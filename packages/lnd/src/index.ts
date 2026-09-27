import { request as httpsRequest } from "node:https";
import { readFileSync } from "node:fs";
import type {
  DecodedInvoice,
  DispatchResult,
  LookupResult,
  Msat,
  PayOptions,
  PaymentProvider,
} from "@paycue/core";

/** The small part of LND's RPC surface Paycue needs.
 *
 * An application can implement this with grpc-js, REST, or an existing LND
 * SDK. {@link LndRestTransport} is a dependency-free REST implementation.
 */
export interface LndTransport {
  decodePayReq(invoice: string): Promise<LndDecodedInvoice>;
  sendPaymentV2(invoice: string, options: { timeoutSeconds: number; feeLimitSat: number }): Promise<LndPaymentUpdate>;
  trackPaymentV2(paymentHash: string): Promise<LndPaymentUpdate>;
}

export type LndDecodedInvoice = {
  paymentHash: string;
  /** Amount in millisatoshis. Omitted means a zero-amount invoice. */
  amountMsat?: Msat;
  destination?: string;
  /** Unix seconds. */
  timestamp?: number;
  /** Seconds after `timestamp`. */
  expiry?: number;
};

export type LndPaymentStatus = "SUCCEEDED" | "FAILED" | "IN_FLIGHT" | "INITIATED" | "PENDING" | "NOT_FOUND";

export type LndPaymentUpdate = {
  status: LndPaymentStatus | string;
  paymentHash?: string;
  preimage?: string;
  feeMsat?: Msat;
  failureReason?: string;
  failureCode?: string | number;
};

export type LndProviderOptions = {
  transport: LndTransport;
  version?: string;
  /** Routing fee cap for an amount. Default: 1% with a 10 sat floor. */
  feeLimitSat?: (amountMsat: Msat) => number;
};

function status(update: LndPaymentUpdate): string {
  return update.status.toUpperCase();
}

/** PaymentProvider backed by LND's DecodePayReq, SendPaymentV2 and TrackPaymentV2. */
export class LndPaymentProvider implements PaymentProvider {
  readonly name = "lnd";
  readonly version: string;
  /** LND refuses a second payment for a hash that is in flight or already paid. */
  readonly idempotentByPaymentHash = true;
  private readonly transport: LndTransport;
  private readonly feeLimitSat: (amountMsat: Msat) => number;
  private readonly amounts = new Map<string, Msat>();

  constructor(options: LndProviderOptions) {
    this.transport = options.transport;
    this.version = options.version ?? "unknown";
    this.feeLimitSat = options.feeLimitSat ?? ((msat) => Math.max(10, Math.ceil(Number(msat / 1000n) / 100)));
  }

  async decode(invoice: string): Promise<DecodedInvoice> {
    const decoded = await this.transport.decodePayReq(invoice);
    if (!decoded.paymentHash) throw new Error("Decoded invoice has no payment hash");
    if (decoded.amountMsat !== undefined) this.amounts.set(decoded.paymentHash, decoded.amountMsat);
    return {
      paymentHash: decoded.paymentHash,
      ...(decoded.amountMsat === undefined ? {} : { amountMsat: decoded.amountMsat }),
      ...(decoded.destination === undefined ? {} : { destination: decoded.destination }),
      ...(decoded.timestamp !== undefined && decoded.expiry !== undefined
        ? { expiresAt: new Date((decoded.timestamp + decoded.expiry) * 1000).toISOString() }
        : {}),
    };
  }

  async pay(invoice: string, paymentHash: string, options: PayOptions): Promise<DispatchResult> {
    const amount = this.amounts.get(paymentHash) ?? (await this.decode(invoice)).amountMsat ?? 0n;
    const update = await this.transport.sendPaymentV2(invoice, {
      timeoutSeconds: options.timeoutSeconds,
      feeLimitSat: this.feeLimitSat(amount),
    });
    const hash = update.paymentHash ?? paymentHash;
    const current = status(update);
    if (current === "SUCCEEDED") {
      return {
        outcome: "settled",
        paymentHash: hash,
        ...(update.preimage === undefined ? {} : { preimage: update.preimage }),
        ...(update.feeMsat === undefined ? {} : { feeMsat: update.feeMsat }),
      };
    }
    if (current === "FAILED") {
      return {
        outcome: "failed",
        paymentHash: hash,
        reason: update.failureReason ?? (update.failureCode === undefined ? "LND payment failed" : `LND payment failed (${update.failureCode})`),
      };
    }
    return { outcome: "unknown", paymentHash: hash, reason: `LND payment status: ${update.status}` };
  }

  async lookup(paymentHash: string): Promise<LookupResult> {
    const current = status(await this.transport.trackPaymentV2(paymentHash));
    if (current === "SUCCEEDED") return "settled";
    if (current === "FAILED") return "failed";
    if (current === "NOT_FOUND") return "not_found";
    return "inflight";
  }
}

export type LndRestOptions = {
  /** e.g. https://127.0.0.1:8080 */
  url: string;
  /** Hex macaroon, or a path to the macaroon file. Use a payment-scoped macaroon. */
  macaroon: string;
  /** PEM certificate, or a path to tls.cert. */
  tlsCert: string;
};

type Line = Record<string, unknown>;

function readMaybeFile(value: string, binary: boolean): string {
  if (value.includes("-----BEGIN") || /^[0-9a-f]+$/i.test(value)) return value;
  const content = readFileSync(value);
  return binary ? content.toString("hex") : content.toString("utf8");
}

/** LND's REST gateway wants URL-safe base64 with its `=` padding kept. */
function hexToBase64Url(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64ToHex(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? Buffer.from(value, "base64").toString("hex") : undefined;
}

function errorText(line: Line): string | undefined {
  const error = line.error as { message?: string } | undefined;
  return error?.message ?? (typeof line.message === "string" ? line.message : undefined);
}

/** LND REST (`restlisten`) transport using only `node:https`. */
export class LndRestTransport implements LndTransport {
  private readonly url: URL;
  private readonly macaroon: string;
  private readonly ca: string;

  constructor(options: LndRestOptions) {
    this.url = new URL(options.url);
    this.macaroon = readMaybeFile(options.macaroon, true);
    this.ca = readMaybeFile(options.tlsCert, false);
  }

  /** Stream newline-delimited JSON until `until` accepts a line or the timeout passes. */
  private call(method: string, path: string, body: unknown, until: (line: Line) => boolean, timeoutMs: number): Promise<Line[]> {
    return new Promise((resolve, reject) => {
      const lines: Line[] = [];
      let buffer = "";
      let done = false;
      const finish = (error?: Error): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        req.destroy();
        if (error && lines.length === 0) reject(error);
        else resolve(lines);
      };
      const req = httpsRequest({
        method,
        hostname: this.url.hostname,
        port: this.url.port,
        path,
        ca: this.ca,
        headers: {
          "Grpc-Metadata-macaroon": this.macaroon,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
      }, (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buffer += chunk;
          let index;
          while ((index = buffer.indexOf("\n")) >= 0) {
            const text = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (text === "") continue;
            try {
              const line = JSON.parse(text) as Line;
              lines.push(line);
              if (until(line)) return finish();
            } catch {
              // Ignore partial or non-JSON lines.
            }
          }
        });
        res.on("end", () => {
          const text = buffer.trim();
          if (text !== "") {
            try {
              lines.push(JSON.parse(text) as Line);
            } catch {
              // Ignore.
            }
          }
          finish();
        });
        res.on("error", (error) => finish(error));
      });
      const timer = setTimeout(() => finish(new Error("LND request timed out")), timeoutMs);
      req.on("error", (error) => finish(error));
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async decodePayReq(invoice: string): Promise<LndDecodedInvoice> {
    const [line] = await this.call("GET", `/v1/payreq/${encodeURIComponent(invoice)}`, undefined, () => false, 15_000);
    if (!line || errorText(line)) throw new Error(`LND could not decode the invoice: ${line ? errorText(line) : "no response"}`);
    const msat = typeof line.num_msat === "string" ? BigInt(line.num_msat) : undefined;
    return {
      paymentHash: String(line.payment_hash ?? ""),
      ...(msat === undefined || msat === 0n ? {} : { amountMsat: msat }),
      ...(typeof line.destination === "string" ? { destination: line.destination } : {}),
      ...(line.timestamp === undefined ? {} : { timestamp: Number(line.timestamp) }),
      ...(line.expiry === undefined ? {} : { expiry: Number(line.expiry) }),
    };
  }

  private update(lines: Line[]): LndPaymentUpdate {
    const last = lines[lines.length - 1];
    if (last === undefined) return { status: "IN_FLIGHT", failureReason: "No response from LND" };
    const message = errorText(last);
    if (message !== undefined) {
      // Only an explicit payment status of FAILED proves a payment failed. An
      // RPC error ("already paid", "transport is closing", a timeout) says
      // nothing definite, so it is reported as uncertain and the runtime
      // asks LND's own record before deciding.
      if (/isn't initiated|not (been )?initiated|not found|unknown payment/i.test(message)) return { status: "NOT_FOUND" };
      return { status: "IN_FLIGHT", failureReason: message };
    }
    const result = (last.result ?? last) as Line;
    const failure = typeof result.failure_reason === "string" && result.failure_reason !== "FAILURE_REASON_NONE"
      ? result.failure_reason
      : undefined;
    return {
      status: String(result.status ?? "IN_FLIGHT"),
      ...(typeof result.payment_hash === "string" ? { paymentHash: result.payment_hash } : {}),
      ...(typeof result.payment_preimage === "string" && !/^0+$/.test(result.payment_preimage) ? { preimage: result.payment_preimage } : {}),
      ...(result.fee_msat === undefined ? {} : { feeMsat: BigInt(String(result.fee_msat)) }),
      ...(failure === undefined ? {} : { failureReason: failure }),
    };
  }

  private static terminal(line: Line): boolean {
    if (errorText(line) !== undefined) return true;
    const result = (line.result ?? line) as Line;
    return result.status === "SUCCEEDED" || result.status === "FAILED";
  }

  async sendPaymentV2(invoice: string, options: { timeoutSeconds: number; feeLimitSat: number }): Promise<LndPaymentUpdate> {
    const lines = await this.call("POST", "/v2/router/send", {
      payment_request: invoice,
      timeout_seconds: options.timeoutSeconds,
      fee_limit_sat: String(options.feeLimitSat),
      no_inflight_updates: true,
    }, LndRestTransport.terminal, (options.timeoutSeconds + 10) * 1000);
    return this.update(lines);
  }

  async trackPaymentV2(paymentHash: string): Promise<LndPaymentUpdate> {
    // Tracking an in-flight payment streams until it resolves; a short read
    // window is enough to learn its current state.
    const lines = await this.call("GET", `/v2/router/track/${hexToBase64Url(paymentHash)}?no_inflight_updates=false`, undefined, () => true, 10_000);
    return this.update(lines);
  }

  /** Helpers used by the demo and by setup scripts; not part of the provider contract. */
  async getJson(path: string): Promise<Line> {
    const [line] = await this.call("GET", path, undefined, () => false, 15_000);
    if (!line) throw new Error(`No response for ${path}`);
    const message = errorText(line);
    if (message !== undefined) throw new Error(message);
    return line;
  }

  async postJson(path: string, body: unknown): Promise<Line> {
    const [line] = await this.call("POST", path, body, () => false, 30_000);
    if (!line) throw new Error(`No response for ${path}`);
    const message = errorText(line);
    if (message !== undefined) throw new Error(message);
    return line;
  }

  /**
   * Create an invoice on this node. Used by the demo player wallet. Pass the
   * LNURL metadata hash as `descriptionHashHex` for LNURL-pay invoices.
   */
  async addInvoice(amountMsat: Msat, memo: string, options: { expirySeconds?: number; descriptionHashHex?: string } = {}): Promise<{ invoice: string; paymentHash: string }> {
    const line = await this.postJson("/v1/invoices", {
      value_msat: amountMsat.toString(),
      memo,
      expiry: String(options.expirySeconds ?? 600),
      ...(options.descriptionHashHex === undefined ? {} : { description_hash: Buffer.from(options.descriptionHashHex, "hex").toString("base64") }),
    });
    return { invoice: String(line.payment_request), paymentHash: base64ToHex(line.r_hash) ?? "" };
  }

  /**
   * Follow a streaming endpoint such as `/v1/invoices/subscribe`, reconnecting
   * after errors. Returns a function that stops it.
   */
  stream(path: string, onLine: (line: Line) => void, retryMs = 3_000): () => void {
    let stopped = false;
    let current: ReturnType<typeof httpsRequest> | undefined;
    const connect = (): void => {
      if (stopped) return;
      let buffer = "";
      current = httpsRequest({
        method: "GET",
        hostname: this.url.hostname,
        port: this.url.port,
        path,
        ca: this.ca,
        headers: { "Grpc-Metadata-macaroon": this.macaroon },
      }, (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buffer += chunk;
          let index;
          while ((index = buffer.indexOf("\n")) >= 0) {
            const text = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (text === "") continue;
            try {
              const line = JSON.parse(text) as Line;
              onLine((line.result ?? line) as Line);
            } catch {
              // Ignore partial lines.
            }
          }
        });
        res.on("end", () => setTimeout(connect, retryMs));
        res.on("error", () => undefined);
      });
      current.on("error", () => setTimeout(connect, retryMs));
      current.end();
    };
    connect();
    return () => {
      stopped = true;
      current?.destroy();
    };
  }
}
