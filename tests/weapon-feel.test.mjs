/**
 * Silahin hissi (apps/web/src/vfx/weapon-feel.ts): kutle, atis sesi, geri
 * tepme, itme, duraklama, ezilme, titreme, sarsinti ve olumun bicimi.
 *
 * Sahibin kararlari (2026-10-20): hafif silah sayiyla hissettiriyor (itme,
 * duraklama, sarsinti yok); agir silah tek vurusla. Sarsinti yalnizca kendi
 * agir vurusun (Sunucu, Obsesyon, Kin) ve kendi kritigin, 1-2 px. Hasar
 * sayilari silaha gore degismiyor. Hepsi istemcide; sunucu degismiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const feel = await importWebModule("apps/web/src/vfx/weapon-feel.ts");
const profiles = await importWebModule("apps/web/src/vfx/vfx-profiles.ts");
const { towerCatalog } = await import("../packages/shared/dist/index.js");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const PLAYABLE = ["warrior-1", "warrior-2", "warrior-3", "warrior-4", "warrior-5", "warrior-6", "zeynep-1", "zeynep-2", "zeynep-3", "zeynep-6", "zeynep-8"];

test("oynanan her kulenin elle yazilmis hissi var; her saldiran kule bir hisse iniyor", () => {
  for (const id of PLAYABLE) assert.ok(feel.WEAPON_FEELS[id], `${id} tabloda yok`);
  const seen = new Set();
  for (const towers of Object.values(towerCatalog)) {
    for (const tower of towers) {
      if (seen.has(tower.id) || !profiles.isAttackingDefinition(tower)) continue;
      seen.add(tower.id);
      const entry = feel.getWeaponFeel(tower.id);
      assert.ok(entry && ["light", "medium", "heavy"].includes(entry.mass), tower.id);
      for (const key of ["recoil", "knock", "hitStopMs", "shiver", "shake"]) {
        assert.equal(entry[key].length, 3, `${tower.id}.${key}`);
        assert.ok(entry[key].every((value) => value >= 0), `${tower.id}.${key} negatif`);
        assert.ok(entry[key][0] <= entry[key][1] && entry[key][1] <= entry[key][2], `${tower.id}.${key} kademeyle azalmamali`);
      }
      assert.ok(entry.hitStopMs[2] <= feel.HIT_STOP_MAX_MS, `${tower.id} duraklama ust sinirda`);
      assert.ok(entry.shake[2] <= 2, `${tower.id} sarsinti en fazla 2 px`);
    }
  }
  // Son ekli kimlik kulenin hissine iniyor.
  assert.equal(feel.getWeaponFeel("zeynep-3-kin-projectile"), feel.WEAPON_FEELS["zeynep-3"]);
});

test("kutle kurali: hafif itmiyor, durmuyor, sarsmiyor; agir hepsini yapiyor; sarsinti yalniz Sunucu, Obsesyon, Kin", () => {
  const takipci = feel.WEAPON_FEELS["warrior-1"];
  assert.equal(takipci.mass, "light");
  assert.deepEqual([...takipci.knock, ...takipci.hitStopMs, ...takipci.shake], [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(takipci.fire, "fireLight");
  const sunucu = feel.WEAPON_FEELS["warrior-2"];
  assert.equal(sunucu.mass, "heavy");
  assert.ok(sunucu.knock[0] >= 2 && sunucu.hitStopMs[0] >= 30 && sunucu.squash > 0 && sunucu.shake[0] >= 1);
  assert.ok(sunucu.recoil[2] > takipci.recoil[2] * 2, "topcu daha cok geri tepiyor");
  const shakers = Object.entries(feel.WEAPON_FEELS).filter(([, entry]) => entry.shake.some((px) => px > 0)).map(([id]) => id).sort();
  assert.deepEqual(shakers, ["warrior-2", "warrior-4", "zeynep-6"]);
  assert.ok(feel.WEAPON_FEELS["warrior-6"].shiver[0] > 0, "Ucube titretiyor");
  assert.equal(feel.WEAPON_FEELS["warrior-4"].death, "implode", "Obsesyon ice cokertiyor");
  assert.equal(feel.WEAPON_FEELS["warrior-5"].death, "ash", "lazer kul ediyor");
  assert.equal(feel.WEAPON_FEELS["warrior-5"].fire, undefined, "isinin atis sesi yok");
  assert.equal(feel.WEAPON_FEELS["zeynep-8"].fire, undefined, "Abarti ates etmiyor");
  // Kritik: kisa duraklama, 1 px.
  assert.equal(feel.CRIT_SHAKE_PX, 1);
  assert.ok(feel.CRIT_HIT_STOP_MS > 0 && feel.CRIT_HIT_STOP_MS <= feel.HIT_STOP_MAX_MS);
});

test("egriler: geri tepme hizli gidip yavas donuyor; ezilme ve titreme sonumlu ve bitiyor", () => {
  assert.equal(feel.getRecoilAmount(0), 0);
  assert.equal(feel.getRecoilAmount(feel.RECOIL_KICK_MS), 1);
  assert.ok(feel.getRecoilAmount(60) > 0 && feel.getRecoilAmount(60) < 1);
  assert.equal(feel.getRecoilAmount(feel.RECOIL_MS), 0);
  assert.equal(feel.getRecoilAmount(-5), 0);

  assert.ok(Math.abs(feel.getSquashAmount(0, 0.1) - 0.1) < 1e-12);
  assert.ok(feel.getSquashAmount(50, 0.1) < 0.1);
  assert.equal(feel.getSquashAmount(feel.SQUASH_MS, 0.1), 0);
  const [sx, sy] = feel.getSquashScale(0.1, 0, 0);
  assert.ok(Math.abs(sx - 0.9) < 1e-12 && Math.abs(sy - 1.06) < 1e-12, "vurus ekseninde basiliyor");
  const [vx, vy] = feel.getSquashScale(0.1, Math.PI / 2, 0);
  assert.ok(vx > 1 && vy < 1, "dik vurusta y basiliyor");

  for (let ms = 0; ms < feel.SHIVER_MS; ms += 7) {
    assert.ok(Math.abs(feel.getShiverOffset(ms, 1.5, 3, 0)) <= 1.5);
  }
  assert.equal(feel.getShiverOffset(feel.SHIVER_MS, 1.5, 3, 0), 0);
  assert.equal(feel.getShiverOffset(10, 1.5, 3, 0), feel.getShiverOffset(10, 1.5, 3, 0), "deterministik");
});

test("duraklama: bitmeden ve aralik dolmadan yenisi yok (Hiza saniyede ~6 delik)", () => {
  assert.equal(feel.shouldStartHitStop(undefined, 0, 30), true);
  assert.equal(feel.shouldStartHitStop(undefined, 0, 0), false);
  assert.equal(feel.shouldStartHitStop(50, 100, 30), false);
  assert.equal(feel.shouldStartHitStop(50, 50 + feel.HIT_STOP_GAP_MS, 30), true);
});

test("lazer isisi: maruz kaldikca artiyor, birakinca soguyor; nabzi isindikca agirlasiyor", () => {
  assert.equal(feel.getBeamHeat(0, 0), 0);
  assert.ok(feel.getBeamHeat(700, 0) > 0.4 && feel.getBeamHeat(700, 0) < 0.6);
  assert.equal(feel.getBeamHeat(feel.BEAM_HEAT_FULL_MS * 2, 0), 1);
  assert.equal(feel.getBeamHeat(feel.BEAM_HEAT_FULL_MS, 200), 1, "nabizlar arasi soguma yok");
  assert.ok(feel.getBeamHeat(feel.BEAM_HEAT_FULL_MS, 600) < 1);
  assert.equal(feel.getBeamHeat(feel.BEAM_HEAT_FULL_MS, 2000), 0);
  assert.equal(feel.getBeamPulseRate(0), 1);
  assert.ok(feel.getBeamPulseRate(1) < 1 && feel.getBeamPulseRate(1) >= 0.85);
  assert.equal(feel.mixColor(0x000000, 0xffffff, 0.5), 0x808080);
  assert.ok(feel.BEAM_HEAT_MAX_MIX <= 0.6, "govdenin rengi okunur kaliyor");
});

test("sag-sol yeri: ekranin solu eksi, sagi arti, genislik sinirli", () => {
  assert.equal(feel.getStereoPan(50, 0, 100), 0);
  assert.equal(feel.getStereoPan(0, 0, 100), -feel.STEREO_WIDTH);
  assert.equal(feel.getStereoPan(200, 0, 100), feel.STEREO_WIDTH);
  assert.equal(feel.getStereoPan(Number.NaN, 0, 100), 0);
  assert.ok(feel.STEREO_WIDTH <= 0.6);
});

test("sahne baglantisi: atis sesi + geri tepme, duraklama/ezilme/titreme, isin temasi, kritik, olumun bicimi", () => {
  const scene = read("apps/web/src/scenes/GameScene.ts");
  // Atis: dogrusal mermide namluyla ayni anda (gec atis sessiz), gudumlude ilk gorulmede.
  assert.match(scene, /if \(isHitSoundFresh\(receivedAt, performance\.now\(\), this\.playbackDelayMs\)\) \{\n\s+this\.fireFromTower\(definitionId, projectile\.tier, projectile\.x, projectile\.y, angle, own, projectile\.id\);/);
  assert.match(scene, /this\.fireFromTower\(definitionId, projectile\.tier, originX, originY, angle, own, projectile\.id\);/);
  assert.match(scene, /this\.feedback\?\.playFire\(feel\.fire, tier, own, key, this\.getStereoPan\(x\), feel\.fireGain\);/);
  assert.match(scene, /if \(!\(recoil > 0\) \|\| this\.feedback\?\.reducedMotion\) return;/, "hareket azaltmada geri tepme yok");
  // Dusman: yalnizca kendi vurusun ve hareket azaltma kapaliyken hareket.
  assert.match(scene, /onEnemyHit: \(hit\) => this\.applyEnemyHitFeel\(hit\)/);
  assert.match(scene, /if \(!hit\.own \|\| hit\.still\) return;/);
  assert.match(scene, /mover\.sprite\.setPosition\(drawX \+ mover\.knockDx, drawY \+ mover\.knockDy\);/);
  // Isin: lazer nabzi temasi ve isi; Kin bandi; Gosteri ucu; ses sag-sol yeriyle.
  assert.match(scene, /new BeamHitTracker\(\(beam, voice, tick\) => this\.playBeamHit\(beam, voice, tick\)\)/);
  assert.match(scene, /this\.feedback\?\.playHit\(voice, beam\.tier, own, beam\.id, tick, this\.getStereoPan\(beam\.x2\), rate\);/);
  assert.match(scene, /this\.feedback\?\.playHit\(voice, message\.tier, own, key, false, this\.getStereoPan\(at\.x\)\);/);
  // Kin: his dalganin cephesi dusmana ulastiginda (dalga basina bir kez), dogusunda degil.
  assert.match(scene, /this\.beamHitTracker\.update\(beams, now, enemies\);\n\s+this\.updateKinWaveFeel\(beams, now\);/);
  assert.match(scene, /if \(distance > front \+ KIN_FRONT_SLACK\) continue;/);
  // Gosteri: hattaki dusmanlar, menzilin ucu degil.
  assert.match(scene, /this\.applyShowcaseFeel\(beam, angle, own, now\);/);
  // Kritik: yalnizca kendi kritigin.
  assert.match(scene, /if \(own && crit\) this\.punchCrit\(event\.x, event\.y, now\);/);
  assert.match(scene, /private punchCrit\(x: number, y: number, now: number\) \{\n\s+if \(this\.feedback\?\.reducedMotion\) return;/);
  // Olum: son vuran silahin bicimi ve yonu.
  assert.match(scene, /style: recentHit\?\.death,\n\s+heading: recentHit\?\.angle,/);
  // Hasar sayilari degismedi: sayi havuzuna silah bilgisi gitmiyor.
  assert.doesNotMatch(read("apps/web/src/vfx/damage-numbers.ts"), /weapon-feel|getWeaponFeel/);
});

test("isin temasi ve olumun bicimleri ciziliyor; hareket azaltmada kivilcim ve parca yok", async () => {
  const { AttackVfx } = await importWebModule("apps/web/src/vfx/attack-vfx.ts");
  const { VfxLod } = await importWebModule("apps/web/src/vfx/lod.ts");
  const combat = await importWebModule("apps/web/src/vfx/combat-vfx.ts");
  const recorder = () => {
    const calls = [];
    return new Proxy({ calls }, { get: (target, key) => (key in target ? target[key] : (...args) => { calls.push([key, ...args]); return target; }) });
  };
  const hits = [];
  const events = recorder();
  const vfx = new AttackVfx(recorder(), recorder(), events, undefined, { lod: new VfxLod(), onEnemyHit: (hit) => hits.push({ ...hit }) });
  vfx.emitBeamContact({ x: 10, y: 10, angle: 0, definitionId: "warrior-5", tier: 2, own: true, bornAt: 0 }, 0);
  vfx.render(20, 1);
  assert.ok(events.calls.length > 0, "lazer temasi cizilmeli");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].still, true, "lazer nabzi yalnizca kayit (duraklama yok)");
  assert.equal(hits[0].death, "ash");
  vfx.emitBeamContact({ x: 10, y: 10, angle: 0, definitionId: "zeynep-2", tier: 1, own: true, bornAt: 30 });
  assert.equal(hits[1].still, false);
  assert.ok(hits[1].hitStopMs > 0);

  const burst = { x: 100, y: 100, size: 34, color: 0xdc2626, shards: 5, durationMs: 190, intensity: 1, still: false, bornAt: 0, texture: "enemy-grunt", heavy: false, air: false };
  for (const style of ["shards", "ash", "implode"]) {
    const g = recorder();
    const vfxDeath = new combat.CombatVfx(g, recorder(), new VfxLod());
    vfxDeath.emitDeath({ ...burst, style, heading: 0.5 });
    for (const at of [10, 60, 140, 300]) vfxDeath.render(at, 1);
    assert.ok(g.calls.length > 0, `${style} cizilmeli`);
  }
});
