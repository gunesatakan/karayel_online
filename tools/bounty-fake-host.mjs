/**
 * Sahte Bounty Board barindiricisi: bulut kaydini yerelde denemek icin.
 *
 * Derlenmis oyunu `/game/` altinda, `/` adresinde de onu saydam olmayan
 * kokenli (opaque origin) bir cerceveye gomen sayfayi sunar. O cercevede,
 * Bounty Board'daki gibi, `localStorage` erisimde hata firlatir; sayfa
 * Arcade SDK'nin `load` / `save` isteklerini kendi `localStorage`indan
 * cevaplar ve gelen mesajlari listeler. Ayrinti: docs/bounty-board.md.
 *
 *   npm run build --workspace @karayel/web
 *   node tools/bounty-fake-host.mjs            # http://localhost:4599
 *
 * Kipler (adres cubugunda): `?mode=player` (varsayilan, giris yapmis),
 * `?mode=guest` (kayit reddedilir), `?mode=silent` (hic cevap yok);
 * `&reset=1` sahte bulut kaydini siler. Yalnizca yerel gelistirme araci.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(process.argv[2] ?? fileURLToPath(new URL("../apps/web/dist", import.meta.url)));
const port = Number(process.argv[3] ?? 4599);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".woff2": "font/woff2" };

const HOST_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Fake Bounty Board host</title>
<style>body{font:13px system-ui;margin:12px;background:#111;color:#ddd}iframe{width:405px;height:720px;border:1px solid #444;float:left;margin-right:12px}pre{white-space:pre-wrap}</style>
<iframe id="game" sandbox="allow-scripts allow-pointer-lock" src="/game/index.html"></iframe>
<div>mode: <b id="mode"></b> | saves: <b id="saves">0</b> | loads: <b id="loads">0</b></div>
<div>saved keys: <span id="keys"></span></div>
<pre id="log"></pre>
<script>
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") || "player"; // player | guest | silent
  const KEY = "bb-fake-save";
  if (params.has("reset")) localStorage.removeItem(KEY);
  document.getElementById("mode").textContent = mode;
  const frame = document.getElementById("game");
  const log = document.getElementById("log");
  const seen = [];
  let saves = 0, loads = 0;
  function note(text) { seen.push(text); log.textContent = seen.slice(-60).join("\\n"); }
  function showKeys() {
    try {
      const raw = localStorage.getItem(KEY);
      const ls = raw ? JSON.parse(raw).ls || {} : {};
      document.getElementById("keys").textContent = Object.keys(ls).sort().join(", ") || "(none)";
    } catch (e) { document.getElementById("keys").textContent = "(unparsable)"; }
  }
  showKeys();
  window.__harness = { seen, get saves() { return saves; }, get loads() { return loads; }, read() { return localStorage.getItem(KEY); } };
  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.source !== "bb-arcade") return;
    note(data.type + (typeof data.score === "number" ? " score=" + data.score : "") + (data.requestId ? " [request]" : "") + " origin=" + event.origin);
    if (data.type === "init" && mode !== "silent") {
      frame.contentWindow.postMessage({ source: "bb-arcade-host", type: "config", player: mode === "player" ? { name: "Tester", avatarUrl: null } : null }, "*");
    }
    if (!data.requestId || mode === "silent") return;
    const reply = (body) => frame.contentWindow.postMessage({ source: "bb-arcade", requestId: data.requestId, ...body }, "*");
    if (data.type === "load") {
      loads += 1;
      document.getElementById("loads").textContent = loads;
      if (mode === "guest") return reply({ type: "load_result", ok: false, code: "unauthenticated" });
      reply({ type: "load_result", ok: true, data: localStorage.getItem(KEY) });
    } else if (data.type === "save") {
      if (mode === "guest") return reply({ type: "save_result", ok: false, code: "unauthenticated" });
      saves += 1;
      document.getElementById("saves").textContent = saves;
      localStorage.setItem(KEY, data.payload);
      showKeys();
      reply({ type: "save_result", ok: true });
    }
  });
</script>`;

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  if (url.pathname === "/") {
    response.writeHead(200, { ...headers, "Content-Type": TYPES[".html"] });
    return response.end(HOST_PAGE);
  }
  if (!url.pathname.startsWith("/game/")) {
    response.writeHead(404, headers);
    return response.end("not found");
  }
  const relative = normalize(decodeURIComponent(url.pathname.slice("/game/".length)) || "index.html");
  const file = join(dist, relative);
  if (!file.startsWith(dist)) {
    response.writeHead(403, headers);
    return response.end("forbidden");
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { ...headers, "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, headers);
    response.end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`fake host on http://localhost:${port}`));
