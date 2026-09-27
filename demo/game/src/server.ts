/**
 * Orbital Sats: the Payhook showcase game server. Serves the game, validates
 * hits against its own coin schedule, and turns valid hits into payouts.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMITTED_STATES, OPEN_STATES, type PayhookEvent, type Payout, publicPayout, toJson } from "@payhook/core";
import { type Difficulty, DIFFICULTY, PRIZE_COINS_NEEDED, ROUND_PRIZE_SAT, Rounds, type Session } from "./game.js";
import { type DemoConfig, type DemoPayhook, type OutageMode, createPayhook } from "./payhook.js";

const home = process.env.PAYHOOK_DEMO_HOME ?? join(process.env.HOME ?? ".", "payhook-demo");
const PORT = Number(process.env.GAME_PORT ?? 8090);
const dataDir = join(home, "game");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const config: DemoConfig = {
  home,
  dbPath: join(dataDir, "payouts.sqlite"),
  mode: process.env.PAYHOOK_MODE === "fake" ? "fake" : "real",
  walletDomain: process.env.WALLET_DOMAIN ?? "localhost:8091",
  budgetSat: Number(process.env.DEMO_BUDGET_SAT ?? 400_000),
  perMinuteCount: Number(process.env.DEMO_PER_MINUTE ?? 60),
  log: process.env.PAYHOOK_LOG !== "0",
};
const tokenFile = join(dataDir, "admin-token");
if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(18).toString("base64url"), { mode: 0o600 });
const ADMIN_TOKEN = readFileSync(tokenFile, "utf8").trim();
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const rounds = new Rounds();
let payhook: DemoPayhook = createPayhook(config);

// ---- Live feed --------------------------------------------------------------

export type FeedRow = {
  payoutId: string;
  obligationKey: string;
  sessionId: string | null;
  pilot: string;
  kind: "coin" | "prize";
  level: string;
  amountSat: number;
  state: string;
  route: string | null;
  note: string | null;
  delivered: Record<string, unknown> | null;
  updatedAt: string;
};

const clients = new Set<ServerResponse>();
const rows = new Map<string, FeedRow>();

function broadcast(message: Record<string, unknown>): void {
  const frame = `data: ${toJson(message)}\n\n`;
  for (const client of clients) client.write(frame);
}

function lastNote(payout: Payout): string | null {
  for (const item of [...payout.evidence].reverse()) {
    const detail = item.detail ?? {};
    if (item.kind === "delivered") {
      const txid = typeof detail.payoutTxid === "string" ? detail.payoutTxid : null;
      return txid ? `Delivered on Liquid · tx ${txid.slice(0, 12)}…` : "Delivered";
    }
    if (item.kind === "resolved" && typeof detail.payoutAmount === "number") {
      return `Swap quoted: ${(detail.payoutAmount / 1e8).toFixed(2)} ${String(detail.payoutAsset ?? "")} · fee ${((Number(detail.feeBps) || 0) / 100).toFixed(2)}%`;
    }
    if (typeof detail.reason === "string") return detail.reason;
  }
  return null;
}

function rowOf(payout: Payout): FeedRow {
  const data = (payout.sourceEvent.data ?? {}) as Record<string, unknown>;
  const parts = payout.obligationKey.split(":");
  const route = payout.attempts.at(-1)?.resolver
    ?? (payout.evidence.find((e) => e.kind === "resolver_selected")?.detail?.resolver as string | undefined)
    ?? null;
  const delivered = payout.evidence.find((e) => e.kind === "delivered")?.detail ?? null;
  const resolved = payout.evidence.find((e) => e.kind === "resolved" && e.actor === "resolver:kaleidoswap")?.detail;
  return {
    payoutId: payout.id,
    obligationKey: payout.obligationKey,
    sessionId: parts[1] ?? null,
    pilot: String(data.pilot ?? "pilot"),
    kind: payout.obligationKey.endsWith(":round-prize") ? "prize" : "coin",
    level: String(data.level ?? ""),
    amountSat: Number(payout.amountMsat / 1000n),
    state: payout.state,
    route,
    note: lastNote(payout),
    delivered: delivered ?? (resolved ? { quotedAmount: resolved.payoutAmount, asset: resolved.payoutAsset } : null),
    updatedAt: payout.updatedAt,
  };
}

function track(payout: Payout): void {
  const row = rowOf(payout);
  rows.set(row.payoutId, row);
  if (rows.size > 400) rows.delete(rows.keys().next().value!);
  broadcast({ type: "row", row });
}

function subscribe(target: DemoPayhook): void {
  target.runtime.on((event: PayhookEvent) => {
    if (event.type === "payout.duplicate") {
      broadcast({ type: "game", event: "duplicate", obligationKey: event.obligationKey, note: event.status === "duplicate_delivery" ? "Replayed hit ignored: same delivery" : "Replayed hit ignored: obligation already exists" });
      return;
    }
    track(event.payout);
  });
}

function loadRows(): void {
  rows.clear();
  for (const payout of payhook.storage.listPayouts({ limit: 200 }).reverse()) rows.set(payout.id, rowOf(publicPayout(payout)));
}
subscribe(payhook);
loadRows();

// ---- Game flow --------------------------------------------------------------

function proposeCoin(session: Session, coinId: string): void {
  const sats = DIFFICULTY[session.difficulty].satsPerCoin;
  const outcome = payhook.runtime.submit({
    source: "orbital-sats",
    deliveryId: `${session.id}:${coinId}`,
    type: "coin.hit",
    occurredAt: new Date().toISOString(),
    data: { pilot: session.name, level: session.level, coinId, difficulty: session.difficulty, glitch: session.glitch },
  }, {
    obligationKey: `shooter:${session.id}:coin:${coinId}`,
    recipient: session.recipient,
    amountMsat: BigInt(sats) * 1000n,
    reason: `Golden coin ${coinId} (${DIFFICULTY[session.difficulty].label})`,
    policyVersion: "orbital-sats-v1",
  });
  if (outcome.status === "created") {
    session.satsProposed += sats;
    void payhook.runtime.execute(outcome.payout.id);
  }
}

function endRound(session: Session): void {
  if (session.ended) return;
  session.ended = true;
  broadcast({ type: "game", event: "round_end", sessionId: session.id, pilot: session.name, coins: session.coinsHit });
  if (session.level !== "liquid" || session.prizeSubmitted) return;
  if (session.coinsHit < PRIZE_COINS_NEEDED) {
    broadcast({ type: "game", event: "no_prize", sessionId: session.id, pilot: session.name, note: `Round prize needs ${PRIZE_COINS_NEEDED} coins; got ${session.coinsHit}` });
    return;
  }
  session.prizeSubmitted = true;
  const outcome = payhook.runtime.submit({
    source: "orbital-sats",
    deliveryId: `${session.id}:round-prize`,
    type: "round.prize",
    occurredAt: new Date().toISOString(),
    data: { pilot: session.name, level: session.level, coins: session.coinsHit },
  }, {
    obligationKey: `shooter:${session.id}:round-prize`,
    recipient: session.recipient,
    amountMsat: BigInt(ROUND_PRIZE_SAT) * 1000n,
    reason: `Round prize: ${session.coinsHit} golden coins`,
    policyVersion: "orbital-sats-v1",
  });
  if (outcome.status === "created") void payhook.runtime.execute(outcome.payout.id);
}

setInterval(() => {
  const now = Date.now();
  for (const session of rounds.all()) if (!session.ended && now > session.endsAt + 1_000) endRound(session);
}, 500).unref();

// ---- HTTP -------------------------------------------------------------------

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

function isAdmin(req: IncomingMessage, url: URL): boolean {
  return req.headers["x-admin-token"] === ADMIN_TOKEN || url.searchParams.get("token") === ADMIN_TOKEN;
}

async function adminStatus(): Promise<Record<string, unknown>> {
  const committed = payhook.storage.listPayouts({ states: COMMITTED_STATES });
  const settled = committed.filter((p) => p.state === "settled");
  const open = payhook.storage.listPayouts({ states: [...OPEN_STATES, "stuck"] });
  let balances: Record<string, unknown> | null = null;
  if (payhook.studio) {
    const [channels, chain] = await Promise.all([
      payhook.studio.getJson("/v1/balance/channels").catch((e: Error) => ({ error: e.message })),
      payhook.studio.getJson("/v1/balance/blockchain").catch((e: Error) => ({ error: e.message })),
    ]);
    balances = { channels, chain };
  }
  return {
    mode: payhook.mode,
    paused: payhook.pause.paused,
    outage: payhook.outage.mode,
    budgetSat: config.budgetSat,
    perMinuteCount: config.perMinuteCount,
    committedSat: committed.reduce((sum, p) => sum + Number(p.amountMsat / 1000n), 0),
    settledSat: settled.reduce((sum, p) => sum + Number(p.amountMsat / 1000n), 0),
    openPayouts: open.map((p) => ({ id: p.id, state: p.state, obligationKey: p.obligationKey })),
    balances,
  };
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/config") {
    return send(res, 200, {
      mode: payhook.mode,
      walletDomain: config.walletDomain,
      walletUrl: process.env.WALLET_PUBLIC_URL ?? `http://${config.walletDomain}`,
      glitchAllowed: process.env.ALLOW_GLITCH !== "0",
      prize: { sat: ROUND_PRIZE_SAT, coinsNeeded: PRIZE_COINS_NEEDED },
      difficulty: DIFFICULTY,
    });
  }

  if (req.method === "POST" && path === "/api/session") {
    const body = await readJson(req);
    const difficulty = (["easy", "normal", "hard"].includes(String(body.difficulty)) ? body.difficulty : "normal") as Difficulty;
    try {
      const session = rounds.start({
        name: String(body.name ?? "").trim(),
        recipient: String(body.recipient ?? ""),
        difficulty,
        glitch: body.glitch === true && process.env.ALLOW_GLITCH !== "0",
      });
      broadcast({ type: "game", event: "round_start", sessionId: session.id, pilot: session.name, level: session.level, difficulty, glitch: session.glitch });
      return send(res, 201, { token: session.token, round: rounds.view(session) });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : "Could not start" });
    }
  }

  const sessionRoute = /^\/api\/session\/([0-9a-f-]{36})(?:\/(hit|end))?$/.exec(path);
  if (sessionRoute) {
    const session = rounds.get(sessionRoute[1]!);
    if (!session) return send(res, 404, { error: "Unknown session" });
    if (req.method === "GET" && !sessionRoute[2]) {
      return send(res, 200, { coinsHit: session.coinsHit, satsProposed: session.satsProposed, ended: session.ended, payouts: [...rows.values()].filter((r) => r.sessionId === session.id) });
    }
    const body = await readJson(req);
    if (body.token !== session.token) return send(res, 403, { error: "Wrong session token" });
    if (sessionRoute[2] === "end") {
      endRound(session);
      return send(res, 200, { ended: true, coinsHit: session.coinsHit });
    }
    if (sessionRoute[2] === "hit") {
      const claim = {
        coinId: String(body.coinId ?? ""),
        shotAt: Number(body.shotAt),
        hitAt: Number(body.hitAt),
        x: Number(body.x),
        y: Number(body.y),
      };
      const replay = session.claimed.has(claim.coinId);
      if (replay) {
        // Level 1 replays reach Payhook on purpose: its dedup, not the game,
        // stops them. Level 2 coins only count toward the round prize.
        if (session.level === "lightning") proposeCoin(session, claim.coinId);
        return send(res, 200, { ok: true, duplicate: true });
      }
      const verdict = rounds.verify(session, claim);
      if (!verdict.ok) {
        broadcast({ type: "game", event: "hit_rejected", sessionId: session.id, pilot: session.name, note: verdict.reason });
        return send(res, 200, { ok: false, reason: verdict.reason });
      }
      session.claimed.add(claim.coinId);
      session.coinsHit += 1;
      if (session.level === "lightning") proposeCoin(session, claim.coinId);
      return send(res, 200, { ok: true, coinsHit: session.coinsHit, sats: session.level === "lightning" ? DIFFICULTY[session.difficulty].satsPerCoin : 0 });
    }
  }

  if (path === "/api/feed") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${toJson({ type: "snapshot", rows: [...rows.values()].slice(-80), mode: payhook.mode, paused: payhook.pause.paused })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (path.startsWith("/api/admin/")) {
    if (!isAdmin(req, url)) return send(res, 401, { error: "Admin token required" });
    const action = path.slice("/api/admin/".length);
    if (req.method === "GET" && action === "status") return send(res, 200, await adminStatus());
    if (req.method === "GET" && action.startsWith("payout/")) {
      const payout = payhook.storage.getPayout(action.slice("payout/".length));
      return payout ? send(res, 200, publicPayout(payout)) : send(res, 404, { error: "Unknown payout" });
    }
    if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
    const body = await readJson(req);
    if (action === "pause") payhook.pause.pause(String(body.reason ?? "Paused by the operator"));
    else if (action === "resume") {
      payhook.pause.resume();
      void payhook.runtime.processPending();
    } else if (action === "outage") {
      const mode = String(body.mode) as OutageMode;
      if (!["normal", "offline", "drop-next-response"].includes(mode)) return send(res, 400, { error: "Unknown outage mode" });
      payhook.outage.mode = mode;
      if (mode === "normal") void payhook.runtime.processPending();
    } else if (action === "reset") {
      const open = payhook.storage.listPayouts({ states: [...OPEN_STATES, "stuck"] });
      if (open.length > 0 && body.force !== true) {
        return send(res, 409, { error: `${open.length} payouts are still open; finish them or force the reset`, open: open.map((p) => p.id) });
      }
      payhook.stop();
      // Obligation keys include the session id, so ending every session makes
      // it impossible to replay a hit that was paid before the reset.
      rounds.clear();
      // Archive rather than delete: the old file keeps its audit trail.
      renameSync(config.dbPath, config.dbPath.replace(/\.sqlite$/, `.${Date.now()}.sqlite`));
      for (const suffix of ["-wal", "-shm"]) {
        if (existsSync(config.dbPath + suffix)) renameSync(config.dbPath + suffix, config.dbPath.replace(/\.sqlite$/, `.${Date.now()}.sqlite${suffix}`));
      }
      payhook = createPayhook(config);
      subscribe(payhook);
      loadRows();
      broadcast({ type: "reset" });
    } else return send(res, 404, { error: "Unknown admin action" });
    broadcast({ type: "admin", paused: payhook.pause.paused, outage: payhook.outage.mode });
    return send(res, 200, await adminStatus());
  }

  // Static files.
  const file = path === "/" ? "index.html" : path === "/admin" ? "admin.html" : normalize(path).replace(/^\/+/, "");
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
}).listen(PORT, () => {
  console.log(`[orbital-sats] ${config.mode} mode on http://localhost:${PORT} · admin: http://localhost:${PORT}/admin?token=${ADMIN_TOKEN}`);
});
