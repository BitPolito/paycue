import test from "node:test";
import assert from "node:assert/strict";

import {
  FakePaymentProvider,
  FakeResolver,
  MemoryStorage,
  PauseSwitch,
  PaycueRuntime,
  ResolutionError,
  budget,
  defaultPolicy,
  deny,
  maxPerPayout,
  recipientLimit,
} from "../dist/index.js";

let counter = 0;
function event(deliveryId = `delivery-${++counter}`) {
  return { source: "game", deliveryId, type: "coin.hit", occurredAt: "2026-09-27T00:00:00.000Z", data: {} };
}
function proposal(key = `obligation-${++counter}`, extra = {}) {
  return {
    obligationKey: key,
    recipient: "fake:ada",
    amountMsat: 21_000n,
    reason: "Golden coin",
    policyVersion: "test-v1",
    ...extra,
  };
}
function setup(options = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const provider = options.provider ?? new FakePaymentProvider();
  const resolver = options.resolver ?? new FakeResolver();
  let id = 0;
  const runtime = new PaycueRuntime({
    storage,
    provider,
    resolvers: [resolver],
    idFactory: () => `payout-${++id}`,
    ...options.runtime,
  });
  const events = [];
  runtime.on((e) => events.push(e));
  return { storage, provider, resolver, runtime, events };
}

test("a payout settles and records who did what", async () => {
  const { runtime, provider } = setup();
  const created = runtime.submit(event(), proposal());
  assert.equal(created.status, "created");
  const payout = await runtime.execute(created.payout.id);
  assert.equal(payout.state, "settled");
  assert.equal(provider.settledCount, 1);
  assert.deepEqual(payout.evidence.map((e) => `${e.actor}/${e.kind}`), [
    "policy/allowed",
    "runtime/resolver_selected",
    "resolver:fake/resolved",
    "provider:fake/settled",
  ]);
});

test("the same delivery and a new delivery for the same obligation never create a second payout", async () => {
  const { runtime } = setup();
  const first = runtime.submit(event("d-1"), proposal("coin-1"));
  assert.equal(runtime.submit(event("d-1"), proposal("coin-1")).status, "duplicate_delivery");
  const second = runtime.submit(event("d-2"), proposal("coin-1"));
  assert.equal(second.status, "duplicate_obligation");
  assert.equal(second.payout.id, first.payout.id);
});

test("private resolver state never reaches events", async () => {
  const { runtime, storage, events } = setup();
  const { payout } = runtime.submit(event(), proposal());
  await runtime.execute(payout.id);
  assert.equal(storage.getPayout(payout.id).attempts[0].resolverState.secret, "secret-1");
  assert.equal(JSON.stringify(events, (_k, v) => (typeof v === "bigint" ? String(v) : v)).includes("secret-1"), false);
});

test("a lost provider response is reconciled without paying twice", async () => {
  const provider = new FakePaymentProvider([{ outcome: "unknown", reason: "response lost" }]);
  const { runtime } = setup({ provider });
  const { payout } = runtime.submit(event(), proposal());
  const done = await runtime.execute(payout.id);
  assert.equal(done.state, "settled");
  assert.deepEqual(done.evidence.slice(-2).map((e) => e.kind), ["unknown", "settled"]);
  assert.equal(done.evidence.at(-1).detail.via, "lookup");
  assert.equal(provider.settledCount, 1);
});

test("an outage leaves the payout unknown until the provider is back", async () => {
  const provider = new FakePaymentProvider();
  provider.online = false;
  const { runtime } = setup({ provider });
  const { payout } = runtime.submit(event(), proposal());
  assert.equal((await runtime.execute(payout.id)).state, "unknown");
  assert.equal((await runtime.execute(payout.id)).state, "unknown");
  provider.online = true;
  // The provider has no record, so the same invoice is sent again.
  const done = await runtime.execute(payout.id);
  assert.equal(done.state, "settled");
  assert.equal(done.attempts.length, 1);
  assert.equal(done.attempts[0].dispatchCount, 2);
  assert.equal(provider.settledCount, 1);
});

/** Walk a payout to `attempting` the way a process that crashed mid-send leaves it. */
function leaveInFlight(storage, payoutId, { at, dispatched }) {
  const ev = (kind, detail) => ({ actor: "runtime", kind, recordedAt: at, detail });
  let p = storage.getPayout(payoutId);
  p = storage.compareAndSetState(p.id, "received", "proposed", {}, at);
  p = storage.compareAndSetState(p.id, "proposed", "authorized", {}, at);
  p = storage.compareAndSetState(p.id, "authorized", "resolving", { evidence: [ev("resolver_selected", { resolver: "fake" })] }, at);
  const attempt = {
    id: `${p.id}:attempt:1`, resolver: "fake", invoice: `fake:hash-${p.id}:21000`, paymentHash: `hash-${p.id}`,
    dispatchCount: dispatched ? 1 : 0, outcome: dispatched ? "dispatched" : "prepared",
  };
  return storage.compareAndSetState(p.id, "resolving", "attempting", {
    invoice: attempt.invoice, paymentHash: attempt.paymentHash, attempts: [attempt], attemptCount: 1,
  }, at);
}

test("a crash after paying is recovered by asking the provider, not by paying again", async () => {
  const storage = new MemoryStorage();
  const provider = new FakePaymentProvider();
  let now = Date.parse("2026-09-27T00:00:00.000Z");
  const { runtime } = setup({ storage, provider, runtime: { clock: () => new Date(now) } });
  const { payout } = runtime.submit(event(), proposal());
  leaveInFlight(storage, payout.id, { at: new Date(now).toISOString(), dispatched: true });
  // The earlier process did pay before it died.
  await provider.pay(`fake:hash-${payout.id}:21000`, `hash-${payout.id}`);

  assert.equal((await runtime.execute(payout.id)).state, "attempting", "a fresh in-flight attempt may belong to a live process");
  now += 60_000;
  const recovered = await runtime.execute(payout.id);
  assert.equal(recovered.state, "settled");
  assert.ok(recovered.evidence.some((e) => e.kind === "recovered"));
  assert.equal(provider.settledCount, 1);
  assert.equal(provider.dispatchCount, 1);
});

test("a crash before the send reached the provider resends the same invoice once", async () => {
  const storage = new MemoryStorage();
  const provider = new FakePaymentProvider();
  let now = Date.parse("2026-09-27T00:00:00.000Z");
  const { runtime } = setup({ storage, provider, runtime: { clock: () => new Date(now) } });
  const { payout } = runtime.submit(event(), proposal());
  leaveInFlight(storage, payout.id, { at: new Date(now).toISOString(), dispatched: false });
  now += 60_000;
  const done = await runtime.execute(payout.id);
  assert.equal(done.state, "settled");
  assert.equal(done.attempts.length, 1, "never resolves a new invoice");
  assert.equal(done.attempts[0].invoice, `fake:hash-${payout.id}:21000`);
  assert.equal(provider.settledCount, 1);
});

test("a payment the provider never saw that cannot be resent again is marked stuck", async () => {
  const storage = new MemoryStorage();
  const provider = new FakePaymentProvider();
  provider.online = false;
  let now = Date.parse("2026-09-27T00:00:00.000Z");
  const resolver = new FakeResolver();
  const { runtime } = setup({ storage, provider, resolver, runtime: { clock: () => new Date(now), maxDispatches: 1 } });
  const { payout } = runtime.submit(event(), proposal());
  assert.equal((await runtime.execute(payout.id)).state, "unknown");
  provider.online = true;
  const stuck = await runtime.execute(payout.id);
  assert.equal(stuck.state, "stuck", "one dispatch allowed, provider has no record: a human decides");
  assert.equal(provider.settledCount, 0);
});

test("policy denials fail the payout with the rule and reason", async () => {
  const { runtime } = setup({ runtime: { policy: [maxPerPayout(10_000n)] } });
  const { payout } = runtime.submit(event(), proposal());
  const done = await runtime.execute(payout.id);
  assert.equal(done.state, "failed");
  const denial = done.evidence.find((e) => e.kind === "denied");
  assert.equal(denial.detail.rule, "max_per_payout");
  assert.match(denial.detail.reason, /above the 10 sat limit/);
});

test("recipient limits count uncertain payouts so a burst cannot overspend", async () => {
  const provider = new FakePaymentProvider([
    { outcome: "unknown", reason: "slow" },
    { outcome: "unknown", reason: "slow" },
    { outcome: "unknown", reason: "slow" },
  ]);
  const { runtime } = setup({ provider, runtime: { policy: [recipientLimit({ windowMs: 60_000, maxCount: 2 })] } });
  const ids = [1, 2, 3].map(() => runtime.submit(event(), proposal()).payout.id);
  const results = await Promise.all(ids.map((id) => runtime.execute(id)));
  assert.deepEqual(results.map((p) => p.state).sort(), ["failed", "settled", "settled"]);
  const denied = results.find((p) => p.state === "failed");
  assert.match(denied.evidence.at(-1).detail.reason, /2 of 2 payouts/);
});

test("the budget is shared across recipients", async () => {
  const { runtime } = setup({ runtime: { policy: [budget(50_000n)] } });
  const a = runtime.submit(event(), proposal(undefined, { recipient: "fake:ada" })).payout.id;
  const b = runtime.submit(event(), proposal(undefined, { recipient: "fake:bob" })).payout.id;
  const c = runtime.submit(event(), proposal(undefined, { recipient: "fake:cy" })).payout.id;
  const states = [];
  for (const id of [a, b, c]) states.push((await runtime.execute(id)).state);
  assert.deepEqual(states, ["settled", "settled", "failed"]);
});

test("pause holds payouts without failing them", async () => {
  const pause = new PauseSwitch();
  pause.pause("Demo paused");
  const { runtime } = setup({ runtime: { policy: [pause] } });
  const { payout } = runtime.submit(event(), proposal());
  const held = await runtime.execute(payout.id);
  assert.equal(held.state, "proposed");
  assert.equal(held.evidence.at(-1).kind, "held");
  await runtime.execute(payout.id);
  assert.equal(held.evidence.filter((e) => e.kind === "held").length, 1);
  pause.resume();
  assert.equal((await runtime.processPending()), 1);
  assert.equal((await runtime.execute(payout.id)).state, "settled");
});

test("a throwing rule denies instead of approving", async () => {
  const { runtime } = setup({ runtime: { policy: [() => { throw new Error("boom"); }] } });
  const { payout } = runtime.submit(event(), proposal());
  const done = await runtime.execute(payout.id);
  assert.equal(done.state, "failed");
  assert.equal(done.evidence.at(-1).detail.code, "rule_error");
});

test("custom function rules and default policy compose", async () => {
  const noBots = function no_bots(p) {
    return p.recipient.includes("bot") ? deny("bot", "Bots are not paid") : { verdict: "allow" };
  };
  const { runtime } = setup({ runtime: { policy: [...defaultPolicy(), noBots] } });
  const { payout } = runtime.submit(event(), proposal(undefined, { recipient: "fake:bot-7" }));
  const done = await runtime.execute(payout.id);
  assert.equal(done.evidence.at(-1).detail.rule, "no_bots");
});

test("retryable resolver errors retry, permanent ones fail, and nothing is paid meanwhile", async () => {
  const resolver = new FakeResolver([new ResolutionError("maker timeout", true)]);
  const { runtime, provider } = setup({ resolver });
  const { payout } = runtime.submit(event(), proposal());
  assert.equal((await runtime.execute(payout.id)).state, "resolving");
  assert.equal(provider.dispatchCount, 0);
  assert.equal((await runtime.execute(payout.id)).state, "settled");

  const permanent = setup({ resolver: new FakeResolver([new ResolutionError("bad address", false)]) });
  const second = permanent.runtime.submit(event(), proposal());
  assert.equal((await permanent.runtime.execute(second.payout.id)).state, "failed");
});

test("an invoice for a different amount than authorized is refused", async () => {
  const resolver = new FakeResolver();
  const original = resolver.resolve.bind(resolver);
  resolver.resolve = async (req) => original({ ...req, amountMsat: req.amountMsat * 10n });
  const { runtime, provider } = setup({ resolver });
  const { payout } = runtime.submit(event(), proposal());
  const done = await runtime.execute(payout.id);
  assert.equal(done.state, "failed");
  assert.equal(done.evidence.at(-1).kind, "invoice_rejected");
  assert.equal(provider.dispatchCount, 0);
});

test("recipients no resolver accepts fail as unroutable", async () => {
  const { runtime } = setup();
  const { payout } = runtime.submit(event(), proposal(undefined, { recipient: "mailto:ada" }));
  assert.equal((await runtime.execute(payout.id)).evidence.at(-1).kind, "unroutable");
});

test("concurrent execute calls for one payout pay once", async () => {
  const { runtime, provider } = setup();
  const { payout } = runtime.submit(event(), proposal());
  await Promise.all([runtime.execute(payout.id), runtime.execute(payout.id), runtime.processPending()]);
  await runtime.execute(payout.id);
  assert.equal(provider.settledCount, 1);
});

test("processPending drives everything open", async () => {
  const { runtime, storage } = setup();
  for (let i = 0; i < 5; i += 1) runtime.submit(event(), proposal());
  assert.equal(await runtime.processPending(), 5);
  assert.equal(storage.listPayouts({ states: ["settled"] }).length, 5);
});

test("regression: paused payouts cannot slip past a window limit when resumed later", async () => {
  let now = Date.parse("2026-09-27T00:00:00.000Z");
  const pause = new PauseSwitch();
  pause.pause();
  const { runtime, provider } = setup({ runtime: { clock: () => new Date(now), policy: [pause, recipientLimit({ windowMs: 60_000, maxCount: 1 })] } });
  const ids = [1, 2, 3].map(() => runtime.submit(event(), proposal()).payout.id);
  for (const id of ids) await runtime.execute(id);
  now += 5 * 60_000;
  pause.resume();
  await runtime.processPending();
  assert.equal(provider.settledCount, 1);
});

test("regression: non-positive amounts are refused before the delivery is recorded", () => {
  const { runtime, storage } = setup();
  for (const amountMsat of [0n, -100_000n]) {
    const e = event();
    assert.throws(() => runtime.submit(e, proposal(undefined, { amountMsat })), /positive/);
    assert.equal(storage.hasEvent(e.source, e.deliveryId), false);
  }
});

test("regression: recipient aliases share one limit", async () => {
  const resolver = new FakeResolver();
  resolver.accepts = () => true;
  const { runtime, provider } = setup({ resolver, runtime: { policy: [recipientLimit({ windowMs: 60_000, maxCount: 2 })] } });
  for (const recipient of ["ada@wallet.example", "lightning:ADA@wallet.example", " Ada@Wallet.example "]) {
    await runtime.execute(runtime.submit(event(), proposal(undefined, { recipient })).payout.id);
  }
  assert.equal(provider.settledCount, 2);
});
