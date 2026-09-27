import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FakePaymentProvider, FakeResolver, PayhookRuntime } from "@payhook/core";
import { SQLiteStorage } from "../dist/index.js";

const event = (deliveryId) => ({
  source: "github",
  deliveryId,
  type: "pull_request.merged",
  occurredAt: "2026-09-06T00:00:00.000Z",
  data: { issueNumber: 42 },
});
const proposal = {
  obligationKey: "github:issue:42:reward",
  recipient: "fake:ada",
  amountMsat: 500_000n,
  reason: "Approved contribution",
  policyVersion: "v1",
};

test("sqlite ingest is atomic and deduplicates deliveries and obligations", () => {
  const storage = new SQLiteStorage();
  assert.equal(storage.ingest("p1", event("d1"), proposal).status, "created");
  assert.equal(storage.ingest("p2", event("d1"), proposal).status, "duplicate_delivery");
  assert.equal(storage.ingest("p3", event("d2"), proposal).status, "duplicate_obligation");
  assert.deepEqual(storage.getEvent("github", "d1"), event("d1"));
  assert.equal(storage.getPayout("p1").amountMsat, 500_000n);
  storage.close();
});

test("sqlite compare-and-set enforces expected state and filters lists", () => {
  const storage = new SQLiteStorage();
  storage.ingest("p1", event("d1"), proposal, "2026-09-01T00:00:00.000Z");
  storage.ingest("p2", event("d2"), { ...proposal, obligationKey: "k2", recipient: "fake:bob" }, "2026-09-02T00:00:00.000Z");
  assert.ok(storage.compareAndSetState("p1", "received", "proposed"));
  assert.equal(storage.compareAndSetState("p1", "received", "proposed"), null);
  assert.deepEqual(storage.listPayouts({ states: ["proposed"] }).map((p) => p.id), ["p1"]);
  assert.deepEqual(storage.listPayouts({ recipient: "fake:bob" }).map((p) => p.id), ["p2"]);
  assert.deepEqual(storage.listPayouts({ createdSince: "2026-09-01T12:00:00.000Z" }).map((p) => p.id), ["p2"]);
  storage.close();
});

test("a payout survives a restart and finishes exactly once", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "payhook-")), "db.sqlite");
  const provider = new FakePaymentProvider();
  provider.online = false;
  const first = new PayhookRuntime({ storage: new SQLiteStorage(path), provider, resolvers: [new FakeResolver()], idFactory: () => "p1" });
  first.submit(event("d1"), proposal);
  assert.equal((await first.execute("p1")).state, "unknown");

  provider.online = true;
  const storage = new SQLiteStorage(path);
  const second = new PayhookRuntime({ storage, provider, resolvers: [new FakeResolver()] });
  await second.processPending();
  assert.equal(storage.getPayout("p1").state, "settled");
  assert.equal(provider.settledCount, 1);
  storage.close();
});
