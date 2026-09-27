/**
 * The demos' shared payout service: one Paycue, one studio node, one budget.
 * The game demo and the contribution reward demo submit payouts here with
 * their own client tokens; operators use the console at /.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { OPEN_STATES } from "@paycue/core";
import { createPaycueServer } from "@paycue/server";
import { CLIENTS, type OutageMode, type ServiceConfig, createPaycue } from "./paycue.js";

const home = process.env.PAYCUE_DEMO_HOME ?? join(process.env.HOME ?? ".", "paycue-demo");
const PORT = Number(process.env.PAYOUT_PORT ?? 8089);
const dataDir = join(home, "payout-service");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });

const config: ServiceConfig = {
  home,
  dbPath: join(dataDir, "payouts.sqlite"),
  mode: process.env.PAYCUE_MODE === "fake" ? "fake" : "real",
  walletDomain: process.env.WALLET_DOMAIN ?? "localhost:8091",
  budgetSat: Number(process.env.DEMO_BUDGET_SAT ?? 600_000),
  gamePerMinute: Number(process.env.GAME_PER_MINUTE ?? 60),
  log: process.env.PAYCUE_LOG !== "0",
};

/** Tokens live next to the data so a machine move carries them along. */
type Tokens = { admin: string; clients: Record<string, string> };
const tokenFile = join(dataDir, "tokens.json");
const token = (): string => randomBytes(24).toString("base64url");
let tokens: Tokens = existsSync(tokenFile) ? JSON.parse(readFileSync(tokenFile, "utf8")) as Tokens : { admin: token(), clients: {} };
for (const client of Object.values(CLIENTS)) tokens.clients[client.id] ??= token();
writeFileSync(tokenFile, JSON.stringify(tokens, null, 2), { mode: 0o600 });

const paycue = createPaycue(config);

const server = createPaycueServer({
  title: "Paycue signet demo",
  runtime: paycue.runtime,
  storage: paycue.storage,
  pause: paycue.pause,
  adminToken: tokens.admin,
  clients: Object.values(CLIENTS).map((client) => ({ ...client, token: tokens.clients[client.id]! })),
  status: async () => {
    const node: Record<string, unknown> = { mode: config.mode, outage: paycue.outage.mode };
    if (paycue.studio) {
      const [channels, chain] = await Promise.all([
        paycue.studio.getJson("/v1/balance/channels").catch((e: Error) => ({ error: e.message })),
        paycue.studio.getJson("/v1/balance/blockchain").catch((e: Error) => ({ error: e.message })),
      ]) as Array<Record<string, any>>;
      node.channels = channels?.error ?? `${Number(channels?.local_balance?.sat ?? 0).toLocaleString("en-US")} sat out, ${Number(channels?.remote_balance?.sat ?? 0).toLocaleString("en-US")} sat in`;
      node.onchain = chain?.error ?? `${Number(chain?.confirmed_balance ?? 0).toLocaleString("en-US")} sat`;
    }
    return { studio: node };
  },
  actions: {
    "drop-response": {
      label: "Drop next node response",
      description: "Recovery scene: the next payment is sent but its answer is lost",
      tone: "warning",
      run: () => setOutage("drop-next-response"),
    },
    offline: {
      label: "Take studio node offline",
      description: "Payouts wait as unknown until restored",
      tone: "warning",
      run: () => setOutage("offline"),
    },
    restore: {
      label: "Restore studio node",
      run: () => setOutage("normal"),
    },
    reset: {
      label: "Archive history and restart",
      description: "Refuses while payouts are unfinished; the old database is kept",
      tone: "warning",
      run: () => reset(),
    },
  },
});

function setOutage(mode: OutageMode): { message: string } {
  paycue.outage.mode = mode;
  if (mode === "normal") void paycue.runtime.processPending();
  return { message: `studio node: ${mode}` };
}

function reset(): { message: string } {
  const open = paycue.storage.listPayouts({ states: [...OPEN_STATES, "stuck"] });
  if (open.length > 0) throw new Error(`${open.length} payouts are still open; let them finish first`);
  paycue.stop();
  const stamp = Date.now();
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = config.dbPath + suffix;
    if (existsSync(file)) renameSync(file, config.dbPath.replace(/\.sqlite$/, `.${stamp}.sqlite${suffix}`));
  }
  // systemd restarts the service with a fresh database.
  setTimeout(() => process.exit(75), 200);
  return { message: "history archived; restarting" };
}

createServer(server.handler).listen(PORT, () => {
  console.log(`[payout-service] ${config.mode} mode on :${PORT} · console http://localhost:${PORT}/ · tokens in ${tokenFile}`);
});
