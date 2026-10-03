/**
 * Contribution reward demo: GitHub bounties paid through the shared payout
 * service. Label an issue `bounty: 60000`, merge a pull request that closes
 * it, and its author is paid: L-USDT on Liquid for a Liquid address (via
 * KaleidoSwap), sats for a Lightning Address.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Payout, toJson } from "@paycue/core";
import { GitHubWebhookAdapter } from "@paycue/github";
import { PaycueClient } from "@paycue/server";
import { type Bounty, BountyStore, LOGIN, closedIssues, isPayableAddress, payoutOverride } from "./bounties.js";
import { clientToken } from "./token.js";

const home = process.env.PAYCUE_DEMO_HOME ?? join(process.env.HOME ?? ".", "paycue-demo");
const PORT = Number(process.env.CONTRIB_PORT ?? 8092);
// Set GITHUB_REPO=owner/name to sync bounty issues from a real repository.
const REPO = process.env.GITHUB_REPO ?? "local/demo";
const SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";
const WALLET_URL = process.env.WALLET_PUBLIC_URL ?? "http://localhost:8091";
// The GitHub account the board's "Fill the demo user" button enters.
const DEMO_LOGIN = process.env.DEMO_GITHUB_LOGIN ?? (REPO === "local/demo" ? "ada" : REPO.split("/")[0]!);
const dataDir = join(home, "contributions");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const store = new BountyStore(join(dataDir, "bounties.json"), REPO);
const payouts = new PaycueClient({ url: process.env.PAYOUT_SERVICE_URL ?? "http://127.0.0.1:8089", token: clientToken(home, "contributions") });
const github = SECRET ? new GitHubWebhookAdapter(SECRET) : undefined;

// ---- Live page updates -------------------------------------------------------

const clients = new Set<ServerResponse>();
const payoutState = new Map<string, Payout>();

/** The last webhook deliveries, so the board can show that GitHub is reaching us. */
type Delivery = { at: string; event: string; deliveryId: string; outcome: string };
const deliveries: Delivery[] = store.state.deliveries ??= [];
function logDelivery(delivery: Delivery): void {
  deliveries.unshift(delivery);
  deliveries.splice(20);
  store.save();
  broadcast({ type: "delivery", delivery });
}

/** Contributors for display: never the full address. */
function contributorsView(): Array<{ login: string; kind: string; address: string }> {
  return Object.entries(store.state.contributors).map(([login, address]) => ({
    login,
    kind: address.includes("@") ? "Lightning (sats)" : "Liquid (L-USDT)",
    address: address.length > 20 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address,
  }));
}

function broadcast(message: Record<string, unknown>): void {
  const frame = `data: ${toJson(message)}\n\n`;
  for (const client of clients) client.write(frame);
}

function view(bounty: Bounty): Record<string, unknown> {
  const payout = bounty.claim?.payoutId ? payoutState.get(bounty.claim.payoutId) : undefined;
  const delivered = payout?.evidence.find((e) => e.kind === "delivered")?.detail;
  const quoted = payout?.evidence.find((e) => e.kind === "resolved")?.detail;
  const cause = payout && [...payout.evidence].reverse().find((e) => typeof e.detail?.reason === "string");
  const reason = cause?.detail?.reason;
  return {
    ...bounty,
    payout: payout && {
      id: payout.id,
      state: payout.state,
      recipient: payout.recipient,
      reason: payout.state === "failed" || payout.state === "unknown" ? reason ?? null : null,
      /** Who stopped it: policy, resolver (the route), provider (the node) or runtime. */
      decidedBy: payout.state === "failed" || payout.state === "unknown" ? cause?.actor ?? null : null,
      quoted: quoted && typeof quoted.payoutAmount === "number" ? { amount: quoted.payoutAmount / 1e8, asset: quoted.payoutAsset, feeBps: quoted.feeBps } : null,
      txid: typeof delivered?.payoutTxid === "string" ? delivered.payoutTxid : null,
    },
  };
}

function announce(bounty: Bounty): void {
  broadcast({ type: "bounty", bounty: view(bounty) });
}

let serviceConnected = false;
/** Payouts started from the "Try to break it" card, reported back to it. */
const demoPayouts = new Set<string>();
const DEMOS = process.env.ALLOW_DEMO_ACTIONS !== "0";

payouts.follow((event) => {
  if (!("payout" in event) || !event.payout) return;
  payoutState.set(event.payout.id, event.payout);
  if (demoPayouts.has(event.payout.id)) {
    const p = event.payout;
    const cause = [...p.evidence].reverse().find((e) => typeof e.detail?.reason === "string");
    broadcast({ type: "demo", id: p.id, state: p.state, amountSat: Number(p.amountMsat / 1000n), reason: cause?.detail?.reason ?? null, decidedBy: cause?.actor ?? null, rule: cause?.detail?.rule ?? null });
  }
  const bounty = store.list().find((b) => b.claim?.payoutId === event.payout!.id);
  if (bounty) announce(bounty);
}, (connected) => {
  // The follower retries every 2 s; tell the board only about changes.
  if (connected === serviceConnected) return;
  serviceConnected = connected;
  broadcast({ type: "service", connected });
  if (connected) {
    refreshPayouts();
    void retryPending();
  }
});

// ---- Paying bounties ---------------------------------------------------------

/**
 * Submit a bounty's payout. If the payout service can't be reached the claim
 * keeps a `pending` record and is retried with the same delivery ID, so
 * Paycue's duplicate protection makes the retry safe.
 */
async function pay(bounty: Bounty, deliveryId: string, address: string): Promise<void> {
  const claim = bounty.claim!;
  let result: Record<string, unknown>;
  try {
    result = await payouts.submit({
      deliveryId,
      obligationKey: `bounty:${REPO}#${bounty.number}`,
      recipient: address,
      amountSat: bounty.amountSat,
      reason: `Bounty #${bounty.number}: ${bounty.title} (PR #${claim.pr} by @${claim.login})`,
      type: "bounty.claimed",
      policyVersion: "contribution-rewards-v1",
      data: { login: claim.login, issue: bounty.number, pr: claim.pr, repo: REPO },
    });
  } catch (error) {
    // PaycueClient throws a plain Error when the service answered with a refusal;
    // anything else (fetch failure, timeout, a non-JSON proxy page) means it wasn't reached.
    const refused = error instanceof Error && error.constructor === Error;
    claim.pending = { deliveryId, address, error: error instanceof Error ? error.message : String(error), retry: !refused, at: new Date().toISOString() };
    delete claim.waitingForAddress;
    store.save();
    announce(bounty);
    console.error(`[contributions] bounty #${bounty.number}: payout ${refused ? "refused" : "not submitted, will retry"}: ${claim.pending.error}`);
    return;
  }
  const payout = result.payout as Payout | undefined;
  if (payout) {
    claim.payoutId = payout.id;
    delete claim.waitingForAddress;
    delete claim.pending;
    payoutState.set(payout.id, { ...payout, amountMsat: BigInt(payout.amountMsat as unknown as string) });
  }
  store.save();
  announce(bounty);
}

let retrying = false;
async function retryPending(): Promise<void> {
  if (retrying) return;
  retrying = true;
  try {
    for (const bounty of store.list()) {
      const pending = bounty.claim?.pending;
      if (pending?.retry && !bounty.claim?.payoutId) await pay(bounty, pending.deliveryId, pending.address);
    }
  } finally {
    retrying = false;
  }
}
setInterval(() => void retryPending(), 10_000).unref();

/** Refresh payout states after (re)connecting, so bounties never show a stale state. */
function refreshPayouts(): void {
  payouts.recent().then((list) => {
    for (const payout of list) payoutState.set(payout.id, payout);
    for (const bounty of store.list()) if (bounty.claim?.payoutId && payoutState.has(bounty.claim.payoutId)) announce(bounty);
  }).catch((error: Error) => console.error("[contributions] payout service unreachable:", error.message));
}

async function onMerged(raw: Record<string, any>, deliveryId: string): Promise<string[]> {
  const pr = raw.pull_request ?? {};
  const login = String(pr.user?.login ?? "");
  const text = `${pr.title ?? ""}\n${pr.body ?? ""}`;
  const notes: string[] = [];
  for (const number of closedIssues(text)) {
    const bounty = store.state.bounties[String(number)];
    if (!bounty) {
      notes.push(`#${number} has no bounty`);
      continue;
    }
    if (bounty.claim) {
      notes.push(`#${number} was already claimed by @${bounty.claim.login}`);
      continue;
    }
    bounty.claim = { login, pr: Number(pr.number), prUrl: String(pr.html_url ?? ""), mergedAt: String(pr.merged_at ?? new Date().toISOString()) };
    const address = payoutOverride(String(pr.body ?? "")) ?? store.addressOf(login);
    if (!address || !isPayableAddress(address)) {
      bounty.claim.waitingForAddress = true;
      store.save();
      announce(bounty);
      notes.push(`#${number} claimed by @${login}; waiting for a payout address`);
      continue;
    }
    await pay(bounty, `${deliveryId}:${number}`, address);
    const pending = bounty.claim.pending;
    notes.push(pending
      ? `#${number} claimed by @${login}; ${pending.retry ? "payout queued, payout service unreachable" : `payout refused: ${pending.error}`}`
      : `#${number} paying @${login}`);
  }
  return notes;
}

// ---- GitHub sync (public API, no token needed for a public repo) -------------

async function syncFromGitHub(): Promise<number> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "paycue-contribution-demo" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  let count = 0;
  for (const issue of await res.json() as Array<Record<string, any>>) {
    if (issue.pull_request) continue;
    if (store.upsertIssue(issue as never)) count += 1;
  }
  return count;
}

// ---- HTTP --------------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(toJson(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 2_000_000) throw new Error("Request too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "POST" && url.pathname === "/webhooks/github") {
    if (!github) return send(res, 503, { error: "GITHUB_WEBHOOK_SECRET is not configured" });
    const raw = await readBody(req);
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
    const at = new Date().toISOString();
    let event;
    try {
      event = await github.verify({ headers, body: raw, receivedAt: at });
    } catch (error) {
      logDelivery({ at, event: String(headers["x-github-event"] ?? "?"), deliveryId: String(headers["x-github-delivery"] ?? "?"), outcome: `rejected: ${error instanceof Error ? error.message : "invalid"}` });
      throw error;
    }
    const payload = event.payload as Record<string, any>;
    if (event.type.startsWith("issues.")) {
      const bounty = store.upsertIssue(payload.issue);
      if (bounty) announce(bounty);
      else broadcast({ type: "issue", number: payload.issue?.number ?? null });
      logDelivery({ at, event: event.type, deliveryId: event.deliveryId, outcome: bounty ? `bounty #${bounty.number} updated (${bounty.amountSat.toLocaleString("en-US")} sat)` : `issue #${payload.issue?.number} has no bounty label` });
      return send(res, 202, { accepted: true, bounty: bounty?.number ?? null });
    }
    if (event.type.startsWith("pull_request.")) {
      const rawPayload = (event.type === "pull_request.merged" ? payload.raw : payload) as Record<string, any>;
      const pr = rawPayload.pull_request ?? {};
      const linked = closedIssues(`${pr.title ?? ""}\n${pr.body ?? ""}`);
      const touched = store.linkPullRequest(linked, {
        number: Number(pr.number),
        url: String(pr.html_url ?? ""),
        login: String(pr.user?.login ?? ""),
        title: String(pr.title ?? ""),
        state: pr.merged ? "merged" : pr.state === "closed" ? "closed" : "open",
        updatedAt: at,
      });
      for (const bounty of touched) announce(bounty);
      if (event.type === "pull_request.merged") {
        const notes = await onMerged(rawPayload, event.deliveryId);
        const outcome = notes.join(" · ") || `PR #${pr.number} merged; it closes no bounty`;
        logDelivery({ at, event: event.type, deliveryId: event.deliveryId, outcome });
        broadcast({ type: "note", note: outcome });
        return send(res, 202, { accepted: true, notes });
      }
      const outcome = linked.length === 0
        ? `PR #${pr.number}: no "Closes #N" in the description`
        : touched.length === 0 ? `PR #${pr.number} closes #${linked.join(", #")}, which has no bounty` : `PR #${pr.number} by @${pr.user?.login} linked to bounty #${touched.map((b) => b.number).join(", #")}`;
      logDelivery({ at, event: event.type, deliveryId: event.deliveryId, outcome });
      return send(res, 202, { accepted: true });
    }
    logDelivery({ at, event: event.type, deliveryId: event.deliveryId, outcome: "ignored" });
    return send(res, 202, { accepted: true, ignored: event.type });
  }

  if (req.method === "GET" && url.pathname === "/api/bounties") {
    return send(res, 200, {
      repo: REPO,
      repoUrl: REPO === "local/demo" ? null : `https://github.com/${REPO}`,
      walletUrl: WALLET_URL,
      webhook: Boolean(github),
      serviceConnected,
      deliveries,
      contributors: contributorsView(),
      demoLogin: DEMO_LOGIN,
      issues: store.issueList(),
      bounties: store.list().map(view),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/contributors") {
    const body = JSON.parse(await readBody(req) || "{}") as { login?: string; address?: string };
    const login = String(body.login ?? "").trim().replace(/^@/, "");
    const address = String(body.address ?? "").trim();
    if (!LOGIN.test(login)) return send(res, 400, { error: "Enter a GitHub username" });
    if (!isPayableAddress(address)) return send(res, 400, { error: "Enter a Liquid address (tlq1…) or a Lightning Address (name@domain)" });
    store.register(login, address);
    broadcast({ type: "contributors", contributors: contributorsView() });
    // Bounties this person already won get paid now.
    const waiting = store.list().filter((b) => b.claim?.login.toLowerCase() === login.toLowerCase() && b.claim.waitingForAddress);
    for (const bounty of waiting) await pay(bounty, `register:${login}:${bounty.number}`, address);
    return send(res, 200, { registered: login, paying: waiting.map((b) => b.number) });
  }

  if (req.method === "GET" && url.pathname === "/api/policy") {
    // The rules that can decide a bounty payout: global ones and contributions.*.
    const policy = await payouts.policy();
    const rules = (policy.rules as Array<{ name: string }>).filter((rule) => !rule.name.includes(".") || rule.name.startsWith("contributions."));
    return send(res, 200, { rules, routes: policy.routes, paused: policy.paused, demos: DEMOS });
  }

  // "Try to break it": the requests a confused or malicious caller would make.
  if (req.method === "POST" && url.pathname.startsWith("/api/demo/")) {
    if (!DEMOS) return send(res, 403, { error: "Demo actions are off" });
    const kind = url.pathname.slice("/api/demo/".length);
    if (kind === "replay") {
      // The paid bounty's payout request again, as a redelivered merge would send it.
      const bounty = store.list().filter((b) => b.claim?.payoutId && payoutState.get(b.claim.payoutId)?.state === "settled").sort((a, b) => b.claim!.mergedAt.localeCompare(a.claim!.mergedAt))[0];
      const payout = bounty && payoutState.get(bounty.claim!.payoutId!);
      if (!bounty || !payout) return send(res, 409, { error: "Pay a bounty first, then replay it" });
      const result = await payouts.submit({
        deliveryId: `replay:${randomUUID()}`,
        obligationKey: `bounty:${REPO}#${bounty.number}`,
        recipient: payout.recipient,
        amountSat: bounty.amountSat,
        reason: `Replay of bounty #${bounty.number}`,
        type: "bounty.claimed",
        policyVersion: "contribution-rewards-v1",
        data: { login: bounty.claim!.login, issue: bounty.number, pr: bounty.claim!.pr, repo: REPO },
      });
      return send(res, 200, { bounty: bounty.number, status: result.status });
    }
    if (kind === "oversized") {
      const [login, address] = Object.entries(store.state.contributors)[0] ?? ["demo", "demo@localhost:8091"];
      const amountSat = 200_000;
      const result = await payouts.submit({
        deliveryId: `oversized:${randomUUID()}`,
        obligationKey: `bounty:${REPO}#demo-oversized-${Date.now()}`,
        recipient: address,
        amountSat,
        reason: `Demo: a ${amountSat.toLocaleString("en-US")} sat bounty for @${login}`,
        type: "bounty.claimed",
        policyVersion: "contribution-rewards-v1",
        data: { login, demo: "oversized" },
      });
      const payout = result.payout as Payout | undefined;
      if (payout) demoPayouts.add(payout.id);
      return send(res, 202, { id: payout?.id ?? null, amountSat, login });
    }
    return send(res, 404, { error: "Unknown demo action" });
  }

  if (req.method === "POST" && url.pathname === "/api/sync") {
    if (!process.env.GITHUB_REPO) return send(res, 400, { error: "no GitHub repository configured (set GITHUB_REPO)" });
    try {
      return send(res, 200, { synced: await syncFromGitHub() });
    } catch (error) {
      const message = error instanceof Error ? (error.name === "TimeoutError" ? "GitHub did not answer in 15 s" : error.message) : "GitHub unreachable";
      return send(res, 502, { error: message });
    }
  }

  if (url.pathname === "/api/feed") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  const file = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const full = join(publicDir, file);
  if (full.startsWith(publicDir) && existsSync(full) && !file.includes("..")) {
    const types: Record<string, string> = { ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".css": "text/css", ".html": "text/html; charset=utf-8" };
    res.writeHead(200, { "content-type": types[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(readFileSync(full));
    return;
  }
  send(res, 404, { error: "not found" });
}

setInterval(() => {
  for (const client of clients) client.write(": ping\n\n");
}, 15_000).unref();

if (process.env.GITHUB_REPO && process.env.GITHUB_SYNC !== "0") {
  syncFromGitHub().then((n) => console.log(`[contributions] synced ${n} bounties from ${REPO}`)).catch((e: Error) => console.error(`[contributions] GitHub sync failed: ${e.message}`));
}

createServer((req, res) => {
  route(req, res).catch((error) => send(res, error instanceof Error && error.name === "InvalidWebhookEventError" ? 401 : 500, { error: error instanceof Error ? error.message : "error" }));
}).listen(PORT, () => console.log(`[contributions] on :${PORT} · repo ${REPO} · webhook ${github ? "on" : "off (set GITHUB_WEBHOOK_SECRET)"}`));
