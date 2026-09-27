import test from "node:test";
import assert from "node:assert/strict";

import { ResolutionError } from "@payhook/core";
import { LightningAddressResolver } from "../dist/index.js";

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const route = routes.find(([prefix]) => String(url).startsWith(prefix));
    if (!route) throw new Error("offline");
    const [, status, body] = route;
    return new Response(JSON.stringify(body), { status });
  };
  fn.calls = calls;
  return fn;
}

const request = { payoutId: "p", attemptId: "p:1", obligationKey: "k", recipient: "ada@wallet.example", amountMsat: 21000n };

test("accepts Lightning Addresses only", () => {
  const resolver = new LightningAddressResolver();
  assert.equal(resolver.accepts("ada@wallet.example"), true);
  assert.equal(resolver.accepts("lightning:ada@wallet.example"), true);
  assert.equal(resolver.accepts("lntbs1abc"), false);
  assert.equal(resolver.accepts("tlq1qqexample"), false);
});

test("resolves an invoice for the exact amount", async () => {
  const fetch = fakeFetch([
    ["https://wallet.example/.well-known/lnurlp/ada", 200, { tag: "payRequest", callback: "https://wallet.example/cb/ada", minSendable: 1000, maxSendable: 1_000_000 }],
    ["https://wallet.example/cb/ada", 200, { pr: "lntbs210n1invoice", routes: [] }],
  ]);
  const resolution = await new LightningAddressResolver({ fetch }).resolve(request);
  assert.equal(resolution.invoice, "lntbs210n1invoice");
  assert.equal(fetch.calls[1], "https://wallet.example/cb/ada?amount=21000");
});

test("refuses amounts outside the receiver's range without retrying", async () => {
  const fetch = fakeFetch([["https://wallet.example/.well-known/lnurlp/ada", 200, { tag: "payRequest", callback: "https://wallet.example/cb", minSendable: 100_000, maxSendable: 1_000_000 }]]);
  await assert.rejects(new LightningAddressResolver({ fetch }).resolve(request), (e) => e instanceof ResolutionError && e.retryable === false);
});

test("an unreachable server is retryable and plain HTTP needs an explicit opt-in", async () => {
  await assert.rejects(new LightningAddressResolver({ fetch: fakeFetch([]) }).resolve(request), (e) => e.retryable === true);
  const fetch = fakeFetch([
    ["http://wallet.local:8090/.well-known/lnurlp/ada", 200, { tag: "payRequest", callback: "http://wallet.local:8090/cb/ada", minSendable: 1, maxSendable: 1e9 }],
    ["http://wallet.local:8090/cb/ada", 200, { pr: "lntbs1x" }],
  ]);
  const resolver = new LightningAddressResolver({ fetch, insecureDomains: ["wallet.local:8090"] });
  assert.equal((await resolver.resolve({ ...request, recipient: "ada@wallet.local:8090" })).invoice, "lntbs1x");
});
