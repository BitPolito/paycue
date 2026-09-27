# Orbital Sats demo runbook

Everything runs as systemd user services; see [demo/infra/README.md](../demo/infra/README.md)
for machine requirements and moving the demo between machines. Signet (Mutinynet) and
Liquid testnet only: no real money.

## What is running

| Service | Unit | Address |
|---|---|---|
| Studio Lightning node (the payer) | `payhook-lnd@studio` | REST `https://127.0.0.1:8080`, P2P `:9735` |
| Player Lightning node (the player's wallet) | `payhook-lnd@player` | REST `https://127.0.0.1:8081`, P2P `:9736` |
| Player wallet app | `payhook-wallet` | http://localhost:8091/?user=ada |
| Game server | `payhook-game` | http://localhost:8090 |
| Operator console | (game server) | http://localhost:8090/admin?token=… (token in `~/payhook-demo/game/admin-token`) |

```sh
systemctl --user status payhook-lnd@studio payhook-lnd@player payhook-wallet payhook-game
journalctl --user -u payhook-game -f        # payout log, one line per event
```

Node data, seeds and macaroons live in `~/payhook-demo/` with owner-only
permissions. LND is built from lnd PR #10864 so neutrino can follow
Mutinynet's 30-second blocks.

## Before the demo

1. **Funds and channels.** `demo/infra/liquidity.sh` opens a channel to the
   KaleidoSwap signet maker (Level 2) and one to the player node (Level 1).
   It tells you what's missing. `demo/infra/live-tests.sh` waits for funds,
   runs it, then plays every scene with a bot and writes
   `docs/LIVE-TEST-RESULTS.md`.
2. **Reset** in the operator console. The old database is archived, never
   deleted, and reset refuses while payouts are unfinished.
3. Open three windows: the game (big screen), the player wallet
   (`?user=<pilot name>`), and the operator console (your laptop only).
4. For an offline rehearsal run a second game with
   `PAYHOOK_MODE=fake GAME_PORT=8092 node dist/server.js` in
   `demo/game`. Fake mode moves no money.

## Scenes

### 1. Every coin pays (Level 1)

Pilot name `ada`, click **Demo Lightning wallet** (`ada@localhost:8091`),
Normal. Shoot golden ₿ coins. Each hit becomes a payout in the feed:
`proposed → authorized → resolving → attempting → settled`, and the wallet
window ticks up by 21 sat within a second or two.

Say: the game server decides what a hit is worth and who gets paid. The client
only reports hits, and the server checks each one against its own schedule.

### 2. Difficulty changes the reward

Easy pays 10 sat a coin, Normal 21, Hard 42, with faster coins and more rocks.
The reward is set on the server, never by the client.

### 3. Money glitch

Tick **Money glitch** in the menu. Coins rain and every hit is sent three
times. Watch the feed:

- `Replayed hit ignored` lines: Payhook's duplicate protection, keyed by
  obligation, not the game, stops the replays.
- After 60 payouts in a minute: `failed · Recipient limit reached: 60 of 60
  payouts in 1 min`. The policy denies with a reason, recorded as evidence.
- Pause from the operator console: new payouts wait as `proposed` with
  "Paused by the operator", then drain when you resume.

### 4. Recovery

Operator console → **Drop next response**, then hit one coin. The studio node
pays but the answer is lost; the payout shows `unknown`, Payhook asks the node,
and it becomes `settled` once. Open the payout in the console to show the
evidence: `provider unknown: connection dropped` then `settled via lookup`.

**Take offline** is the harsher version: payouts go `unknown` and wait; after
**Restore** they settle, each exactly once.

### 5. Stablecoin payout (Level 2)

New pilot, click **Demo Liquid wallet (L-USDT)**. The pot meter shows the
round prize: 50,000 sat for 3 coins. At the end of the round Payhook asks
KaleidoSwap for a pay-through swap, pays the maker's hold invoice over
Lightning, the maker sends L-USDT to the player's Liquid address, and only then
settles. The feed shows the quote (`Swap quoted: 41.7 L-USDT · fee 0.50%`) and
then `Delivered on Liquid · tx …`. The wallet window shows the L-USDT balance
after its next scan (10 s, plus Liquid's 1-minute blocks for confirmation).

Say: the studio only holds bitcoin on Lightning. The player picked a
stablecoin on another network, and a resolver module made that possible
without the core knowing anything about Liquid.

## If something goes wrong on stage

| Symptom | Likely cause | Fix |
|---|---|---|
| Level 1 payouts fail with `NO_ROUTE` / `INSUFFICIENT_BALANCE` | Player channel missing or drained | `studio listchannels`; re-run `demo/infra/liquidity.sh` |
| Level 2 fails with `Maker refused the swap` | Maker limits (50,000–211,864 sat) or maker down | Check `curl https://maker.signet.kaleidoswap.com/v2/swap/reverse` |
| Everything `unknown` | Studio node down | `systemctl --user restart payhook-lnd@studio`; payouts reconcile on their own |
| Feed empty | Browser lost the stream | Reload; the feed replays the latest 80 payouts |
| `Budget exhausted` | 400,000 sat demo budget used up | Reset in the operator console, or raise `DEMO_BUDGET_SAT` |

## Configuration

Environment variables on `payhook-game`: `PAYHOOK_MODE` (`real`/`fake`),
`GAME_PORT`, `WALLET_DOMAIN`, `DEMO_BUDGET_SAT` (400000), `DEMO_PER_MINUTE`
(60), `ALLOW_GLITCH` (on unless `0`), `KALEIDOSWAP_MAKER_URL`.
