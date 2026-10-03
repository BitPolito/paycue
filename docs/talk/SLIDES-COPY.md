# Paycue deck: on-screen copy

Paste-ready text for BitPolito's Figma layout. On-screen text only; notes,
visuals and timings are in `SLIDES.md` (deck ends 24:45, live demo 11:45–19:15).
Keep this file in step with it. Lines marked *presenter only* are not for
Figma.

---

## 1

Paycue
Durable, policy-controlled bitcoin payouts, triggered by events
[YOU: your name] · BitPolito · bitcoin++ Berlin 2026

## 2

(no text: the game, full screen)

## 3

BitPolito
Politecnico di Torino's Bitcoin student team, since 2018
Bridging academia and the Bitcoin industry
~60 active members · 200+ alumni · 25 now working in Bitcoin
Open source · research · education

## 4

[YOU: name, role at BitPolito]
[YOU: one line on what you work on]
[YOU: handle / moaki.net]

## 5

If this happens, pay that.
Game rewards · open-source bounties · creator payouts · affiliate fees · payroll

## 6

Four ways a payout goes wrong
1. The webhook arrives twice
2. The process dies mid-payment
3. The node's answer never arrives
4. Two payouts race past the same limit

## 7

Pay twice · pay never · pay too much · can't explain it

---

Pipeline strip on slides 8–13:
event → hook → policy → route → provider → evidence

## 8

Triggers: what cues a payment
- Any event can cue a payment
- Verified before anything else: signatures checked, your server decides, never the client
- Exactly once: a repeated delivery and a repeated business event are both caught
- Hooks are plain code: event in → who, how much, why, plus an obligation key

## 9

Today
GitHub: a merged PR closes a bounty
Game server events (the coin you saw)

Easy next
Signed webhooks: Stripe, Shopify, forms
CI tests pass → pay
Scheduled payouts

Community modules
Unity · Unreal · Godot SDKs
Nostr events and zaps
IoT devices

A game SDK reports to your game server. It never pays from the client.

## 10

Policies: decide before any money moves
- Ordered rules: each allows, denies with a reason, or holds
- Safe defaults out of the box
- Unfinished payments count against limits
- Fails closed: a rule that crashes denies

```ts
policy: [
  pause,
  budget(600_000n * 1000n),
  forClient("game", maxPerPayout(100n * 1000n)),
  forClient("game", recipientLimit({ windowMs: 60_000, maxCount: 60 })),
]
```

## 11

Who sets each limit

operator (you)
pause · 600,000 sat budget · game 100 sat per payout, 60 per player per minute · bounties 150,000 sat per payout, 5 per person per hour · swap fee cap 3%

provider
KaleidoSwap signet maker: minimum 50,000 sat; maximum follows the maker's liquidity (about 137,000 sat for L-USDT today) · 0.5% fee

network
Lightning: channel liquidity · Liquid: one-minute blocks

receiver
the invoice fixes the amount and expiry · LNURL min and max

Denied → fails with its reason, no money moves · Held (pause) → waits
Defaults: pause, 10,000 sat per payout, 20 payouts or 50,000 sat per recipient per hour, 1,000,000 sat budget

## 12

Payments: one rail, any destination
- The core pays only Lightning invoices
- Routes turn a recipient into an invoice: Lightning Address, Liquid L-USDT, …
- The core checks every invoice: amount and expiry, whoever made it
- Uncertain is not failed: save before paying, re-send only the same invoice, ask the node

received → proposed → authorized → resolving → attempting → settled
failed · unknown · stuck

## 13

Provider · What it is · Status
ZBD SDK · compliant, custodial · module to build
Breez SDK · non-custodial, no KYC · module to build
Your own LND · @paycue/lnd · available
Community routes · KaleidoSwap → L-USDT on Liquid · available

Your own LND in three steps: run LND · bake a payment-only macaroon (offchain:read offchain:write info:read) · point LndRestTransport at it

---

## 14

@paycue/server: one executor per node, many clients
game demo → payout service → studio node
bounties → payout service

## 15

Live demo

*Presenter only, do not paste:* if the merge doesn't show on the board, wait
~20 s → Redeliver the `pull_request` "closed" delivery from the `cli` hook
on GitHub (same delivery ID, so it pays once) → `bounty-live.webm` if it
exists → else "it pays the moment the webhook lands", and close. Sync from
GitHub never pays; it only proves the merge.

## 16

LND can't follow Mutinynet's 30 s blocks → built it from PR #10864
The maker isn't in the public graph → a direct channel
A lost base64 = made every lookup fail → uncertain, not failed, so nothing broke

## 17

v0.2 · MIT · BitPolito
@paycue/core · sqlite · lnd · lnurl · kaleidoswap · github · server
Next: batching under route minimums · RGB and Spark routes · ZBD and Breez providers · an approval rule

## 18

github.com/BitPolito/paycue
Bounty playground: github.com/moakilodash/paycue-bounty-demo
[QR code to the repo]

## 19

[YOU: name, handle]
github.com/BitPolito/paycue
(BitPolito logo)

---

## Backup

B1 · Custody
Paycue never holds funds: it tells your node or provider to pay. Custody and compliance come from the provider you choose.

B2 · Recovery, step by step
save attempt → send → response lost → unknown → lookup → settled
or: not found → re-send the same invoice

B3 · The API
submit(event, proposal) · startWorker() · on(listener)
DestinationResolver · PaymentProvider · PolicyRule
