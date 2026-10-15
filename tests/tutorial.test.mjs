/**
 * Ogretici asamasi (apps/web/src/tutorial.ts): oyuncunun yaptigiyla ilerleyen
 * saf adim motoru.
 *
 * Her eylem adimi sunucunun olctugu kendi eylemiyle (`tutorial:progress`),
 * bilgi adimlari ANLADIM ile, her adim GEÇ ile geciyor. Baska bir adimin
 * eylemi adimi gecirmiyor. Son adimdan sonra motor bitiyor (sahne zaferi
 * sunucudan istiyor). Menudeki Eğitim ve ilk kez gelen oyuncunun teklif
 * karti ayri ogretici macini baslatiyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const tutorial = await importWebModule("apps/web/src/tutorial.ts");
const {
  TUTORIAL_STEPS,
  TUTORIAL_ACK_STEPS,
  TUTORIAL_TARGETS,
  advanceTutorial,
  classifyTutorialBuild,
  createTutorialRun,
  getTutorialCopy,
  getTutorialStepPrepare,
  isFreshPlayer,
  isTutorialStepCompletedBy
} = tutorial;
const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const progress = (action, extra = {}) => ({ kind: "progress", progress: { action, ...extra } });
const build = (...definitionIds) => progress("build", { definitionIds });
const stepOf = (run) => TUTORIAL_STEPS[run.step];
const at = (id) => ({ step: TUTORIAL_STEPS.indexOf(id), done: false });

/** Her adimi tamamlayan sinyal (ZentaX'in yapilariyla). */
const COMPLETE = {
  tower: build("zeynep-1"),
  wall: build("wall-1"),
  settings: progress("settings"),
  energy: build("zeynep-10"),
  workerTypes: { kind: "ack" },
  hire: progress("hire"),
  assign: progress("assign", { role: "crystalCollector" }),
  depot: build("warehouse-1"),
  armory: build("zeynep-9"),
  production: progress("production"),
  repairDepot: build("repair-depot-1"),
  repairer: progress("specialize", { role: "repairer" }),
  xpGold: { kind: "ack" },
  upgrade: progress("upgrade"),
  workerTree: progress("workerTree"),
  card: progress("card"),
  shop: progress("shop"),
  skill: progress("skill"),
  ultimate: progress("ultimate")
};

test("bastan sona: her adim kendi eylemiyle geciyor, motor bitiyor", () => {
  assert.deepEqual(Object.keys(COMPLETE), [...TUTORIAL_STEPS], "her adimin bir tamamlayicisi olmali");
  let run = createTutorialRun();
  for (const id of TUTORIAL_STEPS) {
    assert.equal(stepOf(run), id);
    assert.equal(run.done, false);
    run = advanceTutorial(run, COMPLETE[id]);
  }
  assert.equal(run.done, true);
  assert.deepEqual(advanceTutorial(run, { kind: "skip" }), run, "bitmis motor ilerlemiyor");
  assert.deepEqual(advanceTutorial(run, progress("ultimate")), run);
});

test("baska adimin eylemi adimi gecirmiyor", () => {
  for (const id of TUTORIAL_STEPS) {
    const run = at(id);
    for (const other of TUTORIAL_STEPS) {
      if (other === id) continue;
      const signal = COMPLETE[other];
      // Ayni sinyal iki adimi tamamlayabilir (ack adimlari ve ayni eylem): onlari atla.
      if (signal.kind === "ack" && TUTORIAL_ACK_STEPS.includes(id)) continue;
      if (signal.kind === "progress" && isTutorialStepCompletedBy(id, signal.progress)) continue;
      assert.deepEqual(advanceTutorial(run, signal), run, `${id} adimi ${other} eylemiyle gecti`);
    }
  }
  // Ozellikle: kule adiminda duvar ve kaynak binasi sayilmiyor.
  assert.equal(stepOf(advanceTutorial(at("tower"), build("wall-1"))), "tower");
  assert.equal(stepOf(advanceTutorial(at("tower"), build("zeynep-10"))), "tower");
  assert.equal(stepOf(advanceTutorial(at("tower"), build("wall-1", "zeynep-2"))), "wall", "duvar ile birlikte kule");
});

test("GEÇ her adimi geciyor; ANLADIM yalnizca bilgi adiminda", () => {
  for (const id of TUTORIAL_STEPS) {
    const run = at(id);
    assert.equal(advanceTutorial(run, { kind: "skip" }).step, run.step + 1, `${id} GEÇ ile gecmedi`);
    const acked = advanceTutorial(run, { kind: "ack" });
    assert.equal(acked.step, TUTORIAL_ACK_STEPS.includes(id) ? run.step + 1 : run.step, id);
  }
  assert.deepEqual([...TUTORIAL_ACK_STEPS], ["workerTypes", "xpGold"]);
  const last = advanceTutorial(at("ultimate"), { kind: "skip" });
  assert.equal(last.done, true, "son adimi gecmek motoru bitiriyor");
});

test("yapi turu: kule, duvar, enerji, cephanelik, depo, tamir merkezi", () => {
  assert.equal(classifyTutorialBuild("zeynep-1"), "tower");
  assert.equal(classifyTutorialBuild("zeynep-8"), "tower");
  assert.equal(classifyTutorialBuild("wall-1"), "wall");
  assert.equal(classifyTutorialBuild("zeynep-10"), "energy");
  assert.equal(classifyTutorialBuild("zeynep-9"), "armory");
  assert.equal(classifyTutorialBuild("warrior-8"), "energy");
  assert.equal(classifyTutorialBuild("warrior-7"), "armory");
  assert.equal(classifyTutorialBuild("warehouse-1"), "depot");
  assert.equal(classifyTutorialBuild("repair-depot-1"), "repairDepot");
});

test("isci adimlari: alim ya da uzmanlik; tamirci adimi yalnizca onarim rolu ya da altinla onarim", () => {
  assert.equal(isTutorialStepCompletedBy("hire", { action: "hire" }), true);
  assert.equal(isTutorialStepCompletedBy("hire", { action: "specialize", role: "energyTransport" }), true);
  assert.equal(isTutorialStepCompletedBy("hire", { action: "assign" }), false);
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "specialize", role: "crystalCollector" }), false);
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "hire" }), false, "rolsuz alim tamirci degil");
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "hire", role: "repairer" }), true);
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "assign", role: "repairer" }), true);
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "repair" }), true);
  assert.equal(isTutorialStepCompletedBy("settings", { action: "settings" }), true);
  assert.equal(isTutorialStepCompletedBy("workerTypes", { action: "hire" }), false, "bilgi adimi eylemle gecmiyor");
});

test("adim hazirligi: kart, magaza, beceri, ulti; digerleri kaynak tabani", () => {
  assert.equal(getTutorialStepPrepare("card"), "cards");
  assert.equal(getTutorialStepPrepare("shop"), "shop");
  assert.equal(getTutorialStepPrepare("skill"), "skill");
  assert.equal(getTutorialStepPrepare("ultimate"), "ultimate");
  for (const id of ["tower", "wall", "upgrade", "workerTree", "hire"]) assert.equal(getTutorialStepPrepare(id), "resources");
});

test("istenen her mekanik bir adimda", () => {
  // Sahibin listesi: esya alma, kart secme, isci turleri, isci alma, isci
  // yonetme, isci agaci, hammadde deposu, cephanelik, tamirci binasi ve
  // calistirilmasi, enerji, deneyim/altin farki, kule ayarlari, duvar, beceri, ulti.
  for (const id of ["shop", "card", "workerTypes", "hire", "assign", "workerTree", "depot", "armory", "production", "repairDepot", "repairer", "energy", "xpGold", "settings", "wall", "skill", "ultimate", "upgrade", "tower"]) {
    assert.ok(TUTORIAL_STEPS.includes(id), `${id} adimi yok`);
  }
});

test("metinler kisa; bilgi adiminda ANLADIM, kapali pencerede yeniden ac dugmesi", () => {
  for (const id of TUTORIAL_STEPS) {
    for (const open of [false, true]) {
      const copy = getTutorialCopy(id, open);
      assert.ok(copy.title.length > 0 && copy.body.length > 0, id);
      assert.ok(copy.body.length <= 170, `${id} kisa kalmali (${copy.body.length})`);
    }
    assert.equal(Boolean(getTutorialCopy(id).ack), TUTORIAL_ACK_STEPS.includes(id), `${id} ANLADIM`);
    assert.ok(Array.isArray(TUTORIAL_TARGETS[id]), `${id} hedef tablosunda yok`);
  }
  assert.equal(getTutorialCopy("workerTypes").ack, "ANLADIM");
  assert.equal(getTutorialCopy("card", false).reopen, "KARTLARI GÖSTER");
  assert.equal(getTutorialCopy("card", true).reopen, undefined, "pencere acikken dugme yok");
  assert.equal(getTutorialCopy("shop", false).reopen, "MAĞAZAYI AÇ");
  assert.equal(getTutorialCopy("tower", false).reopen, undefined);
  // Metinler sabit operatorun (ZentaX) gercek yapilarini aniyor.
  assert.match(getTutorialCopy("tower").body, /Hiza Emri/);
  assert.match(getTutorialCopy("energy").body, /Enerji Ocağı/);
  assert.match(getTutorialCopy("armory").body, /Cephane Divanı/);
  assert.match(getTutorialCopy("ultimate").body, /Kurucu Fermanı/);
});

test("ilk kez gelen oyuncu: hicbir ilerleme yoksa", () => {
  const none = { clearedStages: 0, records: 0, archiveEntries: 0, badgesEarned: 0 };
  assert.equal(isFreshPlayer(none), true);
  for (const key of Object.keys(none)) assert.equal(isFreshPlayer({ ...none, [key]: 1 }), false, key);
});

test("baglanti: menu Eğitim ve teklif karti ogretici macini baslatiyor; sahne bayragi tasiyor", () => {
  assert.match(readSource("apps/web/src/main.ts"), /setupTutorial\(game\);/);
  const menu = readSource("apps/web/src/menu-ui.ts");
  assert.match(menu, /data-start-game data-replay-tutorial>\$\{t\("menu\.home\.tutorial"\)\}</);
  assert.match(readSource("apps/web/src/locales/areas/menu.ts"), /"menu\.home\.tutorial": "Eğitim"/);
  assert.match(menu, /if \(button\.hasAttribute\("data-replay-tutorial"\)\) \{\n\s*startTutorial\(\);/);
  // Ogretici: varsayilan operator, asama 1, tutorial bayragi.
  const start = menu.slice(menu.indexOf("const startTutorial = "), menu.indexOf("const startGame = "));
  assert.match(start, /characterId: getDefaultOperator\(\)\.id,/);
  assert.match(start, /tutorial: true,/);
  assert.match(start, /stage: 1/);
  assert.match(start, /dismissTutorialOffer\(\);/);
  // Tek seferlik teklif: "Öğreticiyi oyna" / "Şimdi değil".
  assert.match(menu, /data-tutorial-offer/);
  assert.match(menu, /data-dismiss-tutorial-offer/);
  assert.match(readSource("apps/web/src/locales/areas/menu.ts"), /"menu\.home\.tutorialOffer\.play": "Öğreticiyi oyna"/);
  assert.match(readSource("apps/web/src/locales/areas/menu.ts"), /"menu\.home\.tutorialOffer\.later": "Şimdi değil"/);
  // Teklifin kaydi try/catch icinde (itch iframe'i, gizli pencere).
  const source = readSource("apps/web/src/tutorial.ts");
  assert.match(source, /try \{\n\s*return window\.localStorage\.getItem\(TUTORIAL_OFFER_STORAGE_KEY\) === "1";/);
  assert.match(source, /try \{\n\s*window\.localStorage\.setItem\(TUTORIAL_OFFER_STORAGE_KEY, "1"\);/);
  // Sahne: oda kurarken bayrak, sunucu olcumunu motora, motorun istegini odaya.
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /tutorial: this\.tutorialRequested,/);
  assert.match(scene, /room\.onMessage\("tutorial:progress", \(progress: TutorialProgressMessage\) => this\.game\.events\.emit\("game:tutorial-progress", progress\)\);/);
  assert.match(scene, /this\.game\.events\.on\("game:tutorial-command", this\.handleTutorialCommand, this\);/);
  assert.match(scene, /room\.send\("tutorial:complete", \{\}\);/);
  // Ilerleme kapilari: ogretici yaratici gibi hicbir sey yazmiyor.
  assert.match(scene, /return this\.creativeRequested \|\| this\.creativeMode \|\| this\.isTutorialRun\(\);/);
  assert.match(scene, /const creative = summary\.creative === true \|\| summary\.run\?\.creative === true \|\| this\.creativeMode \|\| tutorial;/);
  assert.match(scene, /const actions = report\.tutorial \? \{ primary: "retry" as const \} : planRunReportActions\(/);
});
