# Paycue on stage: cheat sheet

bitcoin++ Berlin, 3 Oct 2026 · 25 min talk + 5 min Q&A · slides in `SLIDES.md`,
answers in `QA.md`. Signet and Liquid testnet only: no real money.

## URLs

| What | Live (office VM) | Fallback (penguin) |
|---|---|---|
| Landing page | http://100.91.180.29:8088 | http://penguin.linux.test:8088 |
| Game: Orbital Sats | http://100.91.180.29:8090 | http://penguin.linux.test:8090 |
| Bounty board | http://100.91.180.29:8092 | http://penguin.linux.test:8092 |
| Player wallet | http://100.91.180.29:8091/?user=ada | http://penguin.linux.test:8091/?user=ada |
| Operator console (laptop only, never on the big screen) | http://100.91.180.29:8089 | http://penguin.linux.test:8089 |

Bounty repo: github.com/moakilodash/paycue-bounty-demo · Paycue repo:
github.com/BitPolito/paycue (private until you flip it).

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

## Running long?

Cut **slide 11** first. On slide 10 say instead: *"Every limit is labelled
with who set it: you, the provider, the network or the receiver."* Saves
about 70 s. Checkpoints: slide 7 ends 5:15, slide 13 ends 12:15, demo (15)
ends 19:30, talk ends 25:00.

## If the demo breaks (say this, about 30 s)

> "This is a live signet network and it just did what networks do. That's
> actually the point of this library: nothing here gets paid twice or lost,
> it waits until it knows. Let me show you the recording of the same run,
> and the payout's evidence will be there when the network catches up."

Then: play the recorded video. If the office is unreachable, switch to the
penguin URLs above. If penguin is running in fake mode, say so: "same
software, no money moves". (Whether penguin runs fake mode or the moved
real nodes is to be confirmed by the lead before the talk.)
