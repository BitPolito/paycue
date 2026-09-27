# Paycue signet demos: runbook

Two demos, one payment connection. Signet (Mutinynet) and Liquid testnet only:
no real money. Machine requirements and moving the stack between machines:
[demo/infra/README.md](../demo/infra/README.md).

```
 game demo (8090) ──┐                       ┌─ Lightning ─ player wallet (8091)
                    ├─► payout service ─────┤
 contribution       │   (8089, @paycue/    └─ KaleidoSwap pay-through ─ Liquid L-USDT
 reward demo (8092)─┘    server + console)
```

| What | Address | Notes |
|---|---|---|
| Operator console | http://localhost:8089/ | token: `admin` in `~/paycue-demo/payout-service/tokens.json`. Keep it off the big screen. |
| Game demo: Orbital Sats | http://localhost:8090 | Lightning only, every coin paid instantly |
| Contribution reward demo | http://localhost:8092 | GitHub bounties, paid as L-USDT (Liquid) or sats (Lightning) |
| Player wallet | http://localhost:8091/?user=ada | the demo player's Lightning Address and Liquid wallet |

Both demos submit payouts to **one** payout service with their own client
tokens. That service is the only process deciding payouts from the studio
node, so the shared budget and every limit see both demos.

```sh
systemctl --user status paycue-lnd@studio paycue-lnd@player paycue-payouts paycue-wallet paycue-game paycue-contributions
journalctl --user -u paycue-payouts -f      # one line per payout event
```

## Before the show

1. Console → **Archive history and restart** (refused while a payout is
   unfinished; the old database is kept).
2. Screens: game or bounty board on the big screen, the player wallet beside
   it, the console on your laptop.
3. Console → *Routes and their limits* should list Lightning and Liquid routes
   with the maker's current limits. If Liquid shows "unavailable", the
   KaleidoSwap signet maker is down.

## Game demo

1. **Every coin pays.** Pilot `ada`, **Use the demo Lightning wallet**, Normal.
   Each golden ₿ coin becomes a payout; the feed shows it settle and the wallet
   ticks up within a second or two. *Say: the server decides what a hit is
   worth and who gets paid; the client only reports hits.*
2. **Difficulty.** Easy 10, Normal 21, Hard 42 sat per coin; set on the
   server.
3. **Rules on screen.** The panel under the feed lists the rules that apply to
   the game, each tagged with who sets it: *operator* (you), *network*,
   *receiver*.
4. **Money glitch.** Tick it in the menu: coins rain and every hit is sent
   three times. Replays show as "Replayed hit ignored"; after 60 payouts a
   minute the rest fail with "Recipient limit reached: 60 of 60 payouts in
   1 min". Pause from the console: new payouts wait, and drain on resume.
5. **Recovery.** Console → **Drop next node response**, then hit one coin: the
   payment is sent, its answer lost, the payout shows `unknown`, then settles
   exactly once. Open it in the console to show the evidence.

## Contribution reward demo

A bounty is a GitHub issue labelled `bounty: 60000` (sats). Merging a pull
request that says `Closes #12` pays its author once, however many PRs mention
the issue.

1. On the bounty board, register a GitHub username with **Use the demo Liquid
   wallet** (or a Lightning Address).
2. Trigger a merge, either:
   - **Real GitHub:** configure the repository's webhook (see
     [QUESTIONS.md](QUESTIONS.md) #8) and merge a real pull request; or
   - **Rehearsal:** `GITHUB_WEBHOOK_SECRET=… node demo/contributions/test/simulate.mjs --issue 12 --sats 60000 --login ada --address <tlq1…>`
     sends the same signed webhooks GitHub would.
3. The board moves the bounty to *paying* with the quote
   (`quoted 50.18 L-USDT · fee 0.50%`), then *paid* with the Liquid tx. The
   wallet's L-USDT balance updates after its next scan (15 s).

*Say: the studio only holds bitcoin on Lightning; the contributor chose a
stablecoin on another network, and a resolver module made that possible
without the core knowing anything about Liquid.*

If a contributor has no address yet, the bounty shows *waiting for address*
and is paid the moment they register.

## If something goes wrong on stage

| Symptom | Likely cause | Fix |
|---|---|---|
| Game payouts fail `NO_ROUTE` / `INSUFFICIENT_BALANCE` | player channel drained | console node panel; re-run `demo/infra/liquidity.sh` |
| Bounty fails "Maker refused the swap" | amount outside the maker's range (shown in the console) or maker down | pick a bounty inside the range |
| Everything `unknown` | studio node down | `systemctl --user restart paycue-lnd@studio`; payouts reconcile themselves |
| Demo says "payout service unreachable" | payout service down | `systemctl --user restart paycue-payouts` |
| "Budget exhausted" | 600,000 sat demo budget used | archive and restart, or raise `DEMO_BUDGET_SAT` |

## Configuration

`paycue-payouts`: `PAYCUE_MODE` (`real`/`fake`), `DEMO_BUDGET_SAT` (600000),
`GAME_PER_MINUTE` (60), `KALEIDOSWAP_MAKER_URL`.
`paycue-contributions`: `~/paycue-demo/contributions/env` with
`GITHUB_WEBHOOK_SECRET`, optional `GITHUB_REPO` (owner/name, enables sync)
and `GITHUB_TOKEN`.
