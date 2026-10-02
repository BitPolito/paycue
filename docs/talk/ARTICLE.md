---
title: "Pay on autopilot, never twice: introducing Paycue"
description: "An open-source library from BitPolito that turns events into durable, policy-controlled bitcoin payouts. Presented at bitcoin++ Berlin 2026."
date: 2026-10-03
author: "[YOU: name]"
tags: [bitcoin, lightning, payments, open-source, bitpolito]
draft: true
---

<!-- Publishing note: publish on the morning of the talk (3 Oct) or right
after it. Before publishing: fill every [YOU: …], make sure
github.com/BitPolito/paycue is public, and drop `draft: true`. -->

I shot a golden coin in a browser game, and a second later a wallet on the
other side of the screen was 21 sats richer. The payment was real Lightning,
triggered by a game event, checked against a policy, and recorded with a
complete audit trail.

It looks like a weekend project. The part you see is. The part you don't see,
making sure that coin is paid **exactly once** whatever goes wrong, is why
we built **Paycue**, an open-source library from
[BitPolito](https://www.bitpolito.it), the Bitcoin student team at
Politecnico di Torino. I presented it at bitcoin++ Berlin's payments edition;
this post is the long version of that talk.

## "If this happens, pay that"

Lightning made small, instant payments cheap. That opened a whole category of
automated payouts: rewards in games, bounties for open-source work, creator
payouts, affiliate fees, payroll for small teams. Each one follows the same
sentence: *if this happens, pay that.*

Writing that sentence as code takes an afternoon. Keeping it correct is a
distributed-systems problem, and it fails in four familiar ways:

1. **The event arrives twice.** Webhooks are delivered at least once. Retry
   the same delivery, or deliver the same business event with a new ID, and a
   naive handler pays twice.
2. **The process dies mid-payment.** Was the payment sent before the crash?
   If you guess wrong you either pay twice or never.
3. **The answer never arrives.** The node paid, but the response was lost.
   "No answer" is not "failed", and treating it as failed invites a second
   payment.
4. **Two payouts race past the same limit.** Two requests both check a budget
   before either is recorded, and both pass.

And a fifth, quieter one: months later, somebody asks *why* a payment
happened, and nobody can say.

## What Paycue does

Paycue turns events into **obligations** and drives each one through a small
state machine until it is paid, refused with a reason, or handed to a human.

```
event → hook → policy → route → provider → evidence
```

Every step leaves **evidence**: who decided what, and when. The core only
pays Lightning invoices, and it has no dependencies. Everything specific to a
network, a vendor or a storage engine is a separate package, so you only
install what you use.

The rest of this post follows a payout through three parts: what **triggers**
it, the **policy** that decides it, and the **payment** itself.

## Triggers: what cues a payment

Any event can cue a payment: a merged pull request, a coin hit in a game, a
form submission. Paycue cares about three things before anything else
happens.

- **Verified first.** A webhook's signature is checked before its contents
  are trusted, and your server decides what happened, never the client.
- **Exactly once.** A delivery seen twice is ignored, and so is a different
  delivery describing a payout that already exists. That second check uses
  the **obligation key**, the business identity of a payout, such as
  `github:…/paycue-bounty-demo:issue:1:pr:12`. Both are recorded in the same
  transaction.
- **Hooks are plain code.** A hook takes an event and returns a proposal: who
  gets paid, how much, why, and the obligation key. It never touches money.

What ships today is a GitHub adapter (a merged pull request that closes a
bounty issue pays its author) and the game server's own events, submitted
in-process. Easy next steps need only a hook and a signature check: signed
webhooks from Stripe, Shopify or a form builder, "CI passed, pay the
contributor", or scheduled payouts. Further out are modules we'd love the
community to write: game-engine SDKs for Unity, Unreal or Godot, Nostr events
and zaps, IoT devices.

One rule holds for all of them: a game SDK reports to **your game server**,
which decides. It never pays from the client.

## Policies: decide before any money moves

Rules are ordinary functions in an ordered list. Each one allows a payout,
denies it with a reason, or holds it. The first one that doesn't allow
decides, and its reason becomes part of the payout's evidence:

```ts
policy: [
  pause,
  budget(600_000n * 1000n),
  forClient("game", maxPerPayout(100n * 1000n)),
  forClient("game", recipientLimit({ windowMs: 60_000, maxCount: 60 })),
]
```

A denied payout doesn't just say `failed`. It says *"Recipient limit reached:
60 of 60 payouts in 1 min"*, and no money moves. A held one, for example
while the pause switch is on, waits until the hold lifts. A rule that throws
denies: a bug in a rule can never approve money by accident.

Payouts that are authorized, in flight or uncertain count against every
limit, so a burst of events can't overspend while payments are pending.

Out of the box, `defaultPolicy()` gives a pause switch, 10,000 sats per
payout, 20 payouts or 50,000 sats per recipient per hour, and a 1,000,000 sat
budget. The demo replaces those with its own numbers: a shared 600,000 sat
budget; 100 sats per payout and 60 per player per minute for the game;
150,000 sats per payout and 5 per person per hour for bounties.

We also found it matters **who** sets a limit. Paycue labels every limit with
its source:

- **operator**: your business rules, such as budgets, caps, pauses, and the
  3% swap fee cap;
- **provider**: the route's limits. KaleidoSwap's signet maker swaps a
  minimum of 50,000 sats; its maximum follows the maker's liquidity (about
  137,000 sats for L-USDT as I write), with a 0.5% fee. That is a limit of
  the *provider*, not of Liquid, and it is shown that way;
- **network**: facts about the network, like Lightning channel liquidity or
  Liquid's one-minute blocks;
- **receiver**: what the recipient accepts, such as the amount and expiry
  fixed in an invoice.

Keeping those apart is what makes a refusal explainable later. The core also
has an *awaiting approval* state for payouts a human should sign off; no rule
uses it yet, so approvals are on the roadmap.

## Payments: one rail, any destination

The core pays only Lightning invoices. Reaching anything else is the job of a
**route** (a resolver), which turns a recipient into an invoice. Two ship
today:

- **Lightning Address**: `name@domain` becomes a fresh invoice for the exact
  amount.
- **KaleidoSwap pay-through**: a Liquid address receives **L-USDT**. Paycue
  pays the swap service's hold invoice over Lightning; the service sends the
  stablecoin to the recipient and only then settles.

The studio only holds bitcoin on Lightning. The recipient picks a stablecoin
on another network, and the core never learns what Liquid is. Whatever a
route returns, the core decodes the invoice itself and refuses any amount
other than the one policy approved, or an invoice about to expire.

[YOU: disclosure, if you want one, about your role at KaleidoSwap.]

### Uncertain is not failed

Most of Paycue's payment safety comes down to three rules:

1. **Save before you pay.** The payment attempt, with its invoice, is on disk
   before the node hears about it. After a crash there is always a record of
   what might have happened.
2. **Only re-send the same invoice.** When a payment's fate is uncertain,
   Paycue never asks for a new invoice. It re-sends the one it saved, which a
   Lightning node will refuse to pay twice.
3. **Ask the node.** When the provider doesn't answer, the payout becomes
   `unknown`, not `failed`, and Paycue checks the node's own record before
   deciding anything.

Every state change is a compare-and-set in storage, so two workers can't both
move the same payout.

### Providers

A provider is whatever actually pays the invoice. Paycue never holds funds;
custody and compliance come from the provider you pick:

| Provider | What it is | Status |
|---|---|---|
| ZBD SDK | compliant, custodial | module to build |
| Breez SDK | non-custodial, no KYC | module to build |
| Your own LND | `@paycue/lnd` | available |
| Community routes | KaleidoSwap → L-USDT on Liquid | available |

Your own LND takes three steps: run LND, bake a macaroon that can only pay
and read payments (`offchain:read offchain:write info:read`), and point
`LndRestTransport` at it. A new provider implements three methods: decode an
invoice, pay it, and look up a payment by its hash.

## One service, many apps

Budgets only work if one process decides every payout from a node. So
`@paycue/server` runs Paycue as a service: several applications submit
payouts over HTTP with their own tokens, each with its own rules, all sharing
one budget and one node. It comes with a plain operator console showing the
policy, every route's limits, and each payout's evidence.

## Two demos

We built two showcases on signet, both paying through the same service:

- **Orbital Sats**, a space shooter where every golden coin pays sats over
  Lightning. The server owns the coin schedule and checks every reported hit
  (position, timing, bullet travel time) before proposing a payout. A "money
  glitch" option makes coins rain and sends every hit three times: the
  replays are ignored as duplicates, and after 60 payouts a minute the rest
  are denied with the reason on screen.
- **A contribution bounty board**, in the spirit of SatQuest: label a GitHub
  issue `bounty: 60000`, and when a pull request that closes it is merged, its
  author is paid, as L-USDT on Liquid or sats over Lightning. The trigger is a
  real, signature-checked GitHub webhook.

For the recovery demo, the operator console can drop the next response from
the node: the payment goes out, the answer is lost, the payout shows
`unknown`, and it settles on its own exactly once.

## What signet taught us

Building this on Mutinynet (a signet with 30-second blocks) produced three
stories worth sharing:

- **LND couldn't follow Mutinynet over neutrino.** Its difficulty checks
  assume ten-minute blocks. We built LND from an open pull request that adds a
  custom signet block time, and it synced fine.
- **The swap maker wasn't in the public graph.** Its invoices carried no
  route hints, so no route could reach it. The fix was a direct channel.
- **A missing `=` broke every payment lookup.** LND's REST gateway wants the
  payment hash as base64 with its padding. Ours was stripped, so every status
  check failed. Because *uncertain is not failed*, nothing was paid
  twice or marked lost: the payout waited in `unknown`, and once we fixed the
  encoding it reconciled to `settled` by itself.

That last one is the whole argument for the design in a single bug.

We also had the code reviewed with safety as the only question: can anything
pay twice, pay the wrong amount, lose track of a payment, leak a credential,
or bypass policy? That review found five real problems, from a reset that
could replay a paid event to recipient aliases that split a limit. Each now
has a regression test.

## Where Paycue is

Paycue is at version 0.2, MIT-licensed, and maintained by BitPolito:
`@paycue/core`, `sqlite`, `lnd`, `lnurl`, `kaleidoswap`, `github` and
`server`. It has been exercised on signet with real Lightning payments and
real swaps, not on mainnet.

Next on the list: batching small payouts until a route's minimum is reached,
RGB and Spark routes, ZBD and Breez providers, and an approval rule for
payouts a human should sign off.

The code is at **[github.com/BitPolito/paycue](https://github.com/BitPolito/paycue)**,
and the bounty playground at
**[github.com/moakilodash/paycue-bounty-demo](https://github.com/moakilodash/paycue-bounty-demo)**:
open a pull request that closes a bounty issue and see it pay.

---

*[YOU: one or two lines about yourself and how to reach you.]*
*BitPolito is the Bitcoin student team of Politecnico di Torino, founded in
2018 to bridge academia and the Bitcoin industry.*
