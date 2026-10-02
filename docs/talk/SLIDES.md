# Paycue at bitcoin++ Berlin: slide content

**Slot:** Saturday 3 October 2026, 30 minutes including Q&A.
**Budget:** 25 minutes talk and demo, 5 minutes questions.
**Build:** in BitPolito's Figma layout. Each slide below gives the on-screen
text (keep it that short), the visual to build, speaker notes, and the time
at which the slide should end. `[YOU: …]` marks what only you can fill in.

Screenshots for the demo slides are in [assets/](assets/) at 1920×1080.

---

## 1 · Title  ·  ends 0:20

**On screen**
> **Paycue**
> Durable, policy-controlled bitcoin payouts, triggered by events
> [YOU: your name] · BitPolito · bitcoin++ Berlin 2026

**Visual:** BitPolito title layout; Paycue wordmark.

**Notes:** Don't linger. Go straight to the live teaser.

## 2 · Live teaser  ·  ends 0:50

**On screen:** the game, full screen (switch to the browser).

**Notes:** Shoot one golden coin. The wallet window ticks up. *"That was a
real Lightning payment, triggered by a game event, decided by a policy, with a
full audit trail. It looks trivial. Let me show you why it isn't."*

## 3 · BitPolito  ·  ends 1:40

**On screen**
> **BitPolito**
> Politecnico di Torino's Bitcoin student team, since 2018
> Bridging academia and the Bitcoin industry
> ~60 active members · 200+ alumni · 25 now working in Bitcoin
> Open source · research · education

**Visual:** team photo or logo wall of projects (SeedSigner build, Silent
Payments BIP352 implementation, Schnorr/MuSig, Bitcoin Academy, ShellShop).

**Notes:** One breath on the mission, one on what students build. Paycue is a
BitPolito project, MIT licensed.

## 4 · About me  ·  ends 2:15

**On screen**
> [YOU: name, role at BitPolito]
> [YOU: one line on what you work on, e.g. your KaleidoSwap work]
> [YOU: handle / moaki.net]

**Notes:** 30 seconds. Why you care about automated payouts.

## 5 · "If this happens, pay that"  ·  ends 3:15

**On screen**
> **If this happens, pay that.**
> Game rewards · open-source bounties · creator payouts · affiliate fees · payroll

**Visual:** five small cards, each "event → sats".

**Notes:** Lightning made small, instant payouts possible. The trigger side is
where teams keep writing the same fragile glue.

## 6 · What goes wrong  ·  ends 4:45

**On screen**
> **Four ways a payout goes wrong**
> 1. The webhook arrives twice
> 2. The process dies mid-payment
> 3. The node's answer never arrives
> 4. Two payouts race past the same limit

**Visual:** four timelines, each with the bug marked in red.

**Notes:** Each one is a double payment, stuck money, or overspending. And
the fifth problem: months later, nobody can explain why a payment happened.

## 7 · The cost  ·  ends 5:15

**On screen**
> Pay twice · pay never · pay too much · can't explain it

**Notes:** Transition: "Paycue is the library we wanted instead of writing
this glue again."

**Section note (slides 8–13: Triggers → Policies → Payments).**

Three topics, two slides each: **A** is the overview (four bullets, no more),
**B** is the deep dive. Every slide in this section carries the same thin
pipeline strip at the top,
`event → hook → policy → route → provider → evidence`, with the current
topic's boxes filled in ink (Triggers: event, hook · Policies: policy ·
Payments: route, provider). The strip replaces the old "one picture" slide.

## 8 · Triggers (A)  ·  ends 6:25

**On screen**
> **Triggers: what cues a payment**
> - Any event can cue a payment
> - Verified before anything else: signatures checked, your server decides, never the client
> - Exactly once: a repeated delivery and a repeated business event are both caught
> - Hooks are plain code: event in → who, how much, why, plus an obligation key

**Visual:** pipeline strip with *event* and *hook* filled. Below it, one hook
as a small card: `pull_request.merged` in →
`github:…/paycue-bounty-demo:issue:1:pr:N`, recipient, 60,000 sat, reason out.

**Notes:** This is where problem 1 (the webhook arrives twice) is solved. Two
checks, recorded in one transaction: the delivery ID catches a re-sent
webhook; the **obligation key** catches the same business event arriving
under a new ID. The key is the payout's business identity, so "PR N closed
issue 1" can only ever be paid once. A hook is a plain function; it never
touches money.

## 9 · Trigger examples (B)  ·  ends 7:35

**On screen**

| Today | Easy next | Community modules |
|---|---|---|
| GitHub: a merged PR closes a bounty | Signed webhooks: Stripe, Shopify, forms | Unity · Unreal · Godot SDKs |
| Game server events (the coin you saw) | CI tests pass → pay | Nostr events and zaps |
| | Scheduled payouts | IoT devices |

> A game SDK reports to **your game server**. It never pays from the client.

**Visual:** three columns; *Today* in solid ink, the other two outlined.

**Notes:** *Today* ships: `@paycue/github` verifies GitHub's signature and
proposes the bounty; the game server calls the runtime in-process. *Easy
next* needs only a hook and a signature check; the core already has a webhook
adapter contract. *Community modules* are an invitation, not a promise. The
one rule: the client is never trusted. A Unity SDK sends "player hit coin" to
the game server, the server decides, Paycue pays.

## 10 · Policies (A)  ·  ends 8:45

**On screen**
> **Policies: decide before any money moves**
> - Ordered rules: each allows, denies with a reason, or holds
> - Safe defaults out of the box
> - Unfinished payments count against limits
> - Fails closed: a rule that crashes denies

**Visual:** pipeline strip with *policy* filled; beside the bullets, the demo
policy as code:

```ts
policy: [
  pause,
  budget(600_000n * 1000n),
  forClient("game", maxPerPayout(100n * 1000n)),
  forClient("game", recipientLimit({ windowMs: 60_000, maxCount: 60 })),
]
```

**Notes:** Rules are plain functions, checked in order; the first one that
doesn't allow decides. A denial is evidence:
*"Recipient limit reached: 60 of 60 payouts in 1 min"*. Problem 4 (two
payouts racing past a limit): payouts that are authorized, in flight or
uncertain already count, so a burst can't overspend. And a bug in a rule
can never approve money by accident.

## 11 · Who sets each limit (B)  ·  ends 9:55

**On screen**

| Set by | Example from the demo |
|---|---|
| **operator** (you) | pause · 600,000 sat budget · game 100 sat per payout, 60 per player per minute · bounties 150,000 sat per payout, 5 per person per hour · swap fee cap 3% |
| **provider** | KaleidoSwap signet maker: about 50,000 to 190,000 sat per swap, 0.5% fee |
| **network** | Lightning: channel liquidity · Liquid: one-minute blocks |
| **receiver** | the invoice fixes the amount and expiry · LNURL min and max |

> Denied → fails with its reason, no money moves · Held (pause) → waits · Defaults: pause, 10,000 sat per payout, 20 payouts or 50,000 sat per recipient per hour, 1,000,000 sat budget

**Visual:** the table; optionally the console's *Routes and their limits*
panel ([assets/console-routes.png](assets/console-routes.png)) with the four
chips circled.

**Notes:** The KaleidoSwap minimum is a *provider* limit, not a Liquid rule.
Keeping the four sources apart is what makes a refusal explainable. The core
already has an *awaiting approval* state for a human sign-off; no rule uses
it yet, so manual approval is on the roadmap, not in v0.2.

## 12 · Payments (A)  ·  ends 11:05

**On screen**
> **Payments: one rail, any destination**
> - The core pays only Lightning invoices
> - Routes turn a recipient into an invoice: Lightning Address, Liquid L-USDT, …
> - The core checks every invoice: amount and expiry, whoever made it
> - Uncertain is not failed: save before paying, re-send only the same invoice, ask the node

**Visual:** pipeline strip with *route* and *provider* filled; the payout
state machine underneath: received → proposed → authorized → resolving →
attempting → settled, with branches to failed, unknown, stuck; `unknown` in
amber.

**Notes:** Problems 2 and 3. The attempt is on disk before the node hears of
it, so a crash leaves a record, not a mystery. If the node's answer is lost
the payout goes `unknown`, never `failed`; Paycue asks the node's own record,
and only ever re-sends the same invoice. Every state change is a
compare-and-set in storage, so two workers can't both move a payout. Slide 16
shows this saving us.

## 13 · Providers (B)  ·  ends 12:15

**On screen**

| Provider | What it is | Status |
|---|---|---|
| **ZBD SDK** | compliant, custodial | module to build |
| **Breez SDK** | non-custodial, no KYC | module to build |
| **Your own LND** | `@paycue/lnd` | available |
| **Community routes** | KaleidoSwap → L-USDT on Liquid | available |

> Your own LND in three steps: run LND · bake a payment-only macaroon (`offchain:read offchain:write info:read`) · point `LndRestTransport` at it

**Visual:** the table; *available* rows in solid ink, *to build* rows
outlined.

**Notes:** Paycue never holds funds; custody and compliance come from the
provider you pick (backup B1). ZBD and Breez are the two obvious next
modules; anyone can write one against the `PaymentProvider` interface. The
macaroon can pay and read payments, nothing else. Transition: "Here's the
LND row and the KaleidoSwap row, live."

## 14 · One service, many apps  ·  ends 12:45

**On screen**
> `@paycue/server`: one executor per node, many clients
> game demo ─┐
> bounties  ─┴─► payout service ─► studio node

**Notes:** Budgets only work if one process decides every payout from a node.

## 15 · Live demo  ·  ends 19:30

**On screen:** "Live demo" title card; then switch to the browser.

**Run sheet** (keep the console on your laptop, open on the payout detail):
1. **Game, Normal:** shoot three coins; the feed goes proposed → settled.
2. **Money glitch:** coins rain, every hit sent three times. Point at
   "Replayed hit ignored", then at "Recipient limit reached".
3. **Recovery:** console → *Drop next node response*; shoot one coin; show
   `unknown` → `settled`; open its evidence.
4. **Bounty board:** your pre-opened PR on `paycue-bounty-demo` → click
   **Merge** on GitHub; the board goes *paying* (quoted ≈50 L-USDT) → *paid*
   with the Liquid tx; the wallet's L-USDT ticks up.

**Fallback:** if the network misbehaves, play the recorded video; if the
office is unreachable, switch to the fake-mode stack on penguin and say so.

## 16 · What signet taught us  ·  ends 21:45

**On screen**
> LND can't follow Mutinynet's 30 s blocks → built it from PR #10864
> The maker isn't in the public graph → a direct channel
> A lost base64 `=` made every lookup fail → **uncertain, not failed**, so nothing broke

**Notes:** The third story is the punchline for slide 12, *uncertain is not failed*: a real bug turned into
a harmless wait instead of a double payment or a lost one.

## 17 · Where Paycue is  ·  ends 23:15

**On screen**
> v0.2 · MIT · BitPolito
> `@paycue/core` · `sqlite` · `lnd` · `lnurl` · `kaleidoswap` · `github` · `server`
> Next: batching under route minimums · RGB and Spark routes · more providers (Breez, ZBD) · approvals

## 18 · Try it  ·  ends 24:30

**On screen**
> github.com/BitPolito/paycue
> Bounty playground: github.com/moakilodash/paycue-bounty-demo
> [QR code to the repo]

**Notes:** Invite people to open a PR on the bounty repo during the event.

## 19 · Thanks / questions  ·  ends 25:00

**On screen:** [YOU: name, handle], BitPolito logo, repo URL.

---

## Backup slides (for Q&A)

**B1 · Custody.** Paycue never holds funds: it tells your node or provider to
pay. Custody and compliance come from the provider you choose.

**B2 · Recovery, step by step.** Sequence diagram: save attempt → send →
response lost → `unknown` → lookup → settled; or not found → re-send the same
invoice.

**B3 · The API.** `submit(event, proposal)`, `startWorker()`, `on(listener)`,
`DestinationResolver`, `PaymentProvider`, `PolicyRule`.
