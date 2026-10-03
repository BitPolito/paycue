import { randomUUID } from "node:crypto";
import {
  COMMITTED_STATES,
  OPEN_STATES,
  type PaymentAttempt,
  type PaymentEvidence,
  type Payout,
  type PayoutEvent,
  type PayoutPatch,
  type PayoutState,
  type RewardProposal,
  canonicalRecipient,
  currentAttempt,
  prepareAttempt,
  publicPayout,
  validateProposal,
} from "./domain.js";
import { EventHub, type PaycueListener } from "./events.js";
import {
  type CommittedFilter,
  type CommittedTotals,
  type PolicyContext,
  type PolicyInput,
  type PolicyRule,
  evaluatePolicy,
  toRule,
} from "./policy.js";
import type { DispatchResult, PaymentProvider } from "./provider.js";
import { Bolt11Resolver, type DestinationResolver, ResolutionError } from "./resolver.js";
import type { IngestOutcome, PayoutStorage } from "./storage.js";

export type RuntimeOptions = {
  storage: PayoutStorage;
  provider: PaymentProvider;
  /** Tried in order; the first that accepts a recipient is used for good. Defaults to BOLT11 only. */
  resolvers?: DestinationResolver[];
  /** Rules evaluated in order. An empty list allows everything. */
  policy?: PolicyInput[];
  idFactory?: () => string;
  clock?: () => Date;
  /** How long one dispatch waits before reporting `unknown`. Default 60. */
  paymentTimeoutSeconds?: number;
  /** Sends of one invoice before giving up and marking the payout stuck. Default 3. */
  maxDispatches?: number;
  /** Resolution tries before failing. Default 3. */
  maxResolveAttempts?: number;
  /** An `attempting` payout untouched for this long is treated as interrupted. Default 30 s. */
  staleAfterMs?: number;
  /** Refuse invoices expiring sooner than this. Default 30 s. */
  invoiceExpiryMarginMs?: number;
  /** Payouts executed at once by `processPending`. Default 4. */
  concurrency?: number;
};

export type Worker = { stop(): void };

/**
 * Drives payouts through the state machine. Run exactly one executor per
 * storage: authorization is serialized inside this process, and budgets rely
 * on that.
 */
export class PaycueRuntime {
  readonly events = new EventHub();
  private readonly storage: PayoutStorage;
  private readonly provider: PaymentProvider;
  private readonly resolvers: DestinationResolver[];
  private readonly rules: PolicyRule[];
  private readonly idFactory: () => string;
  private readonly clock: () => Date;
  private readonly paymentTimeoutSeconds: number;
  private readonly maxDispatches: number;
  private readonly maxResolveAttempts: number;
  private readonly staleAfterMs: number;
  private readonly invoiceExpiryMarginMs: number;
  private readonly concurrency: number;
  private readonly running = new Set<string>();
  private authorizing: Promise<unknown> = Promise.resolve();

  constructor(options: RuntimeOptions) {
    this.storage = options.storage;
    this.provider = options.provider;
    this.resolvers = options.resolvers ?? [new Bolt11Resolver()];
    this.rules = (options.policy ?? []).map(toRule);
    this.idFactory = options.idFactory ?? randomUUID;
    this.clock = options.clock ?? (() => new Date());
    this.paymentTimeoutSeconds = options.paymentTimeoutSeconds ?? 60;
    this.maxDispatches = options.maxDispatches ?? 3;
    this.maxResolveAttempts = options.maxResolveAttempts ?? 3;
    this.staleAfterMs = options.staleAfterMs ?? 30_000;
    this.invoiceExpiryMarginMs = options.invoiceExpiryMarginMs ?? 30_000;
    this.concurrency = options.concurrency ?? 4;
  }

  on(listener: PaycueListener): () => void {
    return this.events.on(listener);
  }

  /** The policy rules in evaluation order, for display. */
  get policy(): readonly PolicyRule[] {
    return this.rules;
  }

  /** The configured resolvers in selection order, for display. */
  get routes(): readonly DestinationResolver[] {
    return this.resolvers;
  }

  /** Store a verified event and its proposal. Nothing is paid until executed. */
  submit(event: PayoutEvent, proposal: RewardProposal): IngestOutcome {
    // Validate before anything is stored, so a bad proposal never marks its
    // delivery as seen.
    validateProposal(proposal);
    const at = this.now();
    const outcome = this.storage.ingest(this.idFactory(), event, proposal, at);
    if (outcome.status === "created") {
      this.events.emit({ type: "payout.created", at, payout: publicPayout(outcome.payout) });
    } else {
      this.events.emit({
        type: "payout.duplicate",
        at,
        status: outcome.status,
        obligationKey: proposal.obligationKey,
        ...(outcome.payout === undefined ? {} : { payout: publicPayout(outcome.payout) }),
      });
    }
    return outcome;
  }

  /** Move one payout as far as it can go now. Safe to call repeatedly. */
  async execute(payoutId: string): Promise<Payout | undefined> {
    if (this.running.has(payoutId)) return this.storage.getPayout(payoutId);
    this.running.add(payoutId);
    try {
      return await this.drive(payoutId);
    } finally {
      this.running.delete(payoutId);
    }
  }

  /** Alias kept for callers that reconcile explicitly. */
  reconcile(payoutId: string): Promise<Payout | undefined> {
    return this.execute(payoutId);
  }

  /** Execute every payout that can still move. Returns how many were visited. */
  async processPending(): Promise<number> {
    const open = this.storage.listPayouts({ states: OPEN_STATES })
      .filter((payout) => !this.running.has(payout.id))
      .reverse();
    let next = 0;
    const lanes = Array.from({ length: Math.min(this.concurrency, open.length) }, async () => {
      while (next < open.length) {
        const payout = open[next++]!;
        await this.execute(payout.id).catch(() => undefined);
      }
    });
    await Promise.all(lanes);
    return open.length;
  }

  /** Call `processPending` on an interval until stopped. */
  startWorker(options: { intervalMs?: number } = {}): Worker {
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void this.processPending().finally(() => {
        busy = false;
      });
    }, options.intervalMs ?? 2_000);
    timer.unref?.();
    return { stop: () => clearInterval(timer) };
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private evidence(actor: string, kind: string, detail?: Record<string, unknown>, extra: Partial<PaymentEvidence> = {}): PaymentEvidence {
    return {
      actor,
      kind,
      recordedAt: this.now(),
      ...extra,
      ...(detail === undefined ? {} : { detail }),
    };
  }

  /** Compare-and-set with evidence, then notify. Null means another worker moved first. */
  private move(payout: Payout, to: PayoutState, added: PaymentEvidence[] = [], patch: PayoutPatch = {}): Payout | null {
    const updated = this.storage.compareAndSetState(
      payout.id,
      payout.state,
      to,
      { ...patch, evidence: [...(patch.evidence ?? payout.evidence), ...added] },
      this.now(),
    );
    if (updated === null) return null;
    const view = publicPayout(updated);
    if (to !== payout.state) {
      this.events.emit({ type: "payout.state", at: updated.updatedAt, from: payout.state, to, payout: view });
    }
    for (const item of added) {
      this.events.emit({ type: "payout.evidence", at: item.recordedAt, evidence: item, payout: view });
    }
    return updated;
  }

  private async drive(payoutId: string): Promise<Payout | undefined> {
    let payout = this.storage.getPayout(payoutId);
    if (payout === undefined) return undefined;
    // An attempt found already in flight was started by an earlier process.
    let resumedInFlight = payout.state === "attempting";

    for (let step = 0; step < 16; step += 1) {
      let next: Payout | null;
      switch (payout.state) {
        case "received":
          next = this.move(payout, "proposed");
          break;
        case "proposed":
          next = await this.authorize(payout);
          if (next?.state === "proposed") return next;
          break;
        case "authorized":
          next = this.select(payout);
          break;
        case "resolving":
          next = await this.resolve(payout);
          if (next?.state === "resolving") return next;
          break;
        case "attempting":
          if (resumedInFlight) {
            if (Date.parse(payout.updatedAt) > this.clock().getTime() - this.staleAfterMs) return payout;
            next = this.move(payout, "unknown", [this.evidence("runtime", "recovered", {
              reason: "Dispatch was interrupted; checking with the provider before doing anything else",
            })]);
          } else {
            next = await this.dispatch(payout);
          }
          break;
        case "unknown":
          next = await this.check(payout);
          if (next?.state === "unknown") return next;
          break;
        case "settled":
          return this.describeDelivery(payout);
        default:
          return payout;
      }
      if (next === null) return this.storage.getPayout(payoutId);
      payout = next;
      resumedInFlight = false;
    }
    return payout;
  }

  private proposalOf(payout: Payout): RewardProposal {
    return {
      obligationKey: payout.obligationKey,
      recipient: payout.recipient,
      amountMsat: payout.amountMsat,
      reason: payout.reason,
      policyVersion: payout.policyVersion,
    };
  }

  /**
   * Budget already held. A payout that is not settled yet always counts: its
   * money may still leave. A settled one counts inside the window from the
   * moment it was authorized.
   */
  private committed(excludeId: string, filter: CommittedFilter = {}): CommittedTotals {
    const since = filter.withinMs === undefined
      ? undefined
      : new Date(this.clock().getTime() - filter.withinMs).toISOString();
    const rows = this.storage.listPayouts({
      states: COMMITTED_STATES,
      ...(filter.recipient === undefined ? {} : { recipient: canonicalRecipient(filter.recipient) }),
    }).filter((payout) => payout.id !== excludeId
      && (filter.obligationKeyPrefix === undefined || payout.obligationKey.startsWith(filter.obligationKeyPrefix))
      && (since === undefined || payout.state !== "settled" || (payout.authorizedAt ?? payout.createdAt) >= since));
    return {
      count: rows.length,
      amountMsat: rows.reduce((sum, payout) => sum + payout.amountMsat, 0n),
    };
  }

  /** Policy runs one payout at a time so limits see every earlier approval. */
  private authorize(payout: Payout): Promise<Payout | null> {
    const run = async (): Promise<Payout | null> => {
      const fresh = this.storage.getPayout(payout.id);
      if (fresh === undefined || fresh.state !== "proposed") return fresh ?? null;
      const context: PolicyContext = {
        now: this.clock(),
        payoutId: fresh.id,
        committed: (filter) => this.committed(fresh.id, filter),
      };
      const { rule, decision } = await evaluatePolicy(this.rules, this.proposalOf(fresh), context);
      if (decision.verdict === "allow") {
        return this.move(fresh, "authorized", [this.evidence("policy", "allowed", { rules: this.rules.map((r) => r.name) })], {
          authorizedAt: this.now(),
        });
      }
      const detail = { rule, code: decision.code, reason: decision.reason };
      if (decision.verdict === "deny") {
        return this.move(fresh, "failed", [this.evidence("policy", "denied", detail)]);
      }
      const last = fresh.evidence[fresh.evidence.length - 1];
      if (last?.kind === "held" && last.detail?.code === decision.code) return fresh;
      return this.move(fresh, "proposed", [this.evidence("policy", "held", detail)]);
    };
    const result = this.authorizing.then(run, run);
    this.authorizing = result.catch(() => undefined);
    return result;
  }

  /** Pick the resolver once and record it, so recovery never switches routes. */
  private select(payout: Payout): Payout | null {
    const resolver = this.resolvers.find((candidate) => candidate.accepts(payout.recipient));
    if (resolver === undefined) {
      return this.move(payout, "failed", [this.evidence("runtime", "unroutable", {
        reason: "No configured resolver accepts this recipient",
      })]);
    }
    return this.move(payout, "resolving", [this.evidence("runtime", "resolver_selected", {
      resolver: resolver.name,
    }, { actorVersion: resolver.version })]);
  }

  private selectedResolver(payout: Payout): DestinationResolver | undefined {
    const record = [...payout.evidence].reverse().find((item) => item.kind === "resolver_selected");
    const name = record?.detail?.resolver;
    return this.resolvers.find((candidate) => candidate.name === name);
  }

  private async resolve(payout: Payout): Promise<Payout | null> {
    const resolver = this.selectedResolver(payout);
    if (resolver === undefined) {
      return this.move(payout, "failed", [this.evidence("runtime", "resolver_missing", {
        reason: "The resolver chosen for this payout is no longer configured",
      })]);
    }
    const actor = `resolver:${resolver.name}`;
    const attemptId = `${payout.id}:attempt:${payout.attemptCount + 1}`;
    const earlierErrors = payout.evidence.filter((item) => item.actor === actor && item.kind === "error").length;

    let resolution;
    try {
      resolution = await resolver.resolve({
        payoutId: payout.id,
        attemptId,
        obligationKey: payout.obligationKey,
        recipient: payout.recipient,
        amountMsat: payout.amountMsat,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Resolution failed";
      const retryable = !(error instanceof ResolutionError) || error.retryable;
      const detail = { reason, ...(error instanceof ResolutionError ? error.detail : {}) };
      if (retryable && earlierErrors + 1 < this.maxResolveAttempts) {
        return this.move(payout, "resolving", [this.evidence(actor, "error", detail, { actorVersion: resolver.version })]);
      }
      return this.move(payout, "failed", [this.evidence(actor, "failed", detail, { actorVersion: resolver.version })]);
    }

    const checked = await this.checkInvoice(resolution.invoice, payout);
    if (typeof checked === "string") {
      return this.move(payout, "failed", [this.evidence("runtime", "invoice_rejected", {
        reason: checked,
        resolver: resolver.name,
      })]);
    }

    const attempt: PaymentAttempt = {
      id: attemptId,
      resolver: resolver.name,
      invoice: resolution.invoice,
      paymentHash: checked.paymentHash,
      dispatchCount: 0,
      outcome: "prepared",
      ...(resolution.reference === undefined ? {} : { reference: resolution.reference }),
      ...(resolution.resolverState === undefined ? {} : { resolverState: resolution.resolverState }),
      ...(checked.expiresAt === undefined ? {} : { expiresAt: checked.expiresAt }),
    };
    const prepared = prepareAttempt(payout, attempt, this.now());
    return this.move(payout, "attempting", [this.evidence(actor, "resolved", resolution.detail, {
      actorVersion: resolver.version,
      paymentHash: attempt.paymentHash,
      ...(attempt.reference === undefined ? {} : { reference: attempt.reference }),
    })], {
      invoice: attempt.invoice,
      paymentHash: attempt.paymentHash,
      attempts: prepared.attempts,
      attemptCount: prepared.attemptCount,
    });
  }

  /** Every invoice is checked here, whichever resolver produced it. */
  private async checkInvoice(invoice: string, payout: Payout): Promise<string | { paymentHash: string; expiresAt?: string }> {
    let decoded;
    try {
      decoded = await this.provider.decode(invoice);
    } catch (error) {
      return `Invoice could not be decoded: ${error instanceof Error ? error.message : "error"}`;
    }
    if (!decoded.paymentHash) return "Invoice has no payment hash";
    if (decoded.amountMsat === undefined) return "Zero-amount invoices are refused";
    if (decoded.amountMsat !== payout.amountMsat) {
      return `Invoice asks for ${decoded.amountMsat} msat but ${payout.amountMsat} msat was authorized`;
    }
    if (decoded.expiresAt !== undefined
      && Date.parse(decoded.expiresAt) - this.clock().getTime() < this.invoiceExpiryMarginMs) {
      return "Invoice expires too soon to pay safely";
    }
    return decoded.expiresAt === undefined
      ? { paymentHash: decoded.paymentHash }
      : { paymentHash: decoded.paymentHash, expiresAt: decoded.expiresAt };
  }

  private replaceAttempt(payout: Payout, attempt: PaymentAttempt): PaymentAttempt[] {
    return payout.attempts.map((item, index) => (index === payout.attempts.length - 1 ? attempt : item));
  }

  private async dispatch(payout: Payout): Promise<Payout | null> {
    const attempt = currentAttempt(payout);
    if (attempt === undefined) return this.move(payout, "unknown");
    // Record the send before making it, so a crash mid-call is visible.
    const sent: PaymentAttempt = {
      ...attempt,
      dispatchCount: attempt.dispatchCount + 1,
      dispatchedAt: this.now(),
      outcome: "dispatched",
    };
    const marked = this.move(payout, "attempting", [], { attempts: this.replaceAttempt(payout, sent) });
    if (marked === null) return null;

    let result: DispatchResult;
    try {
      result = await this.provider.pay(sent.invoice, sent.paymentHash, { timeoutSeconds: this.paymentTimeoutSeconds });
    } catch (error) {
      result = { outcome: "unknown", reason: error instanceof Error ? error.message : "Provider response lost" };
    }
    // A repeated send can be refused because the first one already went
    // through. Only the provider's own record decides that.
    if (result.outcome === "failed" && sent.dispatchCount > 1) {
      const status = await this.provider.lookup(sent.paymentHash).catch(() => "inflight" as const);
      if (status === "settled") result = { outcome: "settled", paymentHash: sent.paymentHash };
      else if (status !== "failed") result = { outcome: "unknown", reason: `Resend refused; provider reports ${status}` };
    }
    return this.finish(marked, sent, result);
  }

  private finish(payout: Payout, attempt: PaymentAttempt, result: DispatchResult): Payout | null {
    const actor = `provider:${this.provider.name}`;
    const extra = { actorVersion: this.provider.version, paymentHash: attempt.paymentHash };
    const attempts = this.replaceAttempt(payout, { ...attempt, outcome: result.outcome });
    if (result.outcome === "settled") {
      return this.move(payout, "settled", [this.evidence(actor, "settled", {
        ...(result.feeMsat === undefined ? {} : { feeMsat: result.feeMsat.toString() }),
        ...(result.preimage === undefined ? {} : { preimage: result.preimage }),
      }, extra)], { attempts });
    }
    return this.move(payout, result.outcome, [this.evidence(actor, result.outcome, { reason: result.reason }, extra)], { attempts });
  }

  /** Ask the provider what happened to an uncertain payment. */
  private async check(payout: Payout): Promise<Payout | null> {
    const attempt = currentAttempt(payout);
    if (attempt === undefined) {
      return this.move(payout, "stuck", [this.evidence("runtime", "stuck", { reason: "No attempt to check" })]);
    }
    let status;
    try {
      status = await this.provider.lookup(attempt.paymentHash);
    } catch {
      return payout;
    }
    const actor = `provider:${this.provider.name}`;
    const extra = { actorVersion: this.provider.version, paymentHash: attempt.paymentHash };
    if (status === "settled") {
      return this.move(payout, "settled", [this.evidence(actor, "settled", { via: "lookup" }, extra)], {
        attempts: this.replaceAttempt(payout, { ...attempt, outcome: "settled" }),
      });
    }
    if (status === "failed") {
      return this.move(payout, "failed", [this.evidence(actor, "failed", { via: "lookup", reason: "Provider reports the payment failed" }, extra)], {
        attempts: this.replaceAttempt(payout, { ...attempt, outcome: "failed" }),
      });
    }
    if (status === "inflight") return payout;

    // The provider has no record of this payment hash.
    const expired = attempt.expiresAt !== undefined && Date.parse(attempt.expiresAt) <= this.clock().getTime();
    if (expired) {
      return this.move(payout, "failed", [this.evidence("runtime", "expired", {
        reason: "Invoice expired and the provider has no record of paying it",
      }, extra)]);
    }
    if (this.provider.idempotentByPaymentHash && attempt.dispatchCount < this.maxDispatches) {
      return this.move(payout, "attempting", [this.evidence("runtime", "resend", {
        reason: "Provider has no record of the payment; sending the same invoice again",
      }, extra)]);
    }
    return this.move(payout, "stuck", [this.evidence("runtime", "stuck", {
      reason: "Provider has no record of the payment and it cannot be resent safely",
    }, extra)]);
  }

  private async describeDelivery(payout: Payout): Promise<Payout> {
    const attempt = currentAttempt(payout);
    const resolver = attempt && this.resolvers.find((candidate) => candidate.name === attempt.resolver);
    if (!attempt || !resolver?.describe) return payout;
    if (payout.evidence.some((item) => item.kind === "delivered")) return payout;
    const detail = await resolver.describe(attempt).catch(() => undefined);
    if (detail === undefined) return payout;
    return this.move(payout, "settled", [this.evidence(`resolver:${resolver.name}`, "delivered", detail, {
      actorVersion: resolver.version,
      ...(attempt.reference === undefined ? {} : { reference: attempt.reference }),
    })]) ?? payout;
  }
}
