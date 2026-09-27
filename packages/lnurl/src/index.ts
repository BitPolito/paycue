import {
  type DestinationResolver,
  type Resolution,
  ResolutionError,
  type ResolveRequest,
  type RouteDescription,
} from "@payhook/core";

export type LightningAddressResolverOptions = {
  /** Defaults to global fetch. */
  fetch?: typeof fetch;
  /**
   * Resolve these domains over plain HTTP. Only for local demos and tests;
   * production Lightning Addresses are always HTTPS.
   */
  insecureDomains?: readonly string[];
  timeoutMs?: number;
};

const ADDRESS = /^(?:lightning:)?([a-z0-9._+-]+)@([a-z0-9.-]+(?::\d+)?)$/i;

type PayRequest = {
  tag?: string;
  callback?: string;
  minSendable?: number;
  maxSendable?: number;
  status?: string;
  reason?: string;
};

/**
 * Resolves Lightning Addresses (LUD-16) through LNURL-pay (LUD-06) into a
 * fresh invoice for the exact amount.
 */
export class LightningAddressResolver implements DestinationResolver {
  readonly name = "lightning-address";
  readonly version = "1";
  private readonly fetcher: typeof fetch;
  private readonly insecure: ReadonlySet<string>;
  private readonly timeoutMs: number;

  constructor(options: LightningAddressResolverOptions = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.insecure = new Set((options.insecureDomains ?? []).map((domain) => domain.toLowerCase()));
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  accepts(recipient: string): boolean {
    return ADDRESS.test(recipient.trim());
  }

  async constraints(): Promise<RouteDescription[]> {
    return [{
      resolver: this.name,
      network: "Lightning",
      asset: "BTC",
      settles: "seconds",
      limits: [
        { label: "Minimum and maximum", value: "set by each receiver's LNURL-pay server", setBy: "receiver" },
        { label: "Smallest unit", value: "1 msat", setBy: "network" },
        { label: "Largest single payment", value: "the route's channel liquidity", setBy: "network" },
      ],
    }];
  }

  private async getJson(url: string): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: "application/json" } });
    } catch (error) {
      throw new ResolutionError(`Lightning Address server unreachable: ${error instanceof Error ? error.message : "error"}`, true);
    }
    const text = await response.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ResolutionError(`Lightning Address server returned ${response.status} without JSON`, response.status >= 500);
    }
    if (body.status === "ERROR") {
      throw new ResolutionError(`Lightning Address server refused: ${String(body.reason ?? "no reason")}`, false);
    }
    if (!response.ok) throw new ResolutionError(`Lightning Address server returned ${response.status}`, response.status >= 500);
    return body;
  }

  async resolve(request: ResolveRequest): Promise<Resolution> {
    const match = ADDRESS.exec(request.recipient.trim());
    if (!match) throw new ResolutionError("Not a Lightning Address", false);
    const user = match[1]!.toLowerCase();
    const domain = match[2]!.toLowerCase();
    const scheme = this.insecure.has(domain) ? "http" : "https";

    const pay = await this.getJson(`${scheme}://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`) as PayRequest;
    if (pay.tag !== "payRequest" || typeof pay.callback !== "string") {
      throw new ResolutionError("Lightning Address did not return an LNURL-pay request", false);
    }
    const amount = Number(request.amountMsat);
    if (!Number.isSafeInteger(amount)) throw new ResolutionError("Amount is too large for LNURL-pay", false);
    if ((pay.minSendable !== undefined && amount < pay.minSendable) || (pay.maxSendable !== undefined && amount > pay.maxSendable)) {
      throw new ResolutionError(`Amount ${amount} msat is outside the receiver's range ${pay.minSendable}-${pay.maxSendable} msat`, false);
    }
    const callback = new URL(pay.callback);
    if (callback.protocol !== "https:" && !this.insecure.has(callback.host.toLowerCase())) {
      throw new ResolutionError("LNURL-pay callback must use HTTPS", false);
    }
    callback.searchParams.set("amount", String(amount));
    const invoice = await this.getJson(callback.toString());
    if (typeof invoice.pr !== "string" || invoice.pr === "") {
      throw new ResolutionError("Lightning Address server returned no invoice", true);
    }
    return {
      invoice: invoice.pr,
      reference: `${user}@${domain}`,
      detail: { address: `${user}@${domain}` },
    };
  }
}
