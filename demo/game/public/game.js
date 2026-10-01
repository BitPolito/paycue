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
  function loadRules() {
    fetch("/api/policy").then((r) => r.json()).then((p) => {
      const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      const rules = p.rules.map((r) => `<li><span>${esc((r.description || r.name).replace(/^game: /, ""))}</span><span class="by operator">operator</span></li>`);
      const limits = p.routes.flatMap((route) => route.limits.map((l) => `<li><span>${esc(route.network)} · ${esc(l.label)}: ${esc(l.value)}</span><span class="by ${esc(l.setBy)}">${esc(l.setBy)}</span></li>`));
      $("rules").innerHTML = [...rules, ...limits].join("");
    }).catch(() => { $("rules").innerHTML = "<li>Rules unavailable: payout service unreachable</li>"; });
  }
  loadRules();
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
      difficulty: document.querySelector('input[name="d"]:checked').value,
      glitch: $("glitch").checked,
    };
    $("launch").disabled = true;
    try {
      const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { $("err").textContent = data.error; return; }
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
    running = true;
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
    fetch(`/api/session/${round.id}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    $("overTitle").textContent = reason;
    $("overStats").textContent = `${coinsHit} golden coins · ${paidSat.toLocaleString()} sat paid so far`;
    $("overNote").textContent = "Payouts keep settling in the feed.";
    const user = ($("recipient").value.split("@")[0] || "").toLowerCase();
    $("walletLink").href = `${config.walletUrl}/?user=${encodeURIComponent(user)}`;
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

  // ---- hits ----
  async function reportHit(coin, bullet, t, pos) {
    const body = JSON.stringify({ token, coinId: coin.id, shotAt: bullet.shotAt, hitAt: t, x: pos.x, y: pos.y });
    const copies = round.glitch ? 3 : 1;
    for (let i = 0; i < copies; i += 1) {
      const res = await fetch(`/api/session/${round.id}/hit`, { method: "POST", headers: { "content-type": "application/json" }, body });
      const data = await res.json();
      if (i > 0) continue;
      if (data.ok) {
        coinsHit = data.coinsHit ?? coinsHit + 1;
        pops.push({ x: pos.x, y: pos.y, text: `+${data.sats} sat`, color: "#FFFFFF", t: performance.now() });
      } else {
        pops.push({ x: pos.x, y: pos.y, text: "✕ " + data.reason, color: "#FFFFFF", t: performance.now() });
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
        en.dead = true; lives -= 1; burst(ship.x, round.shipY, "#FFFFFF"); updateHud();
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
    ctx.textAlign = "center"; ctx.font = "600 12px 'JetBrains Mono', monospace";
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

  function updateTimer(t) { $("time").textContent = String(Math.max(0, Math.ceil((round.roundMs - t) / 1000))); }
  function updateHud() {
    $("coins").textContent = coinsHit;
    $("paid").textContent = paidSat.toLocaleString();
    $("lives").textContent = "▪".repeat(Math.max(0, lives)) || "—";
    $("lives").setAttribute("aria-label", `${Math.max(0, lives)} shields`);
  }

  // ---- feed ----
  const feed = $("feed");
  const items = new Map();
  function label(row) {
    return `${row.pilot} · Coin ${row.amountSat} sat`;
  }
  function renderRow(row) {
    let li = items.get(row.payoutId);
    const isNew = !li;
    if (!li) { li = document.createElement("li"); items.set(row.payoutId, li); feed.prepend(li); }
    li.innerHTML = `<div class="top"><span class="who"></span><span class="chip ${row.state}">${row.state}</span></div><div class="note"></div>`;
    li.querySelector(".who").textContent = label(row);
    li.querySelector(".note").textContent = row.note || "→ Lightning";
    if (!isNew) { li.classList.remove("flash"); void li.offsetWidth; }
    li.classList.add("flash");
    if (round && row.sessionId === round.id) {
      paidSat = latestPaid(round.id);
      updateHud();
    }
    trim();
  }
  const rowsById = new Map();
  function latestPaid(sessionId) {
    let sum = 0;
    for (const r of rowsById.values()) if (r.sessionId === sessionId && r.state === "settled") sum += r.amountSat;
    return sum;
  }
  function note(text) {
    const li = document.createElement("li");
    li.className = "game"; li.textContent = text;
    feed.prepend(li); trim();
  }
  function trim() { while (feed.children.length > 120) feed.lastChild.remove(); }
  function connect() {
    const es = new EventSource("/api/feed");
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "snapshot") { feed.replaceChildren(); items.clear(); rowsById.clear(); for (const r of msg.rows) { rowsById.set(r.payoutId, r); renderRow(r); } }
      else if (msg.type === "row") { rowsById.set(msg.row.payoutId, msg.row); renderRow(msg.row); }
      else if (msg.type === "reset") { feed.replaceChildren(); items.clear(); rowsById.clear(); note("Demo reset"); }
      else if (msg.type === "game") {
        if (msg.event === "hit_rejected") note(`${msg.pilot}: hit rejected · ${msg.note}`);
        else if (msg.event === "duplicate") note(msg.note);
        else if (msg.event === "round_start") note(`${msg.pilot} launched · ${msg.difficulty}${msg.glitch ? " · MONEY GLITCH" : ""}`);
        else if (msg.event === "submit_failed") note(`${msg.pilot}: ${msg.note}`);
      } else if (msg.type === "service") { note(msg.connected ? "Payout service connected" : "Payout service unreachable"); loadRules(); }
    };
  }
  connect();
  requestAnimationFrame(frame);
})();
