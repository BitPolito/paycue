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

## Demo (agent 2)

## Rehearsal (agent 3)
