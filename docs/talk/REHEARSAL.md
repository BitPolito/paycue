# Live demo rehearsal: run sheet and pre-show checklist

bitcoin++ Berlin, 3 October 2026. The live demo is slide 15: it starts at
12:45 and must end by 19:30, so you have **6:45**. This file is the
click-by-click version of slide 15's run sheet. URLs are in
[CHEATSHEET.md](CHEATSHEET.md); the fallback ladder is the same as there.

**Screens.** Big screen: one browser window with the game, the bounty board
and the GitHub PR in tabs, and the player wallet (`:8091/?user=ada`) in a
narrow window beside it. Laptop only: the operator console (`:8089`). Never
put the console on the big screen.

**Lead decisions (3 Oct, hour 2).** Glitch as pilot `glitch`, never `ada`.
Reload the game (F5) between rounds. Recovery is shown by the game feed's
**RECOVERED** chip (agent 2, being deployed); the console stays on the
laptop. The stage PR is **the owner's own pre-opened PR**; the owner
registers and merges it himself. PR #3 by @rajveer002 is an outside
contributor's: nobody touches it, the owner decides.

**Fallback ladder (every step).** (1) live via the Chromebook's Tailscale,
`http://100.91.180.29:808x`; (2) live via the penguin relay,
`http://penguin.linux.test:808x` or `http://localhost:808x`; (3) the live
recordings `docs/talk/video/<scene>-live.webm` (never the `*-fake.webm`
drafts on stage); (4) skip with one sentence. Leaving rung 1, say the
30-second line from the cheat sheet once, not at every step.

## Timings measured

Fake-mode stack, 3 Oct, recorded with `docs/talk/video/record.cjs`
(machine pace, no talking; full numbers in `video/fake-timings.json`):

| Scene | Machine time | What dominated it |
|---|---|---|
| Landing scroll | 12.6 s | scripted scrolling |
| Game, Normal, 3 coins | 13.2 s | 3 s countdown, then a coin every 2 s; launch → first payout settled 5.2 s |
| Money glitch | 31.1 s | "Replayed hit ignored" from the first hit; **"Recipient limit reached: 60 of 60" after ~10 s of play (13 s after LAUNCH)** |
| Recovery | 23.6 s | console click → round → one coin; payout settled 0.1 s after the hit |
| Bounty (simulated webhooks) | 18.6 s | merge → *paid* under 0.5 s in fake mode |
| **Whole demo** | **101 s** | |

So the machinery takes under 2 minutes; the other ~5 minutes are you
talking. Real mode adds: Lightning settlement (1–2 s per coin), the
`gh webhook forward` hop (a few seconds) and the KaleidoSwap swap plus a
Liquid transaction (**not yet measured on the live stack: the lead's
rehearsal must time merge → paid**; if it exceeds ~60 s, fill with the
"stablecoin on another network" line and the wallet's 15 s scan).

Speaker notes of slides 8–13 are 87–106 words each, i.e. 35–42 s at 150
words a minute against a 70 s budget, so they are not the risk. Slide 11
is the longest (106 words).

## Minute by minute

Clock is time since you switched to the browser (slide 15 starts at 12:45).

### 0:00–0:15 · Switch to the browser

- **Click:** leave the "Live demo" title card; bring the browser forward on
  the game tab (`:8090`), menu showing. Wallet window beside it on `ada`.
- **Say:** "Two apps, one payout service. First the game."
- **Audience sees:** the Orbital Sats menu; the payout feed and *Rules for
  this game* on the right; the wallet's sats balance.
- **Fallback:** page doesn't load → rung 2 (penguin), then rung 3.

### 0:15–1:45 · Game, Normal: every coin pays

- **Click:** Pilot name `ada` → **Use the demo Lightning wallet** (fills
  `ada@localhost:8091`) → **Normal** → **LAUNCH →**. After the 3-2-1, hold
  Space (or hold the mouse on the canvas) and shoot three golden ₿ coins.
- **Say:** "Every golden coin becomes a payout request. The server decides
  what a hit is worth, 21 sat on Normal, and who gets paid; the browser only
  reports the hit, and the server checks it against its own coin schedule."
  Then point at the rules panel: "These are the rules that can decide this
  payout, each tagged with who set it: operator, network, receiver."
- **Audience sees:** `+21 sat` pops over the coin; a feed row per coin going
  through the states to **SETTLED**; HUD *PAID* climbs 21 → 42 → 63; the
  wallet ticks up within a second or two each time.
- **Don't wait for the round:** a round lasts 60 s and the menu has no "end"
  button. When you're done, **reload the page (F5)**: the menu comes back
  and the old round just expires on the server.
- **Fallback:** feed says *payouts offline* or coins stay *attempting* →
  rung 2; still bad → play `game-live.webm`. Coin pays but wallet doesn't
  move → keep going, the feed is the proof; reload the wallet later.

### 1:45–3:15 · Money glitch: replays and the per-minute cap

- **Click:** (after F5) Pilot name **`glitch`** → **Use the demo Lightning
  wallet** (→ `glitch@localhost:8091`) → Normal → tick **Money glitch** →
  **LAUNCH →**. Hold fire and sweep left and right.
- **Why `glitch`, not `ada`:** the cap is 60 payouts per recipient per
  minute. If you glitch as `ada`, the recovery coin a minute later fails with
  "Recipient limit reached" instead of recovering. A separate pilot keeps
  ada's window free and the wallet beside you clean.
- **Say:** "Now a buggy client: coins rain and every hit is sent three
  times. The game doesn't deduplicate on purpose, Paycue does." When the
  first grey note shows: "Replayed hit ignored: same delivery." After about
  10 s of play: "And here's the operator's policy: 60 payouts per player per
  minute. The rest fail with a reason, before any money moves."
- **Audience sees:** dozens of coins; grey *Replayed hit ignored* notes;
  then red **FAILED** rows "Recipient limit reached: 60 of 60 payouts in
  1 min". HUD *PAID* stops at 60 × 21 = 1,260 sat (minus any `glitch` payouts
  in the last minute).
- **Optional (laptop):** console → **Pause payouts**, say "new payouts now
  wait", → **Resume**, "and they drain". Only if you are ahead of time.
- **Fallback:** you can't hit coins fast enough to reach 60 → say "it caps
  at 60 a minute" and point at the rules panel; or play `glitch-live.webm`
  (in the fake draft the first red row appears at 0:15).

### 3:15–4:30 · Recovery: the node's answer is lost

- **Click (laptop):** console → **Drop next node response** (yellow button
  under *Controls*). The message line reads "Drop next node response: studio
  node: drop-next-response".
- **Click (big screen):** F5 → Pilot `ada` → Use the demo Lightning wallet →
  Normal, **untick Money glitch** → LAUNCH → shoot **exactly one** coin,
  then stop firing (the drop applies to the next payment only).
- **Say:** "I just told the payout service to lose the node's next answer.
  The payment really goes out, but we never hear back. Most payout code
  either retries, and pays twice, or marks it failed, and the player's
  angry. Paycue writes it down as *unknown* and asks the node."
- **Audience sees:** the coin's feed row ends with the **RECOVERED** chip
  (agent 2's fix: answer lost, confirmed with the node, paid once) instead
  of a plain SETTLED; the wallet gets exactly one 21 sat payment.
- **Heads-up:** the `unknown` step itself is too quick to see (instant in
  fake mode, a flash at most on LND), so point at the RECOVERED chip, not at
  "watch it go unknown". The console stays on the laptop: if you want the
  evidence, read it from there ("provider **unknown**: connection dropped,
  then provider **settled** via lookup"). Before the show, check the chip's
  wording on the deployed game matches what slide 15 says.
- **Fallback:** the coin's row fails with "Recipient limit reached" → you
  glitched as `ada`; say "that's the cap from a minute ago, which is the
  policy working" and play `recovery-live.webm`. Row stays `unknown` past
  30 s → say "it waits until it knows; it'll settle on its own" and move on.

### 4:30–6:30 · Bounty: merge a PR, get paid in L-USDT

- **Click:** bounty board tab (`:8092`), scrolled so the *Bounties* card and
  the right column (*GitHub webhook deliveries*, *Activity*) are visible.
  Then the GitHub tab with **the owner's own pre-opened PR** on
  `moakilodash/paycue-bounty-demo` ("Closes #1" in its description; **not
  PR #3**) → **Merge pull request** → **Confirm merge**. Switch back to the
  board. The owner does the merge himself.
- **Say:** "A bounty is a GitHub issue with a `bounty: 60000` label. Merging
  a pull request that closes it pays its author, once, however many PRs
  mention the issue. The contributor registered a Liquid address, so they
  want L-USDT. The studio only holds bitcoin on Lightning: a resolver module
  pays a KaleidoSwap invoice, and the maker sends the stablecoin on Liquid.
  The core knows nothing about Liquid."
- **Audience sees:** a new `pull_request.merged` delivery "#N paying
  @login"; the bounty chip goes **paying · …** with "quoted xx.xx L-USDT ·
  fee 0.50%" (read the number out), then **PAID** "L-USDT sent · tx …";
  the wallet's L-USDT balance updates on its next scan (up to 15 s).
- **Fallback:** chip says **waiting for address** → the PR author isn't
  registered: type the login and click **Use the demo Liquid wallet** →
  **Save payout address**; it pays immediately. "Maker refused the swap" →
  the amount is outside the maker's live range (shown on the board's form
  card): say so, it's a *provider* limit, and play `bounty-live.webm`.
  Nothing on the board after ~15 s → the webhook forwarder is down: play
  `bounty-live.webm`.

### 6:30–6:45 · Back to slides

- **Say:** "Three failures, zero double payments, and every decision has a
  reason on record." Switch to slide 16.

## Pre-show checklist (T−30 min)

Run top to bottom on the Chromebook unless marked *(laptop)* or *(lead)*.

**Access (T−30)**
- [ ] `http://100.91.180.29:8088` loads the landing page; its live dot is
      green (not "Payout service unreachable"). Same for `:8090`, `:8092`,
      `:8091/?user=ada`, and `:8089` *(laptop)*.
- [ ] Penguin relay as backup: start the relay script in a penguin terminal
      and check `http://penguin.linux.test:8090` (or `localhost:8090`) once,
      then leave it running.
- [ ] Backup videos copied to the Chromebook and opened once in the video
      player: `landing-live.webm`, `game-live.webm`, `glitch-live.webm`,
      `recovery-live.webm`, `bounty-live.webm`. If only `*-fake.webm` exist,
      the lead decides whether to use them (and you say "fake mode").

**Console (laptop, T−25)**
- [ ] Connect with the operator token; *running* chip, live dot on.
- [ ] *Node and service*: `mode: real`, `outage: normal` (if it says
      `drop-next-response` or `offline`, click **Restore studio node**).
      `channels` shows sat out and in (one sum only).
- [ ] *(lead, on the VM)* both channels active and the node synced. The
      console can't show this. Checked at hour 2: maker 449,056 sat local,
      player 241,587, synced.
      ```sh
      ssh paycue-signet
      L="$HOME/paycue-demo/bin/lncli --lnddir=$HOME/paycue-demo/lnd-studio --network=signet --rpcserver=127.0.0.1:10009"
      $L getinfo | grep -E 'synced_to_chain|best_header_timestamp'
      $L listchannels | grep -E '"remote_pubkey"|"active"|"local_balance"'
      ```
      Expect two channels with `"active": true`, the maker's
      `local_balance` ≥ 150,000, and `synced_to_chain: true` (same flags as
      `demo/infra/liquidity.sh`). Not synced after an outage →
      `systemctl --user restart paycue-lnd@studio`, wait, check again.
- [ ] *Totals*: `open payouts 0`.
- [ ] *(lead, laptop console)* **Archive history and restart**: in
      *Controls*, click the yellow **Archive history and restart** button.
      The message line says "history archived; restarting"; systemd brings
      the service back in ~2 s with an empty database (old one kept as
      `payouts.<stamp>.sqlite`). Refused with "N payouts are still open"
      while any payout is unfinished: wait and retry. Then hard-refresh the
      game, board and landing tabs: the game feed is empty, landing totals
      read 0, the budget is back to 600,000 sat. Do it **after** the last
      test payout and before the teaser coin.
- [ ] *Routes and their limits*: Lightning routes and Liquid (L-BTC, L-USDT)
      with the maker's live range. Note the L-USDT maximum for slide 11 and
      check the stage bounty is inside it (≤130,000 sat; 60,000 is fine).
      "unavailable" on Liquid → the maker is down: plan to play
      `bounty-live.webm`.
- [ ] *Operator policy* lists pause, budget 600,000, game 100 sat / 60 per
      min, contributions 150,000 sat / 5 per hour.

**Bounty (T−20)**
- [ ] Board `:8092`: *Last webhook* recent and *GitHub webhook deliveries*
      "verified". On konputer `paycue-webhook-forward` is running *(lead)*.
- [ ] The stage bounty issue (#1 "Add a FAQ entry about Liquid payouts",
      60,000 sat) is **open**, unclaimed, chip *open*.
- [ ] **The owner's own PR** is open on GitHub, mergeable, description
      contains `Closes #1` (the board lists it under the bounty as *open ·
      PR #n* by the owner's login). Open it in a tab, scrolled to the merge
      button. Don't merge.
- [ ] **PR #3 by @rajveer002** (an outside contributor's, open, also closes
      #1): don't touch it, don't comment, don't merge; the owner decides
      after the talk. Whichever PR closing #1 merges first claims the
      bounty, so make sure the tab on screen is the owner's PR.
- [ ] The owner's GitHub login is in *Registered contributors* as *Liquid
      (L-USDT)*. On the 3 Oct check the list was **empty**; the owner
      registers himself *(owner: a POST)*: login → **Use the demo Liquid
      wallet** → **Save payout address**.
- [ ] Contributions recipient limit: that login has had fewer than 5 payouts
      in the last hour (no test bounty to the same login after T−60).

**Wallet and game (T−10)**
- [ ] Wallet window `:8091/?user=ada` shows the Lightning Address, a recent
      Liquid scan and the L-USDT balance. Note both numbers.
- [ ] Game `:8090` menu: *Rules for this game* lists the rules (not
      "unavailable"); the feed is empty after the archive.
- [ ] Slide 2 teaser plan: the game tab on the menu with `ada` and the demo
      wallet filled in, so at 0:20 you only press LAUNCH and shoot one coin.
      The round then runs on (or ends on a ROUND OVER card) while you do
      slides 3–14, so **press F5 on the game tab when slide 15 starts**.
- [ ] Browser zoom so the feed and the wallet are readable from the back;
      notifications off; hard-refresh every tab after any deploy.

**Last minute (T−2)**
- [ ] Console *open payouts 0*, `outage: normal`, not paused.
- [ ] Game tab on the menu, pilot field `ada`, Money glitch unticked.
- [ ] Not on screen: the console, PR #3, any terminal with a token.

## Recording the backup videos

`docs/talk/video/record.cjs` drives headless Chromium through the scenes
above and writes `<scene>-<suffix>.webm` plus `<suffix>-timings.json`.

```sh
# Fake mode (what produced the *-fake.webm drafts):
node docs/talk/video/record.cjs --base http://127.0.0.1 --offset 11000 \
  --token-file "$H/payout-service/tokens.json" --suffix fake --secret <webhook secret>

# Live game backups (lead, after agent 2's RECOVERED chip is deployed):
node docs/talk/video/record.cjs --base http://100.91.180.29 --live \
  --token <operator token> --suffix live --scenes landing,game,glitch,recovery,wallet

# Live bounty backup, during the owner's real PR test (films only):
node docs/talk/video/record.cjs --base http://100.91.180.29 --live \
  --suffix live --scenes bounty --watch-seconds 180
#   start it, then the owner merges his PR; it stops 8 s after *paid*.
```

**What a live run spends.** Only these steps send POSTs to the live demo:

| Scene | POSTs to the live demo | Cost |
|---|---|---|
| `landing` | none (GET only) | nothing |
| `game` | one round (`POST /api/session`, launched through the menu) and one `POST /api/session/<id>/hit` per coin | 3 coins × 21 = 63 sat to `ada` |
| `glitch` | one round as `glitch` and three hit POSTs per coin (the glitch's own replays) | 60 settled × 21 = 1,260 sat to `glitch` (the rest fail at the cap: no money) |
| `recovery` | the console action `POST /v1/admin/actions/drop-response` (the button click), one round, one hit | 21 sat to `ada`, sent once despite the lost answer |
| `wallet` | none (GET only) | nothing |
| `bounty` | **none against the live demo**: with a non-local `--base` the script forces `--bounty watch`, never sends signed webhooks and never registers anyone; the payout comes from the owner's real merge | the bounty itself (60,000 sat, one swap), paid by the owner's merge |

So `--scenes landing,game,glitch,recovery,wallet` costs about 1,344 sat and
no swap. The recorder makes no other writes: everything else it does is
page loads and `GET /api/session/<id>` polling.

`--offset` is added to the 8088–8092 ports. `--scenes` picks scenes
(`landing,game,glitch,recovery,bounty`, plus `wallet`). `--glitch-pilot`
(default `glitch`) keeps ada's per-minute limit free; if you glitch as the
same pilot, the script waits out the minute before the recovery scene. A
non-local `--base` is refused without `--live`. Videos are 1280×720 VP8,
1–4 MB each. Recording the
game scenes again later is safe (the glitch pilot's cap resets every
minute) but each run spends the same ~1,344 sat again.
