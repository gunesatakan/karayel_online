/**
 * Yapi basina cizim maliyeti (2026-10 uretim kaydi: 43 yapida telefon 15 fps).
 *
 * Phaser Graphics komutlarini her karede yeniden ucgenliyor. Duvar govdesi
 * her karede, gorunmez pilot alev her yapida, yuvarlak koseli can cubugu
 * tam canda bile ciziliyordu. Bunlar yalnizca degisince ya da gerekince.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const body = (name) => {
  const start = source.indexOf(`  private ${name}(`);
  assert.ok(start >= 0, `${name} yok`);
  return source.slice(start, source.indexOf("\n  }\n", start));
};

test("kenar yapisinin govdesi yalnizca durumu degisince yeniden ciziliyor", () => {
  const effects = body("renderTowerSpriteEffects");
  assert.ok(effects.indexOf("edgeBodyKeys.get(graphics) === key) return;") < effects.indexOf("graphics.clear();"));
  assert.doesNotMatch(body("renderAbartiEdgeBody"), /performance\.now\(\)/, "duvar govdesi saate bagli (her kare)");
});

test("performans alevi duvarda ve pilot seviyede cizilmiyor", () => {
  const flames = body("renderTowerPerformanceFlames");
  assert.match(flames, /tower\.performance === undefined \|\| this\.isEdgePlacedDefinition\(tower\.definitionId\)\) return;/);
  assert.match(flames, /intensity < PERFORMANCE_FLAME_MIN_INTENSITY\) return;/);
});

test("can cubugu tam canda gizli, duz dikdortgen ve yalnizca degisince ciziliyor", () => {
  const bar = body("drawTowerHealthBar");
  assert.match(bar, /graphics\.setVisible\(!full\);/);
  assert.match(bar, /healthBarKeys\.get\(graphics\) === key\) return;/);
  assert.doesNotMatch(bar, /fillRoundedRect/);
});
