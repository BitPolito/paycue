# Paycue on stage: cheat sheet

bitcoin++ Berlin, 3 Oct 2026 · 25 min talk + 5 min Q&A · slides in `SLIDES.md`,
answers in `QA.md`. Signet and Liquid testnet only: no real money.

## URLs

| What | 1 · Chromebook Tailscale | 2 · penguin relay (same live demo) |
|---|---|---|
| Landing page | http://100.91.180.29:8088 | http://penguin.linux.test:8088 |
| Game: Orbital Sats | http://100.91.180.29:8090 | http://penguin.linux.test:8090 |
| Bounty board | http://100.91.180.29:8092 | http://penguin.linux.test:8092 |
| Player wallet | http://100.91.180.29:8091/?user=ada | http://penguin.linux.test:8091/?user=ada |
| Operator console (laptop only, never on the big screen) | http://100.91.180.29:8089 | http://penguin.linux.test:8089 |

Bounty repo: github.com/moakilodash/paycue-bounty-demo · Paycue repo:
github.com/BitPolito/paycue (private until you flip it).

Penguin relay: start the relay script in a penguin terminal first. If
`penguin.linux.test` doesn't load, use `http://localhost:808x` (same ports).

## Numbers to quote

- **Game:** 21 sat per coin on Normal (Easy 10, Hard 42). Rules: 100 sat per
  payout, 60 payouts per player per minute.
- **Bounties:** 150,000 sat per payout, 5 per person per hour; demo bounty
  label `bounty: 60000`.
- **Shared:** 600,000 sat budget, pause switch.
- **Defaults (`defaultPolicy()`):** pause, 10,000 sat per payout, 20 payouts
  or 50,000 sat per recipient per hour, 1,000,000 sat budget.
- **KaleidoSwap signet maker:** minimum 50,000 sat per swap; the maximum
  follows the maker's liquidity, so **read the live max on the console**
  before you start (about 137,000 sat for L-USDT this morning). Fee 0.5%;
  fee cap 3% is yours (operator).
- **Fees:** the budget counts payout amounts only; Lightning routing fees on
  top (capped at 1%, minimum 10 sat); swap fees come out of what the
  recipient receives.
- **Paycue:** v0.2, MIT, BitPolito; `@paycue/core`, `sqlite`, `lnd`,
  `lnurl`, `kaleidoswap`, `github`, `server`.
- **BitPolito:** since 2018, ~60 active members, 200+ alumni, 25 working in
  Bitcoin.

## Exactly once: the three rules

1. **Save before you pay.** The attempt is on disk before the node hears of it.
2. **Only re-send the same invoice.** Never a new one for an uncertain payment.
3. **Uncertain is not failed.** Ask the node's record before deciding.

Plus the obligation key: a repeated delivery or a repeated business event
never makes a second payout.

## Who sets each limit

**operator** (you: budget, caps, pause, fee cap) · **provider** (maker's
range and fee) · **network** (channel liquidity, Liquid's one-minute
blocks) · **receiver** (the invoice's amount and expiry).

## Demo order (slide 15, 12:45–19:30)

**Stage rules: glitch as pilot `glitch` · F5 between rounds · point at the RECOVERED chip.** Console on the laptop only.

| Clock | Talk time | Step |
|---|---|---|
| 0:00 | 12:45 | Switch to the browser: F5 on the game tab (teaser round), wallet `?user=ada` beside it |
| 0:15 | 13:00 | Game, Normal, pilot `ada`: three coins → **SETTLED**; F5 |
| 1:45 | 14:30 | Money glitch, pilot **`glitch`** (never ada: the cap is per recipient): "Replayed hit ignored", "Recipient limit reached: 60 of 60"; F5 |
| 3:15 | 16:00 | Recovery: console → Drop next node response; pilot `ada`, glitch off, **one** coin; point at the **RECOVERED** chip: "Answer lost · confirmed with the node · paid once"; F5 |
| 4:30 | 17:15 | Bounty: merge **your own** pre-opened PR (not #3): Merge pull request → Confirm merge; *paying* (read the L-USDT quote) → **PAID** |
| 6:30 | 19:15 | "Three failures, zero double payments, and every decision has a reason on record." → slide 16 |

Demo actions take about 101 s; the rest is narration.

## Running long?

Cut **slide 11** first. On slide 10 say instead: *"Every limit is labelled
with who set it: you, the provider, the network or the receiver."* Saves
about 70 s. Checkpoints: slide 7 ends 5:15, slide 13 ends 12:15, demo (15)
ends 19:30, talk ends 25:00.

## If the demo breaks (say this, about 30 s)

> "This is a live signet network and it just did what networks do. That's
> actually the point of this library: nothing here gets paid twice or lost,
> it waits until it knows. Let me try the other connection, and if it's
> still unhappy, I'll show you a recording of this demo from earlier today."

Then walk down the fallback ladder:

1. **Live via the Chromebook's Tailscale:** http://100.91.180.29:808x
2. **Live via the penguin relay:** start the relay script in a penguin
   terminal, then http://penguin.linux.test:808x (or http://localhost:808x).
   Same live demo, same payouts.
3. **Recorded backup videos:** the live recordings `docs/talk/video/*-live.webm`
   (never the `*-fake.webm` drafts).
4. **Skip it:** "I'll show you this one after the talk", and move to slide 16.
