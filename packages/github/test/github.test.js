import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  GitHubWebhookAdapter,
  githubPullRequestMergedRewardHook,
} from "../dist/index.js";
import { InvalidWebhookEventError } from "@paycue/core";

const secret = "demo-secret";
const payload = {
  action: "closed",
  number: 42,
  pull_request: {
    number: 99,
    merged: true,
    merged_at: "2026-09-06T10:00:00.000Z",
    merge_commit_sha: "abc123",
    user: { login: "alice" },
    labels: [{ name: "rewardable" }],
  },
  repository: {
    full_name: "moaki/example",
    name: "example",
    owner: { login: "moaki" },
  },
};

function request(body = JSON.stringify(payload), signatureSecret = secret) {
  const signature = `sha256=${createHmac("sha256", signatureSecret).update(body).digest("hex")}`;
  return {
    body,
    receivedAt: "2026-09-06T10:00:01.000Z",
    headers: {
      "X-GitHub-Event": "pull_request",
      "X-GitHub-Delivery": "delivery-1",
      "X-Hub-Signature-256": signature,
    },
  };
}

test("GitHub adapter verifies the raw body and normalizes merged pull requests", async () => {
  const event = await new GitHubWebhookAdapter(secret).verify(request());
  assert.equal(event.source, "github");
  assert.equal(event.type, "pull_request.merged");
  assert.equal(event.deliveryId, "delivery-1");
  assert.equal(event.occurredAt, payload.pull_request.merged_at);
  assert.equal(event.verification.method, "github-hmac-sha256");
  assert.equal(event.payload.contributor, "alice");
  assert.deepEqual(event.payload.labels, ["rewardable"]);
});

test("GitHub adapter rejects altered bodies and malformed signatures", async () => {
  const adapter = new GitHubWebhookAdapter(secret);
  await assert.rejects(adapter.verify({ ...request(), body: JSON.stringify({ ...payload, number: 43 }) }), InvalidWebhookEventError);
  await assert.rejects(adapter.verify({ ...request(), headers: { ...request().headers, "X-Hub-Signature-256": "sha256=bad" } }), InvalidWebhookEventError);
});

test("merged PR reward hook applies qualification and stable business identity", async () => {
  const event = await new GitHubWebhookAdapter(secret).verify(request());
  assert.equal(event.type, "pull_request.merged");
  const hook = githubPullRequestMergedRewardHook({
    amountMsat: 500_000n,
    policyVersion: "github-rewards-v1",
    recipient: () => "lnaddress:alice@example.com",
    qualifies: (value) => value.labels.includes("rewardable"),
  });
  const proposal = hook.propose(event.payload);
  assert.deepEqual(proposal, {
    obligationKey: "github:moaki/example:issue:42:pr:99",
    recipient: "lnaddress:alice@example.com",
    amountMsat: 500_000n,
    reason: "Merged pull request #99 for issue #42",
    policyVersion: "github-rewards-v1",
  });
  assert.equal(hook.propose({ ...event.payload, labels: [] }), null);
});

test("reward hook refuses to propose without a destination", () => {
  const hook = githubPullRequestMergedRewardHook({
    amountMsat: 1n,
    policyVersion: "v1",
    recipient: () => undefined,
  });
  assert.equal(hook.propose({
    repository: { fullName: "a/b", owner: "a", name: "b" },
    issueNumber: 1,
    pullRequestNumber: 2,
    contributor: "alice",
    mergedAt: "2026-09-06T00:00:00.000Z",
    labels: [],
    raw: {},
  }), null);
});
