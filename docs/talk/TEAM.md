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

## Rehearsal (agent 3)
