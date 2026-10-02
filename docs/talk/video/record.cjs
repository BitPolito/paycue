#!/usr/bin/env node
// Records backup videos of the Paycue live demo with a headless browser.
// One webm per scene, plus <suffix>-timings.json with what happened when.
//
//   Fake-mode stack (no money moves), ports 19088–19092:
//     node docs/talk/video/record.cjs --base http://127.0.0.1 --offset 11000 \
//       --token-file $H/payout-service/tokens.json --suffix fake --secret rehearsal-secret
//
//   Live demo (REAL payouts: lead only). The game scenes pay real sats, the
//   recovery scene presses "Drop next node response", and the bounty scene
//   only watches the board while you merge the pre-opened PR on GitHub:
//     node docs/talk/video/record.cjs --base http://100.91.180.29 --live \
//       --token <admin token> --suffix live --bounty watch --watch-seconds 150
//
// Scenes (--scenes, comma separated, in this order by default):
//   landing   scroll the landing page (8088)
//   game      Normal round, the autopilot shoots --coins coins, feed settles
//   glitch    money glitch as --glitch-pilot (default "glitch", so ada's
//             60-a-minute recipient limit stays free for the recovery coin):
//             coins rain, replays ignored, recipient limit hit
//   recovery  console → Drop next node response; one coin; unknown → settled;
//             back to the console, open the payout and its evidence
//   bounty    bounty board: register (simulate) and merge → paying → paid
//   wallet    the player wallet for --pilot (live only; fake mode has none)
//
// Needs playwright-core (PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core
// if it is not resolvable) and Chromium (CHROME=/path/to/chrome).
"use strict";
const { parseArgs } = require("node:util");
const { createHmac, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { values: o } = parseArgs({
  options: {
    base: { type: "string", default: "http://127.0.0.1" },
    offset: { type: "string", default: "0" },
    token: { type: "string" },
    "token-file": { type: "string" },
    scenes: { type: "string", default: "landing,game,glitch,recovery,bounty" },
    suffix: { type: "string", default: "fake" },
    out: { type: "string", default: path.join(__dirname) },
    live: { type: "boolean", default: false },
    pilot: { type: "string", default: "ada" },
    "glitch-pilot": { type: "string", default: "glitch" },
    coins: { type: "string", default: "3" },
    "glitch-seconds": { type: "string", default: "30" },
    bounty: { type: "string", default: "simulate" },
    secret: { type: "string", default: process.env.GITHUB_WEBHOOK_SECRET },
    issue: { type: "string", default: String(10 + Math.floor(Math.random() * 80)) },
    sats: { type: "string", default: "60000" },
    login: { type: "string", default: "ada" },
    address: { type: "string" },
    "watch-seconds": { type: "string", default: "120" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "720" },
  },
});

// ---- setup -------------------------------------------------------------------

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_CORE, "playwright-core",
    "/tmp/claude-1000/-home-mo--Code-PayHook/e07f0c4d-e9b8-4d31-b458-7cb511076f38/scratchpad/pw/node_modules/playwright-core"];
  for (const t of tries.filter(Boolean)) { try { return require(t); } catch {} }
  throw new Error("playwright-core not found: npm i playwright-core somewhere and set PLAYWRIGHT_CORE to its folder");
}
// Chromium keeps its profile in TMPDIR; a full /tmp shows up as
// net::ERR_INSUFFICIENT_RESOURCES, so keep it next to the videos and clean up.
const TMP = process.env.RECORD_TMPDIR || path.join(o.out, ".tmp");
fs.mkdirSync(TMP, { recursive: true });
process.env.TMPDIR = TMP;
const { chromium } = loadPlaywright();
const CHROME = process.env.CHROME || path.join(os.homedir(), ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome");

const base = new URL(o.base);
const isLocal = ["127.0.0.1", "localhost", "::1"].includes(base.hostname);
if (!isLocal && !o.live) {
  console.error(`${base.hostname} is not local: these scenes create REAL payouts there. Add --live if that is what you want.`);
  process.exit(2);
}
const off = Number(o.offset);
const url = (port, p = "/") => `${base.protocol}//${base.hostname}:${port + off}${p}`;
const URLS = { landing: url(8088), console: url(8089), game: url(8090), wallet: url(8091), board: url(8092) };
const token = o.token ?? (o["token-file"] ? JSON.parse(fs.readFileSync(o["token-file"], "utf8")).admin : undefined);
const size = { width: Number(o.width), height: Number(o.height) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(o.out, { recursive: true });

const T0 = Date.now();
const timeline = [];
let sceneStart = 0;
let lastGlitchAt = 0;
function mark(scene, what) {
  const entry = { scene, at: +((Date.now() - sceneStart) / 1000).toFixed(1), total: +((Date.now() - T0) / 1000).toFixed(1), what };
  timeline.push(entry);
  console.log(`  [${scene} +${entry.at}s] ${what}`);
}

// ---- autopilot -----------------------------------------------------------------
// Uses the coin schedule the server sends the browser (the same one the game
// draws), moves the mouse over the predicted intercept point and holds fire.

function coinPosition(coin, t) {
  const age = (t - coin.spawnAt) / 1000;
  return { x: coin.x + coin.wobble * Math.sin(age * coin.wobbleHz * Math.PI * 2), y: -0.05 + coin.speed * age };
}

function instrumentGame(page, scene) {
  const state = { round: null, t0: 0, taken: new Set(), hits: 0, states: new Map() };
  page.on("response", async (res) => {
    const req = res.request();
    if (req.method() !== "POST") return;
    if (res.url().endsWith("/api/session")) {
      try { const body = await res.json(); if (body.round) { state.round = body.round; state.t0 = Date.now() + body.round.startsInMs; mark(scene, `round started (${body.round.difficulty}${body.round.glitch ? ", glitch" : ""})`); } } catch {}
    } else if (/\/hit$/.test(res.url())) {
      try {
        const claim = JSON.parse(req.postData() || "{}");
        const body = await res.json();
        if (body.ok && !body.duplicate) { state.hits += 1; if (state.hits <= 3 || state.hits % 20 === 0) mark(scene, `hit ${state.hits} accepted (coin ${claim.coinId})`); }
      } catch {}
    }
  });
  page.on("request", (req) => {
    if (req.method() === "POST" && /\/hit$/.test(req.url())) {
      try { state.taken.add(JSON.parse(req.postData() || "{}").coinId); } catch {}
    }
  });
  return state;
}

// Follows this round's payouts through the game's own read-only session API
// and logs the first time each state (and each distinct note) shows up.
function trackSession(state, scene) {
  const seen = new Set();
  const last = new Map();
  state.payouts = [];
  const timer = setInterval(async () => {
    if (!state.round) return;
    try {
      const body = await (await fetch(`${URLS.game}api/session/${state.round.id}`)).json();
      state.payouts = body.payouts || [];
      for (const p of state.payouts) {
        if (last.get(p.payoutId) === p.state) continue;
        last.set(p.payoutId, p.state);
        const key = `${p.state}|${p.note ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mark(scene, `first payout ${p.state}${p.note ? ` (${p.note})` : ""}`);
      }
    } catch {}
  }, 400);
  return () => clearInterval(timer);
}

async function play(page, state, { maxHits = Infinity, seconds = 60, scene }) {
  await page.waitForFunction(() => document.querySelector(".app.playing"), null, { timeout: 15_000 });
  for (let i = 0; i < 50 && !state.round; i += 1) await sleep(100);
  if (!state.round) throw new Error("round did not start");
  const r = state.round;
  await sleep(150); // let the canvas resize
  const box = await page.locator("#c").boundingBox();
  const w = Math.min(box.width, box.height * 0.8);
  const x0 = box.x + (box.width - w) / 2;
  const toPx = (x) => x0 + x * w;
  const yPx = box.y + box.height * 0.6;
  const lifetime = (c) => ((1.1 + 0.05) / c.speed) * 1000;
  await page.mouse.move(toPx(0.5), yPx);
  let down = false;
  const end = state.t0 + Math.min(seconds * 1000, r.roundMs);
  while (Date.now() < end) {
    const t = Date.now() - state.t0;
    const ended = await page.locator("#over").isVisible().catch(() => true);
    if (ended) break;
    if (state.hits >= maxHits) { if (down) await page.mouse.up(); down = false; await sleep(1500); break; }
    let best = null;
    for (const c of r.coins) {
      if (state.taken.has(c.id) || t < c.spawnAt || t > c.spawnAt + lifetime(c)) continue;
      const age = (t - c.spawnAt) / 1000;
      const tau = (r.shipY + 0.05 - c.speed * age) / (r.bulletSpeed + c.speed);
      const y = -0.05 + c.speed * age;
      if (y > r.shipY - 0.15 || tau < 0.15) continue; // too low to reach
      if (!best || y > best.y) best = { c, tau, y };
    }
    if (best) {
      const aim = coinPosition(best.c, t + (best.tau + 0.12) * 1000);
      await page.mouse.move(toPx(Math.max(0.04, Math.min(0.96, aim.x))), yPx, { steps: 2 });
      if (!down && t > 0) { await page.mouse.down(); down = true; }
    }
    await sleep(30);
  }
  if (down) await page.mouse.up();
}

async function launch(page, { glitch, pilot = o.pilot }) {
  await page.goto(URLS.game, { waitUntil: "load" });
  await page.fill("#name", pilot);
  await page.click("#useLn");
  await page.check('input[name="d"][value="normal"]', { force: true });
  if (glitch) await page.check("#glitch"); else await page.uncheck("#glitch");
  await sleep(1200);
  await page.click("#launch");
}

async function waitSettled(state, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const open = state.payouts.filter((p) => !["settled", "failed", "stuck"].includes(p.state));
    if (state.payouts.length >= state.hits && open.length === 0) break;
    await sleep(400);
  }
  const byState = state.payouts.reduce((acc, p) => ({ ...acc, [p.state]: (acc[p.state] ?? 0) + 1 }), {});
  return JSON.stringify(byState);
}

// ---- scenes ----------------------------------------------------------------------

const scenes = {
  async landing(page) {
    await page.goto(URLS.landing, { waitUntil: "load" });
    mark("landing", "landing page open");
    await sleep(3000);
    for (let i = 0; i < 8; i += 1) { await page.mouse.wheel(0, 320); await sleep(900); }
    await sleep(2000);
  },

  async game(page) {
    const st = instrumentGame(page, "game");
    const stop = trackSession(st, "game");
    await launch(page, { glitch: false });
    await play(page, st, { maxHits: Number(o.coins), seconds: 30, scene: "game" });
    mark("game", `${st.hits} coins hit; payouts ${await waitSettled(st, 20_000)}`);
    stop();
    await sleep(3000);
  },

  async glitch(page) {
    const st = instrumentGame(page, "glitch");
    const stop = trackSession(st, "glitch");
    await launch(page, { glitch: true, pilot: o["glitch-pilot"] });
    await play(page, st, { seconds: Number(o["glitch-seconds"]), scene: "glitch" });
    lastGlitchAt = Date.now();
    mark("glitch", `${st.hits} coins hit; payouts ${await waitSettled(st, 15_000)}`);
    stop();
    await sleep(3000);
  },

  async recovery(page) {
    if (!token) throw new Error("recovery needs --token or --token-file (operator token)");
    await page.goto(`${URLS.console}?token=${encodeURIComponent(token)}`, { waitUntil: "load" });
    await page.waitForSelector('button[data-action="drop-response"]');
    mark("recovery", "console open");
    await sleep(2500);
    await page.click('button[data-action="drop-response"]');
    mark("recovery", "clicked Drop next node response");
    await sleep(2500);
    const st = instrumentGame(page, "recovery");
    const stop = trackSession(st, "recovery");
    await launch(page, { glitch: false });
    await play(page, st, { maxHits: 1, seconds: 20, scene: "recovery" });
    mark("recovery", `payouts ${await waitSettled(st, 90_000)}`);
    stop();
    await sleep(2500);
    await page.goto(`${URLS.console}?token=${encodeURIComponent(token)}`, { waitUntil: "load" });
    await page.waitForSelector("#rows tr");
    await sleep(1500);
    await page.click("#rows tr");
    await page.waitForSelector("#detail:not([hidden])");
    await page.locator("#detail").scrollIntoViewIfNeeded();
    mark("recovery", "evidence open");
    await sleep(8000);
  },

  async bounty(page) {
    await page.goto(URLS.board, { waitUntil: "load" });
    mark("bounty", "board open");
    await page.exposeFunction("__bountyChange", (t) => mark("bounty", `board: ${t}`));
    await page.evaluate(() => {
      const seen = new Map();
      new MutationObserver(() => {
        for (const li of document.querySelectorAll("#bounties > li")) {
          const chip = li.querySelector(".meta .chip")?.textContent;
          const n = li.querySelector(".num")?.textContent;
          if (n && seen.get(n) !== chip) { seen.set(n, chip); window.__bountyChange(`${n} ${chip}`); }
        }
      }).observe(document.getElementById("bounties"), { childList: true, subtree: true });
    });
    await sleep(2000);
    const showBounties = () => page.evaluate(() => document.querySelector("#bounties").scrollIntoView({ behavior: "smooth", block: "start" }));
    if (o.bounty === "watch") {
      await showBounties();
      mark("bounty", `watching for ${o["watch-seconds"]} s: merge the PR on GitHub now`);
      const paidBefore = await page.locator("#bounties .chip.c-paid").count();
      const until = Date.now() + Number(o["watch-seconds"]) * 1000;
      while (Date.now() < until && (await page.locator("#bounties .chip.c-paid").count()) <= paidBefore) await sleep(1000);
      mark("bounty", (await page.locator("#bounties .chip.c-paid").count()) > paidBefore ? "bounty paid" : "no new payment while watching");
      await sleep(8000);
      return;
    }
    if (!o.secret) throw new Error("bounty simulate needs --secret or GITHUB_WEBHOOK_SECRET");
    const repoName = (await (await fetch(URLS.board + "api/bounties")).json()).repo;
    const repository = { full_name: repoName, name: repoName.split("/")[1], owner: { login: repoName.split("/")[0] } };
    const hook = async (event, payload) => {
      const body = JSON.stringify(payload);
      const res = await fetch(URLS.board + "webhooks/github", { method: "POST", body, headers: {
        "content-type": "application/json", "x-github-event": event, "x-github-delivery": randomUUID(),
        "x-hub-signature-256": `sha256=${createHmac("sha256", o.secret).update(body).digest("hex")}` } });
      mark("bounty", `webhook ${event}: HTTP ${res.status}`);
    };
    const n = Number(o.issue);
    const pr = 100 + n;
    await hook("issues", { action: "labeled", repository, issue: { number: n, title: "Add a FAQ entry about Liquid payouts", state: "open", html_url: `https://github.com/${repoName}/issues/${n}`, labels: [{ name: `bounty: ${o.sats}` }] } });
    await page.reload({ waitUntil: "load" });
    await sleep(2500);
    // Register through the form, the way a contributor would.
    const address = o.address ?? "tlq1qq" + "fakeaddressforrehearsal".replace(/[^02-9ac-hj-np-z]/g, "q") + "q".repeat(30);
    await page.fill("#login", o.login);
    await sleep(500);
    await page.fill("#address", address);
    await sleep(800);
    await page.click('#form button[type="submit"]');
    await sleep(2500);
    mark("bounty", "contributor registered");
    await showBounties();
    await sleep(1500);
    await hook("pull_request", { action: "opened", number: pr, repository, pull_request: { number: pr, state: "open", merged: false, html_url: `https://github.com/${repoName}/pull/${pr}`, title: "Add a FAQ entry about Liquid payouts", body: `Closes #${n}`, user: { login: o.login }, labels: [] } });
    await sleep(3500);
    await hook("pull_request", { action: "closed", number: pr, repository, pull_request: {
      number: pr, state: "closed", merged: true, merged_at: new Date().toISOString(), html_url: `https://github.com/${repoName}/pull/${pr}`,
      title: "Add a FAQ entry about Liquid payouts", body: `Closes #${n}`, user: { login: o.login }, labels: [], merge_commit_sha: "0".repeat(40) } });
    const until = Date.now() + 90_000;
    while (Date.now() < until && !(await page.locator("#bounties .chip.c-paid").count())) await sleep(500);
    mark("bounty", (await page.locator("#bounties .chip.c-paid").count()) ? "bounty paid" : "not paid after 90 s");
    await sleep(5000);
  },

  async wallet(page) {
    await page.goto(`${URLS.wallet}?user=${encodeURIComponent(o.pilot)}`, { waitUntil: "load" });
    mark("wallet", "wallet open");
    await sleep(10_000);
  },
};

// ---- main --------------------------------------------------------------------

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const durations = {};
  const files = [];
  try {
    for (const name of o.scenes.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!scenes[name]) throw new Error(`unknown scene ${name}`);
      if (name === "recovery" && lastGlitchAt && o["glitch-pilot"] === o.pilot) {
        // The glitch used up the 60-payouts-a-minute recipient limit; a coin
        // now would fail with "Recipient limit reached" instead of recovering.
        const wait = lastGlitchAt + 62_000 - Date.now();
        if (wait > 0) { console.log(`waiting ${Math.round(wait / 1000)} s for the recipient limit window to pass`); await sleep(wait); }
      }
      console.log(`scene ${name}`);
      const dir = fs.mkdtempSync(path.join(o.out, ".rec-"));
      const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
      const page = await context.newPage();
      sceneStart = Date.now();
      let error = null;
      try { await scenes[name](page); } catch (e) { error = e; mark(name, `ERROR ${e.message}`); }
      durations[name] = +((Date.now() - sceneStart) / 1000).toFixed(1);
      const video = page.video();
      await context.close();
      const target = path.join(o.out, `${name}-${o.suffix}.webm`);
      fs.copyFileSync(await video.path(), target);
      fs.rmSync(dir, { recursive: true, force: true });
      files.push({ file: path.basename(target), mb: +(fs.statSync(target).size / 1e6).toFixed(1) });
      console.log(`  → ${target} (${durations[name]} s)`);
      if (error) console.error(error);
    }
  } finally {
    await browser.close();
    if (!process.env.RECORD_TMPDIR) fs.rmSync(TMP, { recursive: true, force: true });
  }
  const report = { base: o.base, offset: off, suffix: o.suffix, recordedAt: new Date().toISOString(), durations, totalSeconds: +((Date.now() - T0) / 1000).toFixed(1), files, timeline };
  fs.writeFileSync(path.join(o.out, `${o.suffix}-timings.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ durations, total: report.totalSeconds, files }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
