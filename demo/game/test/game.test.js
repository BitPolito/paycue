import test from "node:test";
import assert from "node:assert/strict";

import { BULLET_SPEED, Rounds, SHIP_Y, coinPosition, recipientError, schedule } from "../dist/game.js";

const liquid = "tlq1qqv3a0f0ag3hfnlmsmyy4wc06e2zhxaaqyphff75a77kxgxwjkvqcm7lg32cps4ys9cszwkylwuwzdlhasdgsws96j4f2sw0el";

function fairHit(coin) {
  const hitAt = coin.spawnAt + (0.4 / coin.speed) * 1000;
  const pos = coinPosition(coin, hitAt);
  return { coinId: coin.id, hitAt, shotAt: hitAt - ((SHIP_Y - pos.y) / BULLET_SPEED) * 1000 - 20, ...pos };
}

test("schedules are deterministic per seed and glitch rains coins", () => {
  assert.deepEqual(schedule(7, false), schedule(7, false));
  assert.ok(schedule(7, true).length > 5 * schedule(7, false).length);
});

test("only Lightning Addresses are accepted", () => {
  assert.equal(recipientError("ada@localhost:8091"), undefined);
  assert.match(recipientError(liquid), /contribution reward demo/);
  assert.match(recipientError("hello"), /Lightning Address/);
  assert.throws(() => new Rounds().start({ name: "x", recipient: "hello", glitch: false }), /Lightning Address/);
});

test("a fair hit is accepted and forged ones are refused", () => {
  const rounds = new Rounds();
  const t0 = 1_000_000;
  const session = rounds.start({ name: "ada", recipient: "ada@localhost:8091", glitch: false }, t0);
  const coin = session.coins[2];
  const claim = fairHit(coin);
  const at = session.startedAt + claim.hitAt + 200;
  assert.equal(rounds.verify(session, claim, at).ok, true);
  const refuse = (c, when = at) => rounds.verify(session, c, when).reason;
  assert.match(refuse({ ...claim, coinId: "nope" }), /No such coin/);
  assert.match(refuse({ ...claim, x: claim.x + 0.3 }), /does not match/);
  assert.match(refuse({ ...claim, shotAt: claim.hitAt - 5 }), /could not have reached/);
  assert.match(refuse(claim, session.startedAt + claim.hitAt - 2_000), /future/);
  assert.match(refuse(claim, session.startedAt + claim.hitAt + 10_000), /too late/);
  assert.match(refuse({ ...claim, hitAt: coin.spawnAt - 100 }), /not on screen/);
  assert.match(refuse(claim, session.endsAt + 5_000), /Round is over/);
});

test("hit rate is capped per session", () => {
  const rounds = new Rounds();
  const session = rounds.start({ name: "ada", recipient: "ada@localhost:8091", glitch: false }, 0);
  const claim = fairHit(session.coins[3]);
  const at = session.startedAt + claim.hitAt + 100;
  const results = Array.from({ length: 10 }, () => rounds.verify(session, claim, at));
  assert.equal(results.filter((r) => r.ok).length, 8);
  assert.match(results.at(-1).reason, /Too many hits/);
});
