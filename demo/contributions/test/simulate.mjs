#!/usr/bin/env node
// Rehearsal without GitHub: sends signed GitHub webhooks to the contribution
// demo exactly as GitHub would. Creates a bounty issue, optionally registers
// the contributor, then merges a pull request that closes it.
//
//   GITHUB_WEBHOOK_SECRET=... node test/simulate.mjs --issue 12 --sats 60000 --login ada --address tlq1...
import { createHmac, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const { values: o } = parseArgs({ options: {
  server: { type: "string", default: "http://localhost:8092" },
  repo: { type: "string", default: "local/demo" },
  issue: { type: "string", default: "1" },
  sats: { type: "string", default: "60000" },
  title: { type: "string", default: "Add a dark mode to the dashboard" },
  login: { type: "string", default: "ada" },
  address: { type: "string" },
  pr: { type: "string" },
} });
const secret = process.env.GITHUB_WEBHOOK_SECRET;
if (!secret) throw new Error("Set GITHUB_WEBHOOK_SECRET to the demo's secret");
const repository = { full_name: o.repo, name: o.repo.split("/")[1], owner: { login: o.repo.split("/")[0] } };
async function hook(event, payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${o.server}/webhooks/github`, { method: "POST", body, headers: {
    "content-type": "application/json", "x-github-event": event, "x-github-delivery": randomUUID(),
    "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
  } });
  console.log(`${event}: HTTP ${res.status} ${await res.text()}`);
}
const n = Number(o.issue);
const pr = Number(o.pr ?? 100 + n);
await hook("issues", { action: "labeled", repository, issue: { number: n, title: o.title, state: "open", html_url: `https://github.com/${o.repo}/issues/${n}`, labels: [{ name: `bounty: ${o.sats}` }] } });
if (o.address) {
  const res = await fetch(`${o.server}/api/contributors`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: o.login, address: o.address }) });
  console.log(`register @${o.login}: HTTP ${res.status} ${await res.text()}`);
}
await hook("pull_request", { action: "closed", number: pr, repository, pull_request: {
  number: pr, merged: true, merged_at: new Date().toISOString(), html_url: `https://github.com/${o.repo}/pull/${pr}`,
  title: `Dark mode (closes #${n})`, body: `Closes #${n}`, user: { login: o.login }, labels: [], merge_commit_sha: "0".repeat(40),
} });
