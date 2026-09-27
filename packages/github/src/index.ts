import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type Hook,
  InvalidWebhookEventError,
  type RewardProposal,
  normalizeWebhookEvent,
  type VerifiedWebhookEvent,
  type WebhookAdapter,
  type WebhookRequest,
} from "@payhook/core";

/** The subset of GitHub's pull request payload used by the first demo. */
export type GitHubPullRequestMergedEvent = {
  repository: {
    fullName: string;
    owner: string;
    name: string;
  };
  issueNumber: number;
  pullRequestNumber: number;
  contributor: string;
  mergedAt: string;
  mergeCommitSha?: string;
  labels: string[];
  /** Optional application-owned destination, if the host has already resolved it. */
  lightningAddress?: string;
  /** The complete source payload is retained for qualification/audit purposes. */
  raw: Record<string, unknown>;
};

type GitHubPayload = Record<string, unknown>;

function header(headers: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted);
  return entry?.[1];
}

function bodyBytes(body: string | Uint8Array): Uint8Array {
  return typeof body === "string" ? new TextEncoder().encode(body) : body;
}

function signatureBytes(signature: string): Buffer {
  const value = signature.trim();
  if (!/^sha256=[0-9a-f]{64}$/i.test(value)) {
    throw new InvalidWebhookEventError("GitHub signature must use sha256=<hex>");
  }
  return Buffer.from(value.slice("sha256=".length), "hex");
}

function verifiedSignature(body: string | Uint8Array, secret: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(bodyBytes(body)).digest();
  const supplied = signatureBytes(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidWebhookEventError(`GitHub payload requires ${name}`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new InvalidWebhookEventError(`GitHub payload requires ${name}`);
  }
  return value;
}

function numberValue(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new InvalidWebhookEventError(`GitHub payload requires ${name}`);
  }
  return value;
}

function mergedPayload(payload: GitHubPayload): GitHubPullRequestMergedEvent | undefined {
  const pr = objectValue(payload.pull_request, "pull_request");
  if (payload.action !== "closed" || pr.merged !== true) return undefined;
  const repository = objectValue(payload.repository, "repository");
  const owner = objectValue(repository.owner, "repository.owner");
  const user = objectValue(pr.user, "pull_request.user");
  const labels = Array.isArray(pr.labels)
    ? pr.labels.map((label) => stringValue(objectValue(label, "label").name, "label.name"))
    : [];
  const result: GitHubPullRequestMergedEvent = {
    repository: {
      fullName: stringValue(repository.full_name, "repository.full_name"),
      owner: stringValue(owner.login, "repository.owner.login"),
      name: stringValue(repository.name, "repository.name"),
    },
    issueNumber: numberValue(payload.number, "number"),
    pullRequestNumber: numberValue(pr.number, "pull_request.number"),
    contributor: stringValue(user.login, "pull_request.user.login"),
    mergedAt: stringValue(pr.merged_at, "pull_request.merged_at"),
    labels,
    raw: payload,
  };
  if (typeof pr.merge_commit_sha === "string" && pr.merge_commit_sha !== "") result.mergeCommitSha = pr.merge_commit_sha;
  return result;
}

/** Verifies GitHub's X-Hub-Signature-256 and turns a request into a stable event. */
export class GitHubWebhookAdapter implements WebhookAdapter<GitHubPullRequestMergedEvent | GitHubPayload> {
  readonly source = "github";
  constructor(private readonly secret: string) {
    if (secret.length === 0) throw new Error("GitHub webhook secret is required");
  }

  async verify(request: WebhookRequest): Promise<VerifiedWebhookEvent<GitHubPullRequestMergedEvent | GitHubPayload>> {
    const signature = header(request.headers, "x-hub-signature-256");
    const deliveryId = header(request.headers, "x-github-delivery");
    const githubType = header(request.headers, "x-github-event");
    if (!signature || !deliveryId || !githubType) {
      throw new InvalidWebhookEventError("GitHub webhook requires event, delivery, and signature headers");
    }
    if (!verifiedSignature(request.body, this.secret, signature)) {
      throw new InvalidWebhookEventError("GitHub webhook signature is invalid");
    }
    let payload: GitHubPayload;
    try {
      const parsed: unknown = JSON.parse(typeof request.body === "string" ? request.body : new TextDecoder().decode(request.body));
      payload = objectValue(parsed, "JSON payload");
    } catch (error) {
      if (error instanceof InvalidWebhookEventError) throw error;
      throw new InvalidWebhookEventError("GitHub webhook body is not valid JSON");
    }
    const merged = githubType === "pull_request" ? mergedPayload(payload) : undefined;
    const event: VerifiedWebhookEvent<GitHubPullRequestMergedEvent | GitHubPayload> = {
      source: this.source,
      deliveryId,
      type: merged ? "pull_request.merged" : `${githubType}.${typeof payload.action === "string" ? payload.action : "event"}`,
      occurredAt: merged?.mergedAt ?? request.receivedAt,
      payload: merged ?? payload,
      verification: {
        method: "github-hmac-sha256",
        verifiedAt: new Date().toISOString(),
        detail: { event: githubType },
      },
    };
    return normalizeWebhookEvent(event);
  }
}

export type GitHubRewardHookOptions = {
  amountMsat: bigint;
  policyVersion: string;
  /** Resolve a Lightning address/invoice destination from application-owned data. */
  recipient: string | ((event: GitHubPullRequestMergedEvent) => string | null | undefined);
  /** Business qualification belongs to the host application. */
  qualifies?: (event: GitHubPullRequestMergedEvent) => boolean;
  reason?: string | ((event: GitHubPullRequestMergedEvent) => string);
  obligationNamespace?: string;
};

/** Creates the demo rule: one qualified merged PR produces one stable obligation. */
export function githubPullRequestMergedRewardHook(
  options: GitHubRewardHookOptions,
): Hook<GitHubPullRequestMergedEvent> {
  if (options.amountMsat <= 0n) {
    throw new Error("amountMsat must be a positive integer");
  }
  if (!options.policyVersion.trim()) throw new Error("policyVersion is required");
  const namespace = options.obligationNamespace ?? "github";
  return {
    id: "github-pull-request-merged-reward",
    version: options.policyVersion,
    eventType: "pull_request.merged",
    propose(event): RewardProposal | null {
      if (options.qualifies && !options.qualifies(event)) return null;
      const recipient = typeof options.recipient === "function" ? options.recipient(event) : options.recipient;
      if (!recipient) return null;
      const key = `${namespace}:${event.repository.fullName}:issue:${event.issueNumber}:pr:${event.pullRequestNumber}`;
      const reason = typeof options.reason === "function"
        ? options.reason(event)
        : options.reason ?? `Merged pull request #${event.pullRequestNumber} for issue #${event.issueNumber}`;
      return {
        obligationKey: key,
        recipient,
        amountMsat: options.amountMsat,
        reason,
        policyVersion: options.policyVersion,
      };
    },
  };
}
