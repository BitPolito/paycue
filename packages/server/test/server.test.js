import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { FakePaymentProvider, FakeResolver, MemoryStorage, PauseSwitch, PaycueRuntime, maxPerPayout } from "@paycue/core";
import { createPaycueServer } from "../dist/index.js";

const ADMIN = "admin-token-0123456789";
const GAME = "game-token-0123456789";
const CONTRIB = "contrib-token-0123456789";

async function setup() {
  const storage = new MemoryStorage();
  const pause = new PauseSwitch();
  const runtime = new PaycueRuntime({ storage, provider: new FakePaymentProvider(), resolvers: [new FakeResolver()], policy: [pause, maxPerPayout(100_000n)] });
  const paycue = createPaycueServer({
    runtime, storage, pause, adminToken: ADMIN,
    clients: [{ id: "game", token: GAME }, { id: "contrib", token: CONTRIB }],
    actions: { ping: { label: "Ping", run: () => ({ message: "pong" }) } },
  });
  const http = createServer(paycue.handler);
  await new Promise((r) => http.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${http.address().port}`;
  const call = async (path, { token, body } = {}) => {
    const res = await fetch(base + path, { method: body ? "POST" : "GET", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  return { base, call, runtime, close: () => { paycue.close(); http.close(); } };
}

const request = (n, extra = {}) => ({ deliveryId: `d-${n}`, obligationKey: `coin-${n}`, recipient: "fake:ada", amountSat: 21, reason: "coin", ...extra });

test("clients submit payouts that settle, namespaced and scoped to them", async () => {
  const s = await setup();
  try {
    const created = await s.call("/v1/payouts", { token: GAME, body: request(1) });
    assert.equal(created.status, 201);
    assert.equal(created.body.payout.obligationKey, "game:coin-1");
    await s.runtime.processPending();
    // Another client using the same key creates its own obligation.
    assert.equal((await s.call("/v1/payouts", { token: CONTRIB, body: request(1) })).status, 201);
    assert.equal((await s.call("/v1/payouts", { token: GAME, body: request(1) })).body.status, "duplicate_delivery");
    const mine = (await s.call("/v1/payouts", { token: GAME })).body.payouts;
    assert.deepEqual(mine.map((p) => p.sourceEvent.source), ["game"]);
    assert.equal((await s.call("/v1/payouts", { token: ADMIN })).body.payouts.length, 2);
    const other = (await s.call("/v1/payouts", { token: CONTRIB })).body.payouts[0];
    assert.equal((await s.call(`/v1/payouts/${other.id}`, { token: GAME })).status, 404);
  } finally { s.close(); }
});

test("bad requests and bad tokens are refused", async () => {
  const s = await setup();
  try {
    assert.equal((await s.call("/v1/payouts", { body: request(2) })).status, 401);
    assert.equal((await s.call("/v1/payouts", { token: "wrong-token-000000000", body: request(2) })).status, 401);
    assert.equal((await s.call("/v1/payouts", { token: ADMIN, body: request(2) })).status, 403);
    assert.equal((await s.call("/v1/payouts", { token: GAME, body: request(3, { amountSat: -5 }) })).status, 400);
    assert.equal((await s.call("/v1/payouts", { token: GAME, body: request(4, { recipient: "" }) })).status, 400);
    assert.equal((await s.call("/v1/admin/status", { token: GAME })).status, 403);
  } finally { s.close(); }
});

test("policy, status, pause and custom actions are available to the operator", async () => {
  const s = await setup();
  try {
    const policy = (await s.call("/v1/policy", { token: GAME })).body;
    assert.deepEqual(policy.rules.map((r) => r.name), ["pause", "max_per_payout"]);
    assert.match(policy.rules[1].description, /100 sat per payout/);
    assert.equal((await s.call("/v1/admin/pause", { token: ADMIN, body: { reason: "stage" } })).status, 200);
    await s.call("/v1/payouts", { token: GAME, body: request(5) });
    await s.runtime.processPending();
    const status = (await s.call("/v1/admin/status", { token: ADMIN })).body;
    assert.equal(status.paused, true);
    assert.equal(status.open[0].state, "proposed");
    assert.equal((await s.call("/v1/admin/actions/ping", { token: ADMIN, body: {} })).body.message, "pong");
    await s.call("/v1/admin/resume", { token: ADMIN, body: {} });
    await s.runtime.processPending();
    assert.equal((await s.call("/v1/admin/status", { token: ADMIN })).body.open.length, 0);
  } finally { s.close(); }
});

test("event streams are scoped and never carry resolver secrets", async () => {
  const s = await setup();
  try {
    const controller = new AbortController();
    const res = await fetch(`${s.base}/v1/events?token=${CONTRIB}`, { signal: controller.signal });
    const reader = res.body.getReader();
    await s.call("/v1/payouts", { token: GAME, body: request(6) });
    await s.call("/v1/payouts", { token: CONTRIB, body: request(7) });
    await s.runtime.processPending();
    let text = "";
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline && !text.includes("settled")) text += new TextDecoder().decode((await reader.read()).value);
    controller.abort();
    assert.ok(text.includes("contrib:coin-7"));
    assert.equal(text.includes("game:coin-6"), false);
    assert.equal(text.includes("secret-"), false);
  } finally { s.close(); }
});

test("the console page is served", async () => {
  const s = await setup();
  try {
    const res = await fetch(`${s.base}/`);
    assert.match(await res.text(), /Operator policy/);
  } finally { s.close(); }
});

test("forClient scopes a rule to one client's payouts", async () => {
  const { forClient } = await import("../dist/index.js");
  const rule = forClient("game", maxPerPayout(50_000n));
  assert.equal(rule.name, "game.max_per_payout");
  const ctx = { now: new Date(), payoutId: "x", committed: () => ({ count: 0, amountMsat: 0n }) };
  const big = { obligationKey: "", recipient: "r", amountMsat: 100_000n, reason: "", policyVersion: "v" };
  assert.equal(rule.check({ ...big, obligationKey: "game:c1" }, ctx).verdict, "deny");
  assert.equal(rule.check({ ...big, obligationKey: "contrib:b1" }, ctx).verdict, "allow");
});
