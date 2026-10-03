# Paycue at bitcoin++ Berlin: slide content

**Slot:** Saturday 3 October 2026, 30 minutes including Q&A.
**Budget:** 25 minutes talk and demo, 5 minutes questions.
**Build:** in BitPolito's Figma layout. Each slide below gives the on-screen
text (keep it that short), the visual to build, speaker notes, and the time
at which the slide should end. `[YOU: …]` marks what only you can fill in.

Screenshots for the demo slides are in [assets/](assets/) at 1920×1080.

**Timing (speaker notes, 3 Oct hour 3).** The live demo gets 7:30; the main
deck ends at 24:45, leaving 15 s of slack before Q&A. The extra 45 s for the
demo came from words, not slides: slides 8–13 go from 70 s to 60 s each.

| Slide | Target | Ends | | Slide | Target | Ends |
|---|---|---|---|---|---|---|
| 1 Title | 0:20 | 0:20 | | 11 Who sets each limit | 1:00 | 9:15 |
| 2 Live teaser | 0:30 | 0:50 | | 12 Payments (A) | 1:00 | 10:15 |
| 3 BitPolito | 0:50 | 1:40 | | 13 Providers (B) | 1:00 | 11:15 |
| 4 About me | 0:35 | 2:15 | | 14 One service | 0:30 | 11:45 |
| 5 If this, pay that | 1:00 | 3:15 | | **15 Live demo** | **7:30** | **19:15** |
| 6 What goes wrong | 1:30 | 4:45 | | 16 Signet lessons | 2:15 | 21:30 |
| 7 The cost | 0:30 | 5:15 | | 17 Where Paycue is | 1:30 | 23:00 |
| 8 Triggers (A) | 1:00 | 6:15 | | 18 Try it | 1:15 | 24:15 |
| 9 Trigger examples (B) | 1:00 | 7:15 | | 19 Thanks | 0:30 | 24:45 |
| 10 Policies (A) | 1:00 | 8:15 | | Q&A | 5:00 | 30:00 |

Over at a checkpoint (slide 7 at 5:15, slide 13 at 11:15, demo out at
19:15)? Cut slide 11 (−1:00), then shorten slide 16 to its first and third
story (−0:45).

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

**Timing:** 60 s per slide (5:15 → 11:15); each note below is 75–100
spoken words, under 45 s at stage pace, so there is room to point.
**If running long, cut slide 11 first**: skip it, and say its one line on
slide 10 instead: *"Every limit is labelled with who set it: you, the
provider, the network or the receiver."* That buys back 60 s.

## 8 · Triggers (A)  ·  ends 6:15

**On screen**
> **Triggers: what cues a payment**
> - Any event can cue a payment
> - Verified before anything else: signatures checked, your server decides, never the client
> - Exactly once: a repeated delivery and a repeated business event are both caught
> - Hooks are plain code: event in → who, how much, why, plus an obligation key

**Visual:** pipeline strip with *event* and *hook* filled. Below it, one hook
as a small card: `pull_request.merged` in →
`github:…/paycue-bounty-demo:issue:1:pr:N`, recipient, 60,000 sat, reason out.

**Notes:** "A payout starts with an event. Before we look at it, we verify
it: the signature, and the server's own view of what happened. Then problem
one, the webhook that arrives twice. Two checks, in one transaction: the
delivery ID catches a re-sent webhook, and the obligation key catches the
same business event under a new ID. The key *is* the payout: PR N closing
issue 1 can only ever be paid once. And the hook is plain code. Event in;
who, how much, why and the key out. It never touches money."

## 9 · Trigger examples (B)  ·  ends 7:15

**On screen**

| Today | Easy next | Community modules |
|---|---|---|
| GitHub: a merged PR closes a bounty | Signed webhooks: Stripe, Shopify, forms | Unity · Unreal · Godot SDKs |
| Game server events (the coin you saw) | CI tests pass → pay | Nostr events and zaps |
| | Scheduled payouts | IoT devices |

> A game SDK reports to **your game server**. It never pays from the client.

**Visual:** three columns; *Today* in solid ink, the other two outlined.

**Notes:** "Two triggers ship today: GitHub, where a merged PR that closes a
bounty issue pays its author, and game server events, like the coin you saw.
The next column is easy: any signed webhook, CI passing, a schedule. Each is
a hook plus a signature check. The last column is an invitation: engine
SDKs, Nostr, IoT. One rule for all of them: the client is never trusted. A
Unity SDK tells *your game server* the player hit a coin. The server
decides, and Paycue pays. Never from the client."

## 10 · Policies (A)  ·  ends 8:15

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

**Notes:** "Next, policy. An ordered list of plain functions. Each says
allow, deny with a reason, or hold. The first one that doesn't allow
decides, and its reason is saved: *recipient limit reached, 60 of 60 in a
minute*. No money moves. Out of the box you get a pause switch, a per-payout
cap, a per-recipient window and a budget. Problem four, payouts racing past
a limit: anything authorized, in flight or uncertain already counts. And if
a rule crashes, the payout is denied. A bug can't approve money."

## 11 · Who sets each limit (B)  ·  ends 9:15  ·  CUT FIRST if running long

**On screen**

| Set by | Example from the demo |
|---|---|
| **operator** (you) | pause · 600,000 sat budget · game 100 sat per payout, 60 per player per minute · bounties 150,000 sat per payout, 5 per person per hour · swap fee cap 3% |
| **provider** | KaleidoSwap signet maker: minimum 50,000 sat; maximum follows the maker's liquidity (about 137,000 sat for L-USDT today) · 0.5% fee |
| **network** | Lightning: channel liquidity · Liquid: one-minute blocks |
| **receiver** | the invoice fixes the amount and expiry · LNURL min and max |

> Denied → fails with its reason, no money moves · Held (pause) → waits · Defaults: pause, 10,000 sat per payout, 20 payouts or 50,000 sat per recipient per hour, 1,000,000 sat budget

**Visual:** the table; optionally the console's *Routes and their limits*
panel ([assets/console-routes.png](assets/console-routes.png)) with the four
chips circled.

**Notes:** "Who sets a limit matters. You set the budget, the caps and the
fee cap. The swap provider sets its range: at least 50,000 sat, and a
maximum that moves with its liquidity: a provider limit, not a Liquid
rule. The network has its own facts; the receiver's invoice fixes the
amount. Keep them apart and every refusal explains itself. Denied: failed
with a reason, no money moved. Held: it waits." (Approval is roadmap: QA 12.)

Check the maker's live maximum just before the talk (console *Routes and
their limits*, or the board's form card "L-USDT payouts right now"); say
"about" and round it. Live at 3 Oct hour 3: L-USDT 50,000–136,694 sat.

## 12 · Payments (A)  ·  ends 10:15

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

**Notes:** "The core pays one thing: Lightning invoices. A route turns a
recipient, a Lightning Address or a Liquid address, into an invoice, and the
core checks that invoice itself: right amount, not about to expire. Now
problems two and three. The attempt is saved before the node hears of it,
so a crash leaves a record. If the answer is lost, the payout is *unknown*,
not failed. We ask the node, and we only ever re-send the same invoice,
which a node won't pay twice. You'll see this live, and on slide 16."

## 13 · Providers (B)  ·  ends 11:15

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

**Notes:** "Who actually pays? A provider. Paycue never holds funds, so
custody and compliance come from the provider you pick. If you need a
compliant, custodial provider: ZBD. If you want no KYC and self-custody:
Breez. Both are modules still to build; a provider is three methods. Today
you can run your own LND: start it, bake a macaroon that can only pay and
read payments, point Paycue at it. And community routes, like KaleidoSwap
to L-USDT. Those last two rows are what you're about to see live."

## 14 · One service, many apps  ·  ends 11:45

**On screen**
> `@paycue/server`: one executor per node, many clients
> game demo ─┐
> bounties  ─┴─► payout service ─► studio node

**Notes:** Budgets only work if one process decides every payout from a node.

## 15 · Live demo  ·  ends 19:15

**On screen:** "Live demo" title card; then switch to the browser.

**Run sheet** (click-by-click version and pre-show checklist in
[REHEARSAL.md](REHEARSAL.md)). The console stays on the Chromebook's own
screen (display extended, not mirrored), never on the big screen. Clock is
time since you switch to the browser; talk time in brackets. **7:30 in
total**: the first four steps keep REHEARSAL.md's marks; the extra 45 s
over its 6:45 goes to the bounty, the one step that waits on a real swap and
the GitHub webhook relay. Demo actions take about 101 s; the rest is
narration. **Reload the game page (F5) between rounds.**

1. **0:00–0:15 (11:45–12:00) · Switch:** F5 on the game tab first (it is
   mid-round or ROUND OVER from the slide-2 teaser); menu showing, wallet
   `?user=ada` beside it.
2. **0:15–1:45 (→13:30) · Game, Normal:** pilot `ada` → **Use the demo
   Lightning wallet** → **Normal** → **LAUNCH →**; shoot three coins
   (21 sat each); each feed row goes to **SETTLED**, the wallet ticks up.
   Point at the rules panel. F5.
3. **1:45–3:15 (→15:00) · Money glitch:** pilot **`glitch`** (not `ada`:
   the cap is per recipient, and glitching as ada would block the recovery
   coin), tick **Money glitch**. Point at "Replayed hit ignored", then at
   "Recipient limit reached: 60 of 60 payouts in 1 min". F5.
4. **3:15–4:30 (→16:15) · Recovery:** console (Chromebook screen) → **Drop
   next node response**; pilot `ada`, Money glitch unticked, shoot **one**
   coin. Point at the feed row's **RECOVERED** chip: "Answer lost · confirmed
   with the node · paid once". Optional, Chromebook screen only: the
   payout's evidence in the console. F5.
5. **4:30–7:15 (→19:00) · Bounty:** board tab, then **your own** pre-opened
   PR on `paycue-bounty-demo` (not #3) → **Merge pull request** → **Confirm
   merge**; back to the board: a new `pull_request.merged` row under *GitHub
   webhook deliveries*, then *paying* (read out the quoted L-USDT amount) →
   **PAID** with the Liquid tx; the wallet's L-USDT updates on its next scan
   (up to 15 s).
   **Merge not on the board** (no new `pull_request.merged` row under
   *GitHub webhook deliveries*): the webhook relay is the hop that failed (it
   was down from about 29 Sep until 01:18 today; fixed).
   (a) Wait ~20 s, talking.
   (b) Redeliver, on the presenter's (Chromebook) screen: GitHub →
   `moakilodash/paycue-bounty-demo` → **Settings** → **Webhooks** → the
   `cli` hook → **Recent Deliveries** → the `pull_request` "closed"
   delivery → **Redeliver**. Say in one sentence: *"I'm asking GitHub to
   send it again: same delivery ID, so it can only pay once. That's the
   dedup you just saw, on a real webhook."* Caveat: Redeliver only reaches
   us for deliveries of the currently registered `cli` hook (registered at
   01:18 today); anything older can't be redelivered.
   (c) That fails too: play `docs/talk/video/bounty-live.webm` **if it
   exists** (pending: the lead records it during the owner's PR test; never
   the `bounty-fake.webm` draft). Otherwise say *"The webhook is stuck in the
   relay; the payout will run the moment it lands, exactly once. I'll show it
   after the talk"*, and close.
   **Sync from GitHub** (*Bounties* card) is only proof that GitHub saw the
   merge (bounty #1 turns **closed**). It is not a payout path: it never
   pays.
6. **7:15–7:30 (→19:15) · Close:** "Three failures, zero double payments,
   and every decision has a reason on record." Slide 16.

**Fallback ladder** (URLs in `CHEATSHEET.md`; all of 1 and 2 is the same
live demo):
1. Live via the Chromebook's Tailscale: `http://100.91.180.29:808x`.
2. Live via the penguin relay: start the relay script in a penguin terminal,
   then `http://penguin.linux.test:808x` (if that host doesn't load,
   `http://localhost:808x`).
3. The live recordings `docs/talk/video/*-live.webm` (never the `*-fake.webm`
   drafts).
4. Skip the step with one sentence and move on.

Say the 30-second line from `CHEATSHEET.md` once, when you leave rung 1.

## 16 · What signet taught us  ·  ends 21:30

**On screen**
> LND can't follow Mutinynet's 30 s blocks → built it from PR #10864
> The maker isn't in the public graph → a direct channel
> A lost base64 `=` made every lookup fail → **uncertain, not failed**, so nothing broke

**Notes:** The third story is the punchline for slide 12, *uncertain is not
failed*: a real bug turned into a harmless wait instead of a double payment
or a lost one.

## 17 · Where Paycue is  ·  ends 23:00

**On screen**
> v0.2 · MIT · BitPolito
> `@paycue/core` · `sqlite` · `lnd` · `lnurl` · `kaleidoswap` · `github` · `server`
> Next: batching under route minimums · RGB and Spark routes · ZBD and Breez providers · an approval rule

## 18 · Try it  ·  ends 24:15

**On screen**
> github.com/BitPolito/paycue
> Bounty playground: github.com/moakilodash/paycue-bounty-demo
> [QR code to the repo]

**Notes:** Invite people to open a PR on the bounty repo during the event.

## 19 · Thanks / questions  ·  ends 24:45

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
