import type { Msat, RewardProposal } from "./domain.js";

export type PolicyDecision =
  | { verdict: "allow" }
  /** Terminal: the payout fails and the reason is recorded. */
  | { verdict: "deny"; code: string; reason: string }
  /** Not now: the payout stays proposed and is evaluated again later. */
  | { verdict: "hold"; code: string; reason: string };

export const allow: PolicyDecision = { verdict: "allow" };
export function deny(code: string, reason: string): PolicyDecision {
  return { verdict: "deny", code, reason };
}
export function hold(code: string, reason: string): PolicyDecision {
  return { verdict: "hold", code, reason };
}

export type CommittedTotals = { count: number; amountMsat: Msat };

export type PolicyContext = {
  now: Date;
  payoutId: string;
  /**
   * Payouts that already hold budget: authorized, in flight, uncertain or
   * settled. The payout being evaluated is not included.
   */
  committed(filter?: { recipient?: string; withinMs?: number }): CommittedTotals;
};

export type PolicyRule = {
  readonly name: string;
  /** Plain-language summary for operators, e.g. "At most 10,000 sat per payout". */
  readonly description?: string;
  check(proposal: RewardProposal, context: PolicyContext): PolicyDecision | Promise<PolicyDecision>;
};

/** A plain function is accepted as a rule; its name is used in evidence. */
export type PolicyInput = PolicyRule | ((proposal: RewardProposal, context: PolicyContext) => PolicyDecision | Promise<PolicyDecision>);

export function toRule(input: PolicyInput): PolicyRule {
  if (typeof input !== "function") return input;
  return { name: input.name || "custom", check: input };
}

export type RuleOutcome = { rule: string; decision: PolicyDecision };

/** Evaluate rules in order. The first rule that does not allow decides. */
export async function evaluatePolicy(
  rules: readonly PolicyRule[],
  proposal: RewardProposal,
  context: PolicyContext,
): Promise<RuleOutcome> {
  for (const rule of rules) {
    let decision: PolicyDecision;
    try {
      decision = await rule.check(proposal, context);
    } catch (error) {
      // A broken rule must never approve money by accident.
      decision = deny("rule_error", `Rule ${rule.name} failed: ${error instanceof Error ? error.message : "error"}`);
    }
    if (decision.verdict !== "allow") return { rule: rule.name, decision };
  }
  return { rule: "all", decision: allow };
}

function sats(msat: Msat): string {
  return `${(msat / 1000n).toLocaleString("en-US")} sat`;
}

export function maxPerPayout(maxMsat: Msat): PolicyRule {
  return {
    name: "max_per_payout",
    description: `At most ${sats(maxMsat)} per payout`,
    check: (proposal) => proposal.amountMsat > maxMsat
      ? deny("max_per_payout", `Amount ${sats(proposal.amountMsat)} is above the ${sats(maxMsat)} limit per payout`)
      : allow,
  };
}

export type RecipientLimitOptions = {
  windowMs: number;
  maxCount?: number;
  maxMsat?: Msat;
};

/** Caps how often and how much one recipient can be paid within a window. */
export function recipientLimit(options: RecipientLimitOptions): PolicyRule {
  const window = options.windowMs >= 60_000 ? `${Math.round(options.windowMs / 60_000)} min` : `${Math.round(options.windowMs / 1000)} s`;
  const caps = [
    options.maxCount === undefined ? null : `${options.maxCount} payouts`,
    options.maxMsat === undefined ? null : sats(options.maxMsat),
  ].filter(Boolean).join(" or ");
  return {
    name: "recipient_limit",
    description: `Each recipient gets at most ${caps} per ${window}`,
    check: (proposal, context) => {
      const used = context.committed({ recipient: proposal.recipient, withinMs: options.windowMs });
      if (options.maxCount !== undefined && used.count + 1 > options.maxCount) {
        return deny("recipient_count", `Recipient limit reached: ${used.count} of ${options.maxCount} payouts in ${window}`);
      }
      if (options.maxMsat !== undefined && used.amountMsat + proposal.amountMsat > options.maxMsat) {
        return deny("recipient_amount", `Recipient limit reached: ${sats(used.amountMsat)} of ${sats(options.maxMsat)} in ${window}`);
      }
      return allow;
    },
  };
}

/** Total spend across all recipients. Uncertain payouts count as spent. */
export function budget(totalMsat: Msat, options: { withinMs?: number } = {}): PolicyRule {
  return {
    name: "budget",
    description: `Total spend capped at ${sats(totalMsat)}${options.withinMs === undefined ? "" : ` per ${Math.round(options.withinMs / 60_000)} min`}; unfinished payouts count as spent`,
    check: (proposal, context) => {
      const used = context.committed(options.withinMs === undefined ? {} : { withinMs: options.withinMs });
      return used.amountMsat + proposal.amountMsat > totalMsat
        ? deny("budget", `Budget exhausted: ${sats(used.amountMsat)} of ${sats(totalMsat)} committed`)
        : allow;
    },
  };
}

/** Operator kill switch. While paused, new payouts wait instead of failing. */
export class PauseSwitch implements PolicyRule {
  readonly name = "pause";
  readonly description = "Operator pause: new payouts wait until resumed";
  private reason: string | null = null;

  get paused(): boolean {
    return this.reason !== null;
  }

  pause(reason = "Paused by operator"): void {
    this.reason = reason;
  }

  resume(): void {
    this.reason = null;
  }

  check(): PolicyDecision {
    return this.reason === null ? allow : hold("paused", this.reason);
  }
}

export type DefaultPolicyOptions = {
  maxPerPayoutMsat?: Msat;
  recipient?: RecipientLimitOptions;
  budgetMsat?: Msat;
  pause?: PauseSwitch;
};

/**
 * Conservative defaults: 10,000 sat per payout, 20 payouts or 50,000 sat per
 * recipient per hour, 1,000,000 sat total, and a pause switch. Spread the
 * result into your own list to change, drop or add rules.
 */
export function defaultPolicy(options: DefaultPolicyOptions = {}): PolicyRule[] {
  return [
    options.pause ?? new PauseSwitch(),
    maxPerPayout(options.maxPerPayoutMsat ?? 10_000_000n),
    recipientLimit(options.recipient ?? { windowMs: 3_600_000, maxCount: 20, maxMsat: 50_000_000n }),
    budget(options.budgetMsat ?? 1_000_000_000n),
  ];
}
