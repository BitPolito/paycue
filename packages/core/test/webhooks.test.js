import test from "node:test";
import assert from "node:assert/strict";

import {
  deduplicateWebhookEvents,
  InvalidWebhookEventError,
  normalizeWebhookEvent,
} from "../dist/webhooks.js";

const event = {
  source: "github",
  deliveryId: "delivery-1",
  type: "pull_request.merged",
  occurredAt: "2026-09-06T00:00:00.000Z",
  payload: { number: 42 },
  verification: { method: "hmac-sha256", verifiedAt: "2026-09-06T00:00:01.000Z" },
};

test("normalization requires verified identity fields", () => {
  assert.equal(normalizeWebhookEvent({ ...event, source: " github " }).source, "github");
  assert.throws(
    () => normalizeWebhookEvent({ ...event, deliveryId: " " }),
    InvalidWebhookEventError,
  );
});

test("replay filtering is scoped to source and delivery ID", () => {
  const filtered = deduplicateWebhookEvents([
    event,
    { ...event },
    { ...event, deliveryId: "delivery-2" },
    { ...event, source: "other-source" },
  ]);
  assert.equal(filtered.length, 3);
});
