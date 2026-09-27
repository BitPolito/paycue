/**
 * Contracts for webhook source adapters.
 *
 * This module deliberately does not know how a payout is created. An adapter
 * authenticates a request and turns it into a stable, source-owned event. The
 * runtime can then pass that event to hooks and durable storage.
 */

export type WebhookHeaders = Readonly<Record<string, string | undefined>>;

export type WebhookRequest = {
  headers: WebhookHeaders;
  /** The exact request bytes/string used for signature verification. */
  body: string | Uint8Array;
  receivedAt: string;
};

export type VerificationEvidence = {
  method: string;
  verifiedAt: string;
  keyId?: string;
  /** Provider-specific, non-secret verification details. */
  detail?: Readonly<Record<string, unknown>>;
};

/** An event is only admitted to the runtime after an adapter verifies it. */
export type VerifiedWebhookEvent<TPayload = unknown> = {
  source: string;
  deliveryId: string;
  type: string;
  occurredAt: string;
  payload: TPayload;
  verification: VerificationEvidence;
};

export type WebhookAdapter<TPayload = unknown> = {
  readonly source: string;
  verify(request: WebhookRequest): Promise<VerifiedWebhookEvent<TPayload>>;
};

export class InvalidWebhookEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebhookEventError";
  }
}

/**
 * Check identity fields before an event is persisted or handed to a hook.
 * Signature verification remains the adapter's responsibility.
 */
export function normalizeWebhookEvent<TPayload>(
  event: VerifiedWebhookEvent<TPayload>,
): VerifiedWebhookEvent<TPayload> {
  for (const [name, value] of [
    ["source", event.source],
    ["deliveryId", event.deliveryId],
    ["type", event.type],
    ["occurredAt", event.occurredAt],
    ["verification.method", event.verification?.method],
    ["verification.verifiedAt", event.verification?.verifiedAt],
  ] as const) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new InvalidWebhookEventError(`Webhook event requires ${name}`);
    }
  }

  return {
    ...event,
    source: event.source.trim(),
    deliveryId: event.deliveryId.trim(),
    type: event.type.trim(),
    occurredAt: event.occurredAt.trim(),
  };
}

/** Stable identity for transport-level webhook deduplication. */
export function webhookDeliveryKey(
  event: Pick<VerifiedWebhookEvent, "source" | "deliveryId">,
): string {
  return `${event.source}:${event.deliveryId}`;
}

/**
 * Pure replay filter. It keeps the first event for each source/delivery ID;
 * business obligation deduplication must still happen later using the
 * application-supplied obligation key.
 */
export function deduplicateWebhookEvents<TPayload>(
  events: readonly VerifiedWebhookEvent<TPayload>[],
): VerifiedWebhookEvent<TPayload>[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = webhookDeliveryKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
