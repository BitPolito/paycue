#!/usr/bin/env node
// Scripted player for end-to-end tests. Plays a round against a running
// Orbital Sats server using the server's own coin schedule, optionally tries
// cheats and replays, then reports what Paycue did with each payout.
//
//   node test/bot.mjs --server http://localhost:8090 --recipient ada@localhost:8091 --coins 5
//   node test/bot.mjs --glitch --coins 40            # money glitch: replays + policy cap
//   node test/bot.mjs --cheat                        # forged hits must all be rejected

import { parseArgs } from "node:util";

const { values: opt } = parseArgs({
  options: {
    server: { type: "string", default: "http://localhost:8090" },
    recipient: { type: "string", default: "bot@localhost:8091" },
    name: { type: "string", default: "bot" },
    coins: { type: "string", default: "5" },
    glitch: { type: "boolean", default: false },
    cheat: { type: "boolean", default: false },
    wait: { type: "string", default: "90" },
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) => {
  const res = await fetch(opt.server + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
function coinPosition(coin, t) {
  const age = (t - coin.spawnAt) / 1000;
  return { x: coin.x + coin.wobble * Math.sin(age * coin.wobbleHz * Math.PI * 2), y: -0.05 + coin.speed * age };
}

const started = await post("/api/session", { name: opt.name, recipient: opt.recipient, glitch: opt.glitch });
if (started.status !== 201) throw new Error(`start failed: ${JSON.stringify(started.body)}`);
const { round, token } = started.body;
const t0 = Date.now() + round.startsInMs;
const elapsed = () => Date.now() - t0;
console.log(`session ${round.id}${round.glitch ? " · glitch" : ""} · ${round.coins.length} coins scheduled`);

const results = { accepted: 0, rejected: [], duplicates: 0 };

if (opt.cheat) {
  await sleep(Math.max(0, round.startsInMs) + 2_500);
  const coin = round.coins.find((c) => c.spawnAt < elapsed() - 400) ?? round.coins[0];
  const t = elapsed();
  const pos = coinPosition(coin, t);
  const forged = [
    ["unknown coin", { coinId: "c9999", shotAt: t - 500, hitAt: t, ...pos }],
    ["wrong position", { coinId: coin.id, shotAt: t - 900, hitAt: t, x: 1 - pos.x, y: pos.y }],
    ["instant bullet", { coinId: coin.id, shotAt: t - 1, hitAt: t, ...pos }],
    ["from the future", { coinId: coin.id, shotAt: t + 4_000, hitAt: t + 5_000, ...coinPosition(coin, t + 5_000) }],
    ["future coin", (() => { const c = round.coins.at(-1); return { coinId: c.id, shotAt: t - 500, hitAt: t, ...coinPosition(c, t) }; })()],
  ];
  for (const [label, claim] of forged) {
    const r = await post(`/api/session/${round.id}/hit`, { token, ...claim });
    console.log(`  cheat "${label}": ${r.body.ok ? "ACCEPTED (bug!)" : `rejected · ${r.body.reason}`}`);
    if (r.body.ok) results.accepted += 1; else results.rejected.push(label);
  }
  const wrongToken = await post(`/api/session/${round.id}/hit`, { token: "nope", coinId: coin.id, shotAt: t - 900, hitAt: t, ...pos });
  console.log(`  cheat "wrong session token": HTTP ${wrongToken.status}`);
  await post(`/api/session/${round.id}/end`, { token });
  process.exit(results.accepted === 0 && wrongToken.status === 403 ? 0 : 1);
}

const wanted = Number(opt.coins);
for (const coin of round.coins.slice(0, wanted)) {
  // Hit each coin a third of the way down the screen.
  const hitAt = coin.spawnAt + ((0.35 + 0.05) / coin.speed) * 1000;
  const pos = coinPosition(coin, hitAt);
  const shotAt = hitAt - ((round.shipY - pos.y) / round.bulletSpeed) * 1000 - 30;
  const delay = t0 + hitAt - Date.now();
  if (delay > 0) await sleep(delay);
  const copies = round.glitch ? 3 : 1;
  for (let i = 0; i < copies; i += 1) {
    const r = await post(`/api/session/${round.id}/hit`, { token, coinId: coin.id, shotAt, hitAt, ...pos });
    if (r.body.duplicate) results.duplicates += 1;
    else if (r.body.ok) results.accepted += 1;
    else results.rejected.push(r.body.reason);
  }
}
await post(`/api/session/${round.id}/end`, { token });
console.log(`hits accepted ${results.accepted} · replays sent to Paycue ${results.duplicates} · rejected ${results.rejected.length}${results.rejected.length ? ` (${[...new Set(results.rejected)].join("; ")})` : ""}`);

// Wait for payouts to finish, then summarize.
const deadline = Date.now() + Number(opt.wait) * 1000;
let payouts = [];
while (Date.now() < deadline) {
  payouts = (await (await fetch(`${opt.server}/api/session/${round.id}`)).json()).payouts;
  const open = payouts.filter((p) => !["settled", "failed", "stuck"].includes(p.state));
  if (payouts.length >= results.accepted && open.length === 0) break;
  await sleep(1_000);
}
const byState = payouts.reduce((acc, p) => ({ ...acc, [p.state]: (acc[p.state] ?? 0) + 1 }), {});
console.log(`payouts ${payouts.length}: ${JSON.stringify(byState)}`);
for (const p of payouts.filter((p) => p.state !== "settled").slice(0, 5)) console.log(`  ${p.state} coin ${p.amountSat} sat · ${p.note ?? ""}`);
console.log(JSON.stringify({ session: round.id, accepted: results.accepted, duplicates: results.duplicates, rejected: results.rejected.length, payouts: byState }));
