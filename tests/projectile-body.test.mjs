/**
 * Merminin isabet sekli cizilen govdenin kendisi (sahibin karari, 2026-10:
 * "Mermiler de cizildigi kadar vurus yaricapina sahip olmali").
 *
 * Sunucu isabet seklini paylasilan `getProjectileBody` / `getProjectileShape`
 * dan aliyor; istemcinin cizicileri dis hatlarin carpanlarini ayni modulden
 * okuyor. Bu test gercek cizimi (attack-vfx `renderProjectiles`,
 * PreloaderScene dokulari) kayitci bir yuzeye cizdirip olcuyor: biri bir
 * carpani paylasilan sabite dokunmadan degistirirse ya da govdeye yeni bir
 * parca eklerse isabet sekli cizimden kayar ve burasi kiriliyor.
 *
 * Govde sayilan: dolu sekiller ve kalin (>= 0,55) cizgiler, alfa >= 0,6.
 * Sayilmayan (efekt): ince catirti, filaman ve halkalar (Ucube'nin 3.
 * kademedeki damar catali da bir catirti filamani), Obsesyon'un yari
 * saydam bakis kamasi (alfa <= 0,58, iz). Sahibin karariyla yalnizca gorsel:
 * Ucube'nin 3. kademede donen uydulari ve Taht mizraklarinin kuyruktaki
 * kertik pipleri (boy da en de onlarsiz); cift mizragin 3. kademedeki altin
 * kilifi da onlar gibi efekt (nabizli, 0,25-0,75 alfa).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { importWebModule } from "./helpers/web-module.mjs";
import { readFileSync } from "node:fs";
import { createGeometryRecorder, isBodyPrim, THIN_LINE } from "./helpers/geometry-recorder.mjs";
import {
  ATAKAN_ATTACK_DRONE_BODY,
  COMBAT_BODY,
  LANCE_SHOT_BODY,
  PROJECTILE_SLUG,
  PROJECTILE_DISC_TOLERANCE,
  PROJECTILE_TIER_WEIGHT,
  UCUBE_SHOT_BODY,
  getProjectileDiscSides,
  getProjectileReach,
  PROJECTILE_SILHOUETTE_SIZE,
  PROJECTILE_SPRITE_BODIES,
  PROJECTILE_VISUAL_SCALE,
  fitProjectileFront,
  getProjectileBody,
  getProjectileShape,
  getProjectileSilhouette,
  towerCatalog
} from "../packages/shared/dist/index.js";

const { AttackVfx } = await importWebModule("apps/web/src/vfx/attack-vfx.ts");
const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");
const { PreloaderScene } = await importWebModule("apps/web/src/scenes/PreloaderScene.ts");

const TOLERANCE = 0.05;

/** Ucus yonu +x, merkez (ox, oy): ileri, geri ve yanlara en uzak nokta. */
function extents(prims, ox, oy, keep = () => true, thin = THIN_LINE) {
  let tip = -Infinity;
  let tail = -Infinity;
  let half = 0;
  let radial = 0;
  for (const prim of prims) {
    if (!isBodyPrim(prim, thin) || !keep(prim)) continue;
    for (const [px, py] of prim.points) {
      const along = px - ox;
      const side = py - oy;
      tip = Math.max(tip, along);
      tail = Math.max(tail, -along);
      half = Math.max(half, Math.abs(side));
      radial = Math.max(radial, Math.hypot(along, side));
    }
  }
  return { tip, tail, half, radial };
}

/**
 * Govdenin destek fonksiyonunun en kucugu (720 yon): yuvarlak siluette
 * cizilen cokgenin ic dairesinin yaricapi (merkeze gore).
 */
function innerSupport(prims, ox, oy, keep = () => true, thin = THIN_LINE) {
  let inner = Infinity;
  for (let step = 0; step < 720; step += 1) {
    const angle = (step / 720) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let support = -Infinity;
    for (const prim of prims) {
      if (!isBodyPrim(prim, thin) || !keep(prim)) continue;
      for (const [px, py] of prim.points) support = Math.max(support, (px - ox) * c + (py - oy) * s);
    }
    inner = Math.min(inner, support);
  }
  return inner;
}

const ROUND = new Set(["orb", "ball", "ring"]);
const IDS = [
  "warrior-1", "warrior-2", "warrior-3", "warrior-4", "warrior-6",
  "zeynep-1", "zeynep-3", "zeynep-3-kin-projectile", "zeynep-3-copy",
  "onur-2", "onur-6", "mage-1", "mage-6", "healer-1", "tank-1", "unknown-9"
];

function drawBody(definitionId, tier, sceneScale) {
  const body = createGeometryRecorder();
  const vfx = new AttackVfx(body, createGeometryRecorder(), createGeometryRecorder(), undefined, { lod: new VfxLod(), reducedMotion: () => true });
  const ox = 300;
  const oy = 200;
  vfx.renderProjectiles([{ id: "p1", kind: "tower", source: "tower", definitionId, x: ox, y: oy, vx: 120, vy: 0, tier: tier === 1 ? undefined : tier }], 1000, sceneScale);
  const silhouette = getProjectileSilhouette(definitionId);
  const r = (PROJECTILE_SILHOUETTE_SIZE[silhouette] / 2) * sceneScale * PROJECTILE_VISUAL_SCALE;
  const shape = getProjectileBody(definitionId, tier, sceneScale);
  // Ucube'nin uydulari basin cevresinde (1,6 bas) donuyor: agirlik merkezleri basin disinda.
  const centroid = (prim) => prim.points.reduce((sum, [px, py]) => [sum[0] + px / prim.points.length, sum[1] + py / prim.points.length], [0, 0]);
  const notSatellite = (prim) => {
    if (silhouette !== "arc") return true;
    const [cx, cy] = centroid(prim);
    return Math.hypot(cx - ox, cy - oy) <= shape.halfWidth * 1.4;
  };
  // Taht'in pipleri kuyrugun gerisinde (govdenin 2 r'si): govde degil.
  const notSigil = (prim) => silhouette !== "lance" || prim.points.some(([px]) => px - ox >= -r * 2 - 1e-6);
  // Cift mizragin altin kilifi (3. kade): eksene paralel iki ince cizgi, mizragin
  // iki yaninda `sheathSide` yanalda. Efekt; govde degil.
  const sheathSide = Math.max(LANCE_SHOT_BODY.minSheathSide, r * LANCE_SHOT_BODY.sheathSide * PROJECTILE_TIER_WEIGHT[Math.min(2, Math.max(0, tier - 1))]);
  const notSheath = (prim) => !(definitionId === "zeynep-3" && tier >= 3 && prim.width !== undefined
    && prim.points.every(([, py]) => Math.abs(Math.abs(py - oy) - sheathSide) <= prim.width / 2 + 1e-6));
  // Ucube'nin 3. kademe damar catali (`drawFilament`, kalinlik `boy x 0,07 x kalinlik`):
  // karar geregi yalnizca gorsel (uydular gibi; projectile-body'nin basindaki
  // liste): catallandigi yan istemcinin duvar saatiyle yeniden cekiliyor.
  const forkWidth = r * UCUBE_SHOT_BODY.size * 0.07 * 2;
  const notFork = (prim) => !(silhouette === "arc" && tier >= 3 && prim.width !== undefined && Math.abs(prim.width - forkWidth) < 1e-9);
  const keep = (prim) => notSatellite(prim) && notSigil(prim) && notSheath(prim) && notFork(prim);
  // Ucube'nin catirti arklarinin kalinligi boyla buyuyor (`size x 0,05`): ince
  // cizgi esigi onda sahneyle olcekli. Oteki govdelerin cizgi tabanlari sabit.
  const thin = silhouette === "arc" ? THIN_LINE * sceneScale : THIN_LINE;
  return { prims: body.prims, ox, oy, keep, thin, silhouette, shape };
}

test("isabet sekli cizilen govdeyle ayni: her mermi, her kademe, iki sahne olcegi", () => {
  for (const sceneScale of [1, 1.5]) {
    for (const id of IDS) {
      for (const tier of [1, 2, 3]) {
        const { prims, ox, oy, keep, thin, silhouette, shape } = drawBody(id, tier, sceneScale);
        const drawn = extents(prims, ox, oy, keep, thin);
        const label = `${id} kademe ${tier} olcek ${sceneScale} (${silhouette})`;
        assert.ok(Number.isFinite(drawn.tip), `${label}: govde cizilmedi`);
        if (ROUND.has(silhouette)) {
          assert.ok(Math.abs(drawn.radial - shape.halfWidth) <= TOLERANCE, `${label}: yaricap ${drawn.radial} / ${shape.halfWidth}`);
          // Ic yaricap da: cizilen cokgenin her yondeki en uzak noktasi (destek)
          // isabet dairesinden en fazla `PROJECTILE_DISC_TOLERANCE` iceride.
          // Eskiden 8 kenarli disk (halkada 10 parca) kenar ortasinda
          // yaricapin %7,6'si iceride kaliyordu: daire cizimden erken degiyordu.
          const inner = innerSupport(prims, ox, oy, keep, thin);
          assert.ok(inner >= shape.halfWidth - PROJECTILE_DISC_TOLERANCE - 1e-6, `${label}: ic yaricap ${inner} / ${shape.halfWidth}`);
          continue;
        }
        assert.ok(Math.abs(drawn.tip - shape.tip) <= TOLERANCE, `${label}: uc ${drawn.tip} / ${shape.tip}`);
        assert.ok(Math.abs(drawn.tail - shape.tail) <= TOLERANCE, `${label}: kuyruk ${drawn.tail} / ${shape.tail}`);
        assert.ok(Math.abs(drawn.half - shape.halfWidth) <= TOLERANCE, `${label}: en ${drawn.half} / ${shape.halfWidth}`);
      }
    }
  }
});

/** Noktalarin dis bukey zarfi (saat yonunun tersine). */
function hullOf(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (list) => {
    const out = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 1e-12) out.pop();
      out.push(point);
    }
    return out;
  };
  return chain(sorted).slice(0, -1).concat(chain([...sorted].reverse()).slice(0, -1));
}

/** Nokta zarfin icinde mi (sinir dahil, `epsilon` payla). */
function insideHull(hull, [x, y], epsilon) {
  return hull.every((a, i) => {
    const b = hull[(i + 1) % hull.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -epsilon * length;
  });
}

/** Zarfin sinirindan ve icinden ornekler. */
function sampleHull(hull) {
  const points = [];
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    for (let step = 0; step < 40; step += 1) points.push([a[0] + ((b[0] - a[0]) * step) / 40, a[1] + ((b[1] - a[1]) * step) / 40]);
  }
  const xs = hull.map(([x]) => x);
  const ys = hull.map(([, y]) => y);
  for (let i = 0; i <= 16; i += 1) {
    for (let j = 0; j <= 16; j += 1) {
      const q = [Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 16, Math.min(...ys) + ((Math.max(...ys) - Math.min(...ys)) * j) / 16];
      if (insideHull(hull, q, 0)) points.push(q);
    }
  }
  return points;
}

const pairs = (flat) => Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]]);

test("isabet parcalari cizilen govdenin kendisi: modelin her noktasi cizimde (erken degil), cizimin her noktasi modelde (gec degil)", () => {
  // Eskiden tek kapsul: en genis yerin eniyle kuyruga kadar (Hiza'nin 0,6'lik
  // govdesi 1,8'den, Ucube'nin sivrilen damlasi 3,4'ten vuruyordu) ve
  // mizragin bas ucgeninin yanlari modelde yoktu (yanda gec). Simdi isabet
  // sekli cizicinin dolu parcalarinin birlesimi: iki yonde de cizimle ayni.
  // Ucube'nin basi daire: cizilen cokgen icine cizilmis, kenar ortasi
  // daireden en fazla `PROJECTILE_DISC_TOLERANCE` iceride.
  let checked = 0;
  for (const sceneScale of [1, 1.5]) {
    for (const id of IDS) {
      for (const tier of [1, 2, 3]) {
        const { prims, ox, oy, keep, thin, silhouette } = drawBody(id, tier, sceneScale);
        if (ROUND.has(silhouette)) continue;
        const body = getProjectileBody(id, tier, sceneScale);
        const label = `${id} kademe ${tier} olcek ${sceneScale} (${silhouette})`;
        const drawn = prims.filter((prim) => isBodyPrim(prim, thin) && keep(prim)).map((prim) => hullOf(prim.points.map(([px, py]) => [px - ox, py - oy]))).filter((hull) => hull.length >= 3);
        const model = body.parts.map((part) => hullOf(pairs(part)));
        const inDrawn = (q, epsilon) => drawn.some((hull) => insideHull(hull, q, epsilon));
        const inModel = (q, epsilon) => model.some((hull) => insideHull(hull, q, epsilon)) || (body.disc > 0 && Math.hypot(q[0], q[1]) <= body.disc + epsilon);
        for (const hull of model) {
          for (const q of sampleHull(hull)) assert.ok(inDrawn(q, 1e-6), `${label}: modelin noktasi (${q[0].toFixed(3)}, ${q[1].toFixed(3)}) cizimde degil (erken)`);
        }
        if (body.disc > 0) {
          for (let step = 0; step < 720; step += 1) {
            const angle = (step / 720) * Math.PI * 2;
            for (const radius of [body.disc, body.disc * 0.5]) {
              const q = [Math.cos(angle) * radius, Math.sin(angle) * radius];
              assert.ok(inDrawn(q, PROJECTILE_DISC_TOLERANCE + 1e-6), `${label}: diskin noktasi cizilen cokgenden 0,05'ten fazla disarida`);
            }
          }
        }
        for (const hull of drawn) {
          for (const q of sampleHull(hull)) assert.ok(inModel(q, 1e-6), `${label}: cizimin noktasi (${q[0].toFixed(3)}, ${q[1].toFixed(3)}) modelde degil (gec)`);
        }
        checked += 1;
      }
    }
  }
  assert.ok(checked > 60, `${checked}`);
});

test("Ucube'nin basi dairenin cokgeni: kenar ortasi daireden en fazla 0,05 iceride (cizici paylasilan kenar sayisiyla)", () => {
  for (const sceneScale of [0.6, 1, 1.5, 2]) {
    const head = getProjectileBody("warrior-6", 1, sceneScale).disc;
    const sides = getProjectileDiscSides(head);
    assert.ok(head * (1 - Math.cos(Math.PI / sides)) <= PROJECTILE_DISC_TOLERANCE + 1e-12, `${sceneScale}: ${sides} kenar`);
    // Eski 8 kenar 3,4'luk basta 0,26 iceride kaliyordu; bugunku basta da
    // (olcek 0,64'te 2,69) 0,20: pay asiliyor, 8 kenar yetmiyor.
    if (sceneScale === 1) assert.ok(sides > 8 && head * (1 - Math.cos(Math.PI / 8)) > PROJECTILE_DISC_TOLERANCE, `${head}: ${sides} kenar`);
  }
  const shots = readFileSync(new URL("../apps/web/src/vfx/atakan-shots.ts", import.meta.url), "utf8");
  assert.match(shots, /fillDisc\(g, x, y, head, getProjectileDiscSides\(head\)\);/);
});

test("ucusla donen bas: capraz ucusta da cizilen govde isabet sekliyle ayni (Takipci, ok, hucre, mizrak)", () => {
  // `drawSlug`in kare basi ucusla birlikte donuyor (iki ucgen): eskiden
  // eksene hizali kare 45 derecede kosesiyle 0,99'a uzaniyor, Takipci'nin
  // 0,70'lik ucunu ve 0,78'lik enini asiyordu. Cizim ucus cercevesine
  // dondurulup olculuyor; her acida 0 derecedeki olcuyle ayni.
  for (const id of ["warrior-1", "onur-2", "warrior-3", "zeynep-1"]) {
    for (const tier of [1, 3]) {
      const body = getProjectileBody(id, tier);
      for (const degrees of [0, 30, 45, 60, 135, 225, 300]) {
        const angle = (degrees * Math.PI) / 180;
        const recorder = createGeometryRecorder();
        const vfx = new AttackVfx(recorder, createGeometryRecorder(), createGeometryRecorder(), undefined, { lod: new VfxLod(), reducedMotion: () => true });
        vfx.renderProjectiles([{ id: "p1", kind: "tower", source: "tower", definitionId: id, x: 300, y: 200, vx: Math.cos(angle) * 120, vy: Math.sin(angle) * 120, tier: tier === 1 ? undefined : tier }], 1000, 1);
        const c = Math.cos(angle);
        const sn = Math.sin(angle);
        const rotated = recorder.prims.map((prim) => ({ ...prim, points: prim.points.map(([px, py]) => [300 + (px - 300) * c + (py - 200) * sn, 200 - (px - 300) * sn + (py - 200) * c]) }));
        const drawn = extents(rotated, 300, 200);
        const label = `${id} kademe ${tier} ${degrees} derece`;
        assert.ok(Math.abs(drawn.tip - body.tip) <= TOLERANCE, `${label}: uc ${drawn.tip} / ${body.tip}`);
        assert.ok(Math.abs(drawn.tail - body.tail) <= TOLERANCE, `${label}: kuyruk ${drawn.tail} / ${body.tail}`);
        assert.ok(Math.abs(drawn.half - body.halfWidth) <= TOLERANCE, `${label}: en ${drawn.half} / ${body.halfWidth}`);
      }
    }
  }
});

test("sekil govdenin kendisi: cizilen parcalar ve disk; yanlar cizilen en, arka uc kuyruk; Taht kuyrugu piplersiz", () => {
  for (const id of IDS) {
    for (const tier of [1, 2, 3]) {
      const body = getProjectileBody(id, tier);
      const shape = getProjectileShape(id, tier);
      // Geriye en fazla cizilen kuyruk, dogarken de dogdugu noktaya kadar
      // (`getProjectileReach`: ucus ve kuyrugun kucugu). Gercek temas bu
      // sinirla tests/visible-hitbox'ta sinaniyor.
      assert.equal(shape.tail, Math.max(0, body.tail), `${id} ${tier} kuyruk`);
      for (const flown of [0, 0.5, 2, 1000]) assert.equal(getProjectileReach(shape, flown), Math.min(flown, shape.tail), `${id} ${tier} ucus ${flown}`);
      assert.equal(shape.halfWidth, body.halfWidth);
      assert.equal(shape.front, body.tip);
      assert.ok(shape.nose <= shape.front + 1e-9, `${id} ${tier} eksenin onu`);
      assert.ok(Object.isFrozen(shape));
      assert.equal(getProjectileShape(id, tier), shape, "onbellek ayni nesne");
    }
  }
  // Eski vurus tipi yaricapinin (4 / 8) yerine cizilen en (olcek 0,64'te):
  // Ucube'nin basi 2,69, Takipci'nin izi 0,7 (kare basin en kucugu), Hiza'nin
  // basi 1,44. Sayilar siluetin boyundan ve gorunus olceginden (`unit`).
  const unit = (silhouette) => (PROJECTILE_SILHOUETTE_SIZE[silhouette] / 2) * PROJECTILE_VISUAL_SCALE;
  const ucubeHead = unit("arc") * UCUBE_SHOT_BODY.size * UCUBE_SHOT_BODY.head * 2;
  assert.ok(Math.abs(getProjectileShape("warrior-6").radius - ucubeHead) < 1e-9 && getProjectileShape("warrior-6").disc === 1, `${getProjectileShape("warrior-6").radius} / ${ucubeHead}`);
  const trail = (COMBAT_BODY.width + COMBAT_BODY.widthPerTier) * COMBAT_BODY.scale * PROJECTILE_VISUAL_SCALE;
  const trailHalf = Math.max(Math.max(PROJECTILE_SLUG.minWidth, trail) / 2, PROJECTILE_SLUG.minHead, trail * PROJECTILE_SLUG.headRatio);
  assert.ok(Math.abs(getProjectileShape("warrior-1").halfWidth - trailHalf) < 1e-9, `${getProjectileShape("warrior-1").halfWidth} / ${trailHalf}`);
  const lanceHead = unit("lance") * LANCE_SHOT_BODY.headHalf;
  assert.ok(Math.abs(getProjectileShape("zeynep-1").halfWidth - lanceHead) < 1e-9);
  // Hiza: bas ucgeni ve govde cizgisi (kare bas ucgenin icinde: atiliyor);
  // ucgenin ucu eksenin en on noktasi. Govde cizgisinin eni en az 1 (olcek
  // 0,64'te tam bu en: yari en 0,5), basin yari eni 1,44.
  const hiza = getProjectileShape("zeynep-1", 1);
  assert.equal(hiza.table.count, 2);
  assert.ok(Math.abs(hiza.nose - unit("lance") * LANCE_SHOT_BODY.tip) < 1e-9 && hiza.disc === 0, JSON.stringify({ nose: hiza.nose, disc: hiza.disc }));
  const shaftHalf = Math.max(PROJECTILE_SLUG.minWidth, LANCE_SHOT_BODY.minShaftWidth, unit("lance") * LANCE_SHOT_BODY.shaftWidth) / 2;
  const widths = Array.from({ length: hiza.table.count }, (_, p) => hiza.table.yhi[p]).sort((a, b) => a - b);
  assert.ok(Math.abs(widths[0] - shaftHalf) < 1e-9 && Math.abs(widths[1] - lanceHead) < 1e-9, widths.join(","));
  // Sunucu paketinin iki ucgeni tek elmas (birlesimleri dis bukey).
  assert.equal(getProjectileShape("warrior-2", 1).table.count, 1);
  // Taht mizraklarinin kuyrugu Hiza'ninkiyle ayni: kertik pipleri isabet degil.
  for (const id of ["zeynep-3", "zeynep-3-kin-projectile", "zeynep-3-copy"]) {
    assert.equal(getProjectileBody(id, 1).tail, getProjectileBody("zeynep-1", 1).tail, id);
  }
});

function measureTexture(draw) {
  let recorder;
  const fake = Object.create(PreloaderScene.prototype);
  fake.make = { graphics: () => (recorder = createGeometryRecorder()) };
  draw(fake);
  return recorder.prims;
}

test("Melis'in dokulu mermileri: dokunun govdesi ve on diski paylasilan piksel sinirlariyla ayni", () => {
  const towers = Object.values(towerCatalog).flat();
  for (const [id, bounds] of Object.entries(PROJECTILE_SPRITE_BODIES)) {
    const tower = towers.find((entry) => entry.id === id);
    assert.ok(tower, id);
    const prims = measureTexture((scene) => scene.createProjectileTexture(tower));
    const center = bounds.texture / 2;
    // Doku kendi karesine kirpiliyor; Fisilti'nin koyu diski (halkanin altinda) govde degil.
    const clipped = prims.map((prim) => ({ ...prim, points: prim.points.map(([x, y]) => [Math.max(0, Math.min(bounds.texture, x)), Math.max(0, Math.min(bounds.texture, y))]) }));
    const keep = id === "archer-6" ? (prim) => prim.width !== undefined || prim.points.every(([x, y]) => Math.hypot(x - center, y - center) < 9) : () => true;
    const drawn = extents(clipped, center, center, keep);
    for (const key of ["tip", "tail", "half"]) {
      assert.ok(Math.abs(drawn[key] - bounds[key]) <= TOLERANCE, `${id} ${key}: ${drawn[key]} / ${bounds[key]}`);
    }
    // On disk ve igne dokunun parcalarindan, sunucunun hesabiyla. Fisilti'nin
    // halkasi daire: disk merkezde (kayitci daireyi cokgenle ciziyor, 0,1 pay).
    const parts = clipped.filter((prim) => isBodyPrim(prim) && keep(prim)).map((prim) => prim.points.flatMap(([x, y]) => [x - center, y - center]));
    const fit = fitProjectileFront(parts, bounds.half);
    assert.ok(Math.abs(fit.nose - bounds.nose) <= TOLERANCE, `${id} igne: ${fit.nose} / ${bounds.nose}`);
    assert.ok(Math.abs(fit.wide - bounds.wide) <= (id === "archer-6" ? 0.1 : TOLERANCE), `${id} disk: ${fit.wide} / ${bounds.wide}`);
    // Sahnede siluet boyunda (16 x 0,8): dunya olcusu bu oranla.
    const body = getProjectileBody(id, 1);
    const k = (PROJECTILE_SILHOUETTE_SIZE.sprite * PROJECTILE_VISUAL_SCALE) / bounds.texture;
    assert.ok(Math.abs(body.tip - bounds.tip * k) < 1e-9 && Math.abs(body.halfWidth - bounds.half * k) < 1e-9 && Math.abs(body.wide - bounds.wide * k) < 1e-9, id);
  }
});

test("AttackLord ulti dronu: dokunun govdesinin ortalama golge yaricapi paylasilan sayi", () => {
  const prims = measureTexture((scene) => scene.createDroneTexture("drone-attack", 0xfb7185, 0xfacc15));
  const size = ATAKAN_ATTACK_DRONE_BODY.texture;
  const points = prims.filter((prim) => isBodyPrim(prim)).flatMap((prim) => prim.points).map(([x, y]) => [x - size / 2, y - size / 2]);
  let width = 0;
  const directions = 360;
  for (let index = 0; index < directions; index += 1) {
    const angle = (index / directions) * Math.PI;
    let low = Infinity;
    let high = -Infinity;
    for (const [x, y] of points) {
      const projection = x * Math.cos(angle) + y * Math.sin(angle);
      low = Math.min(low, projection);
      high = Math.max(high, projection);
    }
    width += high - low;
  }
  const radius = width / directions / 2;
  assert.ok(Math.abs(radius - ATAKAN_ATTACK_DRONE_BODY.radius) <= TOLERANCE, `dron ${radius} / ${ATAKAN_ATTACK_DRONE_BODY.radius}`);
});
