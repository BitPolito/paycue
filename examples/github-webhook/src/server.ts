import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { FakePaymentProvider, FakeResolver, PayhookRuntime, defaultPolicy, publicPayout, toJson } from "@payhook/core";
import { GitHubWebhookAdapter, githubPullRequestMergedRewardHook, type GitHubPullRequestMergedEvent } from "@payhook/github";
import { SQLiteStorage } from "@payhook/sqlite";

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>Payhook GitHub rewards</title>
<style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:0 20px}code{background:#eee;padding:2px 4px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}</style></head>
<body><h1>Payhook GitHub rewards</h1><p>Send a verified <code>pull_request</code> webhook with action <code>closed</code> and merged=true. Payhook will create and process one reward obligation.</p><div id="app">Loading…</div>
<script>async function load(){const r=await fetch('/api/payouts');const ps=await r.json();document.querySelector('#app').innerHTML=ps.length?'<table><tr><th>Obligation</th><th>Amount (msat)</th><th>State</th><th>Reason</th></tr>'+ps.map(p=>'<tr><td>'+p.obligationKey+'</td><td>'+p.amountMsat+'</td><td>'+p.state+'</td><td>'+p.reason+'</td></tr>').join('')+'</table>':'<p>No payouts yet.</p>'}load();setInterval(load,3000)</script></body></html>`;

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(toJson(value));
}

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 1_000_000) throw new Error("Webhook body too large");
    chunks.push(part);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Offline demo: every recipient gets a fake invoice. */
class AnyRecipient extends FakeResolver {
  override accepts(): boolean {
    return true;
  }
}

export function createDemoServer(options: {
  storagePath?: string;
  githubSecret: string;
  recipient: string;
  amountMsat?: bigint;
}): ReturnType<typeof createServer> {
  const storage = new SQLiteStorage(options.storagePath ?? "payhook-demo.sqlite");
  // The fake provider and resolver cannot spend real funds. Swap in
  // @payhook/lnd and @payhook/lnurl for real payouts.
  const runtime = new PayhookRuntime({
    storage,
    provider: new FakePaymentProvider(),
    resolvers: [new AnyRecipient()],
    policy: defaultPolicy(),
  });
  const adapter = new GitHubWebhookAdapter(options.githubSecret);
  const hook = githubPullRequestMergedRewardHook({
    amountMsat: options.amountMsat ?? 500_000n,
    policyVersion: "github-demo-v1",
    recipient: options.recipient,
  });

  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(page);
        return;
      }
      if (request.method === "GET" && request.url === "/api/payouts") {
        json(response, 200, storage.listPayouts().map(publicPayout));
        return;
      }
      if (request.method === "POST" && request.url === "/webhooks/github") {
        const raw = await body(request);
        const headers = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
        const event = await adapter.verify({ headers, body: raw, receivedAt: new Date().toISOString() });
        if (event.type !== "pull_request.merged") {
          json(response, 202, { accepted: true, ignored: true, type: event.type });
          return;
        }
        const proposal = hook.propose(event.payload as GitHubPullRequestMergedEvent);
        if (!proposal) {
          json(response, 202, { accepted: true, qualified: false });
          return;
        }
        const result = runtime.submit({
          source: event.source,
          deliveryId: event.deliveryId,
          type: event.type,
          occurredAt: event.occurredAt,
          data: event.payload,
        }, proposal);
        if (result.status !== "created") {
          json(response, 200, { duplicate: true, status: result.status });
          return;
        }
        const payout = await runtime.execute(result.payout.id);
        json(response, 201, payout && publicPayout(payout));
        return;
      }
      json(response, 404, { error: "not found" });
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : "request failed" });
    }
  });
}

if (process.argv[1]?.endsWith("/server.js")) {
  const secret = process.env.PAYHOOK_GITHUB_SECRET;
  const recipient = process.env.PAYHOOK_RECIPIENT;
  if (!secret || !recipient) {
    console.error("Set PAYHOOK_GITHUB_SECRET and PAYHOOK_RECIPIENT before starting the demo.");
    process.exitCode = 1;
  } else {
    const server = createDemoServer({
      githubSecret: secret,
      recipient,
      ...(process.env.PAYHOOK_DB === undefined ? {} : { storagePath: process.env.PAYHOOK_DB }),
    });
    const port = Number(process.env.PORT ?? 3000);
    server.listen(port, () => console.log(`Payhook demo listening on http://localhost:${port}`));
  }
}
