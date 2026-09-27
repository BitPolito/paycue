/**
 * Server-authoritative coin rounds. The server owns the coin schedule, the
 * reward per coin and the recipient; the client only reports hits, which are
 * checked against the schedule before any payout is proposed.
 */
import { randomBytes, randomUUID } from "node:crypto";

export type Difficulty = "easy" | "normal" | "hard";
export type Level = "lightning" | "liquid";

export type DifficultySettings = {
  label: string;
  coinEveryMs: number;
  coinSpeed: number;
  enemyEveryMs: number;
  enemySpeed: number;
  satsPerCoin: number;
};

export const DIFFICULTY: Record<Difficulty, DifficultySettings> = {
  easy: { label: "Easy", coinEveryMs: 2_600, coinSpeed: 0.16, enemyEveryMs: 1_900, enemySpeed: 0.14, satsPerCoin: 10 },
  normal: { label: "Normal", coinEveryMs: 2_000, coinSpeed: 0.22, enemyEveryMs: 1_200, enemySpeed: 0.2, satsPerCoin: 21 },
  hard: { label: "Hard", coinEveryMs: 1_500, coinSpeed: 0.3, enemyEveryMs: 700, enemySpeed: 0.28, satsPerCoin: 42 },
};

export const ROUND_MS = 60_000;
/** Money glitch: coins rain and every hit is sent three times. Demo only. */
export const GLITCH_COIN_EVERY_MS = 140;
export const SHIP_Y = 0.92;
export const BULLET_SPEED = 1.4;
/** Level 2 pays one round prize, sized to the maker's 50,000 sat swap minimum. */
export const ROUND_PRIZE_SAT = 50_000;
export const PRIZE_COINS_NEEDED = 3;

export type Coin = {
  id: string;
  /** ms after round start. */
  spawnAt: number;
  x: number;
  speed: number;
  wobble: number;
  wobbleHz: number;
};

export type Session = {
  id: string;
  token: string;
  name: string;
  recipient: string;
  level: Level;
  difficulty: Difficulty;
  glitch: boolean;
  seed: number;
  startedAt: number;
  endsAt: number;
  coins: Coin[];
  claimed: Set<string>;
  hitTimes: number[];
  coinsHit: number;
  satsProposed: number;
  prizeSubmitted: boolean;
  ended: boolean;
};

export type HitClaim = {
  coinId: string;
  /** ms after round start when the bullet was fired. */
  shotAt: number;
  /** ms after round start when it hit. */
  hitAt: number;
  x: number;
  y: number;
};

export type HitVerdict = { ok: true; coin: Coin } | { ok: false; reason: string };

/** Deterministic PRNG so the schedule can be regenerated from the seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function schedule(seed: number, difficulty: Difficulty, glitch: boolean): Coin[] {
  const random = mulberry32(seed);
  const settings = DIFFICULTY[difficulty];
  const every = glitch ? GLITCH_COIN_EVERY_MS : settings.coinEveryMs;
  const coins: Coin[] = [];
  for (let t = 900, i = 0; t < ROUND_MS - 1_500; i += 1) {
    coins.push({
      id: `c${i}`,
      spawnAt: Math.round(t),
      x: 0.08 + random() * 0.84,
      speed: settings.coinSpeed * (glitch ? 1.6 : 0.85 + random() * 0.3),
      wobble: glitch ? 0.02 : 0.02 + random() * 0.05,
      wobbleHz: 0.4 + random() * 0.6,
    });
    t += every * (glitch ? 1 : 0.7 + random() * 0.6);
  }
  return coins;
}

/** Coin position at `t` ms after round start, in 0..1 screen units. */
export function coinPosition(coin: Coin, t: number): { x: number; y: number } {
  const age = (t - coin.spawnAt) / 1000;
  return {
    x: coin.x + coin.wobble * Math.sin(age * coin.wobbleHz * Math.PI * 2),
    y: -0.05 + coin.speed * age,
  };
}

export function coinLifetimeMs(coin: Coin): number {
  return ((1.1 + 0.05) / coin.speed) * 1000;
}

export function classifyRecipient(recipient: string): Level | undefined {
  const text = recipient.trim();
  if (/^(?:lightning:)?[a-z0-9._+-]+@[a-z0-9.-]+(?::\d+)?$/i.test(text)) return "lightning";
  if (/^(?:liquid:)?(?:tlq1|tex1|lq1|ex1)[02-9ac-hj-np-z]{20,}/i.test(text)) return "liquid";
  return undefined;
}

export class Rounds {
  private readonly sessions = new Map<string, Session>();

  start(input: { name: string; recipient: string; difficulty: Difficulty; glitch: boolean }, now = Date.now()): Session {
    const level = classifyRecipient(input.recipient);
    if (level === undefined) throw new Error("Enter a Lightning Address (name@domain) or a Liquid testnet address");
    const seed = randomBytes(4).readUInt32BE(0);
    const session: Session = {
      id: randomUUID(),
      token: randomBytes(18).toString("base64url"),
      name: input.name.slice(0, 24) || "pilot",
      recipient: input.recipient.trim(),
      level,
      difficulty: input.difficulty,
      glitch: input.glitch,
      seed,
      startedAt: now + 1_500,
      endsAt: now + 1_500 + ROUND_MS,
      coins: schedule(seed, input.difficulty, input.glitch),
      claimed: new Set(),
      hitTimes: [],
      coinsHit: 0,
      satsProposed: 0,
      prizeSubmitted: false,
      ended: false,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  all(): Session[] {
    return [...this.sessions.values()];
  }

  /** End every round. Used on reset so no old hit can be replayed into a fresh database. */
  clear(): void {
    this.sessions.clear();
  }

  /** Check a reported hit against the server's own schedule and clock. */
  verify(session: Session, claim: HitClaim, now = Date.now()): HitVerdict {
    const elapsed = now - session.startedAt;
    if (session.ended || now > session.endsAt + 2_000) return { ok: false, reason: "Round is over" };
    if (elapsed < 0) return { ok: false, reason: "Round has not started" };
    const coin = session.coins.find((candidate) => candidate.id === claim.coinId);
    if (coin === undefined) return { ok: false, reason: "No such coin in this round" };
    if (![claim.shotAt, claim.hitAt, claim.x, claim.y].every(Number.isFinite)) return { ok: false, reason: "Malformed hit" };
    if (claim.hitAt > elapsed + 300) return { ok: false, reason: "Hit reported from the future" };
    if (elapsed - claim.hitAt > 4_000) return { ok: false, reason: "Hit reported too late" };
    if (claim.hitAt < coin.spawnAt || claim.hitAt > coin.spawnAt + coinLifetimeMs(coin)) {
      return { ok: false, reason: "Coin was not on screen at that time" };
    }
    const expected = coinPosition(coin, claim.hitAt);
    if (Math.hypot(expected.x - claim.x, expected.y - claim.y) > 0.07) {
      return { ok: false, reason: "Hit position does not match the coin's path" };
    }
    const travelMs = ((SHIP_Y - claim.y) / BULLET_SPEED) * 1000;
    if (claim.hitAt - claim.shotAt < travelMs - 150) return { ok: false, reason: "Bullet could not have reached the coin that fast" };
    session.hitTimes = session.hitTimes.filter((t) => now - t < 1_000);
    if (session.hitTimes.length >= (session.glitch ? 30 : 8)) return { ok: false, reason: "Too many hits per second" };
    session.hitTimes.push(now);
    return { ok: true, coin };
  }

  /** Public view sent to the client: everything needed to draw the round. */
  view(session: Session): Record<string, unknown> {
    return {
      id: session.id,
      name: session.name,
      level: session.level,
      difficulty: session.difficulty,
      settings: DIFFICULTY[session.difficulty],
      glitch: session.glitch,
      startsInMs: session.startedAt - Date.now(),
      roundMs: ROUND_MS,
      coins: session.coins,
      shipY: SHIP_Y,
      bulletSpeed: BULLET_SPEED,
      prize: session.level === "liquid" ? { sat: ROUND_PRIZE_SAT, coinsNeeded: PRIZE_COINS_NEEDED } : null,
    };
  }

  static newId(): string {
    return randomUUID();
  }
}
