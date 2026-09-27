import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LndPaymentProvider, LndRestTransport } from "../dist/index.js";

const invoice = "lntbs1qqtest";

function transport(overrides = {}) {
  return {
    async decodePayReq() { return { paymentHash: "hash-a", amountMsat: 500000n, timestamp: 1_800_000_000, expiry: 600 }; },
    async sendPaymentV2() { return { status: "SUCCEEDED", paymentHash: "hash-a", preimage: "ab", feeMsat: 1000n }; },
    async trackPaymentV2() { return { status: "SUCCEEDED" }; },
    ...overrides,
  };
}

test("decode reports amount, hash and expiry", async () => {
  const provider = new LndPaymentProvider({ transport: transport() });
  assert.deepEqual(await provider.decode(invoice), {
    paymentHash: "hash-a",
    amountMsat: 500000n,
    expiresAt: new Date((1_800_000_000 + 600) * 1000).toISOString(),
  });
});

test("pay maps success, failure and in-flight outcomes and caps fees", async () => {
  const seen = [];
  const ok = new LndPaymentProvider({ transport: transport({ async sendPaymentV2(_i, o) { seen.push(o); return { status: "SUCCEEDED", paymentHash: "hash-a", feeMsat: 1000n }; } }) });
  assert.deepEqual(await ok.pay(invoice, "hash-a", { timeoutSeconds: 30 }), { outcome: "settled", paymentHash: "hash-a", feeMsat: 1000n });
  assert.deepEqual(seen, [{ timeoutSeconds: 30, feeLimitSat: 10 }]);

  const failed = new LndPaymentProvider({ transport: transport({ async sendPaymentV2() { return { status: "FAILED", failureReason: "FAILURE_REASON_NO_ROUTE" }; } }) });
  assert.equal((await failed.pay(invoice, "hash-a", { timeoutSeconds: 30 })).reason, "FAILURE_REASON_NO_ROUTE");

  const slow = new LndPaymentProvider({ transport: transport({ async sendPaymentV2() { return { status: "IN_FLIGHT" }; } }) });
  assert.equal((await slow.pay(invoice, "hash-a", { timeoutSeconds: 30 })).outcome, "unknown");
});

test("lookup maps LND statuses", async () => {
  for (const [status, expected] of [["SUCCEEDED", "settled"], ["FAILED", "failed"], ["IN_FLIGHT", "inflight"], ["NOT_FOUND", "not_found"]]) {
    const provider = new LndPaymentProvider({ transport: transport({ async trackPaymentV2() { return { status }; } }) });
    assert.equal(await provider.lookup("hash-a"), expected);
  }
});

function selfSignedServer(handler) {
  const dir = mkdtempSync(join(tmpdir(), "lnd-test-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  const cert = readFileSync(join(dir, "cert.pem"), "utf8");
  const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, handler);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, cert, port: server.address().port })));
}

test("REST transport streams send results and treats 'already paid' as uncertain", async () => {
  const requests = [];
  const { server, cert, port } = await selfSignedServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, macaroon: req.headers["grpc-metadata-macaroon"], body });
      if (req.url.startsWith("/v1/payreq/")) {
        res.end(JSON.stringify({ payment_hash: "aa", num_msat: "21000", timestamp: "1800000000", expiry: "600", destination: "02ff" }));
      } else if (req.url === "/v2/router/send" && JSON.parse(body).payment_request === "lntbs1paid") {
        res.end(JSON.stringify({ error: { code: 6, message: "invoice is already paid" } }) + "\n");
      } else if (req.url === "/v2/router/send") {
        res.write(JSON.stringify({ result: { payment_hash: "aa", status: "IN_FLIGHT" } }) + "\n");
        setTimeout(() => res.end(JSON.stringify({ result: { payment_hash: "aa", status: "SUCCEEDED", payment_preimage: "bb", fee_msat: "0" } }) + "\n"), 20);
      } else if (req.url.startsWith("/v2/router/track/bQ==")) {
        res.end(JSON.stringify({ error: { code: 14, message: "transport is closing" } }) + "\n");
      } else if (req.url.startsWith("/v2/router/track/")) {
        res.end(JSON.stringify({ error: { code: 5, message: "payment isn't initiated" } }) + "\n");
      } else res.end("{}");
    });
  });
  try {
    const rest = new LndRestTransport({ url: `https://127.0.0.1:${port}`, macaroon: "0201abcd", tlsCert: cert });
    const decoded = await rest.decodePayReq("lntbs1abc");
    assert.equal(decoded.amountMsat, 21000n);
    const sent = await rest.sendPaymentV2("lntbs1abc", { timeoutSeconds: 5, feeLimitSat: 10 });
    assert.equal(sent.status, "SUCCEEDED");
    assert.equal(sent.preimage, "bb");
    assert.equal((await rest.sendPaymentV2("lntbs1paid", { timeoutSeconds: 5, feeLimitSat: 10 })).status, "IN_FLIGHT");
    assert.equal((await rest.trackPaymentV2("aa")).status, "NOT_FOUND");
    // An RPC error is not proof of failure.
    const provider = new LndPaymentProvider({ transport: rest });
    assert.equal(await provider.lookup("6d"), "inflight");
    assert.equal(requests[0].macaroon, "0201abcd");
    assert.ok(requests.some((r) => r.url === "/v2/router/track/qg==?no_inflight_updates=false"));
  } finally {
    server.close();
  }
});
