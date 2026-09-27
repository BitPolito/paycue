import { DatabaseSync } from "node:sqlite";
import {
  type IngestOutcome,
  type Payout,
  type PayoutEvent,
  type PayoutFilter,
  type PayoutPatch,
  type PayoutState,
  type PayoutStorage,
  type RewardProposal,
  StorageConflictError,
  applyChange,
  canonicalRecipient,
  createPayout,
  matchesFilter,
} from "@payhook/core";

/**
 * SQLite-backed payout storage. It uses the synchronous SQLite API built into
 * supported modern Node releases, which keeps writes transactional when the
 * runtime is embedded in an application.
 *
 * Payouts are stored as a versioned JSON snapshot while the fields used for
 * uniqueness and compare-and-set are indexed columns. This keeps the storage
 * adapter independent of the domain object's internal shape.
 */
export class SQLiteStorage implements PayoutStorage {
  private readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payhook_events (
        source TEXT NOT NULL,
        delivery_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (source, delivery_id)
      );
      CREATE TABLE IF NOT EXISTS payhook_payouts (
        id TEXT PRIMARY KEY,
        obligation_key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        recipient TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS payhook_payouts_state ON payhook_payouts(state);
      CREATE INDEX IF NOT EXISTS payhook_payouts_recipient ON payhook_payouts(recipient, created_at);
    `);
  }

  close(): void {
    this.db.close();
  }

  ingest(id: string, event: PayoutEvent, proposal: RewardProposal, now?: string): IngestOutcome {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const recorded = this.db.prepare(`
        INSERT OR IGNORE INTO payhook_events (source, delivery_id, payload, recorded_at)
        VALUES (?, ?, ?, ?)
      `).run(event.source, event.deliveryId, encode(event), now ?? new Date().toISOString());
      const existing = this.getPayoutByObligationKey(proposal.obligationKey);
      let outcome: IngestOutcome;
      if (Number(recorded.changes) !== 1) {
        outcome = existing === undefined
          ? { status: "duplicate_delivery" }
          : { status: "duplicate_delivery", payout: existing };
      } else if (existing !== undefined) {
        outcome = { status: "duplicate_obligation", payout: existing };
      } else {
        const payout = createPayout(id, event, proposal, now);
        this.insertPayout(payout);
        outcome = { status: "created", payout };
      }
      this.db.exec("COMMIT");
      return outcome;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private insertPayout(payout: Payout): void {
    try {
      this.db.prepare(`
        INSERT INTO payhook_payouts (id, obligation_key, state, recipient, payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(payout.id, payout.obligationKey, payout.state, payout.recipientKey, encode(payout), payout.createdAt, payout.updatedAt);
    } catch (error) {
      if (isConstraintError(error)) {
        throw new StorageConflictError(`Payout id or obligation key already exists: ${payout.id}`);
      }
      throw error;
    }
  }

  hasEvent(source: string, deliveryId: string): boolean {
    return this.db.prepare(`
      SELECT 1 AS present FROM payhook_events WHERE source = ? AND delivery_id = ?
    `).get(source, deliveryId) !== undefined;
  }

  getEvent(source: string, deliveryId: string): PayoutEvent | undefined {
    const row = this.db.prepare(`
      SELECT payload FROM payhook_events WHERE source = ? AND delivery_id = ?
    `).get(source, deliveryId) as { payload: string } | undefined;
    return row === undefined ? undefined : decode<PayoutEvent>(row.payload);
  }

  getPayout(id: string): Payout | undefined {
    const row = this.db.prepare(`SELECT payload FROM payhook_payouts WHERE id = ?`)
      .get(id) as { payload: string } | undefined;
    return row === undefined ? undefined : payoutOf(row.payload);
  }

  getPayoutByObligationKey(obligationKey: string): Payout | undefined {
    const row = this.db.prepare(`SELECT payload FROM payhook_payouts WHERE obligation_key = ?`)
      .get(obligationKey) as { payload: string } | undefined;
    return row === undefined ? undefined : payoutOf(row.payload);
  }

  listPayouts(filter: PayoutFilter = {}): Payout[] {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.states) {
      where.push(`state IN (${filter.states.map(() => "?").join(",") || "''"})`);
      args.push(...filter.states);
    }
    if (filter.recipient !== undefined) {
      where.push("recipient = ?");
      args.push(canonicalRecipient(filter.recipient));
    }
    if (filter.createdSince !== undefined) {
      where.push("created_at >= ?");
      args.push(filter.createdSince);
    }
    const sql = `SELECT payload FROM payhook_payouts ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC, rowid DESC ${filter.limit === undefined ? "" : `LIMIT ${Math.max(0, Math.floor(filter.limit))}`}`;
    const rows = this.db.prepare(sql).all(...args) as Array<{ payload: string }>;
    return rows.map((row) => payoutOf(row.payload)).filter((payout) => matchesFilter(payout, filter));
  }

  compareAndSetState(
    id: string,
    expectedState: PayoutState,
    nextState: PayoutState,
    patch: PayoutPatch = {},
    now?: string,
  ): Payout | null {
    const current = this.getPayout(id);
    if (current === undefined || current.state !== expectedState) return null;
    const updated = applyChange(current, nextState, patch, now);
    const result = this.db.prepare(`
      UPDATE payhook_payouts SET state = ?, payload = ?, updated_at = ?
      WHERE id = ? AND state = ? AND updated_at = ?
    `).run(updated.state, encode(updated), updated.updatedAt, id, expectedState, current.updatedAt);
    return Number(result.changes) === 1 ? updated : null;
  }
}

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? `${item}n` : item));
}

function payoutOf(value: string): Payout {
  const payout = decode<Payout>(value);
  // Rows written before recipient keys existed.
  return payout.recipientKey === undefined ? { ...payout, recipientKey: canonicalRecipient(payout.recipient) } : payout;
}

function decode<T>(value: string): T {
  return JSON.parse(value, (_key, item: unknown) => {
    if (typeof item === "string" && /^-?\d+n$/.test(item)) return BigInt(item.slice(0, -1));
    return item;
  }) as T;
}

function isConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return code?.startsWith("SQLITE_CONSTRAINT") === true
    || error.message.includes("constraint failed")
    || error.message.includes("UNIQUE constraint");
}
