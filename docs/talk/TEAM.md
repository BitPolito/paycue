# Talk-day team board (3 October 2026)

Shared notes between the three agents and the lead. Append-only: add a dated
entry under your own heading; never edit someone else's. The lead reads this
every hour and records decisions under **Decisions**.

## Decisions (lead)

- **Branch:** `demo/showcase` only. Commit only the paths you own; the lead pushes.
- **Live demo is read-only for agents:** GET requests to
  `http://100.91.180.29:8088–8092` are fine. No payouts, no SSH to the VM,
  penguin or Proxmox, no `systemctl`, no node commands. Anything that moves
  money or changes infra goes to the lead here.
- **Experiments:** a local fake-mode stack on ports 18088–18092 (see
  `docs/DEMO.md`); no money moves there.
- **Money (lead only):** at most one real test swap per hour, three in total,
  keep ≥150,000 sat on the maker channel for the stage.
- **Talk:** 30 minutes including Q&A (25 + 5). Section order Triggers →
  Policies → Payments, two slides each (overview with 4 bullets + deep dive),
  replacing slides 8–13 of `SLIDES.md`.
- **Going public:** not today. The squash, the signature and the visibility
  flip stay with the owner; prepare a checklist only.
- **Leave alone:** `demo/tmp.txt` (owner's note).
- **(hour 1) Maker limits move:** the KaleidoSwap maker's maximum follows its
  liquidity (now L-USDT 50,000–136,636 sat, L-BTC 50,000–206,871 sat, 0.5% fee;
  the 3% fee cap is ours). Never quote a fixed maximum. Stage bounties stay
  at or below 130,000 sat.
- **(hour 1) Slide 13 order:** ZBD first, as the owner framed it. The
  article is reworked to the new structure.

- **(hour 2) Deployed live:** graceful degradation, the bounty retry
  (`pending`, same obligation key), `/api/routes`, the RECOVERED/CHECKING
  feed chips and glitch "HIT" pops. GitHub sync on the VM works.
- **(hour 2) Live backups recorded:** `docs/talk/video/*-live.webm` (landing,
  game, glitch, recovery, wallet; 100 s, ~1,344 sat). Recovery showed
  "Answer lost · confirmed with the node · paid once". The bounty backup is
  recorded during the owner's own PR test. Only `*-live.webm` go on stage.
- **(hour 2) PR #3 by @rajveer002** closes bounty #1: an outside
  contributor's PR. Nobody touches it; the owner decides. The stage PR is the
  owner's own.
- **(hour 3) Webhook relay fixed:** `paycue-webhook-forward` on konputer had
  crash-looped since about 29 Sep (HTTP 422: a stale `cli` hook on
  moakilodash/paycue-bounty-demo). The lead deleted that hook at 01:18 and the
  relay forwards again. Pre-show adds a relay check (agent 3). The stage
  fallback for a missing merge is GitHub sync, then the bounty backup video
  (agents 1 and 2).
- **(hour 3) Talk-day freeze:** bug fixes and wording only, no features.
- **(hour 3) Console screen:** the presenter brings only the Chromebook, so
  the console lives on the Chromebook's own screen with the display extended,
  not mirrored. "Laptop" in older notes means that screen.
- **(hour 3) Linger:** `Linger=no`, but konputer's seat0 desktop session keeps
  the user manager alive, so a dropped Chromebook session does not stop the
  relays. Only a konputer logout or reboot would. `loginctl enable-linger mo_`
  is the owner's choice.
- **(hour 3) Missing merge fallback:** wait ~20 s → Redeliver the
  `pull_request` delivery from the `cli` hook → `bounty-live.webm` → "it pays
  when the webhook lands". Sync from GitHub never pays.
- **(hour 3) recovery-live.webm** keeps its ~10 s console evidence ending: it
  is the proof of "paid once".
- **(hour 3) Glitch round death:** accepted as is (F5, relaunch as `glitch`);
  no difficulty change on talk day.
- **Pre-show (lead, T−30):** archive history and restart in the console;
  `lncli listchannels` on the VM (maker ≥150,000 sat local).

## Talk (agent 1)

### 3 Oct, hour 1

**Done**
- `SLIDES.md`: slides 8–13 replaced by Triggers (A, B) → Policies (A, B) →
  Payments (A, B). Each A slide has exactly 4 bullets. Same 7:00 budget as
  the old 8–13 (5:15 → 12:15), so slides 14–19 keep their timings and the
  talk still ends 25:00. The old "pipeline in one picture" slide became a
  thin strip on all six slides; the state machine moved onto 12 (Payments A);
  the exactly-once rules are its fourth bullet. Slide 16's note now points at
  slide 12. Limit values on slide 11 come from the code's route descriptions
  (`setBy` in core/lnurl/kaleidoswap) and the agreed policy numbers only.
- `RELEASE-CHECKLIST.md`: new. Decide what ships, file scan (grep commands),
  history scan, signed orphan-branch squash, visibility, npm publish order,
  QR/article links. A trial run of the file scans found the tailnet/LAN
  addresses in `demo/infra/README.md`, `docs/QUESTIONS.md` and this file;
  no tokens, keys or macaroons in files or history.

**Open questions for the lead**
1. Slide 13 lists ZBD before Breez as briefed. OK, or lead with LND
   (the one that's available)?
2. `ARTICLE.md` still follows the old 8–13 structure. Rework it to
   Triggers → Policies → Payments next hour?
3. Should infra docs (`demo/infra/`, `docs/QUESTIONS.md`, `TEAM.md`) be
   dropped from the public release? The checklist suggests it; owner decides.
4. The temp filesystem (`/tmp/claude-1000`, 8.2 GB) hit its quota once this
   hour; someone may want to clear old task output.

**Needs**
- Agent 2 (demo): confirm the console's *Routes and their limits* panel
  still shows the four chips, and the live maker range (about 50,000 to
  190,000 sat, 0.5%), so `assets/console-routes.png` matches slide 11. A
  fresh 1920×1080 screenshot if it changed.
- Agent 3 (rehearsal): time slides 8–13 aloud; each has about 70 s. Flag any
  that run long, especially 11 (table plus footer line).

### 3 Oct, hour 2

**Done**
- Slide 11 and the article: the maker range now reads "minimum 50,000 sat;
  maximum follows the maker's liquidity (about 137,000 sat for L-USDT
  today)". "190,000" is gone from every file I own; the old figure stays only
  in my hour-1 entry above, which is append-only.
- `ARTICLE.md`: the middle reworked into Triggers → Policies → Payments,
  matching slides 8–13 (adds trigger examples, defaults and demo limits, the
  four limit sources, approval as roadmap, the providers table). Owner's
  voice and the `[YOU: …]` placeholders kept.
- `QA.md` (new): 12 likely questions with short answers from the code.
  One point marked **[Unsure]**: whether routing/swap fees count against the
  budget (the budget rule doesn't mention fees).
- Slides 8–13: speaker notes rewritten as ~100-word scripts (~70 s each);
  slide 11 marked "CUT FIRST", with a one-line fallback to say on slide 10.

**Open questions for the lead**
1. QA.md is a new file in docs/talk; I took the hour-2 brief as permission.
2. QA 5 and 12 have `[YOU: …]`: does the owner want to suggest small mainnet
   amounts, or give roadmap dates?

**Needs**
- Agent 3 (rehearsal): time the new notes on 8–13 and test the slide-11 cut;
  try QA answers 3, 4 and 8 aloud (the longest).
- Lead: just before the talk, read the maker's live maximum on the console
  so the speaker can say the current "about" figure on slide 11.

### 3 Oct, hour 3

**Done**
- `QA.md`: Q5 (mainnet) and Q12 (roadmap, no dates) use the lead's wording;
  Q7 (fees) now states the settled facts (budget = payout amounts only;
  routing fees on top, capped 1% / min 10 sat; swap fees come out of what the
  recipient receives). No `[YOU: …]` or `[Unsure]` left in QA.md.
- `CHEATSHEET.md` (new): URLs (live and penguin), numbers to quote, the three
  rules, the four limit sources, the slide-11 cut, the 30-second "demo broke"
  line. No tokens; the console row says laptop only.
- Consistency pass over SLIDES, ARTICLE, QA, CHEATSHEET, RELEASE-CHECKLIST:
  numbers, names and slide references agree. Fixed: slide 15 bounty step no
  longer says "≈50 L-USDT" (the bounty is 60,000 sat; the speaker reads the
  quoted amount off the board); slide 15 fallback points at the cheat sheet;
  roadmap wording on slide 17 and in the article now matches QA 12.
- `REHEARSAL.md` is not committed yet, so slide 15 is aligned with
  `docs/DEMO.md` only. I'll align it once agent 3 commits.

**Open questions for the lead**
1. Penguin fallback: fake mode (slide 15 has always said so) or the real
   nodes moved over with export/import (QUESTIONS.md decision 8)? The cheat
   sheet says "if fake mode, say so" until you confirm.
2. Is the penguin landing page on :8088 too? I assumed the same ports as the
   VM.

**Needs**
- Agent 3: when REHEARSAL.md lands, flag any step that differs from slide
  15's run sheet (game Normal ×3 → money glitch → drop next node response →
  merge the bounty PR).

### 3 Oct, hour 4

**Done**
- Fallback ladder applied to slide 15 and `CHEATSHEET.md`: (1) Chromebook
  Tailscale → 100.91.180.29:808x, (2) penguin relay → penguin.linux.test:808x
  or localhost:808x (start the relay script first; same live demo), (3) the
  backup videos in `docs/talk/video/`, (4) skip with a sentence. "Fake mode"
  is gone from both. The 30-second line now says "let me try the other
  connection" before falling back to a recording.
- `SLIDES-COPY.md` (new): on-screen text only for slides 1–19 and B1–B3,
  numbered, for pasting into the Figma layout. It mirrors `SLIDES.md`; if
  either changes, update both.
- `REHEARSAL.md` was not committed when I got here, so slide 15's run sheet
  is not yet aligned with it (skipped as instructed). The videos in
  `docs/talk/video/` are named `*-fake.webm`; if those are fake-mode
  recordings, the speaker should not call them "the same run" (my 30-second
  line says "a recording of the same run"). Agent 3 / lead: confirm, and I'll
  reword.

**Standby.** Ready for small fixes.

### 3 Oct, hour 4 (follow-up)

- 30-second line now ends "I'll show you a recording of this demo from
  earlier today" (CHEATSHEET.md). Ladder step 3 on slide 15 and in the cheat
  sheet points at `docs/talk/video/*-live.webm`, never the `*-fake.webm`
  drafts. Back on standby.

### 3 Oct, hour 4 (REHEARSAL.md alignment)

- Slide 15's run sheet now follows REHEARSAL.md (b9c9cf2): same minute marks
  (0:15 / 1:45 / 3:15 / 4:30 / 6:30 / 6:45 after 12:45), glitch as pilot
  `glitch`, F5 between rounds, ~101 s of actions. Same order added to
  CHEATSHEET.md as a table. SLIDES-COPY.md unaffected (slide 15 is a title
  card).
- One difference, decided by the lead: recovery now points at the feed's
  **RECOVERED** chip; REHEARSAL.md still says the chip may only flash and
  that the proof is the console evidence list. Agent 3 may want to update
  that "Heads-up" paragraph once the chip ships. Back on standby.

### 3 Oct, hour 4 (agent 3's mismatches)

- Fixed all six: slide 15 step 1 starts with F5; step 5 says your own PR
  (not #3), "Merge pull request" → "Confirm merge"; RECOVERED wording kept
  as "Answer lost · confirmed with the node · paid once" (tell me if the
  shipped text differs); CHEATSHEET.md has the three stage rules in one
  line; QA 8 says at most 4 sends in the demo (`maxDispatches: 4` in
  `demo/payout-service/src/paycue.ts`), 3 by library default; QA 11 credits
  the delivery ID first, the obligation key for a new delivery. Standby.

### 3 Oct, hour 3 (lead's hour-3 brief: timing, consistency, webhook)

**Done**
- **Timing:** slide 15 now gets 7:30 (11:45 → 19:15); the main deck ends
  24:45 (15 s slack before Q&A). Paid for by words: slides 8–13 from 70 s to
  60 s each (notes are 75–100 words, under 45 s aloud; slide 11's note
  trimmed to ~70). Timing table in `SLIDES.md` (top), cumulative clock in
  `CHEATSHEET.md`. Run-sheet steps 1–4 keep REHEARSAL.md's durations; the
  extra 45 s goes to the bounty step (4:30–7:15), which waits on the swap
  and the relay. Cut order if long: slide 11 (−1:00), then slide 16's
  middle story (−0:45).
- **Webhook fallback** (slide 15 step 5 and the cheat sheet): no
  `pull_request.merged` row within ~20 s → one sentence → board **Sync from
  GitHub** → `bounty-live.webm` if it exists, else say so and close.
- **QA 13** "What if the webhook is lost?" from the code: delivery ID primary
  key + unique obligation key (`bounty:<repo>#<issue>` on the board) in one
  `ingest` transaction, the board's "already claimed" check, the `pending`
  retry every 10 s with the same delivery ID.
- **Consistency** (GET at hour 3): `/api/routes` on :8092 L-USDT
  50,000–136,694, L-BTC 50,000–206,871, 0.5%, cap 3%; game rules 100 sat /
  60 per min, 21 sat Normal (10/42); contributions 150,000 / 5 per hour;
  budget 600,000. All five files agree; "about 137,000" kept as a moving
  "today" figure only. Button labels now match REHEARSAL.md (Use the demo
  Lightning wallet, Normal, LAUNCH →, Merge pull request → Confirm merge,
  Sync from GitHub). Article recovery line now names the RECOVERED chip.

**Open questions for the lead**
1. **Sync from GitHub does not pay.** `syncFromGitHub()` only re-reads issues
   (labels, open/closed); merged PRs are paid only by the webhook, and there
   is no poll. So on stage the sync proves the merge (bounty turns *closed*)
   but can't rescue the payout. Fine as wording-only under the freeze, or do
   you want a redelivery step (GitHub → Settings → Webhooks → Recent
   Deliveries → Redeliver; same delivery ID, so safe) on your laptop?
2. **`bounty-live.webm` does not exist** (only `bounty-fake.webm`). Slide 15
   and the cheat sheet say "say so and close" until it is recorded.
3. **REHEARSAL.md (agent 3)** still says 12:45–19:30 / 6:45 and "~15 s" for
   the webhook; slides now say 11:45–19:15 / 7:30 and ~20 s.
4. **Live board at hour 3:** *Registered contributors* is still empty, and
   bounty #1 lists only PR #3 (open) and #2 (closed) by @rajveer002: the
   owner's own stage PR isn't linked yet (if it was opened while the relay
   was down, the board never heard of it; sync won't add it). Landing still
   shows 6,664 / 115,000 sat settled (archive not yet run). Last delivery:
   ping at 01:18.

### 3 Oct, hour 3 (lead's answers)

- Fallback on slide 15 step 5 and in the cheat sheet is now: wait ~20 s →
  **Redeliver** on the presenter's screen (Settings → Webhooks → `cli` hook
  → Recent Deliveries → the `pull_request` "closed" delivery; one sentence
  on the same delivery ID; caveat: only deliveries of the hook registered at
  01:18 can be redelivered) → `bounty-live.webm` if it exists, else say so
  and close. Sync from GitHub stays as proof of the merge only. QA 13
  mentions Redeliver. REHEARSAL.md left to agent 3.

### 3 Oct, hour 4

- `SLIDES-COPY.md` in step with `SLIDES.md`: header gives the timings (deck
  24:45, demo 11:45–19:15); slide 15 has a *presenter only, do not paste*
  line with the merge fallback (wait ~20 s → Redeliver → `bounty-live.webm`
  → close) and "Sync from GitHub never pays". On-screen copy unchanged.
- "Laptop" wording replaced in `SLIDES.md` and `CHEATSHEET.md`: the console
  is on the Chromebook's own screen (display extended), never the big
  screen. No "Payhook" left in my files; no doubled words found.
- `CHEATSHEET.md` condensed to one A4 page at 10 pt (checked by printing it
  to PDF): URLs as one line, numbers merged, clock as a 3-row grid, fallback
  as one paragraph; fees now point at QA 7. Content otherwise unchanged.

## Demo (agent 2)

### 3 Oct, hour 1

**Done** (all checked on a local fake-mode stack, 18088–18092; nothing live touched)
- **Game "double border":** not a hit flash. It was the keyboard-focus outline
  `.app:has(canvas:focus-visible)` (2 px, 2 px offset round the whole app).
  `start()` focuses the canvas, so it showed for the whole round. Removed. The
  stage's keyboard focus now shows as a 2 px ink rule and bold text on the
  controls bar. No animation, so reduced motion isn't affected.
- **Game states:** the feed header has a status chip (`live` /
  `payouts offline` / `reconnecting`) and a matching line. The repeated
  "Payout service unreachable" note (the follower retries every 2 s, so it
  used to spam the feed) now shows once per change. Rules show "Loading rules…",
  "No rules reported…", or "unavailable… reload when it is back". A hit whose
  request fails now pops "✕ game service unreachable" instead of nothing. Coin
  maths, the hit body, the cooldown reset and the glitch triple-send are
  unchanged (the only change is a try/catch around each send).
- **Bounty board, real bug fixed (server):** if the payout service was down at
  merge time, the claim was kept in memory but never paid, and GitHub's
  redelivery then answered "already claimed". Now the claim records `pending`,
  the board shows **queued · payout service unreachable · retrying**, and the
  server retries every 10 s, and again on reconnect, with the same delivery ID.
  Paycue's duplicate protection keeps that safe. Tested: two merges while the
  service was down; both settled about 10 s after it came back. After a
  restart with the service down, already-claimed bounties show *checking* until
  their state loads.
- **Bounty board client:** a notice for payout service unreachable, a notice
  for GitHub sync failure ("GitHub sync failed (GitHub 404). Showing the
  bounties from the last sync…"), the Sync button shows "Syncing…" while it
  runs and is hidden when no `GITHUB_REPO` is set, an error state plus 5 s retry
  if the board's own API fails, form and network errors handled, and a
  reconnect note on the live stream. `/api/sync` now returns 502 with the
  reason (it used to return 500).
- **Landing:** when `/api/summary` fails, the dot and label say "Payout service
  unreachable · retrying" (or "· last update HH:MM"). Numbers already on screen
  stay; numbers never loaded show "–". Routes say "Routes unavailable…" instead
  of "Asking the payout service…" forever. Missing fields are guarded.
- **Wallet:** load errors are handled (last balance kept, "unreachable" line,
  5 s retry), and it reloads after the event stream reconnects.
- **Layout:** all four pages at 1440 and 400 px have no horizontal scroll and
  no page errors. Fixed: the landing's "96,000 sat" tile overflowed at 400 px;
  the board's `[hidden]` didn't hide pills.

**Deploy (lead):** rebuild (`cd demo && npm run build`), then restart
`paycue-contributions` (server change). Static-only changes (game, landing,
wallet pages) are read from disk on every request, so the game, landing and
wallet services need no restart. Hard-refresh the stage browsers.

**Open questions**
1. Focus indicator: the controls-bar rule instead of an outline is a small
   departure from DESIGN.md's "2 px outline, never remove it". OK, or would
   you prefer an inset outline on the stage?
2. Live board: `/api/sync` used to answer 500 on GitHub failure. If the real
   repo's sync is failing on the VM, it now shows on the board. Worth a look
   before the show.
3. `/tmp` quota (8.2 GB, mostly other projects' temp) blocked Chromium and
   shell output several times. Headless runs need
   `ignoreDefaultArgs: ["--disable-dev-shm-usage"]` to work at all.

### 3 Oct, hour 2

**Live check** (GET only, non-GET requests blocked in the browser, nothing
clicked; :8088, :8090, :8092, :8091/?user=ada at 1440 and 400 px). No
horizontal scroll and no page errors on any page. Real route limits on the
landing (two Lightning routes, Liquid L-BTC 50,000–206,871, L-USDT
50,000–136,659) fit at both widths. Differences from my fake-mode check:
- **Board, "Last webhook":** more than an hour after the last delivery it
  showed a full clock time ("2:49:48 PM"), which overflowed its tile at 400 px.
  Fixed: now "14:49" (a date after a day), in the stat and the deliveries list.
- **Board, deliveries:** mostly `ping.event · ignored`. Now shown as
  "ping · connection check from GitHub".
- **Game feed (data, not a bug):** full of FAILED "Recipient limit reached:
  60 of 60" rows from a money-glitch run. Archive and restart before the show
  (DEMO.md step 1) so the feed starts clean.
- **Wallet / game (infra, not my paths):** the Lightning Address reads
  `ada@localhost:8091` (the VM's `WALLET_DOMAIN`). It works, since the payout
  service resolves it on the VM, but on the big screen it looks like a
  localhost demo. Your call whether to set `WALLET_DOMAIN`.
- **Numbers differ between pages:** the landing says bounty payouts 115,000 sat
  (every settled `contributions` payout); the board's "Paid out" says 0 (only
  bounties currently on the board). Both are correct, but someone may ask.
  Archive and restart also resets the landing's figure.

**Polish: live maker range on the board.** The board server gets a new
`GET /api/routes` that reads `/v1/policy` with the board's own client token
(the same call the game makes for its rules; no admin token, nothing new in the
browser), keeps only the Liquid routes, and caches for 30 s. The form card
shows "L-USDT payouts right now: 50,000–136,641 sat per bounty · 0.5% plus
miner fees · set by the KaleidoSwap maker" (refreshed every minute; hidden if
the service has no Liquid route, e.g. fake mode). An open bounty outside the
range gets "Above the maker's current L-USDT range: claim it with a Lightning
Address". Tested locally with the live route data stubbed in; today's 60,000
sat bounty is inside the range, so it shows no note.

**Rehearsal bugs:** none filed for my paths yet. Standing by.

**Deploy (lead):** `cd demo && npm run build`, restart `paycue-contributions`
(new `/api/routes` endpoint), hard-refresh the board. No other service changed.

### 3 Oct, hour 2 (rehearsal fixes)

**Done** (agent 3's two game bugs; coin maths and hit reporting untouched)
1. **Recovered payouts are visible.** New `demo/game/src/feed.ts`:
   `feedStatus()` reads the payout's evidence. A payout that settled after a
   provider `unknown`, or after the runtime's `recovered` or `resend`, gets
   chip **RECOVERED** (ok green with a 2 px white border) and the note "Answer lost
   · confirmed with the node · paid once". The row also gets an ok left bar.
   While `unknown`, the chip is **CHECKING** (warn) with the note "Confirming
   with the node", not the raw error. `rowOf()` sends a new `chip` field and
   leaves `state` raw, so the HUD's paid-sats sum is unchanged. Failed
   payouts keep their reason. Unit tests are in `game/test/feed.test.js`
   (11/11 pass). End to end on my fake stack: "Drop next node response" plus
   one game payout shows RECOVERED with that note in the feed.
2. **Glitch hit pops** say "HIT" (no amount). Normal rounds still say "+N sat".

**Deploy (lead):** `cd demo && npm run build`, restart `paycue-game` (server
change in `rowOf`), hard-refresh the game screen. Nothing else changed.

## Rehearsal (agent 3)

### 3 Oct, hour 1 (landed late: this is the first rehearsal entry)

**Done**
- `docs/talk/REHEARSAL.md` (new): the 6:45 live demo minute by minute (click,
  say, what the audience sees, fallback per step, using agent 1's ladder:
  Tailscale → penguin relay → `*-live.webm` → skip), the T−30 pre-show
  checklist, measured timings and how to record the backup videos.
- `docs/talk/video/record.cjs` (new): headless Chromium + autopilot (aims
  with the server's coin schedule, holds fire) through `landing`, `game`,
  `glitch`, `recovery` (clicks the console's *Drop next node response*, one
  coin, opens the evidence), `bounty` (`--bounty simulate` sends signed
  webhooks; `--bounty watch` just films the board while you merge) and
  `wallet`. Writes `<scene>-<suffix>.webm` + `<suffix>-timings.json`.
  Refuses a non-local `--base` without `--live`.
- Draft videos from my fake-mode stack (19088–19092):
  `landing/game/glitch/recovery/bounty-fake.webm`, 0.9–3.8 MB each, 9 MB
  total, plus `fake-timings.json`. **Fake mode: they must not be shown as
  live.**
- Timings (fake, machine pace): game 13 s, glitch 31 s, recovery 24 s,
  bounty 19 s, whole demo 101 s; the rest of the 6:45 is talking. Launch →
  first coin settled 5 s (3 s countdown). Glitch hits the 60/min cap after
  ~10 s of play.
- `docs/DEMO.md`: landing page on 8088, tailnet relay
  `http://100.91.180.29:808x` and penguin relay, a console section with the
  real button names (Pause payouts, Resume, Drop next node response, Take
  studio node offline, Restore studio node, Archive history and restart),
  the webhook forwarder, a local fake-mode stack recipe, new trouble rows,
  config per service.
- Slides 8–13 notes: 87–106 words each = 35–42 s at 150 wpm against 70 s, so
  they won't run long; slide 11 is the longest (106 words). Not timed aloud
  (no voice here).

**Differences from slide 15 (agent 1, please align)**
1. **Glitch as a different pilot** (`glitch`, not `ada`). The 60/min cap is
   per recipient: glitching as ada makes the recovery coin a minute later
   fail "Recipient limit reached" instead of recovering. Seen in my first
   fake run.
2. **"show `unknown` → `settled`"**: in fake mode the lookup runs at once,
   so the feed never shows `unknown`; the row goes straight to SETTLED with
   the note "Connection to the studio node dropped before it answered". On
   LND it may only flash. The proof is the console evidence (provider
   unknown → provider settled via lookup), but the cheat sheet keeps the
   console off the big screen. Lead: allow the console on screen for that
   one view, or narrate it, or cut to backup slide B2.
3. **Reload (F5) between rounds**: a round is 60 s and the menu has no end
   button.

**For agent 2 (bugs and asks, none blocking)**
1. Recovery is invisible in the game feed (point 2 above). If you want the
   audience to see `unknown`, the game could hold the row's `unknown` for a
   second or so, or show a "recovered after a lost answer" note instead of
   the raw error text on a settled row (it reads like a failure).
2. Glitch: the `+21 sat` pop shows for every accepted hit, including those
   that then fail "Recipient limit reached". HUD *PAID* is right (settled
   only), the pops overstate.
3. Board in fake mode: a Liquid contributor's paid bounty says "sats sent
   over Lightning" (no txid in fake mode). Fake only; fine for rehearsal.
4. Console: *Node and service* shows one channel sum, so "both channels
   active" can't be checked from the console. A per-channel line (peer,
   active, local) in `status()` would make the pre-show check self-serve.
5. `/api/config` on the live game still reports
   `walletUrl: http://192.168.1.219:8091` (the LAN address). The client
   ignores it now (derives it from the page address), so it's cosmetic.
6. Headless Chromium on this box: with `/tmp` near its quota, every request
   fails `net::ERR_INSUFFICIENT_RESOURCES`. `record.cjs` keeps the browser's
   TMPDIR next to the videos (`docs/talk/video/.tmp`, deleted afterwards).

**Real-money steps for the lead**
1. **Register the PR author on the live board.** On my GETs at ~00:30 the
   live board's *Registered contributors* was **empty**; merging now would
   leave the bounty *waiting for address*. Register the stage PR author's
   login with **Use the demo Liquid wallet** (a POST, so yours).
2. **Stage PR:** bounty #1 has **PR #3 by @rajveer002 open** (and #2 closed).
   Whichever PR closing #1 merges first claims it. Use your own pre-opened
   PR, keep #3 unmerged until after the talk.
3. **Archive history and restart** in the console before the show (the live
   feed is full of glitch FAILED rows; landing shows 115,000 sat bounty
   payouts from earlier).
4. **Check both channels** with `lncli listchannels` on the VM (the console
   can't show it), maker local ≥ 150,000 sat.
5. **Record the live backups** (uses one of your three swaps):
   `node docs/talk/video/record.cjs --base http://100.91.180.29 --live --token <operator token> --suffix live --bounty watch --watch-seconds 150`,
   and merge the PR on GitHub while the bounty scene runs. That pays about
   1,350 sat of game payouts plus the bounty. It needs a second bounty
   issue + PR, or do it after the talk's bounty is set up again. Time
   merge → paid there: it's the one timing I can't measure in fake mode.
6. Optional: one full live dress rehearsal of the run sheet with a stopwatch
   (same costs as 5).

### 3 Oct, hour 2

**Done**
- `REHEARSAL.md`: lead decisions at the top (glitch pilot `glitch`, F5
  between rounds, RECOVERED chip with the console kept on the laptop, the
  owner's own PR, PR #3 untouched). The recovery step now points at the
  RECOVERED chip. The bounty step and checklist say the owner's own
  pre-opened PR, and that PR #3 by @rajveer002 must not be touched. The lead
  items have exact commands: `lncli getinfo` / `listchannels` on the VM with
  the same flags as `demo/infra/liquidity.sh`, plus the console's **Archive
  history and restart** (what it says, when it refuses, what to refresh).
  Slide 2 teaser → press F5 when slide 15 starts.
- `record.cjs`: with a non-local `--base` the bounty scene is forced to
  `--bounty watch`. It never sends signed webhooks and never registers
  anyone (tested against a non-local address: "using --bounty watch").
  REHEARSAL.md has a table of what each scene POSTs and what it costs. The
  lead's `--scenes landing,game,glitch,recovery,wallet` makes 3 rounds, about
  64 coin hits (the glitch's replays add more hit POSTs, but those pay
  nothing), and one console action (`drop-response`). That is about
  1,344 sat and no swap. The bounty backup is a watch-only run during the
  owner's merge, and needs no token.

**Mismatches for agent 1** (SLIDES.md, CHEATSHEET.md, QA.md against the code
and a live run)
1. **Slide 15 step 4, RECOVERED chip text** ("Answer lost · confirmed with
   the node · paid once"): not in the deployed game yet. Match it to agent
   2's actual wording once deployed.
2. **Slide 15 step 5:** say "the owner's own pre-opened PR (not #3)". The
   GitHub buttons are **Merge pull request** → **Confirm merge**, not
   "Merge".
3. **Slide 2 → slide 15:** after the teaser coin the game tab is mid-round
   or on ROUND OVER when slide 15 starts. Step 1 should start with "F5".
4. **CHEATSHEET.md** has none of the stage rules: glitch pilot `glitch`, F5
   between rounds, RECOVERED chip. Suggest one "Demo reminders" line.
5. **QA 8** "re-sends the same invoice (up to 3 sends)": 3 is the core
   default (`maxDispatches ?? 3`), but the demo service sets
   `maxDispatches: 4` (`demo/payout-service/src/paycue.ts`). Say "3 by
   default; the demo allows 4", or drop the number.
6. **QA 11** "duplicate hits are ignored by obligation key": in the demo the
   glitch replays are caught first by the delivery ID (the feed says
   "Replayed hit ignored: same delivery"). The obligation key is the second
   layer. Suggest "by delivery ID and obligation key".
7. **Numbers check, all OK against the live summary (GET, ~01:00):** L-USDT
   50,000–136,619 sat ("about 137,000" still right), L-BTC to 206,871, 0.5%
   fee, 3% cap; game 100 sat / 60 per minute; bounties 150,000 / 5 per hour;
   600,000 budget; routing fee cap 1%, minimum 10 sat (`@paycue/lnd`
   `feeLimitSat`). Ports 8088–8092 and the console button names match.
8. Slide 15's clock (0:15/1:45/3:15/4:30/6:30) and "about 101 s" match
   REHEARSAL.md.

### 3 Oct, hour 3

**Done**
- `REHEARSAL.md` aligned to the lead's 7:30 (11:45 → 19:15; bounty
  4:30–7:15, close 7:15–7:30; webhook wait ~20 s). New **Relays on konputer
  (lead only, T−30)** checks with exact commands: `systemctl --user
  is-active paycue-webhook-forward paycue-tailnet-relay`, `journalctl --user
  -u paycue-webhook-forward -n 5` ("Forwarding Webhook events from
  GitHub..."), `gh api repos/moakilodash/paycue-bounty-demo/hooks --jq
  '.[]|{id,created_at}'` (exactly one `cli` hook), the 422 symptom, and the
  fix as the lead's call (delete the stale hook, restart the service).
- **Stage failure card** (one table, top of REHEARSAL.md): landing, game,
  glitch, recovery, bounty, wallet → symptom, one action, which
  `*-live.webm`. Bounty row uses the lead's order: wait ~20 s → GitHub
  Settings → Webhooks → `cli` hook → Recent Deliveries → Redeliver the
  `pull_request` "closed" delivery → `bounty-live.webm` if present → "it
  pays when the webhook lands". Sync from GitHub marked "does not pay".
- `record.cjs`: Chromium now launched with `ignoreDefaultArgs:
  ["--disable-dev-shm-usage"]` (shared memory stays in /dev/shm, not the
  near-full /tmp). Tested by the dry run below; nothing else changed.

**Dry run of slide 15** (fake stack 18088–18092, `record.cjs` default
scenes, temp files in `docs/talk/video/.tmp`, removed afterwards; stack
stopped). Machine time 93.4 s (hour 1: 101 s): landing 12.6, game 12.9
(13.2), glitch 22.8 (31.1), recovery 23.3 (23.6), bounty 19.2 (18.6).

| Step | Slot | Paced estimate (machine + ~8 s clicks + Say at 150 wpm) | Delta vs slot |
|---|---|---|---|
| Switch | 0:00–0:15 | ~8 s | −7 s |
| Game | 0:15–1:45 | ~46 s (first coin settled 3.6 s after LAUNCH) | −44 s |
| Glitch | 1:45–3:15 | ~43 s (cap row ~13 s after LAUNCH) | −47 s |
| Recovery | 3:15–4:30 | ~36 s (click → RECOVERED 7.3 s) | −39 s |
| Bounty | 4:30–7:15 | ~51 s + relay, swap, Liquid tx (unmeasured live) | −114 s of room for those |
| Close | 7:15–7:30 | ~5 s | −10 s |

No step overruns its mark; ~3:10 of 7:30 is scripted, so the risk is
running short, not long. The recovery note text in the code is exactly
"Answer lost · confirmed with the node · paid once" (matches slide 15).
**New finding:** in the dry run the glitch round ended **SHIELDS DOWN**
after ~15 s of play (enemies, 3 lives; the autopilot ignores them). The cap
row had already shown, so no harm, but a human sweeping for coins can die
before 60 hits. Added to the glitch step and the card: F5, relaunch as
`glitch` if the cap hasn't shown.

**Live GETs (01:25):** board deliveries show a `ping.event` at 23:18:30Z
(01:18:30 local): the relay is back. *Registered contributors* still
**empty**; bounty #1 lists only PR #3 (open) and #2 (closed): the owner's
stage PR is not linked (opened while the relay was down?). Linking is
display only; editing the PR description re-sends it.

**Needs a lead decision**
1. **No laptop:** REHEARSAL, the slides and the cheat sheet say "console on
   the laptop only". With only the Chromebook, where does the console live?
   I wrote "the Chromebook's own screen, display extended, not mirrored"
   as a placeholder.
2. **Linger on konputer:** QUESTIONS.md #4 says `Linger=no`, so the user
   services (`paycue-webhook-forward`, `paycue-tailnet-relay`) stop when the
   last konputer session ends, e.g. if the Chromebook's remote session
   drops. Added `loginctl show-user mo_ -p Linger` to the T−30 reads; the
   fix (`loginctl enable-linger mo_`) is yours.
3. **`bounty-live.webm` does not exist.** The bounty backup is still to be
   recorded during the owner's PR test (watch-only, no token).
4. **`recovery-live.webm`** ends with ~10 s of the console's evidence view.
   OK on the big screen as a recording, or cut before it?
5. **Slide 15 step 5 (agent 1)** still has Sync from GitHub as fallback (a)
   and no Redeliver step; the card follows your hour-3 order.

### 3 Oct, hour 4

**Done**
- `REHEARSAL.md` **Offline pack** (owner action): exactly what goes in the
  Chromebook's local Downloads before leaving: the five `*-live.webm`
  (landing, game, glitch, recovery, wallet; 9.1 MB), `bounty-live.webm` once
  it exists, the deck as a Figma PDF export, CHEATSHEET.md and REHEARSAL.md
  saved as PDFs from github.com. How: private repo `BitPolito/paycue`,
  branch `demo/showcase` (pushed to fb6ddad, all five live videos are on
  it), *Download raw file* per video or *Code → Download ZIP*; fake drafts
  kept out of Downloads; a Wi-Fi-off check. Plus a table of which steps are
  impossible without the konputer link (all of them, since both live rungs
  go through konputer's VPN; the GitHub merge still works from the
  Chromebook) and the video that covers each.
- Applied the hour-3 decisions: "laptop" = the Chromebook's own screen,
  extended display (no longer a placeholder); T−30 backup-video check points
  at the Offline pack.

**Reference check** (every file named in REHEARSAL.md, SLIDES.md,
CHEATSHEET.md, working tree incl. agent 1's uncommitted edits):
- Present: all five `*-live.webm`, all `*-fake.webm`, `fake-timings.json`,
  `record.cjs`, `assets/` with `console-routes.png` (and four more PNGs),
  `demo/infra/liquidity.sh`, CHEATSHEET/QA/SLIDES/REHEARSAL.md,
  `docs/QUESTIONS.md`.
- **Missing:** `docs/talk/video/bounty-live.webm` (known gap).
- **Not in the repo, named but not as a file:** the penguin "relay script"
  (REHEARSAL, SLIDES, CHEATSHEET and DEMO.md all say "start the relay
  script in a penguin terminal"; no such script is in the repo). Lead/owner:
  confirm it is on the Chromebook's Linux and give its name. Note that the
  penguin relay also goes through konputer, so it is no help if the
  konputer link itself is lost.
- Figma-only, expected outside the repo: the deck itself, slide 3's team
  photo / logo wall, slide 18's QR code, slide 19's BitPolito logo (and its
  `[YOU: name, handle]` placeholder is still open).
