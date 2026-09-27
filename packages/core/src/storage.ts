import {
  type Payout,
  type PayoutEvent,
  type PayoutPatch,
  type PayoutState,
  type RewardProposal,
  amend,
  canonicalRecipient,
  createPayout,
  transition,
  validateProposal,
} from "./domain.js";

export type IngestOutcome =
  | { status: "created"; payout: Payout }
  /** This exact delivery was seen before. */
  | { status: "duplicate_delivery"; payout?: Payout }
  /** A different delivery described an obligation that already exists. */
  | { status: "duplicate_obligation"; payout: Payout };

export type PayoutFilter = {
  states?: readonly PayoutState[];
  /** Matches the canonical recipient identity (see `canonicalRecipient`). */
  recipient?: string;
  /** ISO timestamp; only payouts created at or after it. */
  createdSince?: string;
  limit?: number;
};

/**
 * Persistence required by the runtime. Implementations must make each
 * operation durable and atomic; the in-memory implementation is intended for
 * tests and local development only.
 */
export interface PayoutStorage {
  /**
   * Record the delivery and create its payout in one atomic step, so a crash
   * can never leave a delivery marked as seen without its obligation.
   */
  ingest(id: string, event: PayoutEvent, proposal: RewardProposal, now?: string): IngestOutcome;
  hasEvent(source: string, deliveryId: string): boolean;
  getEvent(source: string, deliveryId: string): PayoutEvent | undefined;

  getPayout(id: string): Payout | undefined;
  getPayoutByObligationKey(obligationKey: string): Payout | undefined;
  /** Newest first. */
  listPayouts(filter?: PayoutFilter): Payout[];

  /**
   * Apply a change only if the current state still equals `expectedState`.
   * When `nextState` equals `expectedState` the patch is applied without a
   * transition. Returns the updated payout, or null when the payout is
   * missing or another worker changed its state first.
   */
  compareAndSetState(
    id: string,
    expectedState: PayoutState,
    nextState: PayoutState,
    patch?: PayoutPatch,
    now?: string,
  ): Payout | null;
}

export class StorageConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConflictError";
  }
}

/** Shared by storage adapters so every backend applies patches identically. */
export function applyChange(
  current: Payout,
  nextState: PayoutState,
  patch: PayoutPatch,
  now?: string,
): Payout {
  return nextState === current.state
    ? amend(current, patch, now)
    : transition(current, nextState, patch, now);
}

/** Shared filter semantics for adapters that filter in memory. */
export function matchesFilter(payout: Payout, filter: PayoutFilter = {}): boolean {
  if (filter.states && !filter.states.includes(payout.state)) return false;
  if (filter.recipient !== undefined && payout.recipientKey !== canonicalRecipient(filter.recipient)) return false;
  if (filter.createdSince !== undefined && payout.createdAt < filter.createdSince) return false;
  return true;
}

function eventKey(source: string, deliveryId: string): string {
  return `${source}\u0000${deliveryId}`;
}

/** A dependency-free storage implementation for tests and prototypes. */
export class MemoryStorage implements PayoutStorage {
  private readonly events = new Map<string, PayoutEvent>();
  private readonly payouts = new Map<string, Payout>();
  private readonly obligationIndex = new Map<string, string>();

  ingest(id: string, event: PayoutEvent, proposal: RewardProposal, now?: string): IngestOutcome {
    validateProposal(proposal);
    const key = eventKey(event.source, event.deliveryId);
    const existing = this.getPayoutByObligationKey(proposal.obligationKey);
    if (this.events.has(key)) {
      return existing === undefined
        ? { status: "duplicate_delivery" }
        : { status: "duplicate_delivery", payout: existing };
    }
    this.events.set(key, structuredClone(event));
    if (existing !== undefined) return { status: "duplicate_obligation", payout: existing };
    if (this.payouts.has(id)) throw new StorageConflictError(`Payout id already exists: ${id}`);
    const payout = createPayout(id, event, proposal, now);
    this.payouts.set(id, structuredClone(payout));
    this.obligationIndex.set(payout.obligationKey, id);
    return { status: "created", payout: structuredClone(payout) };
  }

  hasEvent(source: string, deliveryId: string): boolean {
    return this.events.has(eventKey(source, deliveryId));
  }

  getEvent(source: string, deliveryId: string): PayoutEvent | undefined {
    const event = this.events.get(eventKey(source, deliveryId));
    return event === undefined ? undefined : structuredClone(event);
  }

  getPayout(id: string): Payout | undefined {
    const payout = this.payouts.get(id);
    return payout === undefined ? undefined : structuredClone(payout);
  }

  getPayoutByObligationKey(obligationKey: string): Payout | undefined {
    const id = this.obligationIndex.get(obligationKey);
    return id === undefined ? undefined : this.getPayout(id);
  }

  listPayouts(filter: PayoutFilter = {}): Payout[] {
    const rows = [...this.payouts.values()]
      .filter((payout) => matchesFilter(payout, filter))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return (filter.limit === undefined ? rows : rows.slice(0, filter.limit))
      .map((payout) => structuredClone(payout));
  }

  compareAndSetState(
    id: string,
    expectedState: PayoutState,
    nextState: PayoutState,
    patch: PayoutPatch = {},
    now?: string,
  ): Payout | null {
    const current = this.payouts.get(id);
    if (current === undefined || current.state !== expectedState) return null;
    const updated = applyChange(current, nextState, patch, now);
    this.payouts.set(id, structuredClone(updated));
    return structuredClone(updated);
  }
}
