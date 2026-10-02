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

## Demo (agent 2)

## Rehearsal (agent 3)
