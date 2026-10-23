/**
 * Lojistik iscilerin gorunusu (apps/web/src/worker-look.ts).
 *
 * Sahibin istegi (2026-10-24): Toplayici, Tasiyici ve Tamirci kolay
 * ayrilmali; renkler belirgin farkli, Tamircinin sekli de farkli. Secim
 * (onizlemeden B): Toplayici mor, Tasiyici kehribar, Tamirci yesil arti.
 * Eski cizim ayni dokuyu tint ile carpip Toplayici ile Tamirciyi ayni
 * maviye dusuruyordu; simdi her rolun kendi dokusu var, tint yok.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const { WORKER_LOOKS, WORKER_PLUS_ARM_RATIO, getWorkerLookRole, getWorkerPlusOutline } = await importWebModule("apps/web/src/worker-look.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

function hue(color) {
  const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

test("renkler: secilen uc renk, aralarinda en az 60 derece; dokular ayri, Tamirci arti", () => {
  assert.equal(WORKER_LOOKS.gatherer.color, 0x9b7ee0, "Toplayici mor");
  assert.equal(WORKER_LOOKS.carrier.color, 0xe0a63a, "Tasiyici kehribar");
  assert.equal(WORKER_LOOKS.repairer.color, 0x4cc77a, "Tamirci yesil");
  const looks = Object.values(WORKER_LOOKS);
  for (let i = 0; i < looks.length; i += 1) {
    for (let j = i + 1; j < looks.length; j += 1) {
      const gap = Math.abs(hue(looks[i].color) - hue(looks[j].color));
      assert.ok(Math.min(gap, 360 - gap) >= 60, `${looks[i].texture} ile ${looks[j].texture} birbirine yakin (${gap.toFixed(0)} derece)`);
    }
  }
  assert.equal(new Set(looks.map((look) => look.texture)).size, 3, "iki rol ayni dokuyu paylasiyor");
  assert.equal(WORKER_LOOKS.repairer.shape, "plus");
  assert.equal(WORKER_LOOKS.gatherer.shape, "diamond");
  assert.equal(WORKER_LOOKS.carrier.shape, "diamond");
  // Halka ve merkez govdeden acik: koyu zeminde silueti tutan cizgi.
  for (const look of looks) {
    const light = (color) => ((color >> 16) & 255) + ((color >> 8) & 255) + (color & 255);
    assert.ok(light(look.accent) > light(look.color), `${look.texture} halkasi govdeden koyu`);
  }
});

test("tel kipi: eski muhimmat kipleri ayni gorunuste, ulti dronlari isci degil", () => {
  assert.equal(getWorkerLookRole("crystalCollector"), "gatherer");
  assert.equal(getWorkerLookRole("ammoCollector"), "gatherer");
  assert.equal(getWorkerLookRole("energyTransport"), "carrier");
  assert.equal(getWorkerLookRole("ammoTransport"), "carrier");
  assert.equal(getWorkerLookRole("repairer"), "repairer");
  assert.equal(getWorkerLookRole("repair"), undefined, "AttackLord'un nexus dronu Tamirci degil");
  assert.equal(getWorkerLookRole("attack"), undefined);
});

test("arti: 12 kose, yaricap kadar uzaniyor, kol kalinligi orani, dort yonde simetrik", () => {
  const points = getWorkerPlusOutline(100, 50, 11);
  assert.equal(points.length, 12);
  const xs = points.map((point) => point.x - 100);
  const ys = points.map((point) => point.y - 50);
  assert.equal(Math.max(...xs), 11);
  assert.equal(Math.min(...xs), -11);
  assert.equal(Math.max(...ys), 11);
  assert.equal(Math.min(...ys), -11);
  const half = 11 * WORKER_PLUS_ARM_RATIO;
  assert.ok(Math.abs(half - 4) < 1e-9, "30 px dokuda kol 8 px kalin");
  // 90 derece dondurulunce ayni kume (arti donmuyor, sekli yone bagli degil).
  const key = (point) => `${Math.round(point.x * 1000)}:${Math.round(point.y * 1000)}`;
  const set = new Set(points.map((point) => key({ x: point.x - 100, y: point.y - 50 })));
  for (const point of points) assert.ok(set.has(key({ x: -(point.y - 50), y: point.x - 100 })));
});

test("baglanti: rol dokulari pisiriliyor, sahne tint carpmiyor, Tamirci donmuyor, liste ve agac ayni renkte", () => {
  const preloader = read("apps/web/src/scenes/PreloaderScene.ts");
  assert.match(preloader, /for \(const look of Object\.values\(WORKER_LOOKS\)\) this\.createWorkerTexture\(look\);/);
  assert.match(preloader, /this\.createDroneTexture\("drone-repair", 0x22d3ee, 0x86efac\);/, "AttackLord'un nexus dronu kendi dokusunda kalmali");
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /const texture = look \? look\.texture : drone\.mode === "repair" \? "drone-repair" : "drone-attack";/);
  assert.match(scene, /sprite\.clearTint\(\);/);
  assert.match(scene, /if \(look\?\.shape === "plus"\) \{\n\s+sprite\.setRotation\(0\);/);
  assert.match(scene, /sprite\.rotation, look\?\.shape\);/, "gelismis Tamirci kendi artisini cizmiyor");
  assert.ok(!scene.includes('drone.mode === "crystalCollector" ? 0xa78bfa'), "eski tint tablosu duruyor");

  const css = read("apps/web/src/style.css");
  const rgb = (match) => (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]);
  for (const [role, look] of Object.entries(WORKER_LOOKS)) {
    const row = css.match(new RegExp(`\\.worker-row--${role} \\{ border-left-color: rgba\\((\\d+), (\\d+), (\\d+),`));
    assert.ok(row, `${role} satir rengi yok`);
    assert.equal(rgb(row), look.color, `${role} satiri haritadaki renkte degil`);
  }
  const treeRole = { gatherer: "crystalCollector", carrier: "energyTransport", repairer: "repairer" };
  for (const [role, look] of Object.entries(WORKER_LOOKS)) {
    const header = css.match(new RegExp(`\\.worker-development__role--${treeRole[role]} > strong \\{ border-color: rgba\\((\\d+), (\\d+), (\\d+),`));
    assert.ok(header, `${role} agac basligi rengi yok`);
    assert.equal(rgb(header), look.color, `${role} agac basligi haritadaki renkte degil`);
  }
});
