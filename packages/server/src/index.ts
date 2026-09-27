/**
 * Run Payhook as a service. Several applications (clients) submit payout
 * requests over HTTP to one runtime, so one executor decides every payout
 * from a node and budgets see all of them. Includes a neutral operator
 * console. Only `node:http` types are used; mount the handler on any server.
 */
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type PayhookEvent,
  type Payout,
  type PayoutStorage,
  type PayhookRuntime,
  type PauseSwitch,
  type PayoutState,
  InvalidProposalError,
  type PolicyRule,
  allow,
  publicPayout,
  toJson,
} from "@payhook/core";
import { consoleHtml } from "./console.js";

export { PayhookClient, type PayhookClientOptions, type SubmitRequest } from "./client.js";

export type ServerClient = {
  /** Becomes the event source and the obligation-key namespace. */
  id: string;
  token: string;
  label?: string;
};

export type AdminAction = {
  label: string;
  /** Shown next to the button. */
  description?: string;
  /** Destructive or scene-changing actions are shown in a warning style. */
  tone?: "normal" | "warning";
  run(body: Record<string, unknown>): unknown | Promise<unknown>;
};

export type PayhookServerOptions = {
  runtime: PayhookRuntime;
  storage: PayoutStorage;
  clients: ServerClient[];
  adminToken: string;
  pause?: PauseSwitch;
  /** Extra operator facts, e.g. node balances. */
  status?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Extra operator buttons, keyed by a URL-safe name. */
  actions?: Record<string, AdminAction>;
  title?: string;
  /** Largest request body accepted. Default 64 KiB. */
  maxBodyBytes?: number;
};

type Caller = { kind: "admin" } | { kind: "client"; client: ServerClient };

export type PayoutRequest = {
  deliveryId: string;
  obligationKey: string;
  recipient: string;
  /** Whole satoshis; or give `amountMsat` as a decimal string. */
  amountSat?: number;
  amountMsat?: string;
  reason: string;
  policyVersion?: string;
  type?: string;
  occurredAt?: string;
  data?: Record<string, unknown>;
};

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function text(value: unknown, name: string, max = 512): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > max) {
    throw new HttpError(400, `${name} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

function amountOf(body: PayoutRequest): bigint {
  if (body.amountMsat !== undefined) {
    if (typeof body.amountMsat !== "string" || !/^[1-9]\d{0,18}$/.test(body.amountMsat)) throw new HttpError(400, "amountMsat must be a positive integer string");
    return BigInt(body.amountMsat);
  }
  if (!Number.isSafeInteger(body.amountSat) || (body.amountSat as number) <= 0) throw new HttpError(400, "amountSat must be a positive integer");
  return BigInt(body.amountSat as number) * 1000n;
}

/**
 * Apply a rule only to one client's payouts, e.g. a coin-sized cap for a game
 * and a bounty-sized cap for contribution rewards, on one shared node.
 * Budgets and pauses usually stay global.
 */
export function forClient(clientId: string, rule: PolicyRule): PolicyRule {
  const prefix = `${clientId}:`;
  return {
    name: `${clientId}.${rule.name}`,
    description: `${clientId}: ${rule.description ?? rule.name}`,
    check: (proposal, context) => (proposal.obligationKey.startsWith(prefix) ? rule.check(proposal, context) : allow),
  };
}

export function sourceOf(payout: Payout): string {
  return payout.sourceEvent.source;
}

export class PayhookServer {
  private readonly streams = new Map<ServerResponse, Caller>();
  private readonly unsubscribe: () => void;
  private readonly ping: ReturnType<typeof setInterval>;

  constructor(private readonly options: PayhookServerOptions) {
    const ids = new Set<string>();
    for (const client of options.clients) {
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(client.id)) throw new Error(`Client id "${client.id}" must be lowercase letters, digits and dashes`);
      if (ids.has(client.id)) throw new Error(`Duplicate client id ${client.id}`);
      if (client.token.length < 16) throw new Error(`Client ${client.id} needs a token of at least 16 characters`);
      ids.add(client.id);
    }
    if (options.adminToken.length < 16) throw new Error("adminToken must be at least 16 characters");
    this.unsubscribe = options.runtime.on((event) => this.broadcast(event));
    this.ping = setInterval(() => {
      for (const stream of this.streams.keys()) stream.write(": ping\n\n");
    }, 15_000);
    this.ping.unref?.();
  }

  close(): void {
    this.unsubscribe();
    clearInterval(this.ping);
    for (const stream of this.streams.keys()) stream.end();
    this.streams.clear();
  }

  /** Use as `createServer(server.handler)`. */
  readonly handler = (req: IncomingMessage, res: ServerResponse): void => {
    this.route(req, res).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : error instanceof InvalidProposalError ? 400 : 500;
      this.json(res, status, { error: error instanceof Error ? error.message : "error" });
    });
  };

  private caller(req: IncomingMessage, url: URL): Caller | undefined {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("token") ?? "";
    if (token === "") return undefined;
    if (same(token, this.options.adminToken)) return { kind: "admin" };
    const client = this.options.clients.find((candidate) => same(token, candidate.token));
    return client ? { kind: "client", client } : undefined;
  }

  private require(req: IncomingMessage, url: URL, admin = false): Caller {
    const caller = this.caller(req, url);
    if (!caller) throw new HttpError(401, "A valid token is required");
    if (admin && caller.kind !== "admin") throw new HttpError(403, "Operator token required");
    return caller;
  }

  private visible(caller: Caller, payout: Payout): boolean {
    return caller.kind === "admin" || sourceOf(payout) === caller.client.id;
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    if (res.headersSent) return;
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(toJson(body));
  }

  private async body(req: IncomingMessage): Promise<Record<string, unknown>> {
    const limit = this.options.maxBodyBytes ?? 65_536;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > limit) throw new HttpError(413, "Request body too large");
      chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) return {};
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
      return value as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Body must be a JSON object");
    }
  }

  private broadcast(event: PayhookEvent): void {
    const payout = event.payout;
    for (const [stream, caller] of this.streams) {
      if (payout && !this.visible(caller, payout)) continue;
      if (!payout && caller.kind !== "admin") continue;
      stream.write(`data: ${toJson(event)}\n\n`);
    }
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://payhook.local");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method ?? "GET";

    if (method === "GET" && (path === "/" || path === "/console")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(consoleHtml(this.options.title ?? "Payhook"));
      return;
    }
    if (method === "GET" && path === "/v1/health") return this.json(res, 200, { ok: true });

    if (path === "/v1/payouts" && method === "POST") {
      const caller = this.require(req, url);
      if (caller.kind !== "client") throw new HttpError(403, "Submit payouts with a client token");
      const body = await this.body(req) as unknown as PayoutRequest;
      const source = caller.client.id;
      const outcome = this.options.runtime.submit({
        source,
        deliveryId: text(body.deliveryId, "deliveryId"),
        type: body.type === undefined ? "payout.requested" : text(body.type, "type", 64),
        occurredAt: body.occurredAt === undefined ? new Date().toISOString() : text(body.occurredAt, "occurredAt", 64),
        data: typeof body.data === "object" && body.data !== null ? body.data : {},
      }, {
        // Namespaced so one client can never collide with another's obligations.
        obligationKey: `${source}:${text(body.obligationKey, "obligationKey")}`,
        recipient: text(body.recipient, "recipient", 1024),
        amountMsat: amountOf(body),
        reason: text(body.reason, "reason"),
        policyVersion: body.policyVersion === undefined ? `${source}-v1` : text(body.policyVersion, "policyVersion", 64),
      });
      if (outcome.status === "created") void this.options.runtime.execute(outcome.payout.id);
      return this.json(res, outcome.status === "created" ? 201 : 200, {
        status: outcome.status,
        ...(outcome.payout === undefined ? {} : { payout: publicPayout(outcome.payout) }),
      });
    }

    if (path === "/v1/payouts" && method === "GET") {
      const caller = this.require(req, url);
      const states = url.searchParams.get("state")?.split(",").filter(Boolean) as PayoutState[] | undefined;
      const source = url.searchParams.get("source");
      const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 100) || 100);
      const rows = this.options.storage.listPayouts(states?.length ? { states } : {})
        .filter((payout) => this.visible(caller, payout) && (source === null || sourceOf(payout) === source))
        .slice(0, limit)
        .map(publicPayout);
      return this.json(res, 200, { payouts: rows });
    }

    const one = /^\/v1\/payouts\/([^/]+)$/.exec(path);
    if (one && method === "GET") {
      const caller = this.require(req, url);
      const payout = this.options.storage.getPayout(decodeURIComponent(one[1]!));
      if (!payout || !this.visible(caller, payout)) throw new HttpError(404, "Unknown payout");
      return this.json(res, 200, publicPayout(payout));
    }

    if (path === "/v1/events" && method === "GET") {
      const caller = this.require(req, url);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write(": connected\n\n");
      this.streams.set(res, caller);
      req.on("close", () => this.streams.delete(res));
      return;
    }

    if (path === "/v1/policy" && method === "GET") {
      this.require(req, url);
      const { runtime } = this.options;
      const routes = (await Promise.all(runtime.routes.map(async (resolver) => {
        try {
          return (await resolver.constraints?.()) ?? [{ resolver: resolver.name, network: "?", asset: "?", settles: "?", limits: [] }];
        } catch (error) {
          return [{ resolver: resolver.name, network: "?", asset: "?", settles: "unavailable", limits: [], error: error instanceof Error ? error.message : "error" }];
        }
      }))).flat();
      return this.json(res, 200, {
        rules: runtime.policy.map((rule) => ({ name: rule.name, description: rule.description ?? null, setBy: "operator" })),
        routes,
        paused: this.options.pause?.paused ?? false,
      });
    }

    if (path === "/v1/admin/status" && method === "GET") {
      this.require(req, url, true);
      const open = this.options.storage.listPayouts({ states: ["received", "proposed", "authorized", "resolving", "attempting", "unknown", "stuck"] });
      const sources = new Map<string, number>();
      for (const payout of this.options.storage.listPayouts({ states: ["settled"] })) {
        sources.set(sourceOf(payout), (sources.get(sourceOf(payout)) ?? 0) + Number(payout.amountMsat / 1000n));
      }
      return this.json(res, 200, {
        title: this.options.title ?? "Payhook",
        paused: this.options.pause?.paused ?? false,
        clients: this.options.clients.map((client) => ({ id: client.id, label: client.label ?? client.id })),
        settledSatBySource: Object.fromEntries(sources),
        open: open.map((payout) => ({ id: payout.id, state: payout.state, source: sourceOf(payout), obligationKey: payout.obligationKey })),
        actions: Object.entries(this.options.actions ?? {}).map(([name, action]) => ({ name, label: action.label, description: action.description ?? null, tone: action.tone ?? "normal" })),
        ...(this.options.status ? { extra: await this.options.status() } : {}),
      });
    }

    const admin = /^\/v1\/admin\/(pause|resume|actions\/([a-z0-9-]+))$/.exec(path);
    if (admin && method === "POST") {
      this.require(req, url, true);
      const body = await this.body(req);
      let result: unknown = { ok: true };
      if (admin[1] === "pause") {
        if (!this.options.pause) throw new HttpError(404, "No pause switch configured");
        this.options.pause.pause(typeof body.reason === "string" && body.reason ? body.reason.slice(0, 200) : "Paused by the operator");
      } else if (admin[1] === "resume") {
        if (!this.options.pause) throw new HttpError(404, "No pause switch configured");
        this.options.pause.resume();
        void this.options.runtime.processPending();
      } else {
        const action = this.options.actions?.[admin[2]!];
        if (!action) throw new HttpError(404, "Unknown action");
        result = await action.run(body);
      }
      for (const [stream, caller] of this.streams) {
        if (caller.kind === "admin") stream.write(`data: ${toJson({ type: "admin", action: admin[1], paused: this.options.pause?.paused ?? false })}\n\n`);
      }
      return this.json(res, 200, result ?? { ok: true });
    }

    throw new HttpError(404, "Not found");
  }
}

export function createPayhookServer(options: PayhookServerOptions): PayhookServer {
  return new PayhookServer(options);
}
