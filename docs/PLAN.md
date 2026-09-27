# Payhook showcase plan

Status: implemented; live payments wait on funding (see QUESTIONS.md #1). Decisions that needed the owner are logged in
[QUESTIONS.md](QUESTIONS.md) with the default that was taken.

## Goal

A live demo on signet (Mutinynet) where a space shooter pays players
automatically:

- **Level 1, Lightning to Lightning.** Every golden bitcoin coin a player
  shoots pays a few sats to their Lightning Address within seconds.
- **Level 2, Lightning to L-USDT.** A player who registers a Liquid address
  gets a round prize as L-USDT. The studio only holds BTC on Lightning; the
  KaleidoSwap maker converts.
- **Guardrails on screen.** A "money glitch" menu option floods the screen
  with coins. Policy caps kick in and every denied payout shows its reason.
  Replayed hits never pay twice.
- **Recovery on screen.** Cutting the studio node mid-payment leaves a payout
  in `unknown`; it reconciles to exactly one settlement when the node returns.

## Verified facts this plan rests on

| Fact | Source |
|---|---|
| Signet maker live at `https://maker.signet.kaleidoswap.com/v2`, settles on Mutinynet | swap-sdk README, live `GET /v2/swap/reverse` |
| BTC → L-USDT reverse pair: min 50,000 sat, max 211,864 sat, 0.5% + miner fees | live pairs endpoint |
| Pay-through (`POST /v2/swap/pay`) is enabled on signet: maker returns a hold invoice and pays the destination address itself | live probe returned `invalid_destination` for a bad address, not "disabled" |
| Pay-through destinations: Liquid, Bitcoin, Arkade addresses | maker error text |
| Liquid side is Liquid testnet (fee asset `144c6543…9a49` = testnet L-BTC) | pairs endpoint |
| Stock LND can't follow Mutinynet over neutrino (30 s blocks); lnd PR #10864 adds `bitcoin.signetblocktime` | lnd PR, verified by syncing |
| Spark swaps (Flashnet) don't run on signet | `wallet-engine/src/types/flashnet.ts:75` |

## Architecture decisions

1. **Core settles Lightning only** and keeps `amountMsat`. Everything else is
   a module that turns a destination into a BOLT11 invoice.
2. **Two module contracts in core:**
   - `PaymentProvider` pays a BOLT11 and looks up its status (LND, later Breez,
     ZBD, Spark).
   - `DestinationResolver` turns a recipient string into a payable invoice plus
     durable private state. The runtime tries resolvers in order and uses the
     first that accepts the recipient. This is the "router" and the "converter"
     in one small contract.
3. **Resolver state is persisted before paying.** Attempts gain
   `resolver`, `reference` and a private `resolverState`. Pay-through's
   `swapAuth` credential lives there.
4. **Policy is a list of rules.** Each returns allow, or deny with a code and
   reason; first deny wins. Core ships `defaultPolicy()`:
   max per payout, max per recipient per window, total budget, pause switch.
   Users change numbers, drop rules, or add functions.
5. **Denials are evidence.** A denied payout records rule, code and reason.
6. **Event stream.** The runtime emits one typed event per state change.
   Logging and the demo's live feed both subscribe to it; modules implement
   nothing.
7. **`processPending()` and `startWorker()`.** Execution is asynchronous:
   triggers submit, the worker executes, retries resumable states and
   reconciles `unknown` payouts. A per-process lock prevents double execution.
8. **Evidence names the resolver and provider that actually did the work.**

## Packages (npm workspaces)

| Package | Contents |
|---|---|
| `@payhook/core` | domain, runtime, policy, events, storage interface, memory storage, webhook contract, BOLT11 resolver. Zero dependencies. |
| `@payhook/sqlite` | SQLite storage (Node's built-in `node:sqlite`) |
| `@payhook/lnd` | LND provider plus a REST transport (fetch only) |
| `@payhook/lnurl` | Lightning Address / LNURL-pay resolver |
| `@payhook/kaleidoswap` | pay-through resolver: Liquid/BTC/Arkade destinations via the KaleidoSwap maker |
| `@payhook/github` | GitHub webhook adapter and merged-PR hook |
| `@payhook/webhook` | generic HMAC-signed webhook trigger — **deferred**, the game calls the runtime in-process |
| `demo/game` | game server (authoritative coin spawns and hit validation), browser client, payout feed, admin |
| `demo/player-wallet` | tiny demo wallet: Lightning Address endpoint backed by the player LND node, balance view, Liquid receipts |
| `examples/github-webhook` | the original GitHub webhook demo, ported to the new API |

## Infrastructure (all on konputer, no Docker)

| Service | How |
|---|---|
| `lnd-studio` | LND built from PR #10864, neutrino on Mutinynet, systemd user unit, REST on 127.0.0.1:8080 |
| `lnd-player` | same, REST on 127.0.0.1:8081. Represents the Level 1 player's wallet |
| Liquid player wallet | a Liquid testnet address with its blinding key held by the demo wallet, to show L-USDT receipts |
| game server | Node, systemd user unit, serves game + feed + admin |
| player wallet app | Node, systemd user unit, serves LNURL-pay + wallet page |

Liquidity: studio funded from the Mutinynet faucet, one channel studio →
player (Level 1) and a **direct** channel studio → maker node (Level 2). The
maker node (`03999c08…9fbf`, `maker.signet.kaleidoswap.com:9735`) is not in the
public graph and its invoices have no route hints, so a routed path is not
possible.

## Game design

- Space shooter in a canvas; ship, enemies, golden bitcoin coins.
- **Server-authoritative coins.** The server spawns each coin with an id,
  a seeded trajectory and a lifetime. The client reports a hit; the server
  checks the coin exists, is alive, is unclaimed, and that the hit rate is
  plausible. Only then does it submit a payout. Obligation key:
  `shooter:<session>:coin:<coinId>`.
- Menu: player name, Lightning Address or Liquid address, difficulty
  (easy / normal / hard: enemy speed, coin value), and a demo-only
  **money glitch** toggle.
- Money glitch: coins rain and hits are replayed. Shows three things at once:
  duplicate hits are ignored, the per-recipient cap denies with a reason,
  the budget holds.
- HUD: live payout feed from the event stream (state chips, reasons, amounts).
- Level 2: coins fill a round pot; at round end the pot pays as L-USDT
  (minimum 50,000 sat per swap, so the prize is sized to that).
- Admin page: pause switch, provider kill/restore for the recovery scene,
  budget and reset.

## Build order

1. Core refactor to workspaces, policy, events, worker, resolver contract. Tests.
2. LND REST transport, LNURL resolver, pay-through resolver. Tests with fakes.
3. Infra: nodes synced, funded, channels open. Live Level 1 payment test.
4. Live pay-through test: BTC Lightning → L-USDT on Liquid testnet.
5. Game server + client + feed + admin. Player wallet app.
6. End-to-end tests of each path: L1 pay, L2 swap, duplicate, policy denial,
   budget exhaustion, pause, node outage and reconcile.
7. Demo runbook and reset script.

## Review log

- Codex `gpt-6-astra`, plan review: adopted transactional ingest, explicit
  crash recovery for `resolving`/`attempting`, `not_found` never terminal,
  same-invoice-only resends, budget counting of uncertain payouts, public
  projections for anything leaving the process, stronger anti-cheat, and
  proving live paths early.
- Codex `gpt-6-astra`, money-safety code review, five findings, all fixed
  with regression tests: reset no longer allows replaying a paid hit (sessions
  end on reset); LND RPC errors are uncertain, never failures; window limits
  count from authorization and always count unfinished payouts; non-positive
  amounts are refused before the delivery is recorded; recipient aliases share
  one canonical identity for limits.
