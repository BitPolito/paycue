import test from "node:test";
import assert from "node:assert/strict";

import { CHECKING_NOTE, RECOVERED_NOTE, feedStatus } from "../dist/feed.js";

const ev = (actor, kind, detail) => ({ actor, kind, recordedAt: "2026-10-03T12:00:00Z", ...(detail ? { detail } : {}) });
const allowed = ev("policy", "allowed");
const resolved = ev("resolver:lightning-address", "resolved");

test("a plain settled payout keeps its state", () => {
  assert.deepEqual(feedStatus({ state: "settled", evidence: [allowed, resolved, ev("provider:lnd", "settled")] }), { chip: "settled", note: null });
});

test("an unknown payout reads as checking, without the raw error", () => {
  const evidence = [allowed, resolved, ev("provider:lnd", "unknown", { reason: "socket hang up" })];
  assert.deepEqual(feedStatus({ state: "unknown", evidence }), { chip: "checking", note: CHECKING_NOTE });
});

test("settled after a lost answer, a recovery or a resend reads as recovered", () => {
  const lost = [allowed, resolved, ev("provider:lnd", "unknown", { reason: "Dropped response (demo)" }), ev("provider:lnd", "settled", { via: "lookup" })];
  assert.deepEqual(feedStatus({ state: "settled", evidence: lost }), { chip: "recovered", note: RECOVERED_NOTE });
  const recovered = [allowed, resolved, ev("runtime", "recovered", { reason: "restart" }), ev("provider:lnd", "settled", { via: "lookup" })];
  assert.equal(feedStatus({ state: "settled", evidence: recovered }).chip, "recovered");
  const resent = [allowed, resolved, ev("runtime", "resend"), ev("provider:lnd", "settled")];
  assert.equal(feedStatus({ state: "settled", evidence: resent }).chip, "recovered");
});

test("failed payouts keep their reason, even after an uncertain step", () => {
  const denied = [ev("policy", "denied", { reason: "Recipient limit reached: 60 of 60 payouts in 1 min" })];
  assert.deepEqual(feedStatus({ state: "failed", evidence: denied }), { chip: "failed", note: "Recipient limit reached: 60 of 60 payouts in 1 min" });
  const lostThenFailed = [allowed, ev("provider:lnd", "unknown", { reason: "lost" }), ev("provider:lnd", "failed", { via: "lookup", reason: "Provider reports the payment failed" })];
  assert.deepEqual(feedStatus({ state: "failed", evidence: lostThenFailed }), { chip: "failed", note: "Provider reports the payment failed" });
});
