import { createHash } from "node:crypto";
import type { Msat, PaymentAttempt } from "./domain.js";
import { fakeInvoice } from "./provider.js";

export type ResolveRequest = {
  payoutId: string;
  attemptId: string;
  obligationKey: string;
  recipient: string;
  amountMsat: Msat;
};

export type Resolution = {
  invoice: string;
  /** Public handle, e.g. a swap id. Shown in evidence. */
  reference?: string;
  /** Private data needed later, e.g. swap credentials. Never shown. */
  resolverState?: Record<string, unknown>;
  /** Public facts about the resolution, e.g. quoted output and fees. */
  detail?: Record<string, unknown>;
};

/** Who imposes a limit: the network itself, the route's provider, the receiver, or you (the operator). */
export type LimitSource = "network" | "provider" | "receiver" | "operator";

/** A route a resolver can pay, with its limits and who sets them. For display. */
export type RouteDescription = {
  resolver: string;
  network: string;
  asset: string;
  /** Typical time until the recipient has the funds. */
  settles: string;
  limits: Array<{ label: string; value: string; setBy: LimitSource }>;
};

/**
 * Turns a recipient into a Lightning invoice for exactly the authorized
 * amount. This is where other networks and assets plug in: a swap resolver
 * returns a swap service's invoice and the service delivers elsewhere.
 *
 * The runtime independently decodes and checks every invoice a resolver
 * returns, so a resolver cannot authorize a different amount.
 */
export interface DestinationResolver {
  readonly name: string;
  readonly version: string;
  /** Pure and cheap: decides from the recipient string alone. */
  accepts(recipient: string): boolean;
  resolve(request: ResolveRequest): Promise<Resolution>;
  /** Optional: facts about delivery after the invoice settled, e.g. a payout txid. */
  describe?(attempt: PaymentAttempt): Promise<Record<string, unknown> | undefined>;
  /** Optional: the routes this resolver pays and their limits, for operators. */
  constraints?(): Promise<RouteDescription[]>;
}

/**
 * Thrown by resolvers. `retryable` failures leave the payout resolving so the
 * worker tries again; nothing has been paid at this point, so retrying can at
 * worst leave an unpaid invoice behind.
 */
export class ResolutionError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ResolutionError";
  }
}

const BOLT11 = /^(?:lightning:)?(ln(?:bc|tb|tbs|bcrt|sb)[0-9]*[a-z]?1[02-9ac-hj-np-z]+)$/i;

/** The recipient is already a BOLT11 invoice. */
export class Bolt11Resolver implements DestinationResolver {
  readonly name = "bolt11";
  readonly version = "1";

  accepts(recipient: string): boolean {
    return BOLT11.test(recipient.trim());
  }

  async constraints(): Promise<RouteDescription[]> {
    return [{
      resolver: this.name,
      network: "Lightning",
      asset: "BTC",
      settles: "seconds",
      limits: [
        { label: "Amount", value: "fixed by the invoice", setBy: "receiver" },
        { label: "Invoice expiry", value: "set by the invoice; refused inside 30 s of expiry", setBy: "receiver" },
      ],
    }];
  }

  async resolve(request: ResolveRequest): Promise<Resolution> {
    const match = BOLT11.exec(request.recipient.trim());
    if (!match) throw new ResolutionError("Recipient is not a BOLT11 invoice", false);
    return { invoice: match[1]!.toLowerCase() };
  }
}

/** Resolves `fake:` recipients for tests and offline demos. */
export class FakeResolver implements DestinationResolver {
  readonly name = "fake";
  readonly version = "1";
  resolveCount = 0;
  private failures: ResolutionError[];

  constructor(failures: ResolutionError[] = []) {
    this.failures = [...failures];
  }

  accepts(recipient: string): boolean {
    return recipient.startsWith("fake:");
  }

  async resolve(request: ResolveRequest): Promise<Resolution> {
    this.resolveCount += 1;
    const failure = this.failures.shift();
    if (failure) throw failure;
    const hash = createHash("sha256").update(request.attemptId).digest("hex");
    return {
      invoice: fakeInvoice(hash, request.amountMsat),
      reference: `fake-${this.resolveCount}`,
      resolverState: { secret: `secret-${this.resolveCount}` },
    };
  }
}
