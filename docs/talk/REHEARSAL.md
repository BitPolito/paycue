# Live demo rehearsal: run sheet and pre-show checklist

bitcoin++ Berlin, 3 October 2026. The live demo is slide 15: it starts at
12:45 and must end by 19:30, so you have **6:45**. This file is the
click-by-click version of slide 15's run sheet. URLs are in
[CHEATSHEET.md](CHEATSHEET.md); the fallback ladder is the same as there.

**Screens.** Big screen: one browser window with the game, the bounty board
and the GitHub PR in tabs, and the player wallet (`:8091/?user=ada`) in a
narrow window beside it. Laptop only: the operator console (`:8089`). Never
put the console on the big screen.

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
- **Audience sees:** a feed row whose note reads "Connection to the studio
  node dropped before it answered" and whose chip ends **SETTLED**; the
  wallet gets exactly one 21 sat payment.
- **Heads-up:** in fake mode the lookup is instant, so the chip never shows
  `unknown` in the feed; on real LND it may only flash. Don't promise
  "watch it go unknown". The proof is the evidence list: on the laptop,
  click the top row of *Payouts* and read it out: "policy allowed, resolver
  resolved, provider **unknown**: connection dropped, provider **settled**
  via lookup." (Showing the console on the big screen is against the cheat
  sheet; if the lead allows it for this one view, the token field is a
  password field and the URL is cleaned, so nothing secret shows.)
- **Fallback:** the coin's row fails with "Recipient limit reached" → you
  glitched as `ada`; say "that's the cap from a minute ago, which is the
  policy working" and play `recovery-live.webm`. Row stays `unknown` past
  30 s → say "it waits until it knows; it'll settle on its own" and move on.

### 4:30–6:30 · Bounty: merge a PR, get paid in L-USDT

- **Click:** bounty board tab (`:8092`), scrolled so the *Bounties* card and
  the right column (*GitHub webhook deliveries*, *Activity*) are visible.
  Then the GitHub tab with your pre-opened PR on
  `moakilodash/paycue-bounty-demo` ("Closes #N" in its description) →
  **Merge pull request** → **Confirm merge**. Switch back to the board.
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
      `channels` shows sat out and in. The console only shows the sum, so
      **both channels active** (maker and player) must be checked by the
      lead on the VM *(lead)*: `lncli listchannels` → two channels,
      `active: true`; studio node `synced_to_chain: true`.
- [ ] Maker channel local balance ≥ 150,000 sat *(lead)*; player channel has
      inbound room for the game.
- [ ] *Totals*: `open payouts 0`.
- [ ] **Archive history and restart** (refused while a payout is open; the
      service restarts with an empty feed). Afterwards the game feed and
      landing totals start from zero. Budget is back to 600,000 sat.
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
- [ ] Your PR is open on GitHub, mergeable, description contains
      `Closes #1` (the board lists it under the bounty as *open · PR #n*).
      Open it in a tab, scrolled to the merge button. Don't merge.
      On 3 Oct the board also listed **PR #3 by @rajveer002 (open)**
      closing #1: whichever PR is merged first claims the bounty, so don't
      let #3 be merged before the talk, and don't click the wrong one.
- [ ] The PR author's GitHub login is in *Registered contributors* as
      *Liquid (L-USDT)*. On the 3 Oct check the list was **empty**, so
      register it now *(lead: a POST)*: login → **Use the demo Liquid
      wallet** → **Save payout address**.
- [ ] Contributions recipient limit: that login has had fewer than 5 payouts
      in the last hour (no test bounty to the same login after T−60).

**Wallet and game (T−10)**
- [ ] Wallet window `:8091/?user=ada` shows the Lightning Address, a recent
      Liquid scan and the L-USDT balance. Note both numbers.
- [ ] Game `:8090` menu: *Rules for this game* lists the rules (not
      "unavailable"); the feed is empty after the archive.
- [ ] Teaser coin for slide 2: one round as `ada`, one coin, then F5. It
      counts 1 of ada's 60 per minute; fine.
- [ ] Browser zoom so the feed and the wallet are readable from the back;
      notifications off; hard-refresh every tab after any deploy.

**Last minute (T−2)**
- [ ] Console *open payouts 0*, `outage: normal`, not paused.
- [ ] Game tab on the menu, pilot field `ada`, Money glitch unticked.

## Recording the backup videos

`docs/talk/video/record.cjs` drives headless Chromium through the scenes
above and writes `<scene>-<suffix>.webm` plus `<suffix>-timings.json`.

```sh
# Fake mode (what produced the *-fake.webm drafts):
node docs/talk/video/record.cjs --base http://127.0.0.1 --offset 11000 \
  --token-file "$H/payout-service/tokens.json" --suffix fake --secret <webhook secret>

# Live (lead only; real sats, a real dropped response, a real bounty):
node docs/talk/video/record.cjs --base http://100.91.180.29 --live \
  --token <operator token> --suffix live --bounty watch --watch-seconds 150
#   while the bounty scene runs, merge the pre-opened PR on GitHub.
```

`--offset` is added to the 8088–8092 ports. `--scenes` picks scenes
(`landing,game,glitch,recovery,bounty`, plus `wallet`). `--glitch-pilot`
(default `glitch`) keeps ada's per-minute limit free; if you glitch as the
same pilot, the script waits out the minute before the recovery scene. A
non-local `--base` is refused without `--live`. Videos are 1280×720 VP8,
1–4 MB each. A full live run pays about 1,350 sat of game payouts (3 + 60 + 1
coins × 21 sat) and one 60,000 sat bounty (one of the lead's three swaps).
