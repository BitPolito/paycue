/**
 * Orbital Sats, the game demo. Serves the game and validates hits against its
 * own coin schedule; valid hits become payout requests to the shared payout
 * service, whose events drive the live feed.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { type Payout, toJson } from "@paycue/core";
import { Rounds, SETTINGS, type Session } from "./game.js";
import { PaycueClient } from "@paycue/server";
import { clientToken } from "./token.js";

const home = process.env.PAYCUE_DEMO_HOME ?? join(process.env.HOME ?? ".", "paycue-demo");
const PORT = Number(process.env.GAME_PORT ?? 8090);
const WALLET_DOMAIN = process.env.WALLET_DOMAIN ?? "localhost:8091";
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const rounds = new Rounds();
const payouts = new PaycueClient({ url: process.env.PAYOUT_SERVICE_URL ?? "http://127.0.0.1:8089", token: clientToken(home, "game") });

// ---- Live feed ---------------------------------------------------------------

export type FeedRow = {
  payoutId: string;
  sessionId: string | null;
  pilot: string;
  amountSat: number;
  state: string;
  note: string | null;
  /** Why the payout is not (yet) paid, and who decided it. Null while it moves normally. */
  decision: Decision | null;
  updatedAt: string;
};

/**
 * Who stopped or delayed a payout. `operator` rules are the policy; the
 * `network` (Lightning, through the provider) and the `receiver` (their
 * LNURL-pay server, through the resolver) impose limits of their own.
 */
export type Decision = {
  verdict: "denied" | "held" | "failed" | "uncertain";
  by: "operator" | "network" | "receiver" | "paycue";
  rule: string | null;
  reason: string;
};

const DECIDED_BY: Record<string, Decision["by"]> = { policy: "operator", provider: "network", resolver: "receiver" };

const clients = new Set<ServerResponse>();
const rows = new Map<string, FeedRow>();
let serviceConnected = false;

function broadcast(message: Record<string, unknown>): void {
  const frame = `data: ${toJson(message)}\n\n`;
  for (const client of clients) client.write(frame);
}

function lastNote(payout: Payout): string | null {
  for (const item of [...payout.evidence].reverse()) {
    const reason = item.detail?.reason;
    if (typeof reason === "string") return reason;
  }
  return null;
}

function decisionOf(payout: Payout): Decision | null {
  const last = payout.evidence.at(-1);
  if (last === undefined) return null;
  const held = payout.state === "proposed" && last.kind === "held";
  if (payout.state !== "failed" && payout.state !== "unknown" && payout.state !== "stuck" && !held) return null;
  const cause = [...payout.evidence].reverse().find((item) => typeof item.detail?.reason === "string") ?? last;
  const verdict = held ? "held" : payout.state === "failed" ? (cause.kind === "denied" ? "denied" : "failed") : "uncertain";
  return {
    verdict,
    by: DECIDED_BY[cause.actor] ?? "paycue",
    rule: typeof cause.detail?.rule === "string" ? cause.detail.rule : null,
    reason: String(cause.detail?.reason ?? payout.state),
  };
}

function rowOf(payout: Payout): FeedRow {
  const data = (payout.sourceEvent.data ?? {}) as Record<string, unknown>;
  // Keys look like game:shooter:<session>:coin:<coin>.
  const parts = payout.obligationKey.split(":");
  return {
    payoutId: payout.id,
    sessionId: parts[2] ?? null,
    pilot: String(data.pilot ?? "pilot"),
    amountSat: Number(payout.amountMsat / 1000n),
    state: payout.state,
    note: lastNote(payout),
    decision: decisionOf(payout),
    updatedAt: payout.updatedAt,
  };
}

function track(payout: Payout): void {
  const row = rowOf(payout);
  rows.set(row.payoutId, row);
  if (rows.size > 400) rows.delete(rows.keys().next().value!);
  broadcast({ type: "row", row });
}

payouts.follow((event) => {
  if (event.type === "payout.duplicate") {
    broadcast({ type: "game", event: "duplicate", note: event.status === "duplicate_delivery" ? "Replayed hit ignored: same delivery" : "Replayed hit ignored: obligation already exists" });
    return;
  }
  track(event.payout);
}, (connected) => {
  serviceConnected = connected;
  broadcast({ type: "service", connected });
});
payouts.recent().then((list) => {
  for (const payout of list.reverse()) rows.set(payout.id, rowOf(payout));
}).catch((error: Error) => console.error("[game] payout service unreachable:", error.message));

// ---- Game flow ---------------------------------------------------------------

function proposeCoin(session: Session, coinId: string): void {
  const sats = SETTINGS.satsPerCoin;
  payouts.submit({
    deliveryId: `${session.id}:${coinId}`,
    obligationKey: `shooter:${session.id}:coin:${coinId}`,
    recipient: session.recipient,
    amountSat: sats,
    reason: `Golden coin ${coinId}`,
    type: "coin.hit",
    policyVersion: "orbital-sats-v3",
    data: { pilot: session.name, coinId, glitch: session.glitch },
  }).then((result) => {
    if (result.status === "created") session.satsProposed += sats;
  }).catch((error: Error) => {
    broadcast({ type: "game", event: "submit_failed", pilot: session.name, note: `Payout service: ${error.message}` });
  });
}

/** Demo control: propose a coin worth more than the game's cap, for the policy to deny. */
const OVERSIZED_SAT = 500;
function proposeOversized(session: Session): void {
  const n = (session.oversized = (session.oversized ?? 0) + 1);
  payouts.submit({
    deliveryId: `${session.id}:oversized:${n}`,
    obligationKey: `shooter:${session.id}:oversized:${n}`,
    recipient: session.recipient,
    amountSat: OVERSIZED_SAT,
    reason: `Demo: a coin worth ${OVERSIZED_SAT} sat`,
    type: "coin.hit",
    policyVersion: "orbital-sats-v3",
    data: { pilot: session.name, coinId: `oversized-${n}`, glitch: session.glitch, demo: "oversized" },
  }).catch((error: Error) => {
    broadcast({ type: "game", event: "submit_failed", pilot: session.name, note: `Payout service: ${error.message}` });
  });
}

function endRound(session: Session): void {
  if (session.ended) return;
  session.ended = true;
  broadcast({ type: "game", event: "round_end", sessionId: session.id, pilot: session.name, coins: session.coinsHit });
}

setInterval(() => {
  const now = Date.now();
  for (const session of rounds.all()) if (!session.ended && now > session.endsAt + 1_000) endRound(session);
}, 500).unref();

// ---- HTTP --------------------------------------------------------------------

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(toJson(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64_000) throw new Error("Request too large");
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : {};
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/config") {
    return send(res, 200, {
      walletDomain: WALLET_DOMAIN,
      walletUrl: process.env.WALLET_PUBLIC_URL ?? `http://${WALLET_DOMAIN}`,
      glitchAllowed: process.env.ALLOW_GLITCH !== "0",
      satsPerCoin: SETTINGS.satsPerCoin,
    });
  }

  if (req.method === "GET" && path === "/api/policy") {
    // Only the rules that can decide a game payout: global ones and game.*.
    const policy = await payouts.policy();
    const rules = (policy.rules as Array<{ name: string }>).filter((rule) => !rule.name.includes(".") || rule.name.startsWith("game."));
    const routes = (policy.routes as Array<{ network: string }>).filter((r) => r.network === "Lightning");
    return send(res, 200, { rules, routes, paused: policy.paused });
  }

  if (req.method === "POST" && path === "/api/session") {
    const body = await readJson(req);
    try {
      const session = rounds.start({
        name: String(body.name ?? "").trim(),
        recipient: String(body.recipient ?? ""),
        glitch: body.glitch === true && process.env.ALLOW_GLITCH !== "0",
      });
      broadcast({ type: "game", event: "round_start", sessionId: session.id, pilot: session.name, glitch: session.glitch });
      return send(res, 201, { token: session.token, round: rounds.view(session) });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Could not start" });
    }
  }

  const sessionRoute = /^\/api\/session\/([0-9a-f-]{36})(?:\/(hit|end|oversized))?$/.exec(path);
  if (sessionRoute) {
    const session = rounds.get(sessionRoute[1]!);
    if (!session) return send(res, 404, { error: "Unknown session" });
    if (req.method === "GET" && !sessionRoute[2]) {
      return send(res, 200, { coinsHit: session.coinsHit, satsProposed: session.satsProposed, ended: session.ended, payouts: [...rows.values()].filter((r) => r.sessionId === session.id) });
    }
    const body = await readJson(req);
    if (body.token !== session.token) return send(res, 403, { error: "Wrong session token" });
    if (sessionRoute[2] === "oversized") {
      if (process.env.ALLOW_GLITCH === "0") return send(res, 403, { error: "Demo controls are off" });
      proposeOversized(session);
      return send(res, 202, { proposed: OVERSIZED_SAT });
    }
    if (sessionRoute[2] === "end") {
      endRound(session);
      return send(res, 200, { ended: true, coinsHit: session.coinsHit });
    }
    if (sessionRoute[2] === "hit") {
      const claim = { coinId: String(body.coinId ?? ""), shotAt: Number(body.shotAt), hitAt: Number(body.hitAt), x: Number(body.x), y: Number(body.y) };
      if (session.claimed.has(claim.coinId)) {
        // Replays reach Paycue on purpose: its duplicate protection, not the game, stops them.
        proposeCoin(session, claim.coinId);
        return send(res, 200, { ok: true, duplicate: true });
      }
      const verdict = rounds.verify(session, claim);
      if (!verdict.ok) {
        broadcast({ type: "game", event: "hit_rejected", sessionId: session.id, pilot: session.name, note: verdict.reason });
        return send(res, 200, { ok: false, reason: verdict.reason });
      }
      session.claimed.add(claim.coinId);
      session.coinsHit += 1;
      proposeCoin(session, claim.coinId);
      return send(res, 200, { ok: true, coinsHit: session.coinsHit, sats: SETTINGS.satsPerCoin });
    }
  }

  if (path === "/api/feed") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${toJson({ type: "snapshot", rows: [...rows.values()].slice(-80), serviceConnected })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  const file = path === "/" ? "index.html" : normalize(path).replace(/^\/+/, "");
  const full = join(publicDir, file);
  if (full.startsWith(publicDir) && existsSync(full)) {
    res.writeHead(200, { "content-type": TYPES[extname(full)] ?? "application/octet-stream" });
    res.end(readFileSync(full));
    return;
  }
  send(res, 404, { error: "not found" });
}

setInterval(() => {
  for (const client of clients) client.write(": ping\n\n");
}, 15_000).unref();

createServer((req, res) => {
  route(req, res).catch((error) => send(res, 500, { error: error instanceof Error ? error.message : "error" }));
}).listen(PORT, () => console.log(`[game] Orbital Sats on :${PORT} · payouts via ${process.env.PAYOUT_SERVICE_URL ?? "http://127.0.0.1:8089"}`));
