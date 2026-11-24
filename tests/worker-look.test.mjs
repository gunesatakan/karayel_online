/**
 * Lojistik iscilerin gorunusu (apps/web/src/worker-look.ts).
 *
 * Sahibin istegi (2026-10-24): Toplayici, Tasiyici ve Tamirci kolay
 * ayrilmali; renkler belirgin farkli, Tamircinin sekli de farkli. Secim
 * (onizlemeden B): Toplayici mor, Tasiyici kehribar, Tamirci yesil arti.
 * Eski cizim ayni dokuyu tint ile carpip Toplayici ile Tamirciyi ayni
 * maviye dusuruyordu; simdi her rolun kendi dokusu var, tint yok.
 *
 * Sahibin istegi (2026-11-24): tek tip isci; gorunus iscinin su anki isinden
 * (atandigi yerden), tel kipinden degil. Atamasiz (bosta) isci gri baklava:
 * uc is renginden tonla degil, renk yoklugu (dusuk doygunluk) ile ayriliyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const { WORKER_LOOKS, WORKER_PLUS_ARM_RATIO, getWorkerLookRole, getWorkerPlusOutline } = await importWebModule("apps/web/src/worker-look.ts");
const { getWorkerRosterRole } = await importWebModule("apps/web/src/worker-roster.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** Uc is; bosta isci bunlarin disinda. */
const JOBS = ["gatherer", "carrier", "repairer"];

function hue(color) {
  const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** HSV doygunlugu: gri 0, saf renk 1. */
function saturation(color) {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

test("renkler: uc is rengi aralarinda en az 60 derece, bosta gri; dokular ayri, Tamirci arti", () => {
  assert.deepEqual(Object.keys(WORKER_LOOKS).sort(), ["carrier", "gatherer", "idle", "repairer"]);
  assert.equal(WORKER_LOOKS.gatherer.color, 0x9b7ee0, "Toplayici mor");
  assert.equal(WORKER_LOOKS.carrier.color, 0xe0a63a, "Tasiyici kehribar");
  assert.equal(WORKER_LOOKS.repairer.color, 0x4cc77a, "Tamirci yesil");
  assert.equal(WORKER_LOOKS.idle.color, 0x8b94a3, "Bosta gri");
  for (let i = 0; i < JOBS.length; i += 1) {
    for (let j = i + 1; j < JOBS.length; j += 1) {
      const [a, b] = [WORKER_LOOKS[JOBS[i]], WORKER_LOOKS[JOBS[j]]];
      const gap = Math.abs(hue(a.color) - hue(b.color));
      assert.ok(Math.min(gap, 360 - gap) >= 60, `${a.texture} ile ${b.texture} birbirine yakin (${gap.toFixed(0)} derece)`);
    }
  }
  // Gri bir ton degil, rengin yoklugu: is renklerinden doygunlukla ayriliyor.
  assert.ok(saturation(WORKER_LOOKS.idle.color) < 0.2, `bosta isci gri degil (${saturation(WORKER_LOOKS.idle.color).toFixed(2)})`);
  for (const role of JOBS) assert.ok(saturation(WORKER_LOOKS[role].color) >= 0.4, `${role} soluk: bosta isciyle karisir`);
  const looks = Object.values(WORKER_LOOKS);
  assert.equal(new Set(looks.map((look) => look.texture)).size, 4, "iki is ayni dokuyu paylasiyor");
  assert.equal(WORKER_LOOKS.idle.texture, "worker-idle");
  assert.equal(WORKER_LOOKS.repairer.shape, "plus");
  for (const role of ["gatherer", "carrier", "idle"]) assert.equal(WORKER_LOOKS[role].shape, "diamond", role);
  // Halka ve merkez govdeden acik: koyu zeminde silueti tutan cizgi.
  for (const look of looks) {
    const light = (color) => ((color >> 16) & 255) + ((color >> 8) & 255) + (color & 255);
    assert.ok(light(look.accent) > light(look.color), `${look.texture} halkasi govdeden koyu`);
  }
});

test("gorunus isten: atamadan geliyor, tel kipinden degil; ulti dronlari isci degil", () => {
  const look = (mode, assignment) => getWorkerLookRole({ mode, assignment });
  assert.equal(look("crystalCollector", { nodeId: "crystal-1" }), "gatherer");
  assert.equal(look("energyTransport", { postKind: "energy" }), "carrier");
  assert.equal(look("energyTransport", { sourceTowerId: "t1", postKind: "warehouse" }), "carrier");
  assert.equal(look("energyTransport", { sourceTowerId: "t2", postKind: "factory" }), "carrier");
  assert.equal(look("repairer", { sourceTowerId: "t3", postKind: "repair" }), "repairer");
  // Yeni alinan isci: tasiyici kipinde ama atamasi yok -- gri.
  assert.equal(look("energyTransport", undefined), "idle");
  // Yuk teslim edilene kadar kip eski isin aynasi; gorunus yeni isi gosteriyor.
  assert.equal(look("crystalCollector", { sourceTowerId: "t3", postKind: "repair" }), "repairer");
  assert.equal(look("repairer", { nodeId: "iron-1" }), "gatherer");
  // Eski muhimmat kipleri de isci.
  assert.equal(look("ammoCollector", { nodeId: "ammo-source-1" }), "gatherer");
  assert.equal(look("ammoTransport", { postKind: "factory" }), "carrier");
  assert.equal(look("repair", { postKind: "repair" }), undefined, "AttackLord'un nexus dronu Tamirci degil");
  assert.equal(look("attack", undefined), undefined);

  // Listedeki satir ile haritadaki isciyi baglayan tek sey renk: kadronun rolu
  // ile gorunusun rolu her kip ve atamada ayni.
  const modes = ["crystalCollector", "energyTransport", "ammoCollector", "ammoTransport", "repairer", "attack", "repair"];
  const assignments = [undefined, {}, { nodeId: "crystal-1" }, { postKind: "warehouse" }, { sourceTowerId: "t", postKind: "energy" }, { postKind: "factory" }, { postKind: "repair" }];
  for (const mode of modes) {
    for (const assignment of assignments) {
      assert.equal(getWorkerLookRole({ mode, assignment }), getWorkerRosterRole({ mode, assignment }), `${mode} ${JSON.stringify(assignment)}`);
    }
  }
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

test("baglanti: is dokulari pisiriliyor, sahne tint carpmiyor, Tamirci donmuyor, liste ve agac ayni renkte", () => {
  const preloader = read("apps/web/src/scenes/PreloaderScene.ts");
  assert.match(preloader, /for \(const look of Object\.values\(WORKER_LOOKS\)\) this\.createWorkerTexture\(look\);/);
  assert.match(preloader, /this\.createDroneTexture\("drone-repair", 0x22d3ee, 0x86efac\);/, "AttackLord'un nexus dronu kendi dokusunda kalmali");
  const scene = read("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /const texture = look \? look\.texture : drone\.mode === "repair" \? "drone-repair" : "drone-attack";/);
  assert.match(scene, /sprite\.clearTint\(\);/);
  assert.match(scene, /if \(look\?\.shape === "plus"\) \{\n\s+sprite\.setRotation\(0\);/);
  assert.match(scene, /sprite\.rotation, look\?\.shape\);/, "gelismis Tamirci kendi artisini cizmiyor");
  assert.ok(!scene.includes('drone.mode === "crystalCollector" ? 0xa78bfa'), "eski tint tablosu duruyor");
  // Iki cizim yolu da (2D sprite ve 3D) gorunusu iscinin isinden aliyor, kipinden degil.
  assert.equal((scene.match(/const lookRole = getWorkerLookRole\(drone\);/g) ?? []).length, 2, "bir cizim yolu gorunusu kipten aliyor");
  assert.doesNotMatch(scene, /getWorkerLookRole\(drone\.mode\)/);
  // 3D: bosta isci kendi rolunde (gri halka), dron degil.
  assert.match(scene, /role: lookRole \?\? "drone",/);
  assert.match(read("apps/web/src/render3d/tower-layer.ts"), /role: "gatherer" \| "carrier" \| "repairer" \| "idle" \| "drone";/);

  const css = read("apps/web/src/style.css");
  const rgb = (match) => (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]);
  // Bosta satir da haritadaki isciyle ayni gri.
  for (const [role, look] of Object.entries(WORKER_LOOKS)) {
    const row = css.match(new RegExp(`\\.worker-row--${role} \\{ border-left-color: rgba\\((\\d+), (\\d+), (\\d+),`));
    assert.ok(row, `${role} satir rengi yok`);
    assert.equal(rgb(row), look.color, `${role} satiri haritadaki renkte degil`);
  }
  // Agacin dallari is basina (bosta iscinin dali yok).
  const treeRole = { gatherer: "crystalCollector", carrier: "energyTransport", repairer: "repairer" };
  for (const [role, mode] of Object.entries(treeRole)) {
    const header = css.match(new RegExp(`\\.worker-development__role--${mode} > strong \\{ border-color: rgba\\((\\d+), (\\d+), (\\d+),`));
    assert.ok(header, `${role} agac basligi rengi yok`);
    assert.equal(rgb(header), WORKER_LOOKS[role].color, `${role} agac basligi haritadaki renkte degil`);
  }
});
