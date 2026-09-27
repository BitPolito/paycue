/** Client for a Payhook server: submit payouts and follow their events. Uses only fetch. */
import type { PayhookEvent, Payout } from "@payhook/core";

export type PayhookClientOptions = {
  /** e.g. http://127.0.0.1:8089 */
  url: string;
  /** This application's client token. */
  token: string;
};

export type SubmitRequest = {
  deliveryId: string;
  obligationKey: string;
  recipient: string;
  amountSat: number;
  reason: string;
  type?: string;
  policyVersion?: string;
  data?: Record<string, unknown>;
};

/** Amounts arrive as decimal strings over JSON; turn them back into bigints. */
function revive(payout: Payout): Payout {
  return { ...payout, amountMsat: BigInt(payout.amountMsat as unknown as string) };
}

export class PayhookClient {
  constructor(private readonly options: PayhookClientOptions) {}

  private async call(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(this.options.url + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${this.options.token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) throw new Error(String(data.error ?? res.statusText));
    return data;
  }

  /** Resolves with `{status, payout}`; `status` is created, duplicate_delivery or duplicate_obligation. */
  submit(request: SubmitRequest): Promise<Record<string, unknown>> {
    return this.call("/v1/payouts", request);
  }

  async recent(limit = 200): Promise<Payout[]> {
    const data = await this.call(`/v1/payouts?limit=${limit}`);
    return (data.payouts as Payout[]).map(revive);
  }

  policy(): Promise<Record<string, unknown>> {
    return this.call("/v1/policy");
  }

  /** Follow the service's event stream for this client, reconnecting forever. */
  follow(onEvent: (event: PayhookEvent) => void, onState?: (connected: boolean) => void): () => void {
    let stopped = false;
    let controller: AbortController | undefined;
    const run = async (): Promise<void> => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const res = await fetch(`${this.options.url}/v1/events?token=${encodeURIComponent(this.options.token)}`, { signal: controller.signal });
          if (!res.ok || !res.body) throw new Error(`events: ${res.status}`);
          onState?.(true);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let index;
            while ((index = buffer.indexOf("\n\n")) >= 0) {
              const frame = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              const line = frame.split("\n").find((l) => l.startsWith("data: "));
              if (!line) continue;
              const event = JSON.parse(line.slice(6)) as PayhookEvent;
              if ("payout" in event && event.payout) (event as { payout: Payout }).payout = revive(event.payout);
              onEvent(event);
            }
          }
        } catch {
          // Reconnect below.
        }
        onState?.(false);
        if (!stopped) await new Promise((r) => setTimeout(r, 2_000));
      }
    };
    void run();
    return () => {
      stopped = true;
      controller?.abort();
    };
  }
}
