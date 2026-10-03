# Paycue on stage: cheat sheet

bitcoin++ Berlin, 3 Oct 2026 · talk ends 24:45, Q&A to 30:00 · signet and
Liquid testnet only. Console on the Chromebook's own screen (extended), never
the big screen.

## Access (the path the owner confirmed at T−30)

Tailnet `http://100.91.180.29:808x` (needs the Chromebook's Tailscale) or the
owner's remote session on konputer. Landing **8088** · console **8089**
(Chromebook screen only) · game **8090** · wallet **8091**/?user=ada · board
**8092**. Repos: github.com/BitPolito/paycue
(private until you flip it) · github.com/moakilodash/paycue-bounty-demo.

## Numbers to quote

- **Game:** 21 sat per coin on Normal (Easy 10, Hard 42); 100 sat per payout,
  60 payouts per player per minute. **Bounties:** 150,000 sat per payout,
  5 per person per hour; label `bounty: 60000`. **Shared:** 600,000 sat
  budget, pause switch.
- **Defaults:** pause, 10,000 sat per payout, 20 payouts or 50,000 sat per
  recipient per hour, 1,000,000 sat budget. **Fees:** see QA 7.
- **Maker:** minimum 50,000 sat; the maximum follows its liquidity, **read it
  live** (console *Routes and their limits* or the board's form card; L-USDT
  50,000–136,694 at hour 3, so "about 137,000"). Fee 0.5%; the 3% cap is ours.
- **Paycue** v0.2, MIT, BitPolito: `@paycue/core`, `sqlite`, `lnd`, `lnurl`,
  `kaleidoswap`, `github`, `server`. **BitPolito:** since 2018, ~60 members,
  200+ alumni, 25 working in Bitcoin.
- **Three rules:** save before you pay · only re-send the same invoice ·
  uncertain is not failed. Plus the obligation key. **Limits set by:**
  operator · provider · network · receiver.

## Clock (slide · ends)

| 1 · 0:20 | 2 · 0:50 | 3 · 1:40 | 4 · 2:15 | 5 · 3:15 | 6 · 4:45 | 7 · **5:15** |
|---|---|---|---|---|---|---|
| 8 · 6:15 | 9 · 7:15 | 10 · 8:15 | 11 · 9:15 | 12 · 10:15 | 13 · **11:15** | 14 · 11:45 |
| **15 · 19:15** (demo 7:30) | 16 · 21:30 | 17 · 23:00 | 18 · 24:15 | 19 · **24:45** | Q&A · 30:00 | |

**Running long:** cut slide 11 (−1:00; on slide 10 say *"Every limit is
labelled with who set it: you, the provider, the network or the receiver"*),
then slide 16's middle story (−0:45).

## Demo (slide 15, 11:45–19:15)

**Glitch as pilot `glitch` · F5 between rounds · point at the RECOVERED chip.**

| Clock | Talk | Step |
|---|---|---|
| 0:00 | 11:45 | F5 on the game tab (teaser round); wallet `?user=ada` beside it |
| 0:15 | 12:00 | Pilot `ada` → **Use the demo Lightning wallet** → **Normal** → **LAUNCH →**; three coins → **SETTLED**; F5 |
| 1:45 | 13:30 | Pilot **`glitch`**, tick **Money glitch**: "Replayed hit ignored", "Recipient limit reached: 60 of 60"; F5 |
| 3:15 | 15:00 | Console → **Drop next node response**; pilot `ada`, glitch off, **one** coin → **RECOVERED** "Answer lost · confirmed with the node · paid once"; F5 |
| 4:30 | 16:15 | Your own PR (not #3) → **Merge pull request** → **Confirm merge**; `pull_request.merged` row → *paying* (read the L-USDT quote) → **PAID** |
| 7:15 | 19:00 | "Three failures, zero double payments, and every decision has a reason on record." → slide 16 |

**Merge not on the board:** (1) wait ~20 s, talking; (2) **Redeliver** on the
Chromebook screen: repo Settings → Webhooks → `cli` hook → Recent Deliveries →
`pull_request` "closed" → **Redeliver**; say *"Same delivery ID, so it can
only pay once: that's the dedup in action"* (only deliveries since 01:18
today can be redelivered); (3) `bounty-live.webm` if it exists (never
`bounty-fake.webm`), else *"it pays the moment the webhook lands, exactly
once; I'll show it after the talk"*, and close. **Sync from GitHub never
pays**: it only proves the merge (bounty #1 turns *closed*).

## If the demo breaks (say once, about 30 s)

> "This is a live signet network and it just did what networks do. That's
> actually the point of this library: nothing here gets paid twice or lost,
> it waits until it knows. Let me try the other connection, and if it's
> still unhappy, I'll show you a recording of this demo from earlier today."

Ladder: (1) live via the confirmed path (the other one once, if it also
passed at T−30) → (2) `*-live.webm` from the Offline pack (never
`*-fake.webm`) → (3) skip: "I'll show you this one after the talk", slide 16.
