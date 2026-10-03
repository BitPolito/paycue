// Orbital Sats client. The server owns coins and rewards; this file draws the
// round, moves the ship and reports hits.
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $("c");
  const app = document.querySelector(".app");
  const ctx = canvas.getContext("2d");
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = motionPreference.matches;
  motionPreference.addEventListener("change", (e) => { reduceMotion = e.matches; if (reduceMotion) sparks = []; });
  const coinImage = new Image();
  coinImage.src = "brand/bitpolito-b.svg";
  document.querySelectorAll("[data-port]").forEach((link) => {
    const url = new URL(location.href);
    url.hostname = location.hostname; url.port = link.dataset.port;
    url.pathname = "/"; url.search = ""; url.hash = "";
    link.href = url.href;
  });
  let config = { walletDomain: "localhost:8091", walletUrl: "http://localhost:8091" };
  // The wallet runs next to the game on port 8091, whichever address the page was opened on.
  const walletBase = () => location.protocol + "//" + location.hostname + ":8091";
  let W = 0, H = 0, DPR = 1;

  // ---- same maths as the server (game.ts) ----
  function coinPosition(coin, t) {
    const age = (t - coin.spawnAt) / 1000;
    return { x: coin.x + coin.wobble * Math.sin(age * coin.wobbleHz * Math.PI * 2), y: -0.05 + coin.speed * age };
  }
  const lifetime = (coin) => ((1.1 + 0.05) / coin.speed) * 1000;

  // ---- state ----
  let round = null, token = null, startAt = 0, running = false;
  let ship = { x: 0.5 }, bullets = [], enemies = [], sparks = [], pops = [];
  let taken = new Set(), lives = 3, coinsHit = 0, paidSat = 0, keys = {}, pointerX = null, firing = false, lastShot = 0, nextEnemy = 0;
  const stars = Array.from({ length: 42 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }));

  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  addEventListener("resize", resize);
  resize();

  // Play area keeps a portrait-ish aspect so hit maths match on every screen.
  function area() {
    const w = Math.min(W, H * 0.8);
    return { x0: (W - w) / 2, w, h: H };
  }
  const px = (x) => area().x0 + x * area().w;
  const py = (y) => y * area().h;

  // ---- menu ----
  fetch("/api/config").then((r) => r.json()).then((c) => {
    config = c;
    if (!c.glitchAllowed) $("glitchRow").hidden = true;
  }).catch(() => { $("err").textContent = "Game service unreachable. Reload to reconnect."; });
  // ---- who decides: the operator's policy, the network, the receiver ----
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const GROUPS = {
    operator: { title: "Operator", who: "you, in the policy" },
    network: { title: "Network", who: "Lightning itself" },
    receiver: { title: "Receiver", who: "the player's wallet" },
    provider: { title: "Provider", who: "the route's service" },
  };
  let recipientRule = null; // { name, max, windowMs } for the live meter
  function loadRules() {
    fetch("/api/policy").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((p) => {
      const by = { operator: [], network: [], receiver: [], provider: [] };
      for (const r of p.rules || []) {
        const text = (r.description || r.name).replace(/^game: /, "");
        by.operator.push({ key: r.name, text, verdict: r.name === "pause" ? "holds" : "denies" });
        const m = r.name.endsWith("recipient_limit") && /at most (\d+) payouts per (\d+) (min|s)/.exec(text);
        if (m) recipientRule = { name: r.name, max: Number(m[1]), windowMs: Number(m[2]) * (m[3] === "min" ? 60_000 : 1000) };
      }
      for (const route of p.routes || []) for (const l of route.limits || []) (by[l.setBy] ?? by.operator).push({ key: null, text: `${l.label}: ${l.value}`, verdict: l.setBy === "operator" ? "denies" : "fails" });
      $("groups").innerHTML = Object.entries(by).filter(([, list]) => list.length).map(([who, list]) => `
        <section class="group" data-group="${who}">
          <header><h3><span class="chip ${who}">${GROUPS[who].title}</span></h3><span>${GROUPS[who].who}</span></header>
          <ul>${list.map((item) => `<li${item.key ? ` data-rule="${esc(item.key)}"` : ""}><span>${esc(item.text)}</span><span class="v">${item.verdict}</span>${item.key === recipientRule?.name ? '<div class="meter" id="meter"><span class="bar"><i></i></span><span class="n">0 / ' + recipientRule.max + "</span></div>" : ""}</li>`).join("")}</ul>
        </section>`).join("");
      renderTallies(); renderMeter();
    }).catch(() => { $("groups").innerHTML = '<section class="group"><p class="intro">Rules unavailable: payout service unreachable. They reload when it is back.</p></section>'; });
  }
  loadRules();
  // The operator's rules are tallied per rule; the network and the receiver per party.
  const decisionKey = (d) => (d.by === "operator" && d.rule ? `rule:${d.rule}` : `group:${d.by}`);
  function decidedTarget(key) {
    const [kind, name] = key.split(/:(.*)/s);
    return kind === "rule" ? $("groups").querySelector(`li[data-rule="${CSS.escape(name)}"]`) : $("groups").querySelector(`[data-group="${CSS.escape(name)}"] header`);
  }
  function renderTallies() {
    const counts = new Map();
    for (const r of rowsById.values()) if (r.decision && r.decision.verdict !== "uncertain") {
      const k = decisionKey(r.decision); const c = counts.get(k) ?? { n: 0, held: r.decision.verdict === "held" };
      c.n += 1; counts.set(k, c);
    }
    $("groups").querySelectorAll(".tally").forEach((t) => t.remove());
    for (const [k, c] of counts) {
      const target = decidedTarget(k); if (!target) continue;
      const el = target.querySelector(".v") ?? target;
      el.insertAdjacentHTML("beforeend", `<span class="tally${c.held ? " held" : ""}" title="${c.held ? "payouts held" : "payouts stopped"}">${c.held ? "HELD" : "✕"} ${c.n}</span>`);
    }
  }
  function fire(decision) {
    const el = decidedTarget(decisionKey(decision));
    const li = el?.closest("li") ?? el?.closest(".group");
    if (!li) return;
    li.classList.remove("fired"); void li.offsetWidth; li.classList.add("fired");
    if ($("deciders").open) li.scrollIntoView({ block: "nearest" });
  }
  function renderMeter() {
    const meter = $("meter"); if (!meter || !recipientRule) return;
    const since = Date.now() - recipientRule.windowMs;
    let used = 0;
    for (const r of rowsById.values()) if (round && r.sessionId === round.id && r.state !== "failed" && (firstSeen.get(r.payoutId) ?? 0) > since) used += 1;
    used = Math.min(used, recipientRule.max);
    meter.querySelector("i").style.width = `${(used / recipientRule.max) * 100}%`;
    meter.querySelector(".n").textContent = `${used} / ${recipientRule.max} this round`;
    meter.classList.toggle("full", used >= recipientRule.max);
  }
  setInterval(renderMeter, 1000);
  function levelHint() {
    const v = $("recipient").value.trim();
    $("levelHint").textContent = /@/.test(v) ? "Every coin pays sats over Lightning, instantly" : "";
  }
  $("recipient").addEventListener("input", levelHint);
  $("useLn").addEventListener("click", () => {
    const name = ($("name").value.trim() || "ada").toLowerCase().replace(/[^a-z0-9._-]/g, "");
    $("recipient").value = `${name}@${config.walletDomain}`; levelHint();
  });
  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("err").textContent = "";
    const body = {
      name: $("name").value.trim(),
      recipient: $("recipient").value.trim(),
      glitch: $("glitch").checked,
    };
    $("launch").disabled = true;
    try {
      const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { $("err").textContent = data.error || "Could not start the round. Please try again."; return; }
      start(data.round, data.token);
    } catch {
      $("err").textContent = "Game service unreachable. Please try launching again.";
    } finally { $("launch").disabled = false; }
  });
  $("again").addEventListener("click", () => { $("over").hidden = true; $("menu").hidden = false; $("name").focus({ preventScroll: true }); });

  function start(r, t) {
    round = r; token = t;
    startAt = performance.now() + r.startsInMs;
    bullets = []; enemies = []; sparks = []; pops = []; taken = new Set();
    lives = 3; coinsHit = 0; paidSat = 0; nextEnemy = 1500;
    // Round clocks restart at zero, so the fire cooldown must too.
    lastShot = -Infinity; keys = {}; firing = false; pointerX = null; ship.x = 0.5;
    running = true; paidHits = [];
    $("breakit").hidden = !config.glitchAllowed;
    $("menu").hidden = true; $("over").hidden = true;
    app.classList.add("playing"); resize();
    canvas.focus({ preventScroll: true });
    canvas.scrollIntoView({ block: "nearest", behavior: "instant" });
    updateHud();
  }
  const elapsed = () => performance.now() - startAt;

  function finish(reason) {
    if (!running) return;
    running = false;
    $("breakit").hidden = true;
    fetch(`/api/session/${round.id}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {});
    $("overTitle").textContent = reason;
    $("overStats").textContent = `${coinsHit} golden coins · ${paidSat.toLocaleString()} sat paid so far`;
    $("overNote").textContent = "Payouts keep settling in the feed.";
    const user = ($("recipient").value.split("@")[0] || "").toLowerCase();
    $("walletLink").href = `${walletBase()}/?user=${encodeURIComponent(user)}`;
    $("over").hidden = false;
    app.classList.remove("playing"); resize();
    $("again").focus({ preventScroll: true });
  }

  // ---- input ----
  const key = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  addEventListener("keydown", (e) => { keys[key(e)] = true; if (running && [" ", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
    if (running && ["ArrowLeft", "ArrowRight", "a", "d"].includes(key(e))) pointerX = null; });
  addEventListener("keyup", (e) => { keys[key(e)] = false; });
  // A key released while the window was in the background never sends keyup.
  addEventListener("blur", () => { keys = {}; firing = false; });
  canvas.addEventListener("pointerdown", (e) => { pointerX = e.clientX; firing = true; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || firing) pointerX = e.clientX; });
  canvas.addEventListener("pointerup", () => { firing = false; });
  canvas.addEventListener("pointercancel", () => { firing = false; });

  // ---- try to break it: the same requests a cheater would send ----
  let paidHits = [];
  const post = (path, body) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...body }) })
    .catch(() => { pops.push({ x: 0.5, y: 0.45, text: "Game service unreachable", t: performance.now() }); });
  $("breakit").addEventListener("click", async (e) => {
    const kind = e.target.closest("[data-break]")?.dataset.break;
    if (!kind || !running) return;
    canvas.focus({ preventScroll: true });
    const t = elapsed();
    if (kind === "forge") {
      // A coin on screen right now, claimed far from where it really is.
      // Never a coin already paid: that would reach Paycue as a replay instead.
      const coin = round.coins.find((c) => !taken.has(c.id) && t > c.spawnAt + 300 && t < c.spawnAt + lifetime(c))
        ?? round.coins.find((c) => !taken.has(c.id));
      if (!coin) return;
      const pos = coinPosition(coin, t);
      await post(`/api/session/${round.id}/hit`, { coinId: coin.id, shotAt: t - 600, hitAt: t, x: Math.min(0.95, pos.x + 0.3), y: pos.y });
      pops.push({ x: 0.5, y: 0.5, text: "Forged hit sent", t: performance.now() });
    } else if (kind === "replay") {
      const hit = paidHits.at(-1);
      if (!hit) { pops.push({ x: 0.5, y: 0.5, text: "Hit a coin first, then replay it", t: performance.now() }); return; }
      await post(`/api/session/${round.id}/hit`, hit);
      pops.push({ x: 0.5, y: 0.5, text: "Paid coin replayed", t: performance.now() });
    } else if (kind === "oversized") {
      await post(`/api/session/${round.id}/oversized`, {});
      pops.push({ x: 0.5, y: 0.5, text: "Asked for 500 sat", t: performance.now() });
    }
  });

  // ---- hits ----
  async function reportHit(coin, bullet, t, pos) {
    const body = JSON.stringify({ token, coinId: coin.id, shotAt: bullet.shotAt, hitAt: t, x: pos.x, y: pos.y });
    const copies = round.glitch ? 3 : 1;
    for (let i = 0; i < copies; i += 1) {
      let data;
      try {
        const res = await fetch(`/api/session/${round.id}/hit`, { method: "POST", headers: { "content-type": "application/json" }, body });
        data = await res.json();
      } catch {
        data = { ok: false, reason: "game service unreachable" };
      }
      if (i > 0) continue;
      if (data.ok) {
        const { token: _token, ...claim } = JSON.parse(body);
        paidHits.push(claim);
        coinsHit = data.coinsHit ?? coinsHit + 1;
        pops.push({ x: pos.x, y: pos.y, text: `+${data.sats} sat`, color: "#FFFFFF", t: performance.now() });
      } else {
        pops.push({ x: pos.x, y: pos.y, text: "✕ " + (data.reason || data.error || "hit not counted"), color: "#FFFFFF", t: performance.now() });
      }
      updateHud();
    }
  }

  // ---- loop ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt, now);
    draw(now);
    requestAnimationFrame(frame);
  }

  function update(dt) {
    if (!running) return;
    const t = elapsed();
    if (t > round.roundMs) return finish("TIME UP");
    const s = round.settings;
    // ship
    const speed = 1.1;
    if (keys.ArrowLeft || keys.a) ship.x -= speed * dt;
    if (keys.ArrowRight || keys.d) ship.x += speed * dt;
    if (pointerX !== null) {
      const target = (pointerX - canvas.getBoundingClientRect().left - area().x0) / area().w;
      ship.x += (target - ship.x) * Math.min(1, dt * 12);
    }
    ship.x = Math.max(0.04, Math.min(0.96, ship.x));
    // fire
    if ((keys[" "] || firing) && t - lastShot > (round.glitch ? 110 : 190) && t > 0) {
      lastShot = t;
      bullets.push({ x: ship.x, y: round.shipY, shotAt: t });
    }
    for (const b of bullets) b.y -= round.bulletSpeed * dt;
    bullets = bullets.filter((b) => b.y > -0.05 && !b.dead);
    // enemies (client-side hazard, never paid)
    if (t > nextEnemy) {
      nextEnemy = t + s.enemyEveryMs * (0.6 + Math.random() * 0.8);
      enemies.push({ x: 0.06 + Math.random() * 0.88, y: -0.05, v: s.enemySpeed * (0.8 + Math.random() * 0.5), r: 0.028 + Math.random() * 0.02, spin: Math.random() * 6 });
    }
    for (const en of enemies) { en.y += en.v * dt; en.spin += dt; }
    for (const en of enemies) {
      for (const b of bullets) if (!b.dead && Math.hypot(b.x - en.x, (b.y - en.y) * 0.8) < en.r) { b.dead = true; en.dead = true; burst(en.x, en.y, "#FFFFFF"); }
      if (!en.dead && Math.hypot(ship.x - en.x, round.shipY - en.y) < en.r + 0.03) {
        en.dead = true; lives -= 1; burst(ship.x, round.shipY, "#FFFFFF");
        pops.push({ x: ship.x, y: round.shipY - 0.06, text: lives > 0 ? `SHIELD −1 · ${lives} LEFT` : "SHIELDS DOWN", t: performance.now() });
        $("shieldBox").classList.remove("hit"); void $("shieldBox").offsetWidth; $("shieldBox").classList.add("hit");
        updateHud();
        if (lives <= 0) return finish("SHIELDS DOWN");
      }
    }
    enemies = enemies.filter((en) => !en.dead && en.y < 1.1);
    // coins
    for (const coin of round.coins) {
      if (taken.has(coin.id) || t < coin.spawnAt || t > coin.spawnAt + lifetime(coin)) continue;
      const pos = coinPosition(coin, t);
      for (const b of bullets) {
        if (!b.dead && Math.hypot(b.x - pos.x, b.y - pos.y) < 0.038) {
          b.dead = true; taken.add(coin.id); burst(pos.x, pos.y, "#FFFFFF", 22);
          reportHit(coin, b, t, pos);
          break;
        }
      }
    }
    for (const sp of sparks) { sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.life -= dt; }
    sparks = sparks.filter((sp) => sp.life > 0);
    updateTimer(t);
  }

  function burst(x, y, color, n = 12) {
    if (reduceMotion) return;
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2, v = 0.1 + Math.random() * 0.35;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.4, color });
    }
  }

  // Rendering alone snaps to a 2-unit grid. Physics and hit reports retain
  // the exact normalized coordinates from coinPosition().
  const grid = (v) => Math.round(v / 2) * 2;
  const shipPixels = [
    "000010000", "000111000", "000111000", "001101100",
    "011101110", "111111111", "110111011", "100010001",
  ];
  const rockPixels = [
    "001111000", "011001110", "110000010", "100000011",
    "100000001", "110000011", "010000110", "011111100",
  ];
  function drawPixels(rows, x, y, cell) {
    const left = grid(x - rows[0].length * cell / 2);
    const top = grid(y - rows.length * cell / 2);
    ctx.fillStyle = "#FFFFFF";
    rows.forEach((row, iy) => {
      for (let ix = 0; ix < row.length; ix += 1) {
        if (row[ix] === "1") ctx.fillRect(left + ix * cell, top + iy * cell, cell, cell);
      }
    });
  }

  function draw(now) {
    ctx.fillStyle = "#001CE0"; ctx.fillRect(0, 0, W, H);
    const a = area();
    ctx.fillStyle = "#FFFFFF";
    for (const st of stars) {
      if (running && !reduceMotion) st.y = (st.y + st.z * 0.0009) % 1;
      ctx.fillRect(grid(a.x0 + st.x * a.w), grid(st.y * H), 2, 2);
    }
    if (!round) return;
    const t = elapsed();
    const unit = a.w;
    for (const coin of round.coins) {
      if (taken.has(coin.id) || t < coin.spawnAt || t > coin.spawnAt + lifetime(coin)) continue;
      const p = coinPosition(coin, t);
      drawCoin(px(p.x), py(p.y), unit * 0.03);
    }
    for (const en of enemies) drawRock(px(en.x), py(en.y), en.r * unit);
    ctx.fillStyle = "#FFFFFF";
    for (const b of bullets) ctx.fillRect(grid(px(b.x) - 2), grid(py(b.y) - 2), 4, 4);
    if (running) drawShip(px(ship.x), py(round.shipY), unit * 0.035);
    for (const sp of sparks) ctx.fillRect(grid(px(sp.x)), grid(py(sp.y)), 2, 2);
    ctx.textAlign = "center"; ctx.font = "600 13px 'JetBrains Mono', monospace";
    pops = pops.filter((p) => now - p.t < 1400);
    for (const p of pops) {
      const rise = reduceMotion ? 0 : Math.floor((now - p.t) / 140) * 2;
      ctx.fillText(p.text.slice(0, 42), grid(px(Math.min(0.8, Math.max(0.2, p.x)))), grid(py(p.y)) - rise);
    }
    if (running && t < 0) {
      ctx.font = "700 40px 'JetBrains Mono', monospace";
      ctx.fillText(String(Math.ceil(-t / 1000)), grid(W / 2), grid(H / 2));
    }
  }

  function drawCoin(x, y, r) {
    if (!coinImage.complete || !coinImage.naturalWidth) return;
    const cell = Math.max(2, grid(r * 2 / 11));
    const size = cell * 11;
    // Trim only transparent padding when drawing the unchanged official mark.
    // Its 140-unit source pixels map exactly onto our 2-unit square grid.
    ctx.drawImage(coinImage, 380, 380, 1540, 1540, grid(x - size / 2), grid(y - size / 2), size, size);
  }
  function drawRock(x, y, r) {
    drawPixels(rockPixels, x, y, Math.max(2, grid(r * 2 / 9)));
  }
  function drawShip(x, y, s) {
    drawPixels(shipPixels, x, y, Math.max(2, grid(s * 2 / 9)));
  }

  // A pixel shield on the same 2-unit grid as the ship; lost shields keep only the outline.
  const SHIELD = ["01111110", "11111111", "11111111", "11111111", "01111110", "01111110", "00111100", "00011000"];
  const SHIELD_EDGE = ["01111110", "10000001", "10000001", "10000001", "01000010", "01000010", "00100100", "00011000"];
  function shieldSvg(full) {
    const rows = full ? SHIELD : SHIELD_EDGE;
    const rects = rows.flatMap((row, y) => [...row].map((c, x) => (c === "1" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ""))).join("");
    return `<svg viewBox="0 0 8 8" class="${full ? "" : "lost"}" fill="#FFFFFF" aria-hidden="true">${rects}</svg>`;
  }

  function updateTimer(t) { $("time").textContent = String(Math.max(0, Math.ceil((round.roundMs - t) / 1000))); }
  function updateHud() {
    $("coins").textContent = coinsHit;
    $("paid").textContent = paidSat.toLocaleString();
    const left = Math.max(0, lives);
    $("lives").innerHTML = [0, 1, 2].map((i) => shieldSvg(i < left)).join("") + `<span class="count">${left}/3</span>`;
    $("lives").setAttribute("aria-label", `${left} of 3 shields`);
    $("lastShield").hidden = !(running && left === 1);
  }

  // ---- feed ----
  const feed = $("feed");
  const items = new Map();
  function label(row) {
    return `${row.pilot} · Coin ${row.amountSat} sat`;
  }
  const PARTY = { operator: "operator rule", network: "the Lightning network", receiver: "the receiver's wallet", paycue: "a Paycue safety check" };
  function whyLabel(d) {
    const rule = d.rule ? ` · <span class="rule">${esc(d.rule.replace(/^game\./, "").replace(/_/g, " "))}</span>` : "";
    if (d.verdict === "denied") return `Denied by ${PARTY[d.by]}${rule}`;
    if (d.verdict === "held") return `Held by ${PARTY[d.by]}${rule}`;
    if (d.verdict === "uncertain") return "Uncertain · checking with the node, never resent blindly";
    return `Failed at ${PARTY[d.by]}${rule}`;
  }
  function renderRow(row, quiet = false) {
    let li = items.get(row.payoutId);
    const isNew = !li;
    if (!li) { li = document.createElement("li"); items.set(row.payoutId, li); feed.prepend(li); }
    const d = row.decision;
    const chip = d?.verdict === "held" ? "held" : row.state;
    li.innerHTML = `<div class="top"><span class="who"></span><span class="chip ${chip}">${chip}</span></div>` +
      (d ? `<div class="why ${d.verdict}"><span class="label">${whyLabel(d)}</span><p></p></div>` : '<div class="note"></div>');
    li.querySelector(".who").textContent = label(row);
    if (d) li.querySelector(".why p").textContent = d.reason;
    else li.querySelector(".note").textContent = row.note || "→ Lightning";
    if (!isNew) { li.classList.remove("flash"); void li.offsetWidth; }
    li.classList.add("flash");
    if (!quiet && d && d.verdict !== "uncertain" && lastVerdict.get(row.payoutId) !== d.verdict) fire(d);
    lastVerdict.set(row.payoutId, d?.verdict);
    if (round && row.sessionId === round.id) {
      paidSat = latestPaid(round.id);
      updateHud();
    }
    trim();
  }
  const rowsById = new Map();
  const firstSeen = new Map();
  const lastVerdict = new Map();
  function remember(r) {
    rowsById.set(r.payoutId, r);
    if (!firstSeen.has(r.payoutId)) firstSeen.set(r.payoutId, Date.now());
    while (rowsById.size > 400) { const k = rowsById.keys().next().value; rowsById.delete(k); firstSeen.delete(k); lastVerdict.delete(k); }
  }
  function latestPaid(sessionId) {
    let sum = 0;
    for (const r of rowsById.values()) if (r.sessionId === sessionId && r.state === "settled") sum += r.amountSat;
    return sum;
  }
  // Events from the game itself. `why` adds a reason bar: who refused and why.
  function note(text, why) {
    const li = document.createElement("li");
    li.className = "game";
    if (why) {
      li.innerHTML = `<div class="why ${why.tone}"><span class="label"></span><p></p></div>`;
      li.querySelector(".label").textContent = why.label;
      li.querySelector("p").textContent = text;
    } else {
      li.innerHTML = '<span class="when"></span>';
      li.querySelector(".when").textContent = text;
    }
    feed.prepend(li); trim();
  }
  // Replays arrive in bursts during the money glitch: one counting row, kept on top.
  let replays = null;
  function replayed(text) {
    if (!replays?.isConnected) { note(text, { tone: "paycue-note", label: "" }); replays = feed.firstElementChild; replays.dataset.n = "0"; }
    replays.dataset.n = String(Number(replays.dataset.n) + 1);
    replays.querySelector(".label").textContent = `Paycue · paid once · ${replays.dataset.n} replay${replays.dataset.n === "1" ? "" : "s"} ignored`;
    replays.querySelector("p").textContent = text;
    if (feed.firstElementChild !== replays) feed.prepend(replays);
  }
  function trim() { while (feed.children.length > 120) feed.lastChild.remove(); }
  // Connection state in the feed header: the game service's stream, then the payout service behind it.
  let gameUp = false, serviceUp = null;
  function showService() {
    const chip = $("svc");
    const [text, cls, info] = !gameUp
      ? ["reconnecting", "wait", "Game service connection lost. Reconnecting…"]
      : serviceUp === false
        ? ["payouts offline", "down", "Payout service unreachable. Hits are still checked; new payouts can't be sent until it is back."]
        : ["live", "", "Every coin becomes a Paycue payout. If one stops, it says who stopped it and why."];
    chip.textContent = text; chip.className = "chip " + cls;
    $("feedInfo").textContent = info;
  }
  function connect() {
    const es = new EventSource("/api/feed");
    es.onopen = () => { gameUp = true; showService(); };
    es.onerror = () => { gameUp = false; showService(); };
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "snapshot") {
        gameUp = true; serviceUp = msg.serviceConnected !== false; showService();
        feed.replaceChildren(); items.clear(); rowsById.clear(); firstSeen.clear(); lastVerdict.clear();
        for (const r of msg.rows) { remember(r); renderRow(r, true); }
        renderTallies();
      } else if (msg.type === "row") { remember(msg.row); renderRow(msg.row); renderTallies(); renderMeter(); }
      else if (msg.type === "reset") { feed.replaceChildren(); items.clear(); rowsById.clear(); firstSeen.clear(); lastVerdict.clear(); renderTallies(); note("Demo reset"); }
      else if (msg.type === "game") {
        if (msg.event === "hit_rejected") note(`${msg.pilot}: ${msg.note}`, { tone: "denied", label: "Not paid · refused by the game server" });
        else if (msg.event === "duplicate") replayed(msg.note);
        else if (msg.event === "round_start") { replays = null; note(`${msg.pilot} launched${msg.glitch ? " · MONEY GLITCH" : ""}`); }
        else if (msg.event === "submit_failed") note(`${msg.pilot}: ${msg.note}`, { tone: "denied", label: "Not submitted · payout service" });
      } else if (msg.type === "service") {
        // The game server's follower retries every 2 s; only report changes.
        const changed = serviceUp !== msg.connected;
        serviceUp = msg.connected; showService();
        if (changed) { note(msg.connected ? "Payout service connected" : "Payout service unreachable"); loadRules(); }
      }
    };
  }
  connect();
  updateHud();
  requestAnimationFrame(frame);
})();
