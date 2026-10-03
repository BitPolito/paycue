# Paycue signet demos: runbook

Two demos, one payment connection. Signet (Mutinynet) and Liquid testnet only:
no real money. Machine requirements and moving the stack between machines:
[demo/infra/README.md](../demo/infra/README.md). The stage run sheet with
timings and the pre-show checklist: [talk/REHEARSAL.md](talk/REHEARSAL.md).

```
 game demo (8090) ──┐                       ┌─ Lightning ─ player wallet (8091)
                    ├─► payout service ─────┤
 contribution       │   (8089, @paycue/    └─ KaleidoSwap pay-through ─ Liquid L-USDT
 reward demo (8092)─┘    server + console)
 landing page (8088) reads totals and route limits from the payout service
```

The demo runs on the office VM `paycue-signet` (192.168.1.219). Open it on
the VM's address from the office LAN, or from the Chromebook (or anything
else on the tailnet) through konputer's relay at **http://100.91.180.29:808x**
(`paycue-tailnet-relay`, see the infra README; the Chromebook's Tailscale must
be online), or from the owner's remote session on konputer. There is no
penguin relay. If neither path works, play the `docs/talk/video/*-live.webm`
backups (see the Offline pack in `docs/talk/REHEARSAL.md`).

| What | Port | Tailnet address | Notes |
|---|---|---|---|
| Landing page | 8088 | http://100.91.180.29:8088 | what Paycue is, links to both demos, live totals and route limits |
| Operator console | 8089 | http://100.91.180.29:8089 | token: `admin` in `~/paycue-demo/payout-service/tokens.json`. Presenter's (Chromebook) screen only, never on the big screen. |
| Game demo: Orbital Sats | 8090 | http://100.91.180.29:8090 | Lightning only, every coin paid instantly |
| Player wallet | 8091 | http://100.91.180.29:8091/?user=ada | the demo player's Lightning Address (`ada@localhost:8091`) and Liquid wallet |
| Contribution reward demo | 8092 | http://100.91.180.29:8092 | GitHub bounties, paid as L-USDT (Liquid) or sats (Lightning) |

The pages link to each other by port on whatever host they were opened on,
so the cross-links work on the tailnet, the LAN and penguin alike.

Both demos submit payouts to **one** payout service with their own client
tokens. That service is the only process deciding payouts from the studio
node, so the shared budget and every limit see both demos.

On the VM (lead only):

```sh
systemctl --user status paycue-lnd@studio paycue-lnd@player paycue-payouts paycue-wallet paycue-game paycue-contributions paycue-landing
journalctl --user -u paycue-payouts -f      # one line per payout event
```

## The console

*Controls* has **Pause payouts** and **Resume**, and the demo's actions:

| Button | What it does |
|---|---|
| **Drop next node response** | Recovery scene: the next payment is really sent, its answer is lost |
| **Take studio node offline** | Every call to the node fails; payouts wait as `unknown` |
| **Restore studio node** | Back to normal; waiting payouts are processed |
| **Archive history and restart** | Refused while payouts are unfinished; the old database is kept and systemd restarts the service with an empty one |

*Node and service* shows the mode, the outage switch and the studio node's
channel balance (one sum, not per channel). *Routes and their limits* lists
each route with its limits and who sets them. Click a row under *Payouts*
for its evidence.

## Before the show

The full checklist is in [talk/REHEARSAL.md](talk/REHEARSAL.md). In short:

1. Console → **Archive history and restart** (refused while a payout is
   unfinished; the old database is kept).
2. Screens: game or bounty board on the big screen, the player wallet beside
   it, the console on your laptop.
3. Console → *Routes and their limits* should list Lightning and Liquid routes
   with the maker's current limits. If Liquid shows "unavailable", the
   KaleidoSwap signet maker is down.
4. Bounty board: the PR author is under *Registered contributors*, the PR is
   open with `Closes #N`, and *GitHub webhook deliveries* shows recent
   deliveries.

## Game demo

1. **Every coin pays.** Pilot `ada`, **Use the demo Lightning wallet**, Normal,
   **LAUNCH**. Each golden ₿ coin becomes a payout; the feed shows it settle
   and the wallet ticks up within a second or two. *Say: the server decides
   what a hit is worth and who gets paid; the client only reports hits.*
   A round lasts 60 s; reload the page to get back to the menu sooner.
2. **Difficulty.** Easy 10, Normal 21, Hard 42 sat per coin; set on the
   server.
3. **Rules on screen.** The panel under the feed lists the rules that apply to
   the game, each tagged with who sets it: *operator* (you), *network*,
   *receiver*.
4. **Money glitch.** Use another pilot (e.g. `glitch`) so ada's per-minute
   limit stays free, tick **Money glitch** in the menu: coins rain and every
   hit is sent three times. Replays show as "Replayed hit ignored"; after 60
   payouts a minute the rest fail with "Recipient limit reached: 60 of 60
   payouts in 1 min" (about 10 s of play). Pause from the console: new
   payouts wait, and drain on resume.
5. **Recovery.** Console → **Drop next node response**, then hit one coin as
   `ada`: the payment is sent, its answer lost, the payout is recorded
   `unknown` and settles exactly once after a lookup. The feed row's note
   says "Connection to the studio node dropped before it answered"; the
   `unknown` step may be too quick to see there, so open the payout in the
   console to show the evidence (`unknown` → `settled` via lookup).

## Contribution reward demo

A bounty is a GitHub issue labelled `bounty: 60000` (sats). Merging a pull
request that says `Closes #12` pays its author once, however many PRs mention
the issue. The live repository is `moakilodash/paycue-bounty-demo`; its
webhook reaches the VM through `gh webhook forward` on konputer
(`paycue-webhook-forward`).

1. On the bounty board, register a GitHub username with **Use the demo Liquid
   wallet** (or a Lightning Address). The PR's author must be registered,
   or the bounty waits (see below).
2. Trigger a merge, either:
   - **Real GitHub:** merge a pull request whose description has
     `Closes #N` on the bounty repository; or
   - **Rehearsal:** `GITHUB_WEBHOOK_SECRET=… node demo/contributions/test/simulate.mjs --server http://127.0.0.1:18092 --issue 12 --sats 60000 --login ada --address <tlq1…>`
     sends the same signed webhooks GitHub would. Only against a fake-mode
     stack: on the live board it pays real L-USDT.
3. The board moves the bounty to *paying* with the quote
   (`quoted xx.xx L-USDT · fee 0.50%`), then *paid* with the Liquid tx. The
   wallet's L-USDT balance updates after its next scan (15 s). The maker's
   live L-USDT range is on the board's form card and in the console; keep
   stage bounties inside it (at most 130,000 sat).

*Say: the studio only holds bitcoin on Lightning; the contributor chose a
stablecoin on another network, and a resolver module made that possible
without the core knowing anything about Liquid.*

If a contributor has no address yet, the bounty shows *waiting for address*
and is paid the moment they register.

## Local fake-mode stack (no money moves)

For rehearsing and recording without touching the live demo. Agents use
18088–18092 (demo) and 19088–19092 (rehearsal); pick your own range.

```sh
cd demo && npm run build
H=$(mktemp -d); mkdir -p $H/contributions
N="node --disable-warning=ExperimentalWarning dist/server.js"
(cd payout-service && PAYCUE_DEMO_HOME=$H PAYCUE_MODE=fake PAYOUT_PORT=19089 PAYCUE_LOG=0 $N &)
sleep 2   # the payout service writes the client tokens the others read
(cd game && PAYCUE_DEMO_HOME=$H GAME_PORT=19090 PAYOUT_SERVICE_URL=http://127.0.0.1:19089 $N &)
(cd contributions && PAYCUE_DEMO_HOME=$H CONTRIB_PORT=19092 PAYOUT_SERVICE_URL=http://127.0.0.1:19089 GITHUB_WEBHOOK_SECRET=rehearsal-secret $N &)
(cd landing && PAYCUE_DEMO_HOME=$H LANDING_PORT=19088 PAYOUT_SERVICE_URL=http://127.0.0.1:19089 $N &)
```

Notes: there is no player wallet in fake mode (it needs the player node), so
use any `tlq1…` string as a Liquid address; the board then says "sats sent
over Lightning" because fake payouts have no Liquid tx. The pages' cross-links
point at 8088–8092, so open the other pages by URL. **Archive history and
restart** just exits the service (exit 75) outside systemd; start it again.
Stop the servers by PID when done. Scripted players:
`node demo/game/test/bot.mjs --server http://127.0.0.1:19090 [--glitch] [--cheat]`;
backup videos: `docs/talk/video/record.cjs` (see REHEARSAL.md).

## If something goes wrong on stage

| Symptom | Likely cause | Fix |
|---|---|---|
| Page doesn't load on 100.91.180.29 | relay or tailnet down | the owner's remote session on konputer, else the `*-live.webm` backups; lead checks `paycue-tailnet-relay` on konputer and the Chromebook's Tailscale |
| Game payouts fail `NO_ROUTE` / `INSUFFICIENT_BALANCE` | player channel drained | console node panel; re-run `demo/infra/liquidity.sh` (lead) |
| Recovery coin fails "Recipient limit reached" | glitch was played as the same pilot less than a minute ago | wait a minute or use the recording; next time glitch as `glitch` |
| Bounty shows *waiting for address* | PR author not registered | register the login on the board; it pays at once |
| Bounty fails "Maker refused the swap" | amount outside the maker's range (shown on the board and in the console) or maker down | pick a bounty inside the range |
| Nothing happens after a merge | webhook forwarder down | lead: `systemctl --user status paycue-webhook-forward` on konputer |
| Everything `unknown` | studio node down | `systemctl --user restart paycue-lnd@studio` (lead); payouts reconcile themselves |
| Demo says "payout service unreachable" | payout service down | `systemctl --user restart paycue-payouts` (lead) |
| "Budget exhausted" | 600,000 sat demo budget used | archive and restart, or raise `DEMO_BUDGET_SAT` |

## Configuration

`paycue-payouts`: `PAYCUE_MODE` (`real`/`fake`), `PAYOUT_PORT` (8089),
`DEMO_BUDGET_SAT` (600000), `GAME_PER_MINUTE` (60), `KALEIDOSWAP_MAKER_URL`,
`WALLET_DOMAIN`.
`paycue-game`: `GAME_PORT` (8090), `PAYOUT_SERVICE_URL`, `WALLET_DOMAIN`,
`ALLOW_GLITCH` (`0` hides the money glitch).
`paycue-contributions`: `CONTRIB_PORT` (8092) and
`~/paycue-demo/contributions/env` with `GITHUB_WEBHOOK_SECRET`, optional
`GITHUB_REPO` (owner/name, enables sync) and `GITHUB_TOKEN`.
`paycue-landing`: `LANDING_PORT` (8088), `PAYOUT_SERVICE_URL`.
`paycue-wallet`: `WALLET_PORT` (8091), `WALLET_DOMAIN`, `LIQUID_SCAN_MS`.
