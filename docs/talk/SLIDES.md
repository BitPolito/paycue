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

## 8 · Paycue in one picture  ·  ends 6:30

**On screen**
> event → **hook** → **policy** → **route** → **provider** → **evidence**

**Visual:** the pipeline as five boxes; mark *core* around policy, lifecycle
and evidence; mark modules (GitHub, Lightning Address, KaleidoSwap, LND,
SQLite) as plug-ins.

**Notes:** The core only pays Lightning invoices and has zero dependencies.
Everything network- or vendor-specific is a module.

## 9 · A payout's life  ·  ends 7:30

**On screen:** the state machine:
received → proposed → authorized → resolving → attempting → settled
with branches to failed, unknown, stuck.

**Visual:** state diagram; highlight `unknown` in amber.

**Notes:** Every change is a compare-and-set in storage, so two workers can't
both move a payout.

## 10 · Three rules for exactly once  ·  ends 8:45

**On screen**
> 1. **Save before you pay.** The attempt is on disk before the node hears of it.
> 2. **Only re-send the same invoice.** Never resolve a new one for an uncertain payment.
> 3. **Uncertain is not failed.** Ask the node's own record before deciding.

**Notes:** Rule 3 saved us during development (slide 16 shows how).

## 11 · Policy, with reasons  ·  ends 10:00

**On screen**
```ts
policy: [
  pause,
  budget(600_000n * 1000n),
  forClient("game", maxPerPayout(100n * 1000n)),
  forClient("game", recipientLimit({ windowMs: 60_000, maxCount: 60 })),
]
```
> Allow · deny with a reason · hold

**Notes:** Rules are plain functions. A denial is evidence:
*"Recipient limit reached: 60 of 60 payouts in 1 min"*. Uncertain payouts count
against limits, so a burst can't overspend.

## 12 · Who sets each limit  ·  ends 11:00

**On screen**
> **operator** · **provider** · **network** · **receiver**

**Visual:** screenshot of the console's *Routes and their limits* panel
([assets/console-routes.png](assets/console-routes.png)) with the four chips circled.

**Notes:** The KaleidoSwap minimum of 50,000 sat is a *provider* limit, not a
Liquid rule. Keeping these separate is what makes a payout explainable.

## 13 · Routes: pay anything from Lightning  ·  ends 12:15

**On screen**
> Lightning Address → sats
> Liquid address → **L-USDT via KaleidoSwap** pay-through
> The core checks every invoice's amount itself.

**Visual:** one Lightning invoice fanning out to two destinations.

**Notes:** The studio only holds bitcoin on Lightning. The recipient picks a
stablecoin on another network, and a resolver module makes it happen without
the core knowing anything about Liquid.

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

**Notes:** The third story is the punchline for rule 3: a real bug turned into
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
