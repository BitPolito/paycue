import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A demo's payout-service token: from the environment, or the service's token file on this machine. */
export function clientToken(home: string, client: string): string {
  const env = process.env[`${client.toUpperCase()}_PAYOUT_TOKEN`];
  if (env) return env;
  const file = join(home, "payout-service", "tokens.json");
  const token = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { clients: Record<string, string> }).clients[client] : undefined;
  if (!token) throw new Error(`No ${client} token: set ${client.toUpperCase()}_PAYOUT_TOKEN or start the payout service first`);
  return token;
}
