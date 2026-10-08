/**
 * Masaustunde menunun bos kenarlarinda kaydirma (apps/web/src/menu-scroll.ts).
 *
 * Menu ortada 460 px'lik bir sutun; kaydirilan kutu sutunun icindeki ekran.
 * Sutunun disinda tekerlek ve touchpad'in iki parmak kaydirmasi hicbir seyi
 * kaydirmiyordu (sikayet: "masaustundeyken ana ekranda asagi kaydiramiyorum").
 * Kenardaki dikey kaydirma etkin ekrana gidiyor; sutunun icindeki kaydirma
 * tarayicinin, yakinlastirma (Ctrl / sikistirma) ve yatay kaydirma dokunulmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { importWebModule } from "./helpers/web-module.mjs";

const { scrollScreenForStrayWheel } = await importWebModule("apps/web/src/menu-scroll.ts");

function fakeMenu() {
  const screen = { scrollTop: 0, clientHeight: 700 };
  const inside = { name: "sutunun icindeki dugme" };
  const stage = { contains: (node) => node === inside, querySelector: (selector) => (selector === ".screen" ? screen : null) };
  const host = { querySelector: (selector) => (selector === ".menu-stage" ? stage : null) };
  return { host, screen, inside, outside: { name: "kabugun bos kenari" } };
}

const wheel = (target, deltaY, overrides = {}) => ({ target, deltaY, deltaMode: 0, ctrlKey: false, ...overrides });

test("sütunun dışındaki tekerlek ve touchpad kaydırması etkin ekranı kaydırır", () => {
  const { host, screen, outside } = fakeMenu();
  assert.equal(scrollScreenForStrayWheel(host, wheel(outside, 120)), true);
  assert.equal(screen.scrollTop, 120);
  // Touchpad'in kucuk, art arda gelen piksel adimlari toplaniyor.
  for (const step of [4, 9, 15, 9, 4]) scrollScreenForStrayWheel(host, wheel(outside, step));
  assert.equal(screen.scrollTop, 161);
  scrollScreenForStrayWheel(host, wheel(outside, -61));
  assert.equal(screen.scrollTop, 100);
});

test("satır ve sayfa kipindeki tekerlek piksele çevrilir", () => {
  const { host, screen, outside } = fakeMenu();
  scrollScreenForStrayWheel(host, wheel(outside, 3, { deltaMode: 1 }));
  assert.equal(screen.scrollTop, 48);
  scrollScreenForStrayWheel(host, wheel(outside, 1, { deltaMode: 2 }));
  assert.equal(screen.scrollTop, 748);
});

test("sütunun içi, yakınlaştırma ve yatay kaydırma dokunulmaz", () => {
  const { host, screen, inside, outside } = fakeMenu();
  assert.equal(scrollScreenForStrayWheel(host, wheel(inside, 120)), false, "sutunun ici tarayicinin");
  assert.equal(scrollScreenForStrayWheel(host, wheel(outside, 120, { ctrlKey: true })), false, "sikistirma yakinlastirma");
  assert.equal(scrollScreenForStrayWheel(host, wheel(outside, 0)), false, "yatay kaydirma");
  assert.equal(screen.scrollTop, 0);
  // Ekran yokken (oyun basladi, menu bos) hicbir sey olmuyor.
  assert.equal(scrollScreenForStrayWheel({ querySelector: () => null }, wheel(outside, 120)), false);
});
