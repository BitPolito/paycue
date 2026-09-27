/**
 * Bounty bookkeeping for the contribution reward demo. A bounty is a GitHub
 * issue with a `bounty: <sats>` label; merging a pull request that closes it
 * pays the pull request's author once.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export type Bounty = {
  number: number;
  title: string;
  url: string;
  amountSat: number;
  open: boolean;
  claim?: { login: string; pr: number; prUrl: string; mergedAt: string; payoutId?: string; waitingForAddress?: boolean };
};

export type State = {
  repo: string;
  bounties: Record<string, Bounty>;
  /** GitHub login -> payout address (Lightning Address or Liquid address). */
  contributors: Record<string, string>;
};

/** `bounty: 60000`, `bounty 60k`, `bounty-75,000 sats` -> sats. */
export function bountyAmount(labels: readonly string[]): number | undefined {
  for (const label of labels) {
    const match = /^bounty[\s:_-]*([\d][\d,._]*)\s*(k)?\s*(?:sats?)?$/i.exec(label.trim());
    if (!match) continue;
    const base = Number(match[1]!.replace(/[,._]/g, ""));
    const sats = match[2] ? base * 1000 : base;
    if (Number.isSafeInteger(sats) && sats > 0) return sats;
  }
  return undefined;
}

/** Issue numbers a pull request closes, from GitHub's closing keywords. */
export function closedIssues(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi)) found.add(Number(match[1]));
  return [...found];
}

/** A `Payout: <address>` line in a pull request description overrides the registered address. */
export function payoutOverride(text: string): string | undefined {
  return /^\s*payout\s*:\s*(\S+)\s*$/im.exec(text)?.[1];
}

export const LOGIN = /^[a-z\d](?:[a-z\d-]{0,38})$/i;

export function isPayableAddress(address: string): boolean {
  const text = address.trim();
  return /^(?:lightning:)?[a-z0-9._+-]+@[a-z0-9.-]+(?::\d+)?$/i.test(text)
    || /^(?:liquid:)?(?:tlq1|tex1|lq1|ex1)[02-9ac-hj-np-z]{20,}/i.test(text);
}

export class BountyStore {
  state: State;

  constructor(private readonly file: string, repo: string) {
    this.state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as State : { repo, bounties: {}, contributors: {} };
    this.state.repo = repo;
  }

  save(): void {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }

  /** Create, update or remove a bounty from an issue's current labels. */
  upsertIssue(issue: { number: number; title: string; html_url: string; state: string; labels: Array<{ name: string } | string> }): Bounty | undefined {
    const labels = issue.labels.map((label) => (typeof label === "string" ? label : label.name));
    const amount = bountyAmount(labels);
    const key = String(issue.number);
    const existing = this.state.bounties[key];
    if (amount === undefined) {
      // A bounty that was already claimed keeps its record.
      if (existing && !existing.claim) delete this.state.bounties[key];
      this.save();
      return existing?.claim ? existing : undefined;
    }
    const bounty: Bounty = {
      ...existing,
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      // The amount is frozen once claimed, so relabelling can't change a payout.
      amountSat: existing?.claim ? existing.amountSat : amount,
      open: issue.state === "open",
    };
    this.state.bounties[key] = bounty;
    this.save();
    return bounty;
  }

  register(login: string, address: string): void {
    this.state.contributors[login.toLowerCase()] = address.trim();
    this.save();
  }

  addressOf(login: string): string | undefined {
    return this.state.contributors[login.toLowerCase()];
  }

  list(): Bounty[] {
    return Object.values(this.state.bounties).sort((a, b) => b.number - a.number);
  }
}
