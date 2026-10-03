/**
 * Demo player wallet. Stands in for the phone wallet a real player would use:
 * a Lightning Address backed by a Mutinynet LND node, and a Liquid testnet
 * wallet that can read its own confidential L-USDT balance.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LndRestTransport } from "@paycue/lnd";
import * as lwk from "lwk_wasm";

const home = process.env.PAYCUE_DEMO_HOME ?? join(process.env.HOME ?? ".", "paycue-demo");
const PORT = Number(process.env.WALLET_PORT ?? 8091);
const DOMAIN = process.env.WALLET_DOMAIN ?? `localhost:${PORT}`;
// Waterfalls answers a whole-wallet scan in a few requests; plain Esplora
// rate-limits a wallet that rescans every few seconds.
const ESPLORA = process.env.LIQUID_ESPLORA ?? "https://waterfalls.liquidwebwallet.org/liquidtestnet/api";
const WATERFALLS = process.env.LIQUID_WATERFALLS !== "0";
const L_USDT = process.env.L_USDT_ASSET ?? "5a061a1c68cb9f18c945d9d8cf24f5b9e1360fad120614eb6633113a04e22c1d";
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const lnd = new LndRestTransport({
  url: process.env.PLAYER_LND_URL ?? "https://127.0.0.1:8081",
  macaroon: process.env.PLAYER_LND_MACAROON ?? join(home, "lnd-player", "wallet.macaroon"),
  tlsCert: process.env.PLAYER_LND_CERT ?? join(home, "lnd-player", "tls.cert"),
});

type Receipt = { user: string; amountSat: number; settledAt: string; paymentHash: string };
type LiquidState = { address: string; balances: Record<string, string>; txCount: number; scannedAt: string | null; error?: string };

const receipts: Receipt[] = [];

// `wallet-reset.json` ({"lightningSince": ISO date}) starts the wallet's Lightning
// totals from zero again without touching the node's invoice history.
const resetFile = join(home, "wallet-reset.json");
function lightningSince(): string | null {
  try {
    const since = (JSON.parse(readFileSync(resetFile, "utf8")) as { lightningSince?: unknown }).lightningSince;
    return typeof since === "string" && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : null;
  } catch {
    return null;
  }
}
const clients = new Set<ServerResponse>();

function broadcast(type: string, data: unknown): void {
  const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) client.write(frame);
}

function metadata(user: string): string {
  return JSON.stringify([["text/plain", `Paycue demo wallet: ${user}`], ["text/identifier", `${user}@${DOMAIN}`]]);
}

function memoUser(memo: unknown): string | undefined {
  if (typeof memo !== "string") return undefined;
  // "payhook:" is the prefix used before the project was renamed.
  const prefix = ["paycue:", "payhook:"].find((p) => memo.startsWith(p));
  return prefix === undefined ? undefined : memo.slice(prefix.length);
}

function toReceipt(invoice: Record<string, unknown>): Receipt | undefined {
  const user = memoUser(invoice.memo);
  if (user === undefined || invoice.state !== "SETTLED") return undefined;
  return {
    user,
    amountSat: Number(invoice.amt_paid_sat ?? invoice.value ?? 0),
    settledAt: new Date(Number(invoice.settle_date ?? 0) * 1000).toISOString(),
    paymentHash: Buffer.from(String(invoice.r_hash ?? ""), "base64").toString("hex"),
  };
}

async function loadReceipts(): Promise<void> {
  const page = await lnd.getJson("/v1/invoices?num_max_invoices=500&reversed=true");
  const invoices = (page.invoices as Record<string, unknown>[] | undefined) ?? [];
  receipts.length = 0;
  for (const invoice of invoices) {
    const receipt = toReceipt(invoice);
    if (receipt) receipts.push(receipt);
  }
  receipts.sort((a, b) => (a.settledAt < b.settledAt ? 1 : -1));
}

// ---- Liquid ---------------------------------------------------------------

// LWK's Esplora client backs off with a browser `window.setTimeout` when the
// server rate-limits it. Under Node the global object has setTimeout, so let
// wasm-bindgen's `instanceof Window` check accept it.
(globalThis as { Window?: unknown }).Window ??= Object;

const network = lwk.Network.testnet();
const liquidDir = join(home, "liquid-player");
mkdirSync(liquidDir, { recursive: true, mode: 0o700 });
const mnemonicFile = join(liquidDir, "mnemonic");
if (!existsSync(mnemonicFile)) writeFileSync(mnemonicFile, lwk.Mnemonic.fromRandom(12).toString(), { mode: 0o600 });
const signer = new lwk.Signer(new lwk.Mnemonic(readFileSync(mnemonicFile, "utf8").trim()), network);
const wollet = new lwk.Wollet(network, signer.wpkhSlip77Descriptor());
const esplora = new lwk.EsploraClient(network, ESPLORA, WATERFALLS, 4, false);
const liquid: LiquidState = { address: wollet.address(0).address().toString(), balances: {}, txCount: 0, scannedAt: null };

function assetName(id: string): string {
  if (id === L_USDT) return "L-USDT";
  if (id === network.policyAsset().toString()) return "L-BTC";
  return id.slice(0, 8);
}

// LWK objects must not be used by two calls at once, so scans never overlap.
let scanning = false;

async function scanLiquid(): Promise<void> {
  if (scanning) return;
  scanning = true;
  try {
    const update = await esplora.fullScan(wollet);
    if (update) wollet.applyUpdate(update);
    const balances: Record<string, string> = {};
    const entries = wollet.balance().entries() as Map<string, bigint> | Array<[string, bigint]>;
    for (const [asset, amount] of entries instanceof Map ? entries.entries() : entries) {
      balances[assetName(String(asset))] = amount.toString();
    }
    const changed = JSON.stringify(balances) !== JSON.stringify(liquid.balances);
    liquid.balances = balances;
    liquid.txCount = wollet.transactions().length;
    liquid.scannedAt = new Date().toISOString();
    delete liquid.error;
    if (changed) broadcast("liquid", liquid);
  } catch (error) {
    liquid.error = error instanceof Error ? error.message : "scan failed";
  } finally {
    scanning = false;
  }
}

// ---- HTTP -----------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): void {
  res.writeHead(status, { "content-type": type, "access-control-allow-origin": "*" });
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${DOMAIN}`);
  const lnurlp = /^\/\.well-known\/lnurlp\/([a-z0-9._+-]+)$/i.exec(url.pathname);
  if (lnurlp) {
    const user = lnurlp[1]!.toLowerCase();
    return send(res, 200, {
      tag: "payRequest",
      callback: `http://${DOMAIN}/lnurl/cb/${user}`,
      minSendable: 1_000,
      maxSendable: 1_000_000_000,
      metadata: metadata(user),
    });
  }
  const callback = /^\/lnurl\/cb\/([a-z0-9._+-]+)$/i.exec(url.pathname);
  if (callback) {
    const user = callback[1]!.toLowerCase();
    const amount = Number(url.searchParams.get("amount"));
    if (!Number.isSafeInteger(amount) || amount < 1_000) return send(res, 400, { status: "ERROR", reason: "amount must be at least 1000 msat" });
    const descriptionHashHex = createHash("sha256").update(metadata(user)).digest("hex");
    const invoice = await lnd.addInvoice(BigInt(amount), `paycue:${user}`, { descriptionHashHex });
    return send(res, 200, { pr: invoice.invoice, routes: [] });
  }
  if (url.pathname === "/api/wallet") {
    const user = (url.searchParams.get("user") ?? "").toLowerCase();
    const since = lightningSince();
    const counted = since ? receipts.filter((r) => r.settledAt >= since) : receipts;
    const mine = user ? counted.filter((r) => r.user === user) : counted;
    const channels = await lnd.getJson("/v1/balance/channels").catch(() => ({}));
    return send(res, 200, {
      user,
      lightningAddress: user ? `${user}@${DOMAIN}` : null,
      lightning: {
        since,
        receivedSat: mine.reduce((sum, r) => sum + r.amountSat, 0),
        count: mine.length,
        recent: mine.slice(0, 30),
        nodeLocalBalanceSat: Number((channels as Record<string, { sat?: string }>).local_balance?.sat ?? 0),
      },
      liquid,
    });
  }
  if (url.pathname === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": "*" });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  const asset = /^\/brand\/([a-z0-9-]+\.svg)$/.exec(url.pathname);
  if (asset && existsSync(join(publicDir, "brand", asset[1]!))) {
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "max-age=3600" });
    res.end(readFileSync(join(publicDir, "brand", asset[1]!)));
    return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return send(res, 200, readFileSync(join(publicDir, "index.html"), "utf8"), "text/html; charset=utf-8");
  }
  send(res, 404, { error: "not found" });
}

lnd.stream("/v1/invoices/subscribe", (invoice) => {
  const receipt = toReceipt(invoice);
  if (receipt === undefined) return;
  receipts.unshift(receipt);
  broadcast("lightning", receipt);
});

await loadReceipts().catch((error) => console.error("[wallet] could not load invoices:", error.message));
void scanLiquid();
setInterval(() => void scanLiquid(), Number(process.env.LIQUID_SCAN_MS ?? 15_000)).unref();
setInterval(() => broadcast("ping", Date.now()), 15_000).unref();

createServer((req, res) => {
  route(req, res).catch((error) => send(res, 500, { status: "ERROR", reason: error instanceof Error ? error.message : "error" }));
}).listen(PORT, () => {
  console.log(`[wallet] listening on http://${DOMAIN} · Liquid address ${liquid.address}`);
});
