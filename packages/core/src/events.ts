import type { PaymentEvidence, Payout, PayoutState } from "./domain.js";

/**
 * Notifications emitted after a change is stored. Payouts are public
 * projections, so listeners can forward them to logs or browsers as is.
 */
export type PayhookEvent =
  | { type: "payout.created"; at: string; payout: Payout }
  | { type: "payout.duplicate"; at: string; status: "duplicate_delivery" | "duplicate_obligation"; obligationKey: string; payout?: Payout }
  | { type: "payout.state"; at: string; from: PayoutState; to: PayoutState; payout: Payout }
  | { type: "payout.evidence"; at: string; evidence: PaymentEvidence; payout: Payout };

export type PayhookListener = (event: PayhookEvent) => void;

export class EventHub {
  private readonly listeners = new Set<PayhookListener>();

  on(listener: PayhookListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: PayhookEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A failing subscriber must never affect payment execution.
      }
    }
  }
}

/** One-line log output for any event; the default observability adapter. */
export function consoleLogger(log: (line: string) => void = console.log): PayhookListener {
  return (event) => {
    const p = event.payout;
    const base = `[payhook] ${event.type} ${p?.id ?? ""} ${p?.obligationKey ?? ""}`.trim();
    if (event.type === "payout.state") log(`${base} ${event.from} -> ${event.to}`);
    else if (event.type === "payout.evidence") log(`${base} ${event.evidence.actor} ${event.evidence.kind}${reasonOf(event.evidence)}`);
    else if (event.type === "payout.duplicate") log(`${base} ${event.status}`);
    else log(base);
  };
}

function reasonOf(evidence: PaymentEvidence): string {
  const reason = evidence.detail?.reason;
  return typeof reason === "string" ? `: ${reason}` : "";
}
