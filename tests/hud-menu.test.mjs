/**
 * Mac ici ayarlar ve menu dugmesi; bekleme odasindan ayrilma.
 *
 * Kilitlenen sozler:
 *   1. Cubuktaki dugme ♪ degil, uc cizgili SVG simge; adi "Ayarlar ve menü".
 *      Emoji ya da muzik notasi yok.
 *   2. Panelin basligi "Menü"; "Menüye dön" basligin hemen altinda, ses
 *      kaydiricilarindan once. Ses, titresim ve veri kutusu yerinde.
 *   3. Bekleme odasinin "‹" dugmesi yalnizca ekrani degistirmiyor: izinli
 *      cikis, lobi odasi ve kayit siliniyor, oda listesine donuluyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { importWebModule } from "./helpers/web-module.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

test("cubuk: ayarlar ve menu dugmesi SVG simge, ♪ yok", () => {
  const hud = read("apps/web/src/game-control-ui.ts");
  const actions = hud.slice(hud.indexOf("<div class=\"game-hud__actions\">"), hud.indexOf("<div class=\"game-hud__strip\""));
  assert.match(actions, /<button class="game-hud__menu-button" data-hud="menu"><svg class="game-hud__menu-glyph"[^>]*aria-hidden="true"/);
  assert.equal(actions.includes("♪"), false, "cubukta hala muzik notasi var");
  assert.equal(actions.includes("data-hud=\"audio\""), false);
  assert.match(hud, /menuButton\.setAttribute\("aria-label", t\("hud\.menuButton"\)\);/);
  assert.match(hud, /menuButton\.title = t\("hud\.menuButton"\);/);
  assert.match(hud, /if \(action === "menu"\) dispatch\("toggleAudioHud"\);/);

  // Simge dugmeyi genisletmiyor: 12 px, dugmenin en kucuk genisliginin icinde.
  const css = read("apps/web/src/style.css");
  const glyph = css.slice(css.indexOf(".game-hud__menu-glyph {"), css.indexOf("}", css.indexOf(".game-hud__menu-glyph {")));
  assert.match(glyph, /width: 12px;/);
  assert.match(glyph, /stroke: currentColor;/);
});

test("panel: baslik Menü, Menüye dön en ustte, ayarlar altinda", () => {
  const hud = read("apps/web/src/game-control-ui.ts");
  const popup = hud.slice(hud.indexOf("const renderAudioPopup = "), hud.indexOf("const volumeActions"));
  assert.match(popup, /<button data-hud="menu">×<\/button><strong>\$\{escapeHudText\(t\("hud\.menu\.title"\)\)\}<\/strong>`/);
  const quit = popup.indexOf("data-hud=\"quit\"");
  assert.ok(quit > 0, "menuye donus dugmesi yok");
  assert.ok(quit < popup.indexOf("hud.menu.title") + 200, "menuye donus basligin hemen altinda degil");
  for (const marker of ["hud.audio.title", "volumeSlider(t(\"hud.audio.music\")", "data-toggle=\"vibration\"", "data-toggle=\"telemetry\""]) {
    const at = popup.indexOf(marker);
    assert.ok(at > quit, `${marker} menuye donusten once ya da yok`);
  }
  assert.equal(popup.match(/data-hud="quit"/g).length, 1, "ikinci bir cikis dugmesi var");
  // Koyu kirmizi cerceve korunuyor.
  const css = read("apps/web/src/style.css");
  const rule = css.slice(css.indexOf(".game-hud__popup > .game-hud__popup-quit {"));
  assert.match(rule.slice(0, rule.indexOf("}")), /border-color: rgba\(180, 80, 90, 0\.7\);/);
});

test("metinler: TR ve EN", async () => {
  const i18n = await importWebModule("tests/fixtures/i18n-entry.ts");
  assert.equal(i18n.tr["hud.menuButton"], "Ayarlar ve menü");
  assert.equal(i18n.en["hud.menuButton"], "Settings & menu");
  assert.equal(i18n.tr["hud.menu.title"], "Menü");
  assert.equal(i18n.en["hud.menu.title"], "Menu");
  assert.equal(i18n.tr["menu.lobby.leave"], "Odadan ayrıl");
  assert.equal(i18n.en["menu.lobby.leave"], "Leave room");
  assert.equal("hud.audioButton" in i18n.tr, false);
  // Veri bildirimi artik ♪ panelini anmiyor.
  assert.equal(i18n.tr["consent.detail.optOut"].includes("♪"), false);
  assert.equal(i18n.en["consent.detail.optOut"].includes("♪"), false);
});

test("bekleme odasi: ‹ odadan izinli cikiyor ve oda listesine donuyor", () => {
  const menu = read("apps/web/src/menu-ui.ts");
  const lobby = menu.slice(menu.indexOf("function renderLobby("), menu.indexOf("function renderMapEditor("));
  assert.equal(lobby.includes("data-view=\"online\""), false, "lobi geri dugmesi yalnizca ekrani degistiriyor");
  assert.equal(lobby.match(/data-lobby-leave aria-label="\$\{t\("menu\.lobby\.leave"\)\}"/g)?.length, 2);

  const leave = menu.slice(menu.indexOf("const leaveLobby = () => {"), menu.indexOf("const refreshRoomListings = "));
  assert.ok(leave.length > 0, "leaveLobby yok");
  const order = ["currentLobbyRoom = undefined;", "currentLobbyState = undefined;", "leaveRoomAndForget(room)", "render(\"online\")", "refreshRoomListings()"];
  let last = -1;
  for (const step of order) {
    const at = leave.indexOf(step);
    assert.ok(at > last, `${step} yok ya da sirasi bozuk`);
    last = at;
  }
  assert.match(menu, /\[data-lobby-leave\]"\)\.forEach\(\(button\) => \{\n\s*button\.addEventListener\("click", leaveLobby\);/);

  // Birakilan odanin gec mesaji ekrani lobiye geri cekmiyor.
  const bind = menu.slice(menu.indexOf("const bindLobbyRoom = "), menu.indexOf("const leaveLobby = "));
  assert.equal(bind.match(/if \(currentLobbyRoom !== room\) return;/g)?.length, 3);
});

test("leaveRoomAndForget: kayitlar once siliniyor, izinli cikis, yukleme yok", async () => {
  const session = await importWebModule("apps/web/src/online-session.ts");
  const store = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    setTimeout,
    location: { reload: () => { throw new Error("lobiden ayrilma sayfayi yukledi"); } }
  };
  try {
    const order = [];
    const room = {
      roomId: "lobi1",
      reconnectionToken: "jeton",
      leave: (consented) => {
        order.push(`leave:${consented}`);
        order.push(`kayit:${session.loadMatchReconnect() ? "var" : "yok"}`);
        order.push(`lobi:${session.getActiveLobbyRoom() ? "var" : "yok"}`);
        return Promise.resolve(1000);
      }
    };
    session.saveMatchReconnect(room, { mode: "online", characterId: "warrior", mapScale: 1, stage: 1 });
    session.setActiveLobbyRoom(room);
    await session.leaveRoomAndForget(room);
    assert.deepEqual(order, ["leave:true", "kayit:yok", "lobi:yok"]);

    // Asili soket bekletmiyor; odasiz cagri sessiz.
    const startedAt = Date.now();
    await session.leaveRoomAndForget({ roomId: "lobi2", leave: () => new Promise(() => {}) }, 30);
    assert.ok(Date.now() - startedAt < 1000);
    await session.leaveRoomAndForget(undefined);

    // Baska odanin lobisi ve kaydi kaliyor.
    const other = { roomId: "baska", reconnectionToken: "j2", leave: () => Promise.resolve() };
    session.saveMatchReconnect(other, { mode: "online", characterId: "warrior", mapScale: 1, stage: 1 });
    session.setActiveLobbyRoom(other);
    await session.leaveRoomAndForget({ roomId: "lobi3", leave: () => Promise.resolve() });
    assert.equal(session.loadMatchReconnect()?.roomId, "baska");
    assert.equal(session.getActiveLobbyRoom(), other);
    session.setActiveLobbyRoom(undefined);
  } finally {
    delete globalThis.window;
  }
});
