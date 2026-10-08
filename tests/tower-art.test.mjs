/**
 * Kademe basina boyanmis kule resimleri (apps/web/src/tower-art.ts).
 *
 * Takipci, Obsesyon, Debug Lazer ve Ucube seviye 1-4, 5-9 ve 10 icin ayri resim tasiyor;
 * resim kendi karesini dolduruyor. Uretici bazen saydamlik yerine gri-beyaz
 * dama desenini resmin icine ciziyor (Obsesyon'un ilk resmi oyleydi): dosyada
 * saydamlik kanali hic olmuyor ve kule opak bir kare olarak cikiyordu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { TOWER_ART_DISC_RATIO } from "../packages/shared/dist/index.js";
import { importWebModule } from "./helpers/web-module.mjs";

const art = await importWebModule("apps/web/src/tower-art.ts");

/** Dosyanin saydamlik kanali var mi: PNG renk tipi / tRNS, WebP VP8X ya da VP8L bayragi. */
function hasAlphaChannel(bytes) {
  if (bytes.subarray(1, 4).toString("latin1") === "PNG") {
    const colorType = bytes[25];
    return colorType === 4 || colorType === 6 || bytes.includes(Buffer.from("tRNS"));
  }
  assert.equal(bytes.subarray(8, 12).toString("latin1"), "WEBP", "PNG ya da WebP degil");
  const chunk = bytes.subarray(12, 16).toString("latin1");
  if (chunk === "VP8X") return (bytes[20] & 0x10) !== 0;
  if (chunk === "VP8L") return ((bytes.readUInt32LE(21) >>> 28) & 1) === 1;
  return false;
}

test("kademe resmi seviyenin kademesine gore seciliyor; digerleri tek resim", () => {
  for (const id of ["warrior-1", "warrior-4", "warrior-5", "warrior-6"]) {
    assert.equal(art.getTowerTextureKey(id, 1), `tower-${id}-levels-1-4`);
    assert.equal(art.getTowerTextureKey(id, 4), `tower-${id}-levels-1-4`);
    assert.equal(art.getTowerTextureKey(id, 5), `tower-${id}-levels-5-9`);
    assert.equal(art.getTowerTextureKey(id, 9), `tower-${id}-levels-5-9`);
    assert.equal(art.getTowerTextureKey(id, 10), `tower-${id}-level-10`);
  }
  assert.equal(art.getTowerTextureKey("zeynep-1", 10), "tower-zeynep-1");
  assert.equal(art.getTieredTowerArtPath("warrior-4", 5), "images/towers/tower-warrior-4-levels-5-9.webp");
  assert.equal(art.getTieredTowerArtPath("warrior-1", 10), "images/towers/tower-warrior-1-level-10.png");
  assert.equal(art.getTieredTowerArtPath("zeynep-1", 5), undefined);
});

test("her kademe resmi pakette ve gercekten saydam", () => {
  const resimler = art.listTieredTowerArt();
  assert.equal(resimler.length, 12);
  for (const { path } of resimler) {
    const url = new URL(`../apps/web/public/${path}`, import.meta.url);
    assert.ok(existsSync(url), `pakette yok: ${path}`);
    assert.ok(hasAlphaChannel(readFileSync(url)), `saydamlik kanali yok (dama deseni resme mi cizilmis?): ${path}`);
  }
});

test("kademe resmi kareyi dolduruyor: cizim boyu kule izi, cikinti payi yok", () => {
  assert.equal(art.getTowerSpriteSize("warrior-1", 34), 34);
  assert.equal(art.getTowerSpriteSize("warrior-4", 34), 34);
  assert.equal(art.getTowerSpriteSize("warrior-5", 34), 34);
  assert.equal(art.getTowerSpriteSize("warrior-6", 68), 68);
  assert.equal(art.getTowerSpriteSize("zeynep-7", 68), 68 / TOWER_ART_DISC_RATIO);
});
