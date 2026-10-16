/**
 * Yonetici panelinin tek sayfasi (`GET /admin`). Kendi kendine yeten HTML:
 * dis kaynak yok (CDN, yazi tipi, resim). Veri `/admin/api/*`dan, jetonla.
 *
 * Kural: bu metin `String.raw` icinde; ters tirnak ve dolar-suslu-parantez
 * kullanilmiyor (sayfa betiginde sablon metni yok, birlestirme var).
 * `tests/debug-admin.test.mjs` betigin sozdizimini denetliyor.
 */
export const ADMIN_PANEL_HTML = String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Nexhold Flight Recorder</title>
<style>
:root{--bg:#07090c;--panel:#0d1117;--panel2:#111821;--line:#1d2733;--line2:#2a3846;--text:#c9d4df;--dim:#7b8a99;--accent:#5ec8dc;--warn:#e0a03a;--bad:#e05a4a;--good:#6cc48a;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent);text-decoration:none}
header{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line);background:#090c10;position:sticky;top:0;z-index:5}
header h1{font-size:13px;letter-spacing:.18em;text-transform:uppercase;margin:0;font-weight:600;color:#e6eef5}
header h1 span{color:var(--accent)}
header .sp{flex:1}
button,.btn{background:var(--panel2);color:var(--text);border:1px solid var(--line2);padding:5px 10px;font:inherit;cursor:pointer;border-radius:2px}
button:hover,.btn:hover{border-color:var(--accent);color:#fff}
button.primary{border-color:var(--accent);color:var(--accent)}
input,select{background:#05070a;color:var(--text);border:1px solid var(--line2);padding:5px 8px;font:inherit;border-radius:2px}
main{padding:16px;max-width:1500px;margin:0 auto}
.panel{background:var(--panel);border:1px solid var(--line);margin:0 0 14px;padding:12px}
.panel h2{margin:0 0 10px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);font-weight:600}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.card{border:1px solid var(--line);background:var(--panel2);padding:8px 10px}
.card .k{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.card .v{font:600 17px var(--mono);color:#e8f1f8;margin-top:2px}
.card .v small{font-size:11px;color:var(--dim);font-weight:400}
.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl th,.tbl td{padding:5px 7px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
.tbl th{color:var(--dim);font-weight:600;font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;user-select:none;position:sticky;top:0;background:var(--panel)}
.tbl th.sorted{color:var(--accent)}
.tbl td.n{font-family:var(--mono);text-align:right}
.tbl tr.click{cursor:pointer}
.tbl tr.click:hover td{background:#131c26}
.scroll{overflow:auto;max-height:70vh}
.pill{display:inline-block;padding:0 6px;border:1px solid var(--line2);font-size:11px;font-family:var(--mono)}
.good{color:var(--good)}.warn{color:var(--warn)}.bad{color:var(--bad)}.dim{color:var(--dim)}
.charts{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:1100px){.charts{grid-template-columns:1fr 1fr}}
.chart{position:relative;background:var(--panel);border:1px solid var(--line);padding:10px 10px 6px}
.chart h3{margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:600}
.chart .wrap{position:relative;height:200px}
.chart canvas{position:absolute;left:0;top:0;width:100%;height:100%}
.legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:11px;color:var(--dim)}
.legend i{display:inline-block;width:10px;height:3px;margin-right:4px;vertical-align:middle}
.legend span{cursor:pointer}
.legend span.off{opacity:.35}
.tip{position:absolute;pointer-events:none;background:#05080bf0;border:1px solid var(--line2);padding:6px 8px;font:11px/1.35 var(--mono);white-space:nowrap;z-index:3;display:none}
.verdict{border-left:3px solid var(--accent);padding:8px 12px;background:var(--panel2);margin-bottom:6px}
.verdict.warn{border-color:var(--warn)}.verdict.bad{border-color:var(--bad)}.verdict.good{border-color:var(--good)}
.login{max-width:420px;margin:12vh auto}
.login input{width:100%;margin:8px 0}
.mono{font-family:var(--mono)}
.err{color:var(--bad);margin:6px 0}
@media(max-width:640px){main{padding:10px}header{padding:8px 10px}.card .v{font-size:15px}.chart .wrap{height:170px}}
</style>
</head>
<body>
<header><h1 lang="en">Nexhold <span>//</span> Flight Recorder</h1><div class="sp"></div><button id="lang"></button><button id="logout"></button></header>
<main id="app"></main>
<script>
(function () {
  "use strict";
  var TEXT = {
    tr: {
      login: "Yönetici jetonu", loginHint: "Jeton yalnızca bu sekmede tutulur (sessionStorage).", enter: "Gir", logout: "Çıkış", wrongToken: "Jeton geçersiz.", tooMany: "Çok fazla hatalı deneme; bir dakika bekleyin.",
      matches: "Maçlar", filter: "Süz (aşama, operatör, kip, sonuç...)", onlyLag: "Yalnızca takılanlar", refresh: "Yenile", loading: "Yükleniyor...", none: "Kayıt yok.",
      date: "Tarih", dur: "Süre", stage: "Aşama", mode: "Kip", ops: "Operatörler", players: "Oyuncu", wave: "Dalga", outcome: "Sonuç", tickMax: "Tick max", tickP99: "Tick p99", fpsMin: "En düşük FPS", spikes: "Takılma", size: "Boyut", status: "Durum",
      back: "Liste", dlTimeline: "Zaman çizelgesi (JSON)", dlReplay: "Yeniden oynatma kaydı", summary: "Özet", diagnosis: "Teşhis",
      chTick: "Sunucu tick'i (ms, bölümler yığılı) + p95/max", chEnt: "Varlıklar", chWire: "Ağ: istemci başına KB/s, snapshot Hz", chProc: "Süreç: olay döngüsü, GC, CPU", chClientFps: "İstemci FPS", chClientFt: "İstemci kare süresi p95 (ms) ve bölümler", chLod: "Efekt LOD seviyesi", chPing: "Ping (ms)", chDt: "Tick aralığı (ms): 16,7 normal", chMem: "Bellek (MB)",
      spikeList: "Tespit edilen takılmalar", waveList: "Dalga özetleri", clientList: "İstemciler", kind: "Tür", at: "An", ms: "ms", dom: "Baskın bölüm", enemies: "Düşman", towers: "Kule", projectiles: "Mermi", sec: "Sn",
      noClient: "İstemci verisi yok (oyuncuların anonim veri ayarı kapalı ya da eski istemci).",
      vServerOk: "Sunucu tick'i bütçe içinde", vServerBad: "Sunucu tick'i bütçeyi aşıyor", vLoop: "Olay döngüsü takılmaları", vClient: "İstemci kare hızı düşük", vWire: "Ağ kuyruğu: atlanan snapshot", vGc: "GC duraklamaları", vCpu: "CPU doygun", vOk: "Belirgin sorun yok",
      tickAvg: "Tick ort.", worstSec: "En kötü saniye p95", fpsAvg: "FPS ort.", maxEnemies: "En fazla düşman", wireMax: "En yüksek KB/s", recOverhead: "Kaydedici maliyeti", replay: "Yeniden oynatma", events: "olay", ticksL: "tick", truncated: "kesik", fingerprints: "iz",
      device: "Cihaz", samples: "Örnek"
    },
    en: {
      login: "Admin token", loginHint: "The token is kept only in this tab (sessionStorage).", enter: "Enter", logout: "Log out", wrongToken: "Invalid token.", tooMany: "Too many failed attempts; wait a minute.",
      matches: "Matches", filter: "Filter (stage, operator, mode, outcome...)", onlyLag: "Only laggy", refresh: "Refresh", loading: "Loading...", none: "No recordings.",
      date: "Date", dur: "Duration", stage: "Stage", mode: "Mode", ops: "Operators", players: "Players", wave: "Wave", outcome: "Outcome", tickMax: "Tick max", tickP99: "Tick p99", fpsMin: "Worst FPS", spikes: "Spikes", size: "Size", status: "Status",
      back: "List", dlTimeline: "Timeline (JSON)", dlReplay: "Replay file", summary: "Summary", diagnosis: "Diagnosis",
      chTick: "Server tick (ms, stacked sections) + p95/max", chEnt: "Entities", chWire: "Network: KB/s per client, snapshot Hz", chProc: "Process: event loop, GC, CPU", chClientFps: "Client FPS", chClientFt: "Client frame time p95 (ms) and sections", chLod: "VFX LOD level", chPing: "Ping (ms)", chDt: "Tick interval (ms): 16.7 is normal", chMem: "Memory (MB)",
      spikeList: "Detected lag spikes", waveList: "Wave summaries", clientList: "Clients", kind: "Kind", at: "At", ms: "ms", dom: "Dominant section", enemies: "Enemies", towers: "Towers", projectiles: "Projectiles", sec: "Sec",
      noClient: "No client data (players have anonymous data off, or an old client).",
      vServerOk: "Server tick within budget", vServerBad: "Server tick over budget", vLoop: "Event loop stalls", vClient: "Low client frame rate", vWire: "Network backpressure: skipped snapshots", vGc: "GC pauses", vCpu: "CPU saturated", vOk: "No obvious problem",
      tickAvg: "Tick avg", worstSec: "Worst second p95", fpsAvg: "FPS avg", maxEnemies: "Max enemies", wireMax: "Peak KB/s", recOverhead: "Recorder cost", replay: "Replay", events: "events", ticksL: "ticks", truncated: "truncated", fingerprints: "prints",
      device: "Device", samples: "Samples"
    }
  };
  var lang = "tr";
  try { lang = localStorage.getItem("nx-admin-lang") || ((navigator.language || "").toLowerCase().indexOf("tr") === 0 ? "tr" : "en"); } catch (e) { lang = "tr"; }
  function t(key) { return (TEXT[lang] && TEXT[lang][key]) || TEXT.en[key] || key; }
  var token = "";
  try { token = sessionStorage.getItem("nx-admin-token") || ""; } catch (e) { token = ""; }
  var app = document.getElementById("app");
  var COLORS = ["#5ec8dc", "#e0a03a", "#9b7fe0", "#6cc48a", "#e05a4a", "#d9d36a", "#4f8fe0", "#e07ab8", "#8fd0c0", "#c08a5a", "#a0a8b0", "#70e070", "#e0e0e0", "#606a78"];
  var SECTIONS = ["spawn", "towers", "projectiles", "enemies", "bodies", "legendary", "procs", "cooldowns", "ultimates", "snapshot", "wire", "latest", "perf", "other"];
  var CLIENT_SECTIONS = ["sFrame", "sEnemies", "sDrones", "sProjectiles", "sBeams", "sSignatures", "sMap", "sTowers", "sEvents", "sHud", "sShop", "sSnapshotRecv", "sVfx"];

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var key in attrs) {
      if (key === "text") node.textContent = attrs[key];
      else if (key === "html") node.innerHTML = attrs[key];
      else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    }
    (children || []).forEach(function (child) { if (child != null) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child); });
    return node;
  }
  function fmt(value, digits) { if (value == null || !isFinite(value)) return "-"; return Number(value).toFixed(digits == null ? 1 : digits); }
  function fmtBytes(bytes) { if (!bytes) return "0"; if (bytes < 1024) return bytes + " B"; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"; return (bytes / 1048576).toFixed(1) + " MB"; }
  function fmtDur(seconds) { if (!seconds && seconds !== 0) return "-"; var m = Math.floor(seconds / 60), s = Math.round(seconds % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function fmtDate(ms) { if (!ms) return "-"; var d = new Date(ms); function p(n) { return (n < 10 ? "0" : "") + n; } return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
  function tone(value, warn, bad) { return value >= bad ? "bad" : value >= warn ? "warn" : "good"; }
  function toneLow(value, warn, bad) { return value <= bad ? "bad" : value <= warn ? "warn" : "good"; }

  function api(path) {
    return fetch("/admin/api" + path, { headers: { Authorization: "Bearer " + token }, cache: "no-store" }).then(function (response) {
      if (response.status === 401 || response.status === 404) { var error = new Error("auth"); error.auth = true; throw error; }
      if (response.status === 429) { var limited = new Error("limited"); limited.limited = true; throw limited; }
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  }
  function download(path, name) {
    fetch("/admin/api" + path, { headers: { Authorization: "Bearer " + token } }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.blob();
    }).then(function (blob) {
      var link = el("a", { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 10000);
    }).catch(function (error) { alert(error.message); });
  }

  function handleError(error) {
    if (error && error.auth) { token = ""; try { sessionStorage.removeItem("nx-admin-token"); } catch (e) {} renderLogin(t("wrongToken")); return; }
    if (error && error.limited) { renderLogin(t("tooMany")); return; }
    app.innerHTML = ""; app.appendChild(el("div", { class: "panel err", text: String(error && error.message || error) }));
  }

  // --- giris ---
  function renderLogin(message) {
    app.innerHTML = "";
    var input = el("input", { type: "password", autocomplete: "off", placeholder: "token" });
    var form = el("form", { class: "panel login", onsubmit: function (event) {
      event.preventDefault();
      token = input.value.trim();
      try { sessionStorage.setItem("nx-admin-token", token); } catch (e) {}
      route();
    } }, [el("h2", { text: t("login") }), input, message ? el("div", { class: "err", text: message }) : null, el("div", { class: "dim", text: t("loginHint") }), el("div", { style: "margin-top:10px" }, [el("button", { class: "primary", type: "submit", text: t("enter") })])]);
    app.appendChild(form);
    input.focus();
  }

  // --- liste ---
  var listState = { sort: "createdAt", dir: -1, filter: "", onlyLag: false, data: null };
  var LIST_COLUMNS = [
    { key: "createdAt", label: "date", get: function (m) { return m.createdAt; }, show: function (m) { return fmtDate(m.createdAt); } },
    { key: "durationS", label: "dur", num: true, get: function (m) { return m.durationS || 0; }, show: function (m) { return fmtDur(m.durationS); } },
    { key: "stage", label: "stage", num: true, get: function (m) { return m.stage || 0; } },
    { key: "mode", label: "mode", get: function (m) { return m.mode || ""; } },
    { key: "operators", label: "ops", get: function (m) { return (m.operators || []).join(", "); } },
    { key: "players", label: "players", num: true, get: function (m) { return m.players || 0; } },
    { key: "wave", label: "wave", num: true, get: function (m) { return m.wave || 0; } },
    { key: "result", label: "outcome", get: function (m) { return m.result || ""; } },
    { key: "tickMax", label: "tickMax", num: true, get: function (m) { return m.tick ? m.tick.max : 0; }, show: function (m) { return fmt(m.tick && m.tick.max); }, tone: function (v) { return tone(v, 8, 16.7); } },
    { key: "tickP99", label: "tickP99", num: true, get: function (m) { return m.tick ? m.tick.p99 : 0; }, show: function (m) { return fmt(m.tick && m.tick.p99); }, tone: function (v) { return tone(v, 4, 10); } },
    { key: "fpsMin", label: "fpsMin", num: true, get: function (m) { return m.client && m.client.fpsMin != null ? m.client.fpsMin : 999; }, show: function (m) { return m.client && m.client.fpsMin != null ? fmt(m.client.fpsMin, 0) : "-"; }, tone: function (v) { return v === 999 ? "dim" : toneLow(v, 45, 25); } },
    { key: "spikes", label: "spikes", num: true, get: function (m) { return m.spikes || 0; } },
    { key: "bytes", label: "size", num: true, get: function (m) { return m.bytes || 0; }, show: function (m) { return fmtBytes(m.bytes); } },
    { key: "status", label: "status", get: function (m) { return m.status; } }
  ];

  function renderList() {
    app.innerHTML = "";
    var panel = el("div", { class: "panel" });
    var filter = el("input", { type: "search", placeholder: t("filter"), value: listState.filter, style: "flex:1;min-width:180px" });
    var lag = el("input", { type: "checkbox" }); lag.checked = listState.onlyLag;
    var info = el("span", { class: "dim mono" });
    var body = el("div", { class: "scroll" });
    filter.addEventListener("input", function () { listState.filter = filter.value; draw(); });
    lag.addEventListener("change", function () { listState.onlyLag = lag.checked; draw(); });
    panel.appendChild(el("h2", { text: t("matches") }));
    panel.appendChild(el("div", { class: "row", style: "margin-bottom:10px" }, [filter, el("label", {}, [lag, " " + t("onlyLag")]), el("button", { text: t("refresh"), onclick: load }), info]));
    panel.appendChild(body);
    app.appendChild(panel);

    function draw() {
      var data = listState.data;
      if (!data) { body.textContent = t("loading"); return; }
      var needle = listState.filter.toLowerCase();
      var rows = data.matches.filter(function (m) {
        if (listState.onlyLag && !((m.tick && m.tick.max >= 16.7) || (m.client && m.client.fpsMin != null && m.client.fpsMin < 40) || (m.loop && m.loop.dtMax >= 50))) return false;
        if (!needle) return true;
        return [m.id, m.mode, m.result, (m.operators || []).join(" "), "s" + m.stage, m.status].join(" ").toLowerCase().indexOf(needle) >= 0;
      });
      var column = LIST_COLUMNS.filter(function (c) { return c.key === listState.sort; })[0] || LIST_COLUMNS[0];
      rows.sort(function (a, b) { var x = column.get(a), y = column.get(b); return (x > y ? 1 : x < y ? -1 : 0) * listState.dir; });
      info.textContent = rows.length + " / " + data.matches.length + "  " + fmtBytes(data.totalBytes) + " / " + fmtBytes(data.maxTotalBytes);
      if (rows.length === 0) { body.textContent = t("none"); return; }
      var table = el("table", { class: "tbl" });
      var head = el("tr");
      LIST_COLUMNS.forEach(function (c) {
        head.appendChild(el("th", { class: c.key === listState.sort ? "sorted" : "", text: t(c.label) + (c.key === listState.sort ? (listState.dir > 0 ? " ^" : " v") : ""), onclick: function () {
          if (listState.sort === c.key) listState.dir = -listState.dir; else { listState.sort = c.key; listState.dir = c.num ? -1 : 1; }
          draw();
        } }));
      });
      table.appendChild(el("thead", {}, [head]));
      var tbody = el("tbody");
      rows.forEach(function (m) {
        var tr = el("tr", { class: "click", onclick: function () { location.hash = "#/m/" + m.id; } });
        LIST_COLUMNS.forEach(function (c) {
          var value = c.get(m);
          tr.appendChild(el("td", { class: (c.num ? "n " : "") + (c.tone ? c.tone(value) : ""), text: c.show ? c.show(m) : String(value == null ? "" : value) }));
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      body.innerHTML = ""; body.appendChild(table);
    }
    function load() {
      body.textContent = t("loading");
      api("/matches").then(function (data) { listState.data = data; draw(); }).catch(handleError);
    }
    if (listState.data) draw();
    load();
  }

  // --- grafik ---
  var charts = [];
  var hoverIndex = -1;
  function setHover(index) { hoverIndex = index; charts.forEach(function (chart) { chart.overlay(); }); }

  function Chart(parent, options) {
    var self = this;
    this.options = options;
    this.hidden = {};
    var box = el("div", { class: "chart" });
    box.appendChild(el("h3", { text: options.title }));
    var wrap = el("div", { class: "wrap" });
    this.base = el("canvas"); this.top = el("canvas");
    this.tip = el("div", { class: "tip" });
    wrap.appendChild(this.base); wrap.appendChild(this.top); wrap.appendChild(this.tip);
    box.appendChild(wrap);
    this.legend = el("div", { class: "legend" });
    box.appendChild(this.legend);
    parent.appendChild(box);
    this.wrap = wrap;
    options.series.forEach(function (series, index) {
      series.color = series.color || COLORS[index % COLORS.length];
      var item = el("span", { onclick: function () { self.hidden[series.key] = !self.hidden[series.key]; item.className = self.hidden[series.key] ? "off" : ""; self.draw(); } }, [el("i", { style: "background:" + series.color }), series.label]);
      self.legend.appendChild(item);
    });
    this.top.addEventListener("mousemove", function (event) { setHover(self.indexAt(event.offsetX)); });
    this.top.addEventListener("touchmove", function (event) { var rect = self.top.getBoundingClientRect(); setHover(self.indexAt(event.touches[0].clientX - rect.left)); }, { passive: true });
    this.top.addEventListener("mouseleave", function () { setHover(-1); });
    this.top.addEventListener("click", function () { if (options.onPick && hoverIndex >= 0) options.onPick(hoverIndex); });
    charts.push(this);
    this.draw();
  }
  Chart.prototype.layout = function () {
    var dpr = window.devicePixelRatio || 1;
    var width = this.wrap.clientWidth, height = this.wrap.clientHeight;
    [this.base, this.top].forEach(function (canvas) { canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr)); });
    this.dpr = dpr; this.width = width; this.height = height;
    this.pad = { l: 42, r: 8, t: 6, b: 18 };
  };
  Chart.prototype.indexAt = function (x) {
    var n = this.options.x.length; if (n === 0) return -1;
    var plot = this.width - this.pad.l - this.pad.r;
    var index = Math.round((x - this.pad.l) / Math.max(1, plot) * (n - 1));
    return index < 0 || index >= n ? -1 : index;
  };
  Chart.prototype.xAt = function (index) { var n = this.options.x.length; return this.pad.l + (n <= 1 ? 0 : index / (n - 1)) * (this.width - this.pad.l - this.pad.r); };
  Chart.prototype.draw = function () {
    this.layout();
    var ctx = this.base.getContext("2d");
    var o = this.options, self = this, n = o.x.length, pad = this.pad;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    var visible = o.series.filter(function (s) { return !self.hidden[s.key]; });
    var stacked = visible.filter(function (s) { return s.stack; });
    var lines = visible.filter(function (s) { return !s.stack; });
    var max = o.min || 0;
    for (var i = 0; i < n; i += 1) {
      var sum = 0;
      stacked.forEach(function (s) { sum += s.values[i] || 0; });
      if (sum > max) max = sum;
      lines.forEach(function (s) { var v = s.values[i]; if (v != null && v > max) max = v; });
    }
    if (o.maxCap && max > o.maxCap) max = o.maxCap;
    max = max <= 0 ? 1 : niceMax(max);
    this.max = max;
    var plotH = this.height - pad.t - pad.b;
    var y = function (v) { return pad.t + plotH - Math.min(1, v / max) * plotH; };
    ctx.strokeStyle = "#1d2733"; ctx.fillStyle = "#7b8a99"; ctx.lineWidth = 1; ctx.font = "10px ui-monospace,Menlo,Consolas,monospace";
    for (var g = 0; g <= 4; g += 1) {
      var gy = Math.round(pad.t + plotH * g / 4) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(this.width - pad.r, gy); ctx.stroke();
      ctx.fillText(fmtAxis(max * (1 - g / 4)), 2, gy + 3);
    }
    if (o.budget && o.budget <= max) { ctx.strokeStyle = "#e05a4a"; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(pad.l, y(o.budget)); ctx.lineTo(this.width - pad.r, y(o.budget)); ctx.stroke(); ctx.setLineDash([]); }
    // Dalga sinirlari
    if (o.waves) {
      ctx.fillStyle = "#7b8a99";
      var lastWave = null;
      for (var w = 0; w < n; w += 1) {
        if (o.waves[w] !== lastWave) {
          var wx = Math.round(this.xAt(w)) + 0.5;
          ctx.strokeStyle = "#16202b"; ctx.beginPath(); ctx.moveTo(wx, pad.t); ctx.lineTo(wx, pad.t + plotH); ctx.stroke();
          if (o.waves[w]) ctx.fillText("W" + o.waves[w], wx + 2, this.height - 5);
          lastWave = o.waves[w];
        }
      }
    }
    var columns = Math.max(1, Math.floor(this.width - pad.l - pad.r));
    var step = n > columns ? n / columns : 1;
    var picks = [];
    if (step === 1) { for (var p = 0; p < n; p += 1) picks.push(p); }
    else {
      // Piksel sutunu basina en buyuk toplam: takilma inceltmede kaybolmasin.
      for (var c = 0; c < columns; c += 1) {
        var from = Math.floor(c * step), to = Math.min(n, Math.floor((c + 1) * step)), best = from, bestValue = -1;
        for (var q = from; q < to; q += 1) {
          var total = 0;
          stacked.forEach(function (s) { total += s.values[q] || 0; });
          lines.forEach(function (s) { total = Math.max(total, s.values[q] || 0); });
          if (total > bestValue) { bestValue = total; best = q; }
        }
        picks.push(best);
      }
    }
    if (stacked.length > 0) {
      var base = picks.map(function () { return 0; });
      stacked.forEach(function (s) {
        ctx.beginPath();
        picks.forEach(function (index, k) { var v = base[k] + (s.values[index] || 0); var px = self.xAt(index); if (k === 0) ctx.moveTo(px, y(v)); else ctx.lineTo(px, y(v)); });
        for (var k = picks.length - 1; k >= 0; k -= 1) ctx.lineTo(self.xAt(picks[k]), y(base[k]));
        ctx.closePath();
        ctx.globalAlpha = 0.75; ctx.fillStyle = s.color; ctx.fill(); ctx.globalAlpha = 1;
        picks.forEach(function (index, k) { base[k] += s.values[index] || 0; });
      });
    }
    lines.forEach(function (s) {
      ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.3;
      var started = false;
      picks.forEach(function (index) {
        var v = s.values[index];
        if (v == null) { started = false; return; }
        var px = self.xAt(index);
        if (!started) { ctx.moveTo(px, y(v)); started = true; } else ctx.lineTo(px, y(v));
      });
      ctx.stroke();
    });
    this.overlay();
  };
  Chart.prototype.overlay = function () {
    var ctx = this.top.getContext("2d");
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    var o = this.options, self = this;
    if (o.marks) {
      ctx.fillStyle = "#e05a4a";
      o.marks.forEach(function (index) { ctx.fillRect(self.xAt(index) - 1, self.pad.t, 2, 4); });
    }
    if (hoverIndex < 0 || hoverIndex >= o.x.length) { this.tip.style.display = "none"; return; }
    var x = Math.round(this.xAt(hoverIndex)) + 0.5;
    ctx.strokeStyle = "#5ec8dc"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, this.pad.t); ctx.lineTo(x, this.height - this.pad.b); ctx.stroke();
    var lines = [o.xLabel ? o.xLabel(hoverIndex) : String(o.x[hoverIndex])];
    var total = 0;
    o.series.forEach(function (s) {
      if (self.hidden[s.key]) return;
      var v = s.values[hoverIndex];
      if (s.stack) total += v || 0;
      if (v == null) return;
      lines.push("<span style=\"color:" + s.color + "\">" + escapeHtml(s.label) + "</span> " + fmt(v, s.digits == null ? 2 : s.digits));
    });
    if (o.series.some(function (s) { return s.stack; })) lines.splice(1, 0, "sum " + fmt(total, 2));
    this.tip.innerHTML = lines.join("<br>");
    this.tip.style.display = "block";
    var left = x + 12; if (left + this.tip.offsetWidth > this.width) left = x - this.tip.offsetWidth - 12;
    this.tip.style.left = Math.max(0, left) + "px"; this.tip.style.top = "4px";
  };
  function niceMax(value) { var p = Math.pow(10, Math.floor(Math.log10(value))); var m = value / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
  function fmtAxis(value) { return value >= 1000 ? (value / 1000).toFixed(1) + "k" : value >= 10 ? value.toFixed(0) : value.toFixed(value >= 1 ? 1 : 2); }
  function escapeHtml(text) { return String(text).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  var resizeTimer = 0;
  window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { charts.forEach(function (chart) { chart.draw(); }); }, 120); });

  // --- ayrinti ---
  function renderDetail(id) {
    charts = []; hoverIndex = -1;
    app.innerHTML = "";
    app.appendChild(el("div", { class: "panel", text: t("loading") }));
    api("/matches/" + encodeURIComponent(id) + "/timeline").then(function (data) { drawDetail(id, data); }).catch(handleError);
  }

  function drawDetail(id, data) {
    charts = [];
    app.innerHTML = "";
    var summary = data.summary || {};
    var seconds = data.seconds || [];
    var x = seconds.map(function (s) { return s.i; });
    var waves = seconds.map(function (s) { return s.wave; });
    function at(index) { var s = seconds[index]; return s ? "#" + s.i + "  W" + s.wave + " " + s.ph + "  " + fmtDur(s.up) : ""; }
    var secondByAt = seconds.map(function (s) { return s.at; });
    function indexForAt(time) { var lo = 0, hi = secondByAt.length - 1; if (hi < 0) return -1; while (lo < hi) { var mid = (lo + hi) >> 1; if (secondByAt[mid] < time) lo = mid + 1; else hi = mid; } return lo; }
    var spikeMarks = (data.spikes || []).map(function (s) { return indexForAt(s.at); });

    var top = el("div", { class: "panel" });
    top.appendChild(el("div", { class: "row", style: "margin-bottom:10px" }, [
      el("a", { href: "#/", class: "btn", text: "< " + t("back") }),
      el("span", { class: "mono", text: id }),
      el("span", { class: "sp", style: "flex:1" }),
      el("button", { text: t("dlTimeline"), onclick: function () { download("/matches/" + encodeURIComponent(id) + "/timeline?download=1", id + ".timeline.json"); } }),
      el("button", { class: "primary", text: t("dlReplay"), onclick: function () { download("/matches/" + encodeURIComponent(id) + "/replay", id + ".ndjson.gz"); } })
    ]));
    var header = data.header || {};
    var tick = summary.tick || {};
    var client = summary.client || {};
    var cards = el("div", { class: "cards" });
    function card(key, value, cls, small) { cards.appendChild(el("div", { class: "card" }, [el("div", { class: "k", text: key }), el("div", { class: "v " + (cls || "") }, [value, small ? el("small", { text: " " + small }) : null])])); }
    card(t("date"), fmtDate(summary.createdAt));
    card(t("dur"), fmtDur(summary.durationS));
    card(t("stage") + " / " + t("mode"), (summary.stage || "-") + " / " + (summary.mode || "-"));
    card(t("ops"), (summary.operators || []).join(", ") || "-");
    card(t("wave") + " / " + t("outcome"), (summary.wave || "-") + " / " + (summary.result || summary.status || "-"));
    card(t("tickAvg"), fmt(tick.avg, 2), "", "ms");
    card("p95 / p99", fmt(tick.p95) + " / " + fmt(tick.p99), tone(tick.p99 || 0, 4, 10), "ms");
    card(t("tickMax"), fmt(tick.max), tone(tick.max || 0, 8, 16.7), "ms");
    card(t("worstSec"), summary.worstSecond ? fmt(summary.worstSecond.p95) : "-", "", summary.worstSecond ? "W" + summary.worstSecond.wave : "");
    card(t("spikes"), String(summary.spikes || 0), (summary.spikes || 0) > 0 ? "warn" : "good", summary.spikeMaxMs ? "max " + fmt(summary.spikeMaxMs) + " ms" : "");
    card("Loop dt max", fmt(summary.loop && summary.loop.dtMax), tone(summary.loop ? summary.loop.dtMax : 0, 34, 60), "ms");
    card(t("fpsAvg") + " / min", client.fpsAvg != null ? fmt(client.fpsAvg, 0) + " / " + fmt(client.fpsMin, 0) : "-", client.fpsMin != null ? toneLow(client.fpsMin, 45, 25) : "dim");
    card(t("maxEnemies"), String(summary.maxEnemies || 0), "", (summary.maxProjectiles || 0) + " proj");
    card(t("wireMax"), fmt(summary.wire && summary.wire.maxKbps), "", (summary.wire && summary.wire.skipped ? summary.wire.skipped + " skip" : ""));
    card(t("recOverhead"), fmt(summary.recorderUs && summary.recorderUs.avg, 1), "", "us/tick");
    card(t("replay"), summary.replay ? summary.replay.events + " " + t("events") : "-", summary.replay && summary.replay.truncated ? "warn" : "", summary.replay ? summary.replay.ticks + " " + t("ticksL") + ", " + summary.replay.fingerprints + " " + t("fingerprints") + (summary.replay.truncated ? ", " + t("truncated") : "") : "");
    card("Server", String(header.server ? (header.server.version || "") : ""), "dim");
    top.appendChild(cards);
    app.appendChild(top);

    app.appendChild(diagnose(summary, seconds, data));

    var grid = el("div", { class: "charts" });
    app.appendChild(grid);
    var pick = function (index) { var row = document.querySelector("[data-sec=\"" + index + "\"]"); if (row) row.scrollIntoView({ block: "center" }); };
    var tickSeries = SECTIONS.map(function (key, index) { return { key: key, label: key, stack: true, color: COLORS[index], values: seconds.map(function (s) { return s.s ? s.s[key] : 0; }), digits: 3 }; });
    tickSeries.push({ key: "p95", label: "p95", color: "#ffffff", values: seconds.map(function (s) { return s.tk ? s.tk.p95 : null; }), width: 1 });
    tickSeries.push({ key: "max", label: "max", color: "#e05a4a", values: seconds.map(function (s) { return s.tk ? s.tk.max : null; }), width: 1 });
    new Chart(grid, { title: t("chTick"), x: x, xLabel: at, series: tickSeries, waves: waves, marks: spikeMarks, budget: 16.7, onPick: pick });
    new Chart(grid, { title: t("chDt"), x: x, xLabel: at, waves: waves, series: [
      { key: "dt", label: "avg", values: seconds.map(function (s) { return s.dt; }) },
      { key: "dtMax", label: "max", color: "#e05a4a", values: seconds.map(function (s) { return s.dtMax; }) },
      { key: "tn", label: "ticks/s", color: "#6cc48a", values: seconds.map(function (s) { return s.tn; }), digits: 0 }
    ] });
    var entityKeys = ["enemies", "towers", "structures", "projectiles", "beams", "drones", "bodies", "damageEvents", "killEvents", "zones"];
    new Chart(grid, { title: t("chEnt"), x: x, xLabel: at, waves: waves, series: entityKeys.map(function (key) { return { key: key, label: key, values: seconds.map(function (s) { return s.e ? s.e[key] : null; }), digits: 0 }; }) });
    var sessions = {};
    seconds.forEach(function (s) { if (s.w && s.w.out) for (var sid in s.w.out) sessions[sid] = true; });
    var wireSeries = Object.keys(sessions).map(function (sid) { return { key: "out-" + sid, label: sid + " KB/s", values: seconds.map(function (s) { return s.w && s.w.out ? (s.w.out[sid] || 0) / 1024 : 0; }) }; });
    wireSeries.push({ key: "hz", label: "snapshot Hz", color: "#e0e0e0", values: seconds.map(function (s) { return s.w ? s.w.hz : null; }) });
    wireSeries.push({ key: "skip", label: "skipped", color: "#e05a4a", values: seconds.map(function (s) { return s.w ? s.w.skip : null; }), digits: 0 });
    wireSeries.push({ key: "patch", label: "state patch ms", color: "#9b7fe0", values: seconds.map(function (s) { return s.patch ? s.patch.ms : null; }) });
    new Chart(grid, { title: t("chWire"), x: x, xLabel: at, waves: waves, series: wireSeries });
    new Chart(grid, { title: t("chProc"), x: x, xLabel: at, waves: waves, series: [
      { key: "elMax", label: "loop max ms", color: "#e05a4a", values: seconds.map(function (s) { return s.pr ? s.pr.elMax : null; }) },
      { key: "elP99", label: "loop p99 ms", values: seconds.map(function (s) { return s.pr ? s.pr.elP99 : null; }) },
      { key: "gcMs", label: "GC ms/s", color: "#e0a03a", values: seconds.map(function (s) { return s.pr ? s.pr.gcMs : null; }) },
      { key: "cpu", label: "CPU % (1 core)", color: "#6cc48a", values: seconds.map(function (s) { return s.pr ? s.pr.cpu : null; }) },
      { key: "rooms", label: "rooms", color: "#a0a8b0", values: seconds.map(function (s) { return s.pr ? s.pr.rooms : null; }), digits: 0 }
    ] });
    new Chart(grid, { title: t("chMem"), x: x, xLabel: at, waves: waves, series: [
      { key: "rss", label: "rss", values: seconds.map(function (s) { return s.pr ? s.pr.rss : null; }), digits: 0 },
      { key: "heap", label: "heap", color: "#e0a03a", values: seconds.map(function (s) { return s.pr ? s.pr.heap : null; }), digits: 0 },
      { key: "ext", label: "external", color: "#9b7fe0", values: seconds.map(function (s) { return s.pr ? s.pr.ext : null; }), digits: 0 }
    ] });

    // istemci: ornekleri saniye eksenine yerlestir
    var samples = data.clients || [];
    var clientIds = [];
    samples.forEach(function (sample) { if (clientIds.indexOf(sample.s) < 0) clientIds.push(sample.s); });
    if (clientIds.length > 0) {
      function clientSeries(field, suffix, digits) {
        return clientIds.map(function (sid, index) {
          var values = x.map(function () { return null; });
          samples.forEach(function (sample) { if (sample.s !== sid) return; var i = indexForAt(sample.at); if (i >= 0 && sample[field] != null) values[i] = sample[field]; });
          fillGaps(values, 6);
          return { key: field + sid, label: sid + suffix, color: COLORS[index % COLORS.length], values: values, digits: digits };
        });
      }
      new Chart(grid, { title: t("chClientFps"), x: x, xLabel: at, waves: waves, series: clientSeries("fps", " avg", 0).concat(clientSeries("fpsMin", " min", 0).map(function (s) { s.color = shade(s.color); return s; })) });
      var ftSeries = clientSeries("ftP95", " p95", 1);
      if (clientIds.length === 1) {
        CLIENT_SECTIONS.forEach(function (field, index) {
          var values = x.map(function () { return null; });
          samples.forEach(function (sample) { var i = indexForAt(sample.at); if (i >= 0 && sample[field] != null) values[i] = sample[field]; });
          fillGaps(values, 6);
          ftSeries.push({ key: field, label: field.slice(1), stack: true, color: COLORS[(index + 2) % COLORS.length], values: values });
        });
      }
      new Chart(grid, { title: t("chClientFt"), x: x, xLabel: at, waves: waves, series: ftSeries, budget: 16.7 });
      new Chart(grid, { title: t("chLod"), x: x, xLabel: at, waves: waves, min: 4, series: clientSeries("lodMax", " lod", 0) });
      new Chart(grid, { title: t("chPing"), x: x, xLabel: at, waves: waves, series: clientSeries("ping", " ping", 0).concat(clientSeries("pingMax", " max", 0).map(function (s) { s.color = shade(s.color); return s; })) });
    }

    app.appendChild(spikeTable(data.spikes || [], indexForAt));
    app.appendChild(waveTable(data.waves || []));
    app.appendChild(clientTable(samples, clientIds));
  }

  function fillGaps(values, limit) { var last = null, gap = 0; for (var i = 0; i < values.length; i += 1) { if (values[i] != null) { last = values[i]; gap = 0; } else if (last != null && gap < limit) { values[i] = last; gap += 1; } } }
  function shade(color) { return color + "88"; }

  function diagnose(summary, seconds, data) {
    var box = el("div", { class: "panel" });
    box.appendChild(el("h2", { text: t("diagnosis") }));
    var tick = summary.tick || {};
    var items = [];
    var worst = 0, gcWorst = 0, cpuWorst = 0, skips = 0, elWorst = 0;
    seconds.forEach(function (s) {
      if (s.pr) { if (s.pr.gcMs > gcWorst) gcWorst = s.pr.gcMs; if (s.pr.cpu > cpuWorst) cpuWorst = s.pr.cpu; if (s.pr.elMax > elWorst) elWorst = s.pr.elMax; }
      if (s.w) skips += s.w.skip || 0;
      if (s.tk && s.tk.p95 > worst) worst = s.tk.p95;
    });
    var dominant = {};
    (data.spikes || []).forEach(function (spike) { dominant[spike.dom] = (dominant[spike.dom] || 0) + 1; });
    var domText = Object.keys(dominant).sort(function (a, b) { return dominant[b] - dominant[a]; }).map(function (key) { return key + " x" + dominant[key]; }).join(", ");
    if ((tick.p99 || 0) >= 10 || (tick.max || 0) >= 16.7) items.push(["bad", t("vServerBad") + ": p99 " + fmt(tick.p99) + " ms, max " + fmt(tick.max) + " ms" + (domText ? " (" + domText + ")" : "")]);
    else items.push(["good", t("vServerOk") + ": p99 " + fmt(tick.p99) + " ms, max " + fmt(tick.max) + " ms"]);
    if (summary.loop && summary.loop.dtMax >= 50) items.push(["warn", t("vLoop") + ": dt max " + fmt(summary.loop.dtMax) + " ms, loop max " + fmt(elWorst) + " ms"]);
    if (gcWorst >= 50) items.push(["warn", t("vGc") + ": " + fmt(gcWorst) + " ms/s"]);
    if (cpuWorst >= 85) items.push(["warn", t("vCpu") + ": " + fmt(cpuWorst, 0) + "%"]);
    if (skips > 0) items.push(["warn", t("vWire") + ": " + skips]);
    var client = summary.client || {};
    if (client.fpsMin != null && client.fpsMin < 40) items.push([client.fpsMin < 25 ? "bad" : "warn", t("vClient") + ": min " + fmt(client.fpsMin, 0) + ", avg " + fmt(client.fpsAvg, 0) + (client.lodMax != null ? ", LOD " + client.lodMax : "")]);
    if (items.length === 1 && items[0][0] === "good" && !(client.fpsMin != null && client.fpsMin < 40)) items.push(["good", t("vOk")]);
    items.forEach(function (item) { box.appendChild(el("div", { class: "verdict " + item[0], text: item[1] })); });
    return box;
  }

  function sortableTable(title, columns, rows, rowAttrs) {
    var box = el("div", { class: "panel" });
    box.appendChild(el("h2", { text: title }));
    var state = { sort: null, dir: -1 };
    var holder = el("div", { class: "scroll" });
    box.appendChild(holder);
    function draw() {
      var list = rows.slice();
      if (state.sort) { var c = columns[state.sort]; list.sort(function (a, b) { var x = c.get(a), y = c.get(b); return (x > y ? 1 : x < y ? -1 : 0) * state.dir; }); }
      var table = el("table", { class: "tbl" });
      var head = el("tr");
      columns.forEach(function (c, index) { head.appendChild(el("th", { class: state.sort === index ? "sorted" : "", text: c.label, onclick: function () { if (state.sort === index) state.dir = -state.dir; else { state.sort = index; state.dir = -1; } draw(); } })); });
      table.appendChild(el("thead", {}, [head]));
      var tbody = el("tbody");
      list.forEach(function (row) {
        var tr = el("tr", rowAttrs ? rowAttrs(row) : {});
        columns.forEach(function (c) { var v = c.get(row); tr.appendChild(el("td", { class: (c.num ? "n " : "") + (c.tone ? c.tone(v, row) : ""), text: c.show ? c.show(v, row) : (v == null ? "-" : String(v)) })); });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      holder.innerHTML = ""; holder.appendChild(table);
    }
    if (rows.length === 0) holder.appendChild(el("div", { class: "dim", text: "-" })); else draw();
    return box;
  }

  function spikeTable(spikes, indexForAt) {
    var num = function (v) { return fmt(v, 2); };
    return sortableTable(t("spikeList"), [
      { label: t("sec"), num: true, get: function (s) { return indexForAt(s.at); } },
      { label: t("wave"), num: true, get: function (s) { return s.e ? s.e.wave : null; } },
      { label: t("kind"), get: function (s) { return s.kind; } },
      { label: t("ms"), num: true, get: function (s) { return s.ms; }, show: num, tone: function (v) { return tone(v, 16.7, 33); } },
      { label: "dt", num: true, get: function (s) { return s.dt; }, show: num },
      { label: t("dom"), get: function (s) { return s.dom + (s.s && s.s[s.dom] != null ? " " + fmt(s.s[s.dom], 2) : ""); } },
      { label: t("enemies"), num: true, get: function (s) { return s.e ? s.e.enemies : null; } },
      { label: t("projectiles"), num: true, get: function (s) { return s.e ? s.e.projectiles : null; } },
      { label: t("towers"), num: true, get: function (s) { return s.e ? s.e.towers : null; } },
      { label: "dmgEv", num: true, get: function (s) { return s.e ? s.e.damageEvents : null; } },
      { label: "target chk", num: true, get: function (s) { return s.ops ? s.ops.tc : null; } },
      { label: "GC ms/s", num: true, get: function (s) { return s.pr ? s.pr.gcMs : null; } },
      { label: "CPU%", num: true, get: function (s) { return s.pr ? s.pr.cpu : null; } },
      { label: "rooms", num: true, get: function (s) { return s.pr ? s.pr.rooms : null; } }
    ], spikes, function (s) { return { class: "click", onclick: function () { setHover(indexForAt(s.at)); window.scrollTo({ top: 0, behavior: "smooth" }); } }; });
  }

  function waveTable(waves) {
    var columns = [
      { label: t("wave"), num: true, get: function (w) { return w.wave; } },
      { label: t("dur"), num: true, get: function (w) { return w.durS; }, show: function (v) { return fmtDur(v); } },
      { label: "avg ms", num: true, get: function (w) { return w.avg; }, show: function (v) { return fmt(v, 3); } },
      { label: "max ms", num: true, get: function (w) { return w.max; }, show: function (v) { return fmt(v, 2); }, tone: function (v) { return tone(v, 8, 16.7); } },
      { label: t("spikes"), num: true, get: function (w) { return w.spikes; } },
      { label: t("enemies") + " max", num: true, get: function (w) { return w.enemiesMax; } },
      { label: t("projectiles") + " max", num: true, get: function (w) { return w.projectilesMax; } }
    ];
    SECTIONS.forEach(function (key) { columns.push({ label: key, num: true, get: function (w) { return w.s ? w.s[key] : null; }, show: function (v) { return fmt(v, 3); } }); });
    return sortableTable(t("waveList"), columns, waves);
  }

  function clientTable(samples, clientIds) {
    if (clientIds.length === 0) { var box = el("div", { class: "panel" }); box.appendChild(el("h2", { text: t("clientList") })); box.appendChild(el("div", { class: "dim", text: t("noClient") })); return box; }
    var rows = clientIds.map(function (sid) {
      var mine = samples.filter(function (s) { return s.s === sid; });
      var last = mine[mine.length - 1] || {};
      var avg = function (field) { var list = mine.map(function (s) { return s[field]; }).filter(function (v) { return v != null; }); return list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : null; };
      var min = function (field) { var list = mine.map(function (s) { return s[field]; }).filter(function (v) { return v != null; }); return list.length ? Math.min.apply(null, list) : null; };
      var max = function (field) { var list = mine.map(function (s) { return s[field]; }).filter(function (v) { return v != null; }); return list.length ? Math.max.apply(null, list) : null; };
      var sum = function (field) { return mine.reduce(function (a, s) { return a + (s[field] || 0); }, 0); };
      return { sid: sid, n: mine.length, fps: avg("fps"), fpsMin: min("fpsMin"), ftMax: max("ftMax"), lodMax: max("lodMax"), ping: avg("ping"), drops: sum("drops"), starve: sum("starve"), hidden: sum("hidden"), ctxLost: sum("ctxLost"), heap: max("heapMb"),
        device: [last.device, last.os, last.browser, last.renderer, last.dpr ? "dpr " + last.dpr : "", last.cw ? last.cw + "x" + last.ch : "", last.cores ? last.cores + "c" : "", last.memGb ? last.memGb + "GB" : ""].filter(Boolean).join(" ") };
    });
    return sortableTable(t("clientList"), [
      { label: "id", get: function (r) { return r.sid; } },
      { label: t("samples"), num: true, get: function (r) { return r.n; } },
      { label: "FPS", num: true, get: function (r) { return r.fps; }, show: function (v) { return fmt(v, 0); }, tone: function (v) { return v == null ? "" : toneLow(v, 45, 25); } },
      { label: "FPS min", num: true, get: function (r) { return r.fpsMin; }, show: function (v) { return fmt(v, 0); }, tone: function (v) { return v == null ? "" : toneLow(v, 45, 25); } },
      { label: "frame max", num: true, get: function (r) { return r.ftMax; }, show: function (v) { return fmt(v, 0); } },
      { label: "LOD max", num: true, get: function (r) { return r.lodMax; } },
      { label: "ping", num: true, get: function (r) { return r.ping; }, show: function (v) { return fmt(v, 0); } },
      { label: "drops", num: true, get: function (r) { return r.drops; } },
      { label: "starve", num: true, get: function (r) { return r.starve; } },
      { label: "hidden", num: true, get: function (r) { return r.hidden; } },
      { label: "ctxLost", num: true, get: function (r) { return r.ctxLost; }, tone: function (v) { return v > 0 ? "bad" : ""; } },
      { label: "heap MB", num: true, get: function (r) { return r.heap; } },
      { label: t("device"), get: function (r) { return r.device; } }
    ], rows);
  }

  // --- yonlendirme ---
  function route() {
    document.documentElement.lang = lang;
    document.getElementById("lang").textContent = lang === "tr" ? "EN" : "TR";
    document.getElementById("logout").textContent = t("logout");
    if (!token) { renderLogin(); return; }
    var match = /^#\/m\/([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (match) renderDetail(match[1]); else renderList();
  }
  document.getElementById("lang").addEventListener("click", function () { lang = lang === "tr" ? "en" : "tr"; try { localStorage.setItem("nx-admin-lang", lang); } catch (e) {} route(); });
  document.getElementById("logout").addEventListener("click", function () { token = ""; try { sessionStorage.removeItem("nx-admin-token"); } catch (e) {} route(); });
  window.addEventListener("hashchange", route);
  route();
})();
</script>
</body>
</html>
`;
