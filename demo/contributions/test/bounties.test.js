import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BountyStore, bountyAmount, closedIssues, isPayableAddress, payoutOverride } from "../dist/bounties.js";

test("bounty labels are read in the common formats", () => {
  assert.equal(bountyAmount(["bug", "bounty: 60000"]), 60000);
  assert.equal(bountyAmount(["Bounty 75k"]), 75000);
  assert.equal(bountyAmount(["bounty-80,000 sats"]), 80000);
  assert.equal(bountyAmount(["bounty"]), undefined);
  assert.equal(bountyAmount(["good first issue"]), undefined);
});

test("closing keywords and payout overrides are found in PR text", () => {
  assert.deepEqual(closedIssues("Fixes #12, also closes #7 and resolves: #12"), [12, 7]);
  assert.deepEqual(closedIssues("Relates to #3"), []);
  assert.equal(payoutOverride("Some text\nPayout: ada@wallet.example\n"), "ada@wallet.example");
  assert.equal(payoutOverride("no line here"), undefined);
  assert.equal(isPayableAddress("ada@wallet.example"), true);
  assert.equal(isPayableAddress("tlq1qqv3a0f0ag3hfnlmsmyy4wc06e2zhxaaqyphff75a77kxgxwjkvqcm7lg32cps4ys9cszwkylwuwzdlhasdgsws96j4f2sw0el"), true);
  assert.equal(isPayableAddress("hello"), false);
});

test("a claimed bounty keeps its amount and record through relabelling", () => {
  const store = new BountyStore(join(mkdtempSync(join(tmpdir(), "bounty-")), "b.json"), "o/r");
  const issue = { number: 5, title: "Fix it", html_url: "https://github.com/o/r/issues/5", state: "open", labels: [{ name: "bounty: 60000" }] };
  store.upsertIssue(issue);
  store.state.bounties["5"].claim = { login: "ada", pr: 9, prUrl: "", mergedAt: "" };
  store.upsertIssue({ ...issue, labels: [{ name: "bounty: 900000" }] });
  assert.equal(store.state.bounties["5"].amountSat, 60000);
  store.upsertIssue({ ...issue, labels: [] });
  assert.ok(store.state.bounties["5"], "claimed bounty survives label removal");
  store.upsertIssue({ number: 6, title: "x", html_url: "", state: "open", labels: [{ name: "bounty: 1000" }] });
  store.upsertIssue({ number: 6, title: "x", html_url: "", state: "open", labels: [] });
  assert.equal(store.state.bounties["6"], undefined, "unclaimed bounty disappears with its label");
});
