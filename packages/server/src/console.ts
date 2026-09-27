/** The operator console: one self-contained page, no external assets. */
export function consoleHtml(title: string): string {
  const safeTitle = title.replace(/[<>&"]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle} console</title>
<style>
:root{--bg:#f6f7f9;--panel:#fff;--ink:#1a1d23;--muted:#5d6573;--line:#dfe3e8;--accent:#2f5bd3;
--ok:#1b7a47;--ok-bg:#e3f4ea;--warn:#8a5a00;--warn-bg:#fdf0d5;--bad:#b3261e;--bad-bg:#fbe6e4;--info:#3949ab;--info-bg:#e8eaf8;
--op:#6b3fa0;--op-bg:#efe7f8;--prov:#0b6e75;--prov-bg:#dff2f3;--net:#435061;--net-bg:#e7eaee;--recv:#8a4b08;--recv-bg:#f8ecdd;
--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#111318;--panel:#1a1d24;--ink:#e6e8ec;--muted:#9aa2b1;--line:#2c313b;--accent:#7a9cff;
--ok:#6fd49c;--ok-bg:#16301f;--warn:#f0c46a;--warn-bg:#332812;--bad:#f28b82;--bad-bg:#3a1a18;--info:#aab4ff;--info-bg:#232848;
--op:#c9a8f0;--op-bg:#2c2140;--prov:#7fd6dc;--prov-bg:#16302f;--net:#b8c2d0;--net-bg:#262b33;--recv:#f2b46d;--recv-bg:#33240f;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans);padding:0 16px 40px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:16px 0;max-width:1280px;margin:0 auto}
h1{font-size:18px;margin:0}
h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
main{max-width:1280px;margin:0 auto;display:grid;gap:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-width:0}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
button{font:500 13px var(--sans);border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:7px 12px;cursor:pointer}
button:hover{border-color:var(--accent)}
button.warn{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,var(--line))}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input,select{font:13px var(--sans);border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:7px 10px}
.chip{display:inline-block;font:600 11px var(--sans);padding:2px 8px;border-radius:999px;white-space:nowrap}
.s-settled{background:var(--ok-bg);color:var(--ok)}.s-failed{background:var(--bad-bg);color:var(--bad)}
.s-unknown,.s-stuck{background:var(--warn-bg);color:var(--warn)}
.s-received,.s-proposed,.s-authorized,.s-resolving,.s-attempting,.s-awaiting_approval{background:var(--info-bg);color:var(--info)}
.by-operator{background:var(--op-bg);color:var(--op)}.by-provider{background:var(--prov-bg);color:var(--prov)}
.by-network{background:var(--net-bg);color:var(--net)}.by-receiver{background:var(--recv-bg);color:var(--recv)}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0}
dt{color:var(--muted)}dd{margin:0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
ul.limits{list-style:none;margin:0;padding:0;display:grid;gap:6px}
ul.limits li{display:grid;grid-template-columns:minmax(120px,auto) 1fr auto;gap:10px;align-items:baseline}
.route{border-top:1px solid var(--line);padding:10px 0}.route:first-of-type{border-top:0;padding-top:0}
.route h3{font-size:14px;margin:0 0 6px}
.muted{color:var(--muted)}
.table{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600}
tr.p{cursor:pointer}tr.p:hover td{background:color-mix(in srgb,var(--accent) 6%,transparent)}
tr.flash td{animation:flash 1s ease-out}@keyframes flash{from{background:color-mix(in srgb,var(--accent) 16%,transparent)}}
td.mono,.mono{font-family:var(--mono);font-size:12px}
.trunc{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
ol.evidence{margin:0;padding-left:18px;display:grid;gap:4px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--bad);display:inline-block}.dot.on{background:var(--ok)}
.msg{color:var(--warn);min-height:1.4em;margin:0}
@media (prefers-reduced-motion:reduce){tr.flash td{animation:none}}
</style>
</head>
<body>
<header>
  <h1>${safeTitle} <span class="muted" style="font-weight:400">console</span></h1>
  <div class="row"><span class="dot" id="live" title="live stream"></span><span id="paused"></span>
    <input id="token" type="password" placeholder="operator token" autocomplete="off" aria-label="Operator token"><button id="save">Connect</button></div>
</header>
<main>
  <p class="msg" id="msg"></p>
  <div class="grid">
    <section><h2>Controls</h2><div class="row" id="controls"><button id="pause" class="warn">Pause payouts</button><button id="resume">Resume</button></div><div id="actions" class="row" style="margin-top:10px"></div></section>
    <section><h2>Totals</h2><dl id="totals"></dl></section>
    <section><h2>Node and service</h2><dl id="extra"><dt>—</dt><dd></dd></dl></section>
  </div>
  <div class="grid">
    <section><h2>Operator policy</h2><ul class="limits" id="rules"><li class="muted">Loading…</li></ul></section>
    <section><h2>Routes and their limits</h2><div id="routes"><p class="muted">Asking each route for its limits…</p></div></section>
  </div>
  <section>
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Payouts</h2>
      <label class="row">Source <select id="source"><option value="">all</option></select></label></div>
    <div class="table"><table><thead><tr><th>Updated</th><th>Source</th><th>Recipient</th><th>Amount</th><th>State</th><th>Last fact</th></tr></thead><tbody id="rows"></tbody></table></div>
  </section>
  <section id="detail" hidden><h2>Payout</h2><dl id="detailMeta"></dl><h2 style="margin-top:12px">Evidence</h2><ol class="evidence" id="evidence"></ol></section>
</main>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let token = new URLSearchParams(location.search).get("token") || "";
  try { if (token) sessionStorage.setItem("payhook-token", token); else token = sessionStorage.getItem("payhook-token") || ""; } catch {}
  if (token) history.replaceState(null, "", location.pathname);
  $("token").value = token;
  const payouts = new Map();
  const api = async (path, body) => {
    const res = await fetch(path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  };
  const sat = (msat) => (Number(BigInt(msat) / 1000n)).toLocaleString() + " sat";
  const lastFact = (p) => { for (const e of [...p.evidence].reverse()) { const d = e.detail || {}; if (typeof d.reason === "string") return d.reason; if (e.kind === "delivered" && d.payoutTxid) return "delivered · tx " + String(d.payoutTxid).slice(0, 12) + "…"; if (e.kind !== "allowed") return e.actor + " " + e.kind; } return ""; };
  function dl(el, entries) { el.innerHTML = entries.map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join(""); }
  function flatten(obj, prefix = "") { return Object.entries(obj || {}).flatMap(([k, v]) => v && typeof v === "object" && !Array.isArray(v) ? flatten(v, prefix + k + " · ") : [[prefix + k, Array.isArray(v) ? v.join(", ") : v]]); }

  async function loadStatus() {
    const s = await api("/v1/admin/status");
    $("paused").innerHTML = s.paused ? '<span class="chip s-unknown">paused</span>' : '<span class="chip s-settled">running</span>';
    dl($("totals"), [["open payouts", s.open.length], ...Object.entries(s.settledSatBySource).map(([k, v]) => ["settled · " + k, v.toLocaleString() + " sat"])]);
    if (s.extra) dl($("extra"), flatten(s.extra));
    $("actions").innerHTML = s.actions.map((a) => '<button data-action="' + esc(a.name) + '" class="' + (a.tone === "warning" ? "warn" : "") + '" title="' + esc(a.description || "") + '">' + esc(a.label) + "</button>").join("");
    const sel = $("source"), cur = sel.value;
    sel.innerHTML = '<option value="">all</option>' + s.clients.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.label) + "</option>").join("");
    sel.value = cur;
  }
  async function loadPolicy() {
    const p = await api("/v1/policy");
    $("rules").innerHTML = p.rules.map((r) => "<li><b>" + esc(r.name) + "</b><span>" + esc(r.description || "") + '</span><span class="chip by-operator">operator</span></li>').join("") || "<li>No rules: everything is allowed</li>";
    $("routes").innerHTML = p.routes.map((r) => '<div class="route"><h3>' + esc(r.network) + " · " + esc(r.asset) + ' <span class="muted" style="font-weight:400">via ' + esc(r.resolver) + " · settles in " + esc(r.settles) + "</span></h3>" + (r.error ? '<p class="msg">' + esc(r.error) + "</p>" : "") + '<ul class="limits">' + r.limits.map((l) => "<li><span>" + esc(l.label) + "</span><span>" + esc(l.value) + '</span><span class="chip by-' + esc(l.setBy) + '">' + esc(l.setBy) + "</span></li>").join("") + "</ul></div>").join("");
  }
  function render(p, fresh) {
    payouts.set(p.id, p);
    const filter = $("source").value;
    if (filter && p.sourceEvent.source !== filter) return;
    let tr = document.getElementById("p-" + p.id);
    if (!tr) { tr = document.createElement("tr"); tr.id = "p-" + p.id; tr.className = "p"; tr.onclick = () => show(p.id); $("rows").prepend(tr); }
    tr.innerHTML = "<td>" + esc(new Date(p.updatedAt).toLocaleTimeString()) + "</td><td>" + esc(p.sourceEvent.source) + '</td><td class="mono trunc" title="' + esc(p.recipient) + '">' + esc(p.recipient) + "</td><td>" + esc(sat(p.amountMsat)) + '</td><td><span class="chip s-' + esc(p.state) + '">' + esc(p.state) + '</span></td><td class="trunc" title="' + esc(lastFact(p)) + '">' + esc(lastFact(p)) + "</td>";
    if (fresh) { tr.classList.remove("flash"); void tr.offsetWidth; tr.classList.add("flash"); }
    while ($("rows").children.length > 300) $("rows").lastChild.remove();
    if (!$("detail").hidden && $("detail").dataset.id === p.id) show(p.id);
  }
  function show(id) {
    const p = payouts.get(id); if (!p) return;
    $("detail").hidden = false; $("detail").dataset.id = id;
    dl($("detailMeta"), [["id", p.id], ["obligation", p.obligationKey], ["source", p.sourceEvent.source], ["recipient", p.recipient], ["amount", sat(p.amountMsat)], ["state", p.state], ["reason", p.reason], ["policy version", p.policyVersion], ["payment hash", p.paymentHash || "—"]]);
    $("evidence").innerHTML = p.evidence.map((e) => "<li><span class='mono'>" + esc(new Date(e.recordedAt).toLocaleTimeString()) + "</span> <b>" + esc(e.actor) + "</b> " + esc(e.kind) + (e.detail ? " <span class='muted mono'>" + esc(JSON.stringify(e.detail)) + "</span>" : "") + "</li>").join("");
  }
  async function loadPayouts() {
    const { payouts: list } = await api("/v1/payouts?limit=200" + ($("source").value ? "&source=" + encodeURIComponent($("source").value) : ""));
    $("rows").innerHTML = "";
    for (const p of list.reverse()) render(p, false);
  }
  let stream;
  function connect() {
    stream?.close();
    stream = new EventSource("/v1/events?token=" + encodeURIComponent(token));
    stream.onopen = () => $("live").classList.add("on");
    stream.onerror = () => $("live").classList.remove("on");
    stream.onmessage = (e) => { const ev = JSON.parse(e.data); if (ev.payout) render(ev.payout, true); if (ev.type === "admin") loadStatus(); };
  }
  async function start() {
    if (!token) { $("msg").textContent = "Enter the operator token to connect."; return; }
    try { await Promise.all([loadStatus(), loadPolicy(), loadPayouts()]); $("msg").textContent = ""; connect(); }
    catch (e) { $("msg").textContent = e.message; }
  }
  $("save").onclick = () => { token = $("token").value.trim(); try { sessionStorage.setItem("payhook-token", token); } catch {} start(); };
  $("pause").onclick = () => api("/v1/admin/pause", {}).then(loadStatus).catch((e) => ($("msg").textContent = e.message));
  $("resume").onclick = () => api("/v1/admin/resume", {}).then(loadStatus).catch((e) => ($("msg").textContent = e.message));
  $("actions").onclick = (e) => { const b = e.target.closest("button[data-action]"); if (!b) return; api("/v1/admin/actions/" + b.dataset.action, {}).then((r) => { $("msg").textContent = b.textContent + ": " + (r.message || "done"); loadStatus(); }).catch((err) => ($("msg").textContent = err.message)); };
  $("source").onchange = loadPayouts;
  setInterval(() => { if (token) loadStatus().catch(() => {}); }, 5000);
  setInterval(() => { if (token) loadPolicy().catch(() => {}); }, 60000);
  start();
})();
</script>
</body>
</html>`;
}
