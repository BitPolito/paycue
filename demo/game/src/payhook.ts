/** Payhook wiring for the demo: provider, resolvers, policy and storage. */
import { join } from "node:path";
import {
  Bolt11Resolver,
  type DecodedInvoice,
  type DestinationResolver,
  type DispatchResult,
  FakePaymentProvider,
  type LookupResult,
  PauseSwitch,
  type PayOptions,
  type PaymentProvider,
  PayhookRuntime,
  type PolicyRule,
  type Resolution,
  type ResolveRequest,
  budget,
  consoleLogger,
  fakeInvoice,
  maxPerPayout,
  recipientLimit,
} from "@payhook/core";
import { LightningAddressResolver } from "@payhook/lnurl";
import { LndPaymentProvider, LndRestTransport } from "@payhook/lnd";
import { PayThroughResolver, SIGNET_MAKER_URL } from "@payhook/kaleidoswap";
import { SQLiteStorage } from "@payhook/sqlite";
import { createHash } from "node:crypto";

export type OutageMode = "normal" | "offline" | "drop-next-response";

/**
 * Wraps the real provider for the recovery scene. `offline` refuses every
 * call before anything is sent. `drop-next-response` really sends the next
 * payment and then loses the answer, exactly the case Payhook must survive.
 */
export class OutageSwitch implements PaymentProvider {
  mode: OutageMode = "normal";
  readonly idempotentByPaymentHash: boolean;

  constructor(private readonly inner: PaymentProvider) {
    this.idempotentByPaymentHash = inner.idempotentByPaymentHash;
  }

  get name(): string {
    return this.inner.name;
  }

  get version(): string {
    return this.inner.version;
  }

  decode(invoice: string): Promise<DecodedInvoice> {
    return this.inner.decode(invoice);
  }

  async pay(invoice: string, paymentHash: string, options: PayOptions): Promise<DispatchResult> {
    if (this.mode === "offline") throw new Error("Studio node unreachable");
    if (this.mode === "drop-next-response") {
      this.mode = "normal";
      await this.inner.pay(invoice, paymentHash, options);
      throw new Error("Connection to the studio node dropped before it answered");
    }
    return this.inner.pay(invoice, paymentHash, options);
  }

  lookup(paymentHash: string): Promise<LookupResult> {
    if (this.mode === "offline") return Promise.reject(new Error("Studio node unreachable"));
    return this.inner.lookup(paymentHash);
  }
}

/** Offline stand-in that accepts every recipient. */
class FakeDestinationResolver implements DestinationResolver {
  readonly name = "fake";
  readonly version = "1";
  accepts(): boolean {
    return true;
  }
  async resolve(request: ResolveRequest): Promise<Resolution> {
    const hash = createHash("sha256").update(request.attemptId).digest("hex");
    return { invoice: fakeInvoice(hash, request.amountMsat), reference: `fake-${hash.slice(0, 8)}`, detail: { note: "fake mode: no money moves" } };
  }
}

export type DemoPayhook = {
  runtime: PayhookRuntime;
  storage: SQLiteStorage;
  pause: PauseSwitch;
  outage: OutageSwitch;
  studio?: LndRestTransport;
  mode: "real" | "fake";
  stop(): void;
};

export type DemoConfig = {
  home: string;
  dbPath: string;
  mode: "real" | "fake";
  walletDomain: string;
  budgetSat: number;
  perMinuteCount: number;
  log: boolean;
};

export function demoPolicy(pause: PauseSwitch, config: DemoConfig): PolicyRule[] {
  return [
    pause,
    // Level 2 prizes are 50,000 sat; nothing in the demo should be larger.
    maxPerPayout(60_000_000n),
    recipientLimit({ windowMs: 60_000, maxCount: config.perMinuteCount }),
    budget(BigInt(config.budgetSat) * 1000n),
  ];
}

export function createPayhook(config: DemoConfig): DemoPayhook {
  const storage = new SQLiteStorage(config.dbPath);
  const pause = new PauseSwitch();
  let inner: PaymentProvider;
  let resolvers: DestinationResolver[];
  let studio: LndRestTransport | undefined;
  if (config.mode === "real") {
    studio = new LndRestTransport({
      url: process.env.STUDIO_LND_URL ?? "https://127.0.0.1:8080",
      macaroon: process.env.STUDIO_LND_MACAROON ?? join(config.home, "lnd-studio", "payhook.macaroon"),
      tlsCert: process.env.STUDIO_LND_CERT ?? join(config.home, "lnd-studio", "tls.cert"),
    });
    inner = new LndPaymentProvider({ transport: studio, version: "0.21.99-signetblocktime" });
    resolvers = [
      new Bolt11Resolver(),
      new LightningAddressResolver({ insecureDomains: [config.walletDomain] }),
      new PayThroughResolver({ makerUrl: process.env.KALEIDOSWAP_MAKER_URL ?? SIGNET_MAKER_URL, defaultAsset: "L-USDT", maxFeeBps: 300, bitcoin: false }),
    ];
  } else {
    inner = new FakePaymentProvider();
    resolvers = [new FakeDestinationResolver()];
  }
  const outage = new OutageSwitch(inner);
  const runtime = new PayhookRuntime({
    storage,
    provider: outage,
    resolvers,
    policy: demoPolicy(pause, config),
    paymentTimeoutSeconds: 45,
    staleAfterMs: 20_000,
    maxDispatches: 4,
  });
  if (config.log) runtime.on(consoleLogger());
  const worker = runtime.startWorker({ intervalMs: 1_500 });
  return {
    runtime,
    storage,
    pause,
    outage,
    ...(studio === undefined ? {} : { studio }),
    mode: config.mode,
    stop: () => {
      worker.stop();
      storage.close();
    },
  };
}
