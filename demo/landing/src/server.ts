/**
 * Landing page for the Paycue demos at bitcoin++ Berlin. Serves the page and
 * a small summary (sats paid per demo, routes and their limits) read from the
 * payout service with the operator token, so no token reaches the browser.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const home = process.env.PAYCUE_DEMO_HOME ?? join(process.env.HOME ?? ".", "paycue-demo");
const PORT = Number(process.env.LANDING_PORT ?? 8088);
const SERVICE = process.env.PAYOUT_SERVICE_URL ?? "http://127.0.0.1:8089";
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

function adminToken(): string | undefined {
  const file = join(home, "payout-service", "tokens.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { admin?: string }).admin : undefined;
}

let cache: { at: number; body: string } | undefined;

async function summary(): Promise<string> {
  if (cache && Date.now() - cache.at < 3_000) return cache.body;
  const token = adminToken();
  const get = async (path: string): Promise<Record<string, any>> => {
    const res = await fetch(SERVICE + path, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json() as Promise<Record<string, any>>;
  };
  let body: Record<string, unknown>;
  try {
    const [status, policy] = await Promise.all([get("/v1/admin/status"), get("/v1/policy")]);
    body = {
      ok: true,
      paused: status.paused,
      settledSat: status.settledSatBySource ?? {},
      open: (status.open as unknown[] | undefined)?.length ?? 0,
      rules: policy.rules,
      routes: policy.routes,
    };
  } catch (error) {
    body = { ok: false, error: error instanceof Error ? error.message : "payout service unreachable" };
  }
  cache = { at: Date.now(), body: JSON.stringify(body) };
  return cache.body;
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/summary") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(await summary());
    return;
  }
  const file = url.pathname === "/" ? "index.html" : normalize(url.pathname).replace(/^\/+/, "");
  const full = join(publicDir, file);
  if (full.startsWith(publicDir) && existsSync(full)) {
    res.writeHead(200, { "content-type": TYPES[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(readFileSync(full));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}

createServer((req, res) => {
  route(req, res).catch(() => {
    res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => console.log(`[landing] on :${PORT}`));
