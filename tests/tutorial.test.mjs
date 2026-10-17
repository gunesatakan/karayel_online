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
  isTutorialStepCompletedBy,
  isTutorialStepSatisfied,
  restoreTutorialRun,
  getTutorialOverlayAvoid,
  TUTORIAL_CARD_AVOID_SELECTOR,
  TUTORIAL_SHOP_AVOID_SELECTOR,
  TUTORIAL_PAGES,
  getTutorialPageCount,
  getTutorialTargets,
  tutorialNeedsCarrierHire
} = tutorial;
const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const progress = (action, extra = {}) => ({ kind: "progress", progress: { action, ...extra } });
const build = (...definitionIds) => progress("build", { definitionIds });
const stepOf = (run) => TUTORIAL_STEPS[run.step];
const at = (id) => ({ step: TUTORIAL_STEPS.indexOf(id), done: false });
const ack = { kind: "ack" };
/** Oyunun hali: bos bir tabana eklenenler. */
const facts = (extra = {}) => ({ definitionIds: [], upgraded: false, hired: 0, manualAssignments: 0, repairers: 0, treeUnlocks: 0, ...extra });
const state = (extra) => ({ kind: "state", facts: facts(extra) });
const gatherer = (nodeKind, manual = true) => ({ mode: "crystalCollector", manual, nodeKind });
const carrier = (product, sourceDefinitionId = "zeynep-9", manual = true) => ({ mode: "energyTransport", manual, product, sourceDefinitionId });
const signalsOf = (value) => (Array.isArray(value) ? value : [value]);

/** Her adimi tamamlayan sinyal(ler) (ZentaX'in yapilariyla); cok sayfali adimda birden cok ANLADIM. */
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
  chain: [ack, ack],
  gatherer: state({ production: "bullet", workers: [gatherer("gunpowder")] }),
  materials: state({ production: "bullet", workers: [carrier("materials")] }),
  ammoCarrier: state({ production: "bullet", workers: [carrier("bullet")] }),
  delivery: [ack, ack],
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
    for (const signal of signalsOf(COMPLETE[id])) run = advanceTutorial(run, signal);
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
      for (const signal of signalsOf(COMPLETE[other])) {
        // Ayni sinyal iki adimi tamamlayabilir (ack adimlari ve ayni eylem): onlari atla.
        if (signal.kind === "ack" && TUTORIAL_ACK_STEPS.includes(id)) continue;
        if (signal.kind === "progress" && isTutorialStepCompletedBy(id, signal.progress)) continue;
        if (signal.kind === "state" && isTutorialStepSatisfied(id, signal.facts)) continue;
        assert.deepEqual(advanceTutorial(run, signal), run, `${id} adimi ${other} eylemiyle gecti`);
      }
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
    if (!TUTORIAL_ACK_STEPS.includes(id)) assert.deepEqual(acked, run, id);
    else if (getTutorialPageCount(id) > 1) assert.deepEqual(acked, { ...run, page: 1 }, `${id} ilk ANLADIM sonraki sayfaya`);
    else assert.equal(acked.step, run.step + 1, id);
  }
  assert.deepEqual([...TUTORIAL_ACK_STEPS], ["workerTypes", "chain", "xpGold", "delivery"]);
  assert.deepEqual({ ...TUTORIAL_PAGES }, { chain: 2, delivery: 2 });
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
  for (const id of ["shop", "card", "workerTypes", "hire", "assign", "workerTree", "depot", "armory", "production", "chain", "gatherer", "materials", "ammoCarrier", "delivery", "repairDepot", "repairer", "energy", "xpGold", "settings", "wall", "skill", "ultimate", "upgrade", "tower"]) {
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
    assert.equal(Boolean(getTutorialCopy(id, true, { facts: facts({ ammoDelivered: true }) }).ack), TUTORIAL_ACK_STEPS.includes(id), `${id} ANLADIM`);
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
  assert.match(scene, /room\.onMessage\("tutorial:progress", \(progress: TutorialProgressMessage\) => \{/);
  assert.match(scene, /this\.game\.events\.emit\("game:tutorial-progress", progress\);/);
  assert.match(scene, /this\.game\.events\.on\("game:tutorial-command", this\.handleTutorialCommand, this\);/);
  assert.match(scene, /room\.send\("tutorial:complete", \{\}\);/);
  // Ilerleme kapilari: ogretici yaratici gibi hicbir sey yazmiyor.
  assert.match(scene, /return this\.creativeRequested \|\| this\.creativeMode \|\| this\.isTutorialRun\(\);/);
  assert.match(scene, /const creative = summary\.creative === true \|\| summary\.run\?\.creative === true \|\| this\.creativeMode \|\| tutorial;/);
  assert.match(scene, /const actions = report\.tutorial \? \{ primary: "retry" as const \} : planRunReportActions\(/);
});

const NO_FACTS = { definitionIds: [], upgraded: false, hired: 0, manualAssignments: 0, repairers: 0, treeUnlocks: 0 };

/** Her durum adimini saglayan hal; eylemle anlasilan adimlarda yok. */
const SATISFIED = {
  tower: { definitionIds: ["zeynep-1"] },
  wall: { definitionIds: ["wall-1"] },
  energy: { definitionIds: ["zeynep-10"] },
  hire: { hired: 1 },
  assign: { manualAssignments: 1 },
  depot: { definitionIds: ["warehouse-1"] },
  armory: { definitionIds: ["zeynep-9"] },
  repairDepot: { definitionIds: ["repair-depot-1"] },
  repairer: { repairers: 1 },
  gatherer: { production: "bullet", workers: [gatherer("gunpowder")] },
  materials: { workers: [carrier("materials")] },
  ammoCarrier: { production: "bullet", workers: [carrier("bullet")] },
  upgrade: { upgraded: true },
  workerTree: { treeUnlocks: 1 }
};

test("onceden yapilan is sayiliyor: hedefi oyunun halinde saglanan adim geciliyor", () => {
  for (const id of TUTORIAL_STEPS) {
    const run = at(id);
    const facts = SATISFIED[id];
    assert.deepEqual(advanceTutorial(run, { kind: "state", facts: NO_FACTS }), run, `${id} bos halde gecti`);
    if (facts) {
      assert.equal(isTutorialStepSatisfied(id, { ...NO_FACTS, ...facts }), true, id);
      assert.equal(advanceTutorial(run, { kind: "state", facts: { ...NO_FACTS, ...facts } }).step, run.step + 1, `${id} saglanmis halde gecmedi`);
    }
  }
  // Eylemle anlasilan adimlar: her sey kurulu olsa da hal yetmiyor.
  const everything = { definitionIds: ["zeynep-1", "wall-1", "zeynep-10", "zeynep-9", "warehouse-1", "repair-depot-1"], upgraded: true, hired: 3, manualAssignments: 2, repairers: 1, treeUnlocks: 2 };
  for (const id of ["settings", "workerTypes", "production", "chain", "delivery", "xpGold", "card", "shop", "skill", "ultimate"]) {
    assert.equal(isTutorialStepSatisfied(id, everything), false, `${id} halden gecti`);
  }
  // Bir hal birden cok adimi tek tikte gecirebilir (motor dongude uyguluyor).
  let run = at("depot");
  for (let index = 0; index < 4; index += 1) run = advanceTutorial(run, { kind: "state", facts: everything });
  assert.equal(stepOf(run), "production", "depo, cephanelik gecildi; uretim eylem bekliyor");
  // Duvar kule sayilmiyor, kaynak binasi da.
  assert.equal(isTutorialStepSatisfied("tower", { ...NO_FACTS, definitionIds: ["wall-1", "zeynep-10"] }), false);
});

test("yeniden yukleme: ayni odada kaldigi adim, baska odada ya da bozuk kayitta 1. adim", () => {
  assert.deepEqual(restoreTutorialRun({ roomId: "oda1", step: 7 }, "oda1"), { step: 7, done: false });
  assert.deepEqual(restoreTutorialRun({ roomId: "oda1", step: 7 }, "oda2"), { step: 0, done: false }, "menuden yeni ogretici");
  assert.deepEqual(restoreTutorialRun({ roomId: "oda1", step: 7 }, undefined), { step: 0, done: false });
  assert.deepEqual(restoreTutorialRun(undefined, "oda1"), { step: 0, done: false });
  assert.deepEqual(restoreTutorialRun("bozuk", "oda1"), { step: 0, done: false });
  assert.deepEqual(restoreTutorialRun({ roomId: "oda1", step: 2.5 }, "oda1"), { step: 0, done: false });
  assert.deepEqual(restoreTutorialRun({ roomId: "oda1", step: 99 }, "oda1"), { step: TUTORIAL_STEPS.length - 1, done: false });
  const source = readSource("apps/web/src/tutorial.ts");
  // Kayit try/catch icinde; motor maca giriste odayla geri yukluyor.
  assert.match(source, /try \{\n\s*const raw = window\.localStorage\.getItem\(TUTORIAL_RUN_STORAGE_KEY\);/);
  assert.match(source, /run = restoreTutorialRun\(readSavedTutorialRun\(\), roomId\(\)\);/);
  assert.match(readSource("apps/web/src/scenes/GameScene.ts"), /tutorialRoomId: this\.tutorialMode \? this\.room\?\.roomId : undefined,/);
});

test("perde acikken baska adim: kutu kaybolmuyor, perdenin dugme satirindan kaciyor; magaza adimi gecilince vitrin kapaniyor", () => {
  assert.equal(getTutorialOverlayAvoid("shop", { cardOpen: true, shopOpen: false }), TUTORIAL_CARD_AVOID_SELECTOR);
  assert.equal(getTutorialOverlayAvoid("skill", { cardOpen: false, shopOpen: true }), TUTORIAL_SHOP_AVOID_SELECTOR);
  assert.equal(getTutorialOverlayAvoid("card", { cardOpen: true, shopOpen: false }), undefined, "kendi adimi: normal hedef");
  assert.equal(getTutorialOverlayAvoid("shop", { cardOpen: false, shopOpen: true }), undefined);
  assert.equal(getTutorialOverlayAvoid("tower", { cardOpen: false, shopOpen: false }), undefined);
  const source = readSource("apps/web/src/tutorial.ts");
  assert.doesNotMatch(source, /\(cardOpen && id !== "card"\) \|\| \(shopOpen && id !== "shop"\)\) \{\n\s*hide\(\);/, "perde kutuyu gizliyor");
  assert.match(source, /if \(leaving === "shop" && controls\.goldShop\) command\(\{ type: "closeShop" \}\);/);
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /case "closeShop":\n[^\n]*\n\s*this\.shopDismissedWave = this\.latestPerfSnapshot\?\.team\.wave \?\? 0;/);
});

test("ogretici etiketleri: HUD'da sayac yerine Eğitim, kart perdesinde Eğitim ödülü, damga ve karne yok", () => {
  const ui = readSource("apps/web/src/game-control-ui.ts");
  assert.match(ui, /setText\(waveNode, state\.tutorial \? t\("hud\.tutorial"\) : `\$\{state\.stats\.wave\}`\);/);
  assert.match(ui, /waveVitalNode\.classList\.toggle\("is-tutorial", Boolean\(state\.tutorial\)\);/);
  assert.match(readSource("apps/web/src/style.css"), /\.game-hud__vital--wave\.is-tutorial \.game-hud__wave-total,\n\.game-hud__vital--wave\.is-tutorial \.game-hud__wave-word \{\n\s*display: none;/);
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /this\.emitHudState\(\{ tutorial: this\.tutorialMode \}\);/);
  assert.match(scene, /\$\{this\.tutorialMode \? t\("scene\.card\.tutorialEyebrow"\) : getCardDraftTitle\(draftWave\)\}/);
  assert.match(scene, /private buildWaveReportCard\(\) \{\n[^\n]*\n\s*if \(this\.tutorialMode\) return undefined;/);
  assert.match(scene, /if \(!summary \|\| this\.cardChoiceRoot \|\| this\.tutorialMode\) \{/);
  const controls = readSource("apps/web/src/locales/areas/controls.ts");
  assert.match(controls, /"hud\.tutorial": "Eğitim",/);
  assert.match(controls, /"hud\.tutorial": "Training",/);
  const sceneLocale = readSource("apps/web/src/locales/areas/scene.ts");
  assert.match(sceneLocale, /"scene\.card\.tutorialEyebrow": "EĞİTİM ÖDÜLÜ",/);
  assert.match(sceneLocale, /"scene\.card\.tutorialEyebrow": "TRAINING REWARD",/);
});

test("mühimmat zinciri: yalnizca dogru rol, dogru urun ve dogru bina sayiliyor", () => {
  // Toplayici: uretimin tarifindeki hammaddenin yatagina, elle.
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "bullet", workers: [gatherer("gunpowder")] })), true);
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "bullet", workers: [gatherer("mystic")] })), false, "yanlis yatak");
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "bullet", workers: [gatherer("gunpowder", false)] })), false, "otomatik is sayilmiyor");
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "auraCrystal", workers: [gatherer("gunpowder")] })), false, "uretim degisince tarif de degisiyor");
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "auraCrystal", workers: [gatherer("mystic")] })), true);
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "powerCrystal", workers: [gatherer("plasma")] })), true);
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ workers: [gatherer("gunpowder")] })), false, "cephanelik yok");
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "bullet", workers: [{ ...carrier("materials"), nodeKind: "gunpowder" }] })), false, "tasiyici toplayici degil");
  // Hammadde tasiyicisi: Hammadde urunuyle cephaneye.
  assert.equal(isTutorialStepSatisfied("materials", facts({ workers: [carrier("materials")] })), true);
  assert.equal(isTutorialStepSatisfied("materials", facts({ workers: [carrier("energy")] })), false, "yanlis urun");
  assert.equal(isTutorialStepSatisfied("materials", facts({ workers: [carrier("materials", "repair-depot-1")] })), false, "tamir merkezine hammadde sayilmiyor");
  assert.equal(isTutorialStepSatisfied("materials", facts({ workers: [carrier("materials", "zeynep-9", false)] })), false);
  assert.equal(isTutorialStepSatisfied("materials", facts({ workers: [{ ...carrier("materials"), mode: "crystalCollector" }] })), false);
  // Cephane tasiyicisi: uretilen muhimmatla cephaneye.
  assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ production: "bullet", workers: [carrier("bullet")] })), true);
  assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ production: "bullet", workers: [carrier("auraCrystal")] })), false, "baska mühimmat");
  assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ production: "bullet", workers: [carrier("materials")] })), false, "hammadde tasiyicisi cephane degil");
  assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ production: "bullet", workers: [carrier("bullet", "zeynep-10")] })), false, "enerji binasi");
  assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ production: "powerCrystal", workers: [carrier("powerCrystal", "warrior-7")] })), true, "baska operatorun cephaneligi de cephanelik");
  // Sira: zincir adimlari uretimden sonra, tamir merkezinden once.
  const order = ["production", "chain", "gatherer", "materials", "ammoCarrier", "delivery", "repairDepot"];
  assert.deepEqual(order.map((id) => TUTORIAL_STEPS.indexOf(id)), order.map((_, index) => TUTORIAL_STEPS.indexOf("production") + index));
  // Ilk teslimat ANLADIM'i acmiyor; bekleme metni ANLADIM'siz, GEÇ ile gecilebiliyor.
  assert.equal(isTutorialStepSatisfied("delivery", facts({ ammoDelivered: true })), false, "teslimat adimi okunmadan gecmiyor");
});

test("bosta tasiyici yoksa adim once isci aldiriyor; cephane tasiyicisinda dogru urun dugmesi cerceveleniyor", () => {
  const busy = facts({ production: "bullet", workers: [carrier("energy", "zeynep-10"), carrier("materials")] });
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", busy), true);
  assert.equal(tutorialNeedsCarrierHire("materials", busy), true);
  assert.equal(tutorialNeedsCarrierHire("gatherer", busy), false);
  assert.deepEqual([...getTutorialTargets("ammoCarrier", busy)], [...TUTORIAL_TARGETS.hire]);
  assert.match(getTutorialCopy("ammoCarrier", true, { facts: busy }).body, /İşe Al/);
  // Tek otomatik enerji tasiyicisi enerjide kalmali: bosta sayilmiyor.
  const autoEnergy = { mode: "energyTransport", manual: false, product: "energy" };
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", facts({ workers: [carrier("materials"), autoEnergy] })), true, "enerji tasiyicisi alinmamali");
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", facts({ workers: [carrier("materials"), autoEnergy, { ...autoEnergy }] })), false, "yeni alinan tasiyici bosta");
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", facts({ workers: [carrier("energy", "zeynep-10"), autoEnergy] })), false, "enerji elle kapaliysa otomatik olan bosta");
  const free = facts({ production: "auraCrystal", workers: [carrier("materials"), autoEnergy, { mode: "energyTransport", manual: false, product: "bullet" }] });
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", free), false);
  assert.equal(getTutorialTargets("ammoCarrier", free)[0], '[data-worker-product="auraCrystal"]:not(.is-active)');
  assert.equal(getTutorialTargets("materials", free)[0], '[data-worker-product="materials"]:not(.is-active)');
  // Tasiyicinin urun dugmesindeki ad (Aura kristali); toplayici adimi cephaneligin secicisindeki adi (Psişik / Aura) kullaniyor.
  assert.match(getTutorialCopy("ammoCarrier", true, { facts: free }).body, /Aura kristali/);
  assert.match(getTutorialCopy("gatherer", true, { facts: free }).body, /Psişik \/ Aura için/);
  assert.match(getTutorialCopy("gatherer", true, { facts: free }).body, /Mistik öz/);
  // Urun dugmesinin sahibi arayuzde; teslimat bilgisi sahneden.
  assert.match(readSource("apps/web/src/game-control-ui.ts"), /button\.dataset\.workerProduct = product;/);
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /if \(progress\?\.action === "ammoDelivered" && !this\.tutorialAmmoDelivered\) \{/);
  assert.match(scene, /ammoDelivered: this\.tutorialAmmoDelivered/);
});

test("cok sayfali bilgi: zincir iki sayfa, teslimat once bekler sonra iki sayfa", () => {
  let run = at("chain");
  assert.equal(getTutorialCopy("chain", true, { page: 0 }).ack, "İLERİ");
  assert.match(getTutorialCopy("chain", true, { page: 0 }).body, /Yatak → Toplayıcı → Hammadde Deposu → Taşıyıcı \(Hammadde\) → Cephanelik → Taşıyıcı \(Cephane\) → Kule/);
  run = advanceTutorial(run, ack);
  assert.equal(stepOf(run), "chain");
  assert.equal(run.page, 1);
  const second = getTutorialCopy("chain", true, { page: run.page });
  assert.equal(second.ack, "ANLADIM");
  assert.notEqual(second.body, getTutorialCopy("chain", true, { page: 0 }).body);
  run = advanceTutorial(run, ack);
  assert.equal(stepOf(run), "gatherer");
  assert.equal(run.page, undefined, "yeni adim ilk sayfadan");

  const waiting = getTutorialCopy("delivery", true, { facts: facts({ production: "bullet" }) });
  assert.equal(waiting.ack, undefined, "teslimat gelmeden ANLADIM yok");
  assert.match(waiting.body, /bekle/);
  const ready = facts({ production: "bullet", ammoDelivered: true });
  assert.equal(getTutorialCopy("delivery", true, { facts: ready, page: 0 }).ack, "İLERİ");
  const failures = getTutorialCopy("delivery", true, { facts: ready, page: 1 });
  assert.equal(failures.ack, "ANLADIM");
  for (const word of ["taşıyıcı yok", "kaynak deposu boş", "sevkiyat kapalı", "yol kapalı"]) assert.ok(failures.body.includes(word), word);
  assert.match(getTutorialCopy("delivery", true, { facts: ready, page: 0 }).body, /Mühimmat akışı/);
  assert.match(getTutorialCopy("delivery", true, { facts: ready, page: 0 }).body, /Sevkiyat önceliği/);
  assert.equal(getTutorialTargets("delivery", ready)[0], ".ts-stock");
  assert.equal(getTutorialTargets("delivery", facts())[0], '.ts-bar[data-key="ammo"]');
  // Sayfa yeniden yuklemede sifirdan; adim korunuyor.
  assert.deepEqual(advanceTutorial({ ...at("delivery"), page: 1 }, ack), { step: TUTORIAL_STEPS.indexOf("delivery") + 1, done: false });
});
