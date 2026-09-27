import type { Msat } from "./domain.js";

export type DecodedInvoice = {
  paymentHash: string;
  /** Omitted for a zero-amount invoice, which the runtime refuses to pay. */
  amountMsat?: Msat;
  /** ISO timestamp after which the invoice can no longer be paid. */
  expiresAt?: string;
  destination?: string;
};

export type DispatchResult =
  | { outcome: "settled"; paymentHash: string; preimage?: string; feeMsat?: Msat }
  | { outcome: "failed"; paymentHash?: string; reason: string }
  | { outcome: "unknown"; paymentHash?: string; reason: string };

export type LookupResult = "settled" | "failed" | "inflight" | "not_found";

export type PayOptions = {
  /** Stop waiting after this long and report `unknown`; the payment may continue. */
  timeoutSeconds: number;
};

/** Pays BOLT11 invoices. Everything about destinations lives in resolvers. */
export interface PaymentProvider {
  readonly name: string;
  readonly version: string;
  /**
   * True when sending the same invoice again can never pay it twice, because
   * the node refuses a payment hash that is already in flight or settled.
   * Only then does the runtime re-send an invoice whose first dispatch is
   * unaccounted for.
   */
  readonly idempotentByPaymentHash: boolean;
  decode(invoice: string): Promise<DecodedInvoice>;
  pay(invoice: string, paymentHash: string, options: PayOptions): Promise<DispatchResult>;
  lookup(paymentHash: string): Promise<LookupResult>;
}

/** Invoice format understood by {@link FakePaymentProvider}: `fake:<hash>:<msat>`. */
export function fakeInvoice(paymentHash: string, amountMsat: Msat): string {
  return `fake:${paymentHash}:${amountMsat}`;
}

/** Deterministic provider for runtime tests and local demos. Spends nothing. */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  readonly version = "0.2";
  readonly idempotentByPaymentHash = true;
  private readonly outcomes: DispatchResult[];
  private readonly payments = new Map<string, LookupResult>();
  /** Every call to `pay`, including refused duplicates. */
  dispatchCount = 0;
  /** Payments that actually moved money. A correct runtime keeps this at one per hash. */
  settledCount = 0;
  online = true;

  constructor(outcomes: DispatchResult[] = []) {
    this.outcomes = [...outcomes];
  }

  async decode(invoice: string): Promise<DecodedInvoice> {
    const match = /^fake:([^:]+):(\d+)$/.exec(invoice);
    if (!match) throw new Error("Not a fake invoice");
    return { paymentHash: match[1]!, amountMsat: BigInt(match[2]!) };
  }

  async pay(_invoice: string, paymentHash: string): Promise<DispatchResult> {
    this.dispatchCount += 1;
    if (!this.online) throw new Error("Provider offline");
    const previous = this.payments.get(paymentHash);
    if (previous === "settled" || previous === "inflight") {
      return { outcome: "failed", paymentHash, reason: "Payment hash already in flight or settled" };
    }
    const next = this.outcomes.shift() ?? { outcome: "settled", paymentHash };
    const result = { ...next, paymentHash: next.paymentHash ?? paymentHash } as DispatchResult;
    // An unknown outcome models a lost response: the money still moved, and a
    // later lookup finds it.
    const recorded: LookupResult = result.outcome === "failed" ? "failed" : "settled";
    this.payments.set(paymentHash, recorded);
    if (recorded === "settled") this.settledCount += 1;
    return result;
  }

  async lookup(paymentHash: string): Promise<LookupResult> {
    if (!this.online) throw new Error("Provider offline");
    return this.payments.get(paymentHash) ?? "not_found";
  }

  /** Test helper: pretend a payment happened out of band. */
  forget(paymentHash: string): void {
    this.payments.delete(paymentHash);
  }
}
