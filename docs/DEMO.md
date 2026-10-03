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

1. **Every coin pays.** Pilot `ada`, **Use the demo Lightning wallet**,
   **Launch**. Each golden ₿ coin pays 21 sat; the feed shows it settle and
   the wallet ticks up within a second or two. *Say: the server decides what a
   hit is worth and who gets paid; the client only reports hits.*
2. **Who decides.** The panel under the feed groups the rules by who sets
   them: *operator* (you, in the policy), *network* (Lightning) and *receiver*
   (the player's wallet). When a payout stops, its feed row says who stopped
   it and why, and the deciding rule lights up with a running count.
3. **Money glitch.** Tick it in the menu: coins rain and every hit is sent
   three times. Replays collapse into one "replays ignored" counter; the
   recipient meter fills, and after 60 payouts a minute the rest are denied by
   the operator's recipient limit. Pause from the console: new payouts show
   *held*, and drain on resume.
4. **Try to break it.** During a round, the strip under the arcade sends
   what a cheater would: **Forge a hit** (refused by the game server: the
   hit is off the coin's path), **Replay a paid coin** (Paycue: paid once,
   replay ignored) and **Ask for 500 sat** (denied by the operator's 100 sat
   cap). Each lands in the feed with who refused it. `ALLOW_GLITCH=0` hides
   these and the money glitch.
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

**Try to break it** (beside the form): **Send a forged webhook** is a merge
paying `@mallory` signed with the wrong secret, refused with HTTP 401 and
logged in red; **Replay a paid bounty** sends the paid bounty's payout again,
which Paycue ignores; **Pay a 200,000 sat bounty** is denied by the 150,000
sat cap. `ALLOW_DEMO_ACTIONS=0` hides the card. The **Who decides a payout**
card lists every limit with who set it, live from the payout service.

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
