import {
  type DestinationResolver,
  type PaymentAttempt,
  type Resolution,
  ResolutionError,
  type ResolveRequest,
  type RouteDescription,
} from "@payhook/core";
import {
  PayThroughApiError,
  PayThroughClient,
  type PayThroughCreated,
  type PayThroughStatus,
} from "@kaleidorg/swap-sdk/pay-through";

export const SIGNET_MAKER_URL = "https://maker.signet.kaleidoswap.com/v2";

/** The part of the swap-sdk pay-through client this resolver uses. */
export type PayThroughApi = Pick<PayThroughClient, "create" | "status">;

export type PayThroughResolverOptions = {
  /** Maker URL ending in /v2. Defaults to the signet maker. */
  makerUrl?: string;
  apiKey?: string;
  /** Asset delivered when the recipient does not name one, e.g. "L-USDT". Omit for the destination's native BTC. */
  defaultAsset?: string;
  /**
   * Refuse quotes whose total fee exceeds this share of the delivered value,
   * in basis points. Default 300 (3%).
   */
  maxFeeBps?: number;
  /** Also accept Bitcoin on-chain addresses. Default true. */
  bitcoin?: boolean;
  /** Inject a client, e.g. a fake in tests. */
  client?: PayThroughApi;
  /** Used to read the maker's pair limits. Defaults to global fetch. */
  fetch?: typeof fetch;
};

// Liquid: blech32 confidential (lq1, tlq1, el1) and bech32 (ex1, tex1, ert1).
const LIQUID = /^(?:lq1|tlq1|el1|ex1|tex1|ert1)[02-9ac-hj-np-z]{20,}$/i;
const BITCOIN = /^(?:bc1|tb1|bcrt1)[02-9ac-hj-np-z]{20,}$/i;
const ARKADE = /^(?:ark1|tark1)[02-9ac-hj-np-z]{20,}$/i;

type Destination = { address: string; asset?: string; layer: "liquid" | "bitcoin" | "arkade" };

/**
 * Pays a Liquid, Bitcoin or Arkade destination through a KaleidoSwap maker's
 * pay-through swap. Payhook pays the maker's hold invoice over Lightning; the
 * maker broadcasts the payout to the destination and only then settles the
 * invoice. The address leg is operator-trusted.
 *
 * Recipients look like `tlq1...` or `liquid:tlq1...?asset=L-USDT`.
 */
export class PayThroughResolver implements DestinationResolver {
  readonly name = "kaleidoswap";
  readonly version = "1";
  private readonly client: PayThroughApi;
  private readonly makerUrl: string;
  private readonly fetcher: typeof fetch;
  private routesCache: { at: number; routes: RouteDescription[] } | undefined;
  private readonly defaultAsset: string | undefined;
  private readonly maxFeeBps: number;
  private readonly bitcoin: boolean;

  constructor(options: PayThroughResolverOptions = {}) {
    this.makerUrl = options.makerUrl ?? SIGNET_MAKER_URL;
    this.fetcher = options.fetch ?? fetch;
    this.client = options.client ?? new PayThroughClient({
      makerUrl: this.makerUrl,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    });
    this.defaultAsset = options.defaultAsset;
    this.maxFeeBps = options.maxFeeBps ?? 300;
    this.bitcoin = options.bitcoin ?? true;
  }

  static parse(recipient: string, bitcoin = true): Destination | undefined {
    const text = recipient.trim();
    const withoutScheme = text.replace(/^(?:liquidnetwork|liquid|bitcoin|ark):/i, "");
    const [address = "", query = ""] = withoutScheme.split("?");
    const asset = new URLSearchParams(query).get("asset") ?? undefined;
    const layer = LIQUID.test(address) ? "liquid" : ARKADE.test(address) ? "arkade" : bitcoin && BITCOIN.test(address) ? "bitcoin" : undefined;
    if (layer === undefined) return undefined;
    return asset === undefined ? { address, layer } : { address, asset, layer };
  }

  accepts(recipient: string): boolean {
    return PayThroughResolver.parse(recipient, this.bitcoin) !== undefined;
  }

  /** The maker's live limits for Lightning BTC to each Liquid asset. Cached for a minute. */
  async constraints(): Promise<RouteDescription[]> {
    if (this.routesCache && Date.now() - this.routesCache.at < 60_000) return this.routesCache.routes;
    const response = await this.fetcher(`${this.makerUrl}/swap/reverse`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Maker pairs unavailable (${response.status})`);
    const pairs = (await response.json()) as Record<string, Record<string, {
      limits?: { minimal?: number; maximal?: number };
      fees?: { percentage?: number };
    }>>;
    const sat = (n: number | undefined): string => (n === undefined ? "?" : `${n.toLocaleString("en-US")} sat`);
    const routes = Object.entries(pairs.BTC ?? {})
      .filter(([asset]) => asset.startsWith("L-"))
      .map(([asset, pair]): RouteDescription => ({
        resolver: this.name,
        network: "Liquid",
        asset,
        settles: "about a minute (one Liquid block)",
        limits: [
          { label: "Per swap", value: `${sat(pair.limits?.minimal)} to ${sat(pair.limits?.maximal)}`, setBy: "provider" },
          { label: "Swap fee", value: `${pair.fees?.percentage ?? "?"}% plus miner fees`, setBy: "provider" },
          { label: "Fee cap", value: `refused above ${(this.maxFeeBps / 100).toFixed(2)}%`, setBy: "operator" },
          { label: "Delivery", value: "the maker broadcasts the payout; no hash lock on the address leg", setBy: "provider" },
          { label: "Block time", value: "1 minute", setBy: "network" },
        ],
      }));
    this.routesCache = { at: Date.now(), routes };
    return routes;
  }

  async resolve(request: ResolveRequest): Promise<Resolution> {
    const destination = PayThroughResolver.parse(request.recipient, this.bitcoin);
    if (destination === undefined) throw new ResolutionError("Not a pay-through destination", false);
    if (request.amountMsat % 1000n !== 0n) {
      throw new ResolutionError("Pay-through amounts must be whole satoshis", false);
    }
    const invoiceAmount = Number(request.amountMsat / 1000n);
    const asset = destination.asset ?? (destination.layer === "liquid" ? this.defaultAsset : undefined);

    let order: PayThroughCreated;
    try {
      order = await this.client.create({
        destination: destination.address,
        invoiceAmount,
        ...(asset === undefined ? {} : { asset }),
      });
    } catch (error) {
      if (error instanceof PayThroughApiError) {
        // 4xx: nothing was created. 429 and 5xx: try again later; any swap
        // created meanwhile stays unpaid because only the invoice Payhook
        // persisted is ever paid.
        const retryable = error.status === 429 || error.status >= 500;
        throw new ResolutionError(`Maker refused the swap: ${error.code}${error.details ? ` (${error.details})` : ""}`, retryable, {
          status: error.status,
          code: error.code,
        });
      }
      throw new ResolutionError(`Maker unreachable: ${error instanceof Error ? error.message : "error"}`, true);
    }

    const totalFees = order.fees.protocol + order.fees.network + order.fees.swap;
    const feeBps = order.payoutAmount + totalFees > 0 ? Math.round((totalFees / (order.payoutAmount + totalFees)) * 10_000) : 0;
    const detail = {
      destination: order.destination,
      destinationLayer: order.destinationLayer,
      payoutAsset: order.payoutAsset,
      payoutAmount: order.payoutAmount,
      invoiceAmountSat: order.invoiceAmount,
      fees: order.fees,
      feeBps,
      pairId: order.pairId,
      quoteExpiresAt: new Date(order.expiresAt * 1000).toISOString(),
    };
    if (feeBps > this.maxFeeBps) {
      throw new ResolutionError(`Swap fee ${(feeBps / 100).toFixed(2)}% is above the ${(this.maxFeeBps / 100).toFixed(2)}% limit`, false, detail);
    }
    return {
      invoice: order.invoice,
      reference: order.id,
      resolverState: { swapId: order.id, swapAuth: order.swapAuth },
      detail,
    };
  }

  /** After the hold invoice settled: the maker's payout transaction. */
  async describe(attempt: PaymentAttempt): Promise<Record<string, unknown> | undefined> {
    const id = attempt.reference;
    if (id === undefined) return undefined;
    let status: PayThroughStatus;
    try {
      status = await this.client.status(id);
    } catch {
      return undefined;
    }
    return {
      swapStatus: status.status,
      payoutTxid: status.payout.reference,
      payoutLayer: status.payout.layer,
      destination: status.payout.destination,
    };
  }
}
