/**
 * Dependency-free domain types for Payhook.
 *
 * Adapters may create events and execute attempts, but all payout state changes
 * must pass through the transition functions in this module.
 */

export type Msat = bigint;

export type PayoutState =
  | "received"
  | "proposed"
  | "awaiting_approval"
  | "authorized"
  | "resolving"
  | "attempting"
  | "settled"
  | "failed"
  | "unknown"
  | "stuck";

/** One auditable fact about a payout, recorded by whoever established it. */
export type PaymentEvidence = {
  /** Who recorded it: "policy", "runtime", "resolver:<name>", "provider:<name>". */
  actor: string;
  kind: string;
  actorVersion?: string;
  paymentHash?: string;
  reference?: string;
  recordedAt: string;
  detail?: Record<string, unknown>;
};

export type PaymentAttempt = {
  id: string;
  /** Resolver that produced the invoice. Chosen once and never switched. */
  resolver: string;
  invoice: string;
  paymentHash: string;
  /** The resolver's public handle for this attempt, e.g. a swap id. */
  reference?: string;
  /**
   * Private resolver data such as swap credentials. Persisted before the
   * invoice is paid and removed from every public projection.
   */
  resolverState?: Record<string, unknown>;
  expiresAt?: string;
  dispatchedAt?: string;
  dispatchCount: number;
  outcome: "prepared" | "dispatched" | "settled" | "failed" | "unknown";
};

export type PayoutEvent = {
  source: string;
  deliveryId: string;
  type: string;
  occurredAt: string;
  data: unknown;
};

export type RewardProposal = {
  obligationKey: string;
  recipient: string;
  amountMsat: Msat;
  reason: string;
  policyVersion: string;
};

export type Payout = {
  id: string;
  state: PayoutState;
  obligationKey: string;
  recipient: string;
  /** Canonical identity of the recipient, used for per-recipient limits. */
  recipientKey: string;
  /** When policy approved it; window limits count from here. */
  authorizedAt?: string;
  amountMsat: Msat;
  reason: string;
  policyVersion: string;
  sourceEvent: PayoutEvent;
  attempts: PaymentAttempt[];
  invoice?: string;
  paymentHash?: string;
  attemptCount: number;
  evidence: PaymentEvidence[];
  createdAt: string;
  updatedAt: string;
};

export type Hook<TEvent = unknown> = {
  id: string;
  version: string;
  eventType: string;
  propose(event: TEvent): RewardProposal | null;
};

export type PayoutPatch = Partial<
  Pick<Payout, "invoice" | "paymentHash" | "attempts" | "attemptCount" | "evidence" | "authorizedAt">
>;

const transitions: Readonly<Record<PayoutState, readonly PayoutState[]>> = {
  received: ["proposed"],
  proposed: ["awaiting_approval", "authorized", "failed"],
  awaiting_approval: ["authorized", "failed"],
  authorized: ["resolving", "failed"],
  resolving: ["attempting", "failed"],
  attempting: ["settled", "failed", "unknown"],
  // unknown -> attempting re-sends the same persisted invoice; it never
  // resolves a new one, so a payment hash can be settled at most once.
  unknown: ["attempting", "settled", "failed", "stuck"],
  stuck: ["unknown"],
  settled: [],
  failed: [],
};

/** States a worker may still move forward. */
export const OPEN_STATES: readonly PayoutState[] = [
  "received",
  "proposed",
  "authorized",
  "resolving",
  "attempting",
  "unknown",
];

/** States that hold budget: the money may still leave or already has. */
export const COMMITTED_STATES: readonly PayoutState[] = [
  "authorized",
  "resolving",
  "attempting",
  "unknown",
  "stuck",
  "settled",
];

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: PayoutState,
    public readonly to: PayoutState,
  ) {
    super(`Invalid payout transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: PayoutState, to: PayoutState): boolean {
  return transitions[from].includes(to);
}

/** Return a new payout after checking the domain state machine. */
export function transition(
  payout: Payout,
  to: PayoutState,
  patch: PayoutPatch = {},
  now = new Date().toISOString(),
): Payout {
  if (!canTransition(payout.state, to)) {
    throw new InvalidTransitionError(payout.state, to);
  }
  return { ...payout, ...patch, state: to, updatedAt: now };
}

/** Update facts about a payout without changing its state. */
export function amend(
  payout: Payout,
  patch: PayoutPatch,
  now = new Date().toISOString(),
): Payout {
  return { ...payout, ...patch, updatedAt: now };
}

export class InvalidProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProposalError";
  }
}

/** Refuse proposals that could never be a legitimate payout. */
export function validateProposal(proposal: RewardProposal): void {
  if (typeof proposal.amountMsat !== "bigint" || proposal.amountMsat <= 0n) {
    throw new InvalidProposalError("amountMsat must be a positive bigint");
  }
  for (const field of ["obligationKey", "recipient", "policyVersion"] as const) {
    if (typeof proposal[field] !== "string" || proposal[field].trim() === "") {
      throw new InvalidProposalError(`${field} is required`);
    }
  }
}

/**
 * One identity per destination, so `lightning:ADA@x` and `ada@x` share a
 * recipient limit. Strips URI schemes and query strings and lowercases,
 * which is safe for Lightning Addresses and bech32/blech32 addresses.
 */
export function canonicalRecipient(recipient: string): string {
  return recipient
    .trim()
    .replace(/^(?:lightning|liquidnetwork|liquid|bitcoin|ark):(?:\/\/)?/i, "")
    .split("?")[0]!
    .toLowerCase();
}

export function createPayout(
  id: string,
  event: PayoutEvent,
  proposal: RewardProposal,
  now = new Date().toISOString(),
): Payout {
  validateProposal(proposal);
  return {
    id,
    state: "received",
    obligationKey: proposal.obligationKey,
    recipient: proposal.recipient,
    recipientKey: canonicalRecipient(proposal.recipient),
    amountMsat: proposal.amountMsat,
    reason: proposal.reason,
    policyVersion: proposal.policyVersion,
    sourceEvent: event,
    attempts: [],
    attemptCount: 0,
    evidence: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Prepare and persist an attempt before the provider is contacted. */
export function prepareAttempt(
  payout: Payout,
  attempt: PaymentAttempt,
  now = new Date().toISOString(),
): Payout {
  if (payout.state !== "resolving") {
    throw new InvalidTransitionError(payout.state, "attempting");
  }
  return transition(
    payout,
    "attempting",
    {
      invoice: attempt.invoice,
      paymentHash: attempt.paymentHash,
      attempts: [...payout.attempts, attempt],
      attemptCount: payout.attemptCount + 1,
    },
    now,
  );
}

export function currentAttempt(payout: Payout): PaymentAttempt | undefined {
  return payout.attempts[payout.attempts.length - 1];
}

/**
 * A payout safe to show in APIs, events and logs: private resolver state is
 * removed. Use this for anything that leaves the process.
 */
export function publicPayout(payout: Payout): Payout {
  return {
    ...payout,
    attempts: payout.attempts.map(({ resolverState: _secret, ...attempt }) => attempt),
  };
}

/** JSON encoding that keeps millisatoshi bigints readable. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}
