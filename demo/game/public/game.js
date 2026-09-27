// Orbital Sats client. The server owns coins and rewards; this file draws the
// round, moves the ship and reports hits.
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $("c");
  const ctx = canvas.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let config = { walletDomain: "localhost:8091", walletUrl: "http://localhost:8091", prize: { sat: 50000, coinsNeeded: 3 } };
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
  const stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }));

  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
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
    if (c.mode === "fake") $("feedInfo").innerHTML = '<span class="mode">FAKE MODE</span> · no money moves';
  });
  function levelHint() {
    const v = $("recipient").value.trim();
    $("levelHint").textContent = /@/.test(v) ? "Level 1 · every coin pays sats over Lightning, instantly"
      : /^(liquid:)?(tlq1|tex1|lq1|ex1)/i.test(v) ? `Level 2 · hit ${config.prize.coinsNeeded}+ coins to win ${config.prize.sat.toLocaleString()} sat, paid as L-USDT via KaleidoSwap`
      : "";
  }
  $("recipient").addEventListener("input", levelHint);
  $("useLn").addEventListener("click", () => {
    const name = ($("name").value.trim() || "ada").toLowerCase().replace(/[^a-z0-9._-]/g, "");
    $("recipient").value = `${name}@${config.walletDomain}`; levelHint();
  });
  $("useLiquid").addEventListener("click", async () => {
    try {
      const w = await (await fetch(`${config.walletUrl}/api/wallet`)).json();
      $("recipient").value = w.liquid.address; levelHint();
    } catch { $("err").textContent = "Demo wallet unreachable"; }
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
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { $("err").textContent = data.error; return; }
    start(data.round, data.token);
  });
  $("again").addEventListener("click", () => { $("over").hidden = true; $("menu").hidden = false; });

  function start(r, t) {
    round = r; token = t;
    startAt = performance.now() + r.startsInMs;
    bullets = []; enemies = []; sparks = []; pops = []; taken = new Set();
    lives = 3; coinsHit = 0; paidSat = 0; nextEnemy = 1500;
    // Round clocks restart at zero, so the fire cooldown must too.
    lastShot = -Infinity; keys = {}; firing = false; ship.x = 0.5;
    running = true;
    $("menu").hidden = true; $("over").hidden = true;
    $("pot").style.display = r.prize ? "block" : "none";
    updateHud();
  }
  const elapsed = () => performance.now() - startAt;

  function finish(reason) {
    if (!running) return;
    running = false;
    fetch(`/api/session/${round.id}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    $("overTitle").textContent = reason;
    $("overStats").textContent = `${coinsHit} golden coins · ${paidSat.toLocaleString()} sat paid so far`;
    $("overNote").textContent = round.prize
      ? coinsHit >= round.prize.coinsNeeded ? "Round prize is on its way as L-USDT. Watch the feed." : `Round prize needs ${round.prize.coinsNeeded} coins.`
      : "Payouts keep settling in the feed.";
    const user = ($("recipient").value.split("@")[0] || "").toLowerCase();
    $("walletLink").href = `${config.walletUrl}/?user=${encodeURIComponent(round.prize ? "" : user)}`;
    $("over").hidden = false;
  }

  // ---- input ----
  const key = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  addEventListener("keydown", (e) => { keys[key(e)] = true; if (e.key === " " && running) e.preventDefault(); });
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
        pops.push({ x: pos.x, y: pos.y, text: data.sats ? `+${data.sats} sat` : "+1 coin", color: "#ffd76a", t: performance.now() });
      } else {
        pops.push({ x: pos.x, y: pos.y, text: "✕ " + data.reason, color: "#ff5d7a", t: performance.now() });
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
      for (const b of bullets) if (!b.dead && Math.hypot(b.x - en.x, (b.y - en.y) * 0.8) < en.r) { b.dead = true; en.dead = true; burst(en.x, en.y, "#8a7bff"); }
      if (!en.dead && Math.hypot(ship.x - en.x, round.shipY - en.y) < en.r + 0.03) {
        en.dead = true; lives -= 1; burst(ship.x, round.shipY, "#ff5d7a"); updateHud();
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
          b.dead = true; taken.add(coin.id); burst(pos.x, pos.y, "#f7b529", 22);
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
    if (reduceMotion) n = 4;
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2, v = 0.1 + Math.random() * 0.35;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.4, color });
    }
  }

  function draw(now) {
    ctx.fillStyle = "#05060d"; ctx.fillRect(0, 0, W, H);
    const a = area();
    // stars
    for (const st of stars) {
      if (!reduceMotion) st.y = (st.y + st.z * 0.0009) % 1;
      ctx.fillStyle = `rgba(200,210,255,${0.25 + st.z * 0.5})`;
      ctx.fillRect(a.x0 + st.x * a.w, st.y * H, st.z * 2, st.z * 2);
    }
    ctx.strokeStyle = "#141a30"; ctx.lineWidth = 1;
    ctx.strokeRect(a.x0 + 0.5, 0.5, a.w - 1, H - 1);
    if (!round) return;
    const t = elapsed();
    const unit = a.w;
    // coins
    for (const coin of round.coins) {
      if (taken.has(coin.id) || t < coin.spawnAt || t > coin.spawnAt + lifetime(coin)) continue;
      const p = coinPosition(coin, t);
      drawCoin(px(p.x), py(p.y), unit * 0.03, now);
    }
    // enemies
    for (const en of enemies) drawRock(px(en.x), py(en.y), en.r * unit, en.spin);
    // bullets
    ctx.fillStyle = "#ffe9a8";
    for (const b of bullets) ctx.fillRect(px(b.x) - 1.5, py(b.y) - 8, 3, 12);
    // ship
    if (running) drawShip(px(ship.x), py(round.shipY), unit * 0.035);
    // sparks
    for (const sp of sparks) { ctx.globalAlpha = Math.max(0, sp.life * 2); ctx.fillStyle = sp.color; ctx.fillRect(px(sp.x), py(sp.y), 3, 3); }
    ctx.globalAlpha = 1;
    // pops
    ctx.textAlign = "center"; ctx.font = "11px 'Press Start 2P', monospace";
    pops = pops.filter((p) => now - p.t < 1400);
    for (const p of pops) {
      const k = (now - p.t) / 1400;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color;
      ctx.fillText(p.text.slice(0, 42), px(Math.min(0.8, Math.max(0.2, p.x))), py(p.y) - k * 40);
    }
    ctx.globalAlpha = 1;
    if (running && t < 0) {
      ctx.fillStyle = "#f7b529"; ctx.font = "28px 'Press Start 2P', monospace";
      ctx.fillText(String(Math.ceil(-t / 1000)), W / 2, H / 2);
    }
  }

  function drawCoin(x, y, r, now) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    g.addColorStop(0, "#fff2b8"); g.addColorStop(0.5, "#f7b529"); g.addColorStop(1, "#b9780a");
    ctx.save();
    ctx.shadowColor = "rgba(247,181,41,.8)"; ctx.shadowBlur = 16;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = "#8a5a06"; ctx.lineWidth = 2; ctx.stroke();
    // ₿ glyph
    ctx.fillStyle = "#6b4404"; ctx.font = `700 ${Math.round(r * 1.25)}px 'Chakra Petch', sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("₿", x, y + (reduceMotion ? 0 : Math.sin(now / 300) * 0.5));
    ctx.restore(); ctx.textBaseline = "alphabetic";
  }
  function drawRock(x, y, r, spin) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
    ctx.fillStyle = "#2a2f4a"; ctx.strokeStyle = "#8a7bff"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) { const a = (i / 8) * Math.PI * 2, rr = r * (0.8 + ((i * 37) % 7) / 20); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function drawShip(x, y, s) {
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = "rgba(56,224,194,.7)"; ctx.shadowBlur = 14;
    ctx.fillStyle = "#38e0c2";
    ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s, s * 0.8); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = "#ff8a3d"; ctx.fillRect(-s * 0.18, s * 0.45, s * 0.36, s * (0.3 + Math.random() * 0.3));
    ctx.restore();
  }

  function updateTimer(t) { $("time").textContent = String(Math.max(0, Math.ceil((round.roundMs - t) / 1000))); }
  function updateHud() {
    $("coins").textContent = coinsHit;
    $("paid").textContent = paidSat.toLocaleString();
    $("lives").textContent = "♥".repeat(Math.max(0, lives)) || "—";
    if (round?.prize) {
      const k = Math.min(1, coinsHit / round.prize.coinsNeeded);
      $("potFill").style.width = `${k * 100}%`;
      $("potText").textContent = `ROUND PRIZE ${round.prize.sat.toLocaleString()} SAT → L-USDT · ${Math.min(coinsHit, round.prize.coinsNeeded)}/${round.prize.coinsNeeded}`;
    }
  }

  // ---- feed ----
  const feed = $("feed");
  const items = new Map();
  function label(row) {
    const what = row.kind === "prize" ? `Round prize ${row.amountSat.toLocaleString()} sat` : `Coin ${row.amountSat} sat`;
    return `${row.pilot} · ${what}`;
  }
  function renderRow(row) {
    let li = items.get(row.payoutId);
    const isNew = !li;
    if (!li) { li = document.createElement("li"); items.set(row.payoutId, li); feed.prepend(li); }
    const route = row.route === "kaleidoswap" ? "→ L-USDT via KaleidoSwap" : row.route === "lightning-address" ? "→ Lightning" : row.route || "";
    li.innerHTML = `<div class="top"><span class="who"></span><span class="chip ${row.state}">${row.state}</span></div><div class="note"></div>`;
    li.querySelector(".who").textContent = label(row);
    li.querySelector(".note").textContent = [route, row.note].filter(Boolean).join(" · ");
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
        else if (msg.event === "round_start") note(`${msg.pilot} launched · ${msg.level === "liquid" ? "Level 2 L-USDT" : "Level 1 Lightning"} · ${msg.difficulty}${msg.glitch ? " · MONEY GLITCH" : ""}`);
        else if (msg.event === "no_prize") note(`${msg.pilot}: ${msg.note}`);
      } else if (msg.type === "admin") note(msg.paused ? "Operator paused payouts" : msg.outage !== "normal" ? `Operator: studio node ${msg.outage}` : "Operator: payouts running");
    };
  }
  connect();
  requestAnimationFrame(frame);
})();
