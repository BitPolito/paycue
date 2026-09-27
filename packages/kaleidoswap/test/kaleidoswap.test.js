import test from "node:test";
import assert from "node:assert/strict";

import { PayThroughApiError } from "@kaleidorg/swap-sdk/pay-through";
import { ResolutionError } from "@paycue/core";
import { PayThroughResolver } from "../dist/index.js";

const liquid = "tlq1qqf3sqkxpnkgvjpu2e7r6xzwe5wfhckm9a7gqpqf5fuzs9ksaxq6x3ufjnxrd0wvkqqrmwya5yhx6gn5wxxmesmcf4v8mlm35j";
const request = { payoutId: "p", attemptId: "p:1", obligationKey: "k", recipient: `liquid:${liquid}?asset=L-USDT`, amountMsat: 60_000_000n };

function created(overrides = {}) {
  return {
    id: "swap-1", swapAuth: "secret-auth", invoice: "lntbs600u1hold", paymentHash: "ff", destination: liquid,
    destinationLayer: "liquid", payoutAsset: "L-USDT", pairId: "BTC/L-USDT", invoiceAmount: 60000, payoutAmount: 5_000_000_000,
    fees: { protocol: 25_000_000, network: 1_000_000, swap: 0 }, expiresAt: 1_800_000_000, ...overrides,
  };
}

test("classifies Liquid, Bitcoin and Arkade destinations", () => {
  const resolver = new PayThroughResolver({ client: {} });
  assert.equal(resolver.accepts(liquid), true);
  assert.equal(resolver.accepts(`liquid:${liquid}?asset=L-USDT`), true);
  assert.equal(resolver.accepts("tb1pvxnjl5vd9q98jj6v3lslu77sdcfc9xp6cj033s648gwyzgpzvmps36f86p"), true);
  assert.equal(new PayThroughResolver({ client: {}, bitcoin: false }).accepts("tb1pvxnjl5vd9q98jj6v3lslu77sdcfc9xp6cj033s648gwyzgpzvmps36f86p"), false);
  assert.equal(resolver.accepts("ada@wallet.example"), false);
  assert.equal(resolver.accepts("lntbs1abc"), false);
});

test("creates a pay-through swap and keeps swapAuth private", async () => {
  const calls = [];
  const resolver = new PayThroughResolver({ client: { async create(input) { calls.push(input); return created(); }, async status() { throw new Error("unused"); } } });
  const resolution = await resolver.resolve(request);
  assert.deepEqual(calls, [{ destination: liquid, invoiceAmount: 60000, asset: "L-USDT" }]);
  assert.equal(resolution.invoice, "lntbs600u1hold");
  assert.equal(resolution.reference, "swap-1");
  assert.deepEqual(resolution.resolverState, { swapId: "swap-1", swapAuth: "secret-auth" });
  assert.equal(JSON.stringify(resolution.detail).includes("secret-auth"), false);
  assert.equal(resolution.detail.feeBps, 52);
});

test("maker errors: 4xx is permanent, 5xx and timeouts retry", async () => {
  const failWith = (error) => new PayThroughResolver({ client: { async create() { throw error; }, async status() {} } });
  await assert.rejects(failWith(new PayThroughApiError(400, "invalid_destination")).resolve(request), (e) => e instanceof ResolutionError && !e.retryable);
  await assert.rejects(failWith(new PayThroughApiError(502, "bad_gateway")).resolve(request), (e) => e.retryable);
  await assert.rejects(failWith(new PayThroughApiError(429, "slow_down")).resolve(request), (e) => e.retryable);
  await assert.rejects(failWith(new TypeError("fetch failed")).resolve(request), (e) => e.retryable);
});

test("refuses quotes above the fee limit and fractional sats", async () => {
  const pricey = new PayThroughResolver({ maxFeeBps: 50, client: { async create() { return created(); }, async status() {} } });
  await assert.rejects(pricey.resolve(request), /above the 0.50% limit/);
  await assert.rejects(pricey.resolve({ ...request, amountMsat: 60_000_500n }), /whole satoshis/);
});

test("describe reports the maker's payout transaction", async () => {
  const resolver = new PayThroughResolver({
    client: { async create() {}, async status(id) { return { id, type: "reverse", status: "invoice.settled", paymentStatus: "settled", failureReason: null, failureDetails: null, events: [], payout: { mode: "direct", destination: liquid, layer: "liquid", reference: "txid-1" } }; } },
  });
  assert.deepEqual(await resolver.describe({ reference: "swap-1" }), { swapStatus: "invoice.settled", payoutTxid: "txid-1", payoutLayer: "liquid", destination: liquid });
});
