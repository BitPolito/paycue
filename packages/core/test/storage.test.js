import test from "node:test";
import assert from "node:assert/strict";

import { MemoryStorage } from "../dist/index.js";

const event = (deliveryId) => ({
  source: "github",
  deliveryId,
  type: "pull_request.merged",
  occurredAt: "2026-09-06T00:00:00.000Z",
  data: { issueNumber: 42 },
});
const proposal = {
  obligationKey: "github:issue:42:reward",
  recipient: "ada@example.com",
  amountMsat: 500_000n,
  reason: "Approved contribution",
  policyVersion: "v1",
};

test("ingest creates once and reports both kinds of duplicate", () => {
  const storage = new MemoryStorage();
  assert.equal(storage.ingest("p1", event("d1"), proposal).status, "created");
  const again = storage.ingest("p2", event("d1"), proposal);
  assert.equal(again.status, "duplicate_delivery");
  assert.equal(again.payout.id, "p1");
  const other = storage.ingest("p3", event("d2"), proposal);
  assert.equal(other.status, "duplicate_obligation");
  assert.equal(other.payout.id, "p1");
  assert.equal(storage.hasEvent("github", "d2"), true);
  assert.equal(storage.listPayouts().length, 1);
});

test("compare-and-set prevents stale transitions and amends in place", () => {
  const storage = new MemoryStorage();
  storage.ingest("p1", event("d1"), proposal);
  assert.ok(storage.compareAndSetState("p1", "received", "proposed"));
  assert.equal(storage.compareAndSetState("p1", "received", "proposed"), null);
  const amended = storage.compareAndSetState("p1", "proposed", "proposed", { evidence: [{ actor: "t", kind: "note", recordedAt: "x" }] });
  assert.equal(amended.state, "proposed");
  assert.equal(amended.evidence.length, 1);
});

test("listPayouts filters by state, recipient and time", () => {
  const storage = new MemoryStorage();
  storage.ingest("p1", event("d1"), proposal, "2026-09-01T00:00:00.000Z");
  storage.ingest("p2", event("d2"), { ...proposal, obligationKey: "k2", recipient: "bob@example.com" }, "2026-09-02T00:00:00.000Z");
  assert.deepEqual(storage.listPayouts().map((p) => p.id), ["p2", "p1"]);
  assert.deepEqual(storage.listPayouts({ recipient: "bob@example.com" }).map((p) => p.id), ["p2"]);
  assert.deepEqual(storage.listPayouts({ createdSince: "2026-09-01T12:00:00.000Z" }).map((p) => p.id), ["p2"]);
  assert.deepEqual(storage.listPayouts({ states: ["settled"] }), []);
});
