import test from "node:test";
import assert from "node:assert/strict";

import {
  InvalidTransitionError,
  canTransition,
  createPayout,
  prepareAttempt,
  transition,
} from "../dist/domain.js";

const event = {
  source: "test",
  deliveryId: "delivery-1",
  type: "work.completed",
  occurredAt: "2026-09-06T00:00:00.000Z",
  data: { workId: "work-1" },
};

const proposal = {
  obligationKey: "demo:work:work-1:reward",
  recipient: "lnbc-recipient",
  amountMsat: 500_000n,
  reason: "Completed verified work",
  policyVersion: "rewards-v1",
};

function payoutAt(state = "received") {
  let payout = createPayout("payout-1", event, proposal, event.occurredAt);
  const path = ["proposed", "authorized", "resolving"];
  const transitionCount = state === "received" ? 0 : path.indexOf(state) + 1;
  for (const next of path.slice(0, transitionCount)) {
    payout = transition(payout, next, {}, event.occurredAt);
  }
  return payout;
}

test("the normal payout path permits only the intended state sequence", () => {
  let payout = payoutAt();
  for (const next of ["proposed", "authorized", "resolving", "attempting", "unknown", "settled"]) {
    assert.equal(canTransition(payout.state, next), true);
    payout = transition(payout, next, {}, event.occurredAt);
  }
  assert.equal(payout.state, "settled");
  assert.equal(payout.updatedAt, event.occurredAt);
});

test("terminal states and skipped authorization cannot be bypassed", () => {
  assert.throws(
    () => transition(payoutAt("received"), "authorized"),
    (error) => error instanceof InvalidTransitionError,
  );

  const settled = transition(
    transition(transition(payoutAt("received"), "proposed"), "authorized"),
    "resolving",
  );
  const attempted = transition(settled, "attempting");
  const complete = transition(attempted, "settled");
  assert.throws(() => transition(complete, "failed"), InvalidTransitionError);
  assert.throws(() => transition(attempted, "authorized"), InvalidTransitionError);
});

test("obligation identity is stable when the same event is replayed", () => {
  const first = createPayout("payout-1", event, proposal, event.occurredAt);
  const replay = createPayout("payout-2", { ...event }, proposal, event.occurredAt);

  assert.equal(first.obligationKey, replay.obligationKey);
  assert.equal(first.sourceEvent.deliveryId, replay.sourceEvent.deliveryId);
  // The storage/ingestion layer must reject this duplicate key; the domain
  // factory deliberately does not pretend to be a deduplication store.
});

test("prepareAttempt requires resolving and records the attempt before dispatch", () => {
  const payout = payoutAt("resolving");
  const attempt = {
    id: "attempt-1",
    invoice: "lnbc1demo",
    paymentHash: "hash-1",
    outcome: "prepared",
  };

  const prepared = prepareAttempt(payout, attempt, "2026-09-06T00:01:00.000Z");
  assert.equal(prepared.state, "attempting");
  assert.deepEqual(prepared.attempts, [attempt]);
  assert.equal(prepared.attemptCount, 1);
  assert.equal(prepared.invoice, attempt.invoice);
  assert.equal(prepared.paymentHash, attempt.paymentHash);

  assert.throws(
    () => prepareAttempt(payoutAt("authorized"), attempt),
    InvalidTransitionError,
  );
});
