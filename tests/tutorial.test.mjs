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
/**
 * Tek tip isci (sahnenin `getTutorialFacts` hali): kip isin aynasi, is
 * atandigi yerden. Kaynaktaki isci toplar; binadaki isci gorev yeri turuyla
 * (`postKind`) ve binanin tanim kimligiyle; atamasiz isci bosta.
 */
const gatherer = (nodeKind, manual = true) => ({ mode: "crystalCollector", manual, nodeKind });
const POST_BUILDINGS = { warehouse: "warehouse-1", energy: "zeynep-10", factory: "zeynep-9", repair: "repair-depot-1" };
const modeOfPost = (postKind) => (postKind === "repair" ? "repairer" : "energyTransport");
/** Elle bir binaya atanmis isci. */
const posted = (postKind, sourceDefinitionId = POST_BUILDINGS[postKind]) => ({ mode: modeOfPost(postKind), manual: true, postKind, sourceDefinitionId });
/** Sunucunun baslangic iscisi: varsayilan isi "en yakin bu tur bina", bina kimligi yok. */
const auto = (postKind) => ({ mode: modeOfPost(postKind), manual: false, postKind });
/** Yeni alinan isci: atamasi yok, tasiyici kipinde bosta. */
const idle = () => ({ mode: "energyTransport", manual: false });
const signalsOf = (value) => (Array.isArray(value) ? value : [value]);

/** Adimin butun metinleri: her sayfa, kapali/acik pencere, her uretim; bos isciyle, teslimattan once ve sonra. */
function allCopies(id) {
  const contexts = [{}];
  for (const production of ["bullet", "auraCrystal", "powerCrystal"]) {
    for (const ammoDelivered of [false, true]) contexts.push({ facts: facts({ production, ammoDelivered, workers: [auto("energy"), idle()] }) });
  }
  return contexts.flatMap((context) => Array.from({ length: getTutorialPageCount(id) }, (_, page) => [false, true].map((open) => getTutorialCopy(id, open, { ...context, page }))).flat());
}

/** Her adimi tamamlayan sinyal(ler) (ZentaX'in yapilariyla); cok sayfali adimda birden cok ANLADIM. */
const COMPLETE = {
  tower: build("zeynep-1"),
  wall: build("wall-1"),
  settings: progress("settings"),
  energy: build("zeynep-10"),
  workerTypes: { kind: "ack" },
  hire: progress("hire"),
  // Sunucunun atama olcumu: kaynaga atamada isin kipi, binaya atamada kip ve gorev yeri.
  assign: progress("assign", { role: "crystalCollector" }),
  depot: build("warehouse-1"),
  armory: build("zeynep-9"),
  production: progress("production"),
  chain: [ack, ack],
  gatherer: state({ production: "bullet", workers: [gatherer("gunpowder")] }),
  materials: state({ production: "bullet", workers: [posted("warehouse")] }),
  ammoCarrier: state({ production: "bullet", workers: [posted("factory")] }),
  delivery: [ack, ack],
  repairDepot: build("repair-depot-1"),
  repairer: progress("assign", { role: "repairer", postKind: "repair" }),
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

test("isci adimlari: alim yalnizca alimla; tamirci adimi Tamir Merkezi'ne atamayla ya da altinla onarimla", () => {
  assert.equal(isTutorialStepCompletedBy("hire", { action: "hire" }), true);
  assert.equal(isTutorialStepCompletedBy("hire", { action: "assign", role: "energyTransport", postKind: "warehouse" }), false, "atama alim degil");
  // Uzmanlik secimi kalkti: eski eylem hicbir isci adimini gecirmiyor.
  for (const id of ["hire", "assign", "repairer"]) {
    assert.equal(isTutorialStepCompletedBy(id, { action: "specialize", role: "repairer" }), false, `${id} uzmanlikla gecti`);
  }
  // Yonetim: her atama sayiliyor (kaynak ya da bina); alim sayilmiyor.
  assert.equal(isTutorialStepCompletedBy("assign", { action: "assign", role: "crystalCollector" }), true);
  assert.equal(isTutorialStepCompletedBy("assign", { action: "assign", role: "energyTransport", postKind: "factory" }), true);
  assert.equal(isTutorialStepCompletedBy("assign", { action: "hire" }), false);
  // Tamirci: Tamir Merkezi'ne atanan isci tamirci oluyor; alim kimseyi tamirci yapmiyor.
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "assign", role: "repairer", postKind: "repair" }), true);
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "assign", postKind: "repair" }), true, "gorev yeri yetiyor");
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "assign", role: "repairer" }), true, "isin kipi yetiyor");
  for (const postKind of ["warehouse", "energy", "factory"]) {
    assert.equal(isTutorialStepCompletedBy("repairer", { action: "assign", role: "energyTransport", postKind }), false, `${postKind} tamirci yapmiyor`);
  }
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "assign", role: "crystalCollector" }), false, "kaynaga atama");
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "hire" }), false, "alim tamirci degil");
  assert.equal(isTutorialStepCompletedBy("repairer", { action: "hire", role: "repairer" }), false, "alimdaki eski rol yok sayiliyor");
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
    for (const copy of allCopies(id)) {
      assert.ok(copy.title.length > 0 && copy.body.length > 0, id);
      assert.ok(copy.body.length <= 170, `${id} kisa kalmali (${copy.body.length})`);
      // Tek tip isci: uzmanlik, isci turu ya da urun secimi kalmadi.
      assert.doesNotMatch(copy.body, /uzman|Toplama işçisi|Taşıma işçisi|ürün olarak/, id);
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
  // Is atandigi yerden: tek tip isci; tamirci Tamir Merkezi'ne atanarak oluyor.
  assert.match(getTutorialCopy("workerTypes").body, /Tek tip işçi/);
  assert.match(getTutorialCopy("repairer").body, /Tamir Merkezi'ne dokun/);
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
  materials: { workers: [posted("warehouse")] },
  ammoCarrier: { production: "bullet", workers: [posted("factory")] },
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

test("mühimmat zinciri: yalnizca elle, dogru yere atanmis isci sayiliyor", () => {
  // Toplama: uretimin tarifindeki hammaddenin yatagina, elle.
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "bullet", workers: [gatherer("gunpowder")] })), true);
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "bullet", workers: [gatherer("mystic")] })), false, "yanlis yatak");
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "bullet", workers: [gatherer("gunpowder", false)] })), false, "otomatik is sayilmiyor");
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "auraCrystal", workers: [gatherer("gunpowder")] })), false, "uretim degisince tarif de degisiyor");
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "auraCrystal", workers: [gatherer("mystic")] })), true);
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "powerCrystal", workers: [gatherer("plasma")] })), true);
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ workers: [gatherer("gunpowder")] })), false, "cephanelik yok");
  // Kaynaga yeni atanmis ama elindeki yuku teslim etmemis isci (kip henuz tasima) toplamiyor.
  assert.equal(isTutorialStepSatisfied("gatherer", facts({ production: "bullet", workers: [{ mode: "energyTransport", manual: true, nodeKind: "gunpowder" }] })), false, "kip toplama degil");
  // Hammadde tasima: Hammadde Deposu'na elle atanmis isci; uretimden bagimsiz.
  assert.equal(isTutorialStepSatisfied("materials", facts({ workers: [posted("warehouse")] })), true);
  for (const postKind of ["energy", "factory", "repair"]) {
    assert.equal(isTutorialStepSatisfied("materials", facts({ production: "bullet", workers: [posted(postKind)] })), false, `${postKind} hammadde tasimiyor`);
  }
  assert.equal(isTutorialStepSatisfied("materials", facts({ workers: [auto("warehouse")] })), false, "otomatik is sayilmiyor");
  assert.equal(isTutorialStepSatisfied("materials", facts({ production: "bullet", workers: [gatherer("gunpowder"), idle()] })), false, "toplayan ve bosta isci");
  // Kip degil yer sayiliyor: depoya atanip yukunu teslim edince tasimaya gececek isci de.
  assert.equal(isTutorialStepSatisfied("materials", facts({ workers: [{ ...posted("warehouse"), mode: "crystalCollector" }] })), true, "atandigi yer sayilmadi");
  // Muhimmat tasima: cephanelige elle atanmis isci; urun secimi yok, cephanelik ne uretiyorsa o.
  for (const production of ["bullet", "auraCrystal", "powerCrystal"]) {
    assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ production, workers: [posted("factory")] })), true, production);
  }
  assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ workers: [posted("factory")] })), false, "cephanelik yok");
  for (const postKind of ["warehouse", "energy", "repair"]) {
    assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ production: "bullet", workers: [posted(postKind)] })), false, `${postKind} muhimmat tasimiyor`);
  }
  assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ production: "bullet", workers: [auto("factory")] })), false, "baslangictaki otomatik cephanelik tasiyicisi sayildi");
  assert.equal(isTutorialStepSatisfied("ammoCarrier", facts({ production: "powerCrystal", workers: [posted("factory", "warrior-7")] })), true, "baska operatorun cephaneligi de cephanelik");
  // Sira: zincir adimlari uretimden sonra, tamir merkezinden once.
  const order = ["production", "chain", "gatherer", "materials", "ammoCarrier", "delivery", "repairDepot"];
  assert.deepEqual(order.map((id) => TUTORIAL_STEPS.indexOf(id)), order.map((_, index) => TUTORIAL_STEPS.indexOf("production") + index));
  // Ilk teslimat ANLADIM'i acmiyor; bekleme metni ANLADIM'siz, GEÇ ile gecilebiliyor.
  assert.equal(isTutorialStepSatisfied("delivery", facts({ ammoDelivered: true })), false, "teslimat adimi okunmadan gecmiyor");
});

test("bos isci yoksa tasima adimi once isci aldiriyor; bos: elle atanmamis ve kaynakta degil", () => {
  // Herkes is basinda: elle atanmis ya da kaynakta (otomatik toplayici da).
  const busy = facts({ production: "bullet", workers: [posted("energy"), posted("warehouse"), gatherer("gunpowder"), gatherer("energy", false)] });
  for (const id of ["materials", "ammoCarrier"]) {
    assert.equal(tutorialNeedsCarrierHire(id, busy), true, id);
    assert.deepEqual([...getTutorialTargets(id, busy)], [...TUTORIAL_TARGETS.hire], id);
    assert.match(getTutorialCopy(id, true, { facts: busy }).body, /İşe Al/, id);
  }
  for (const id of ["gatherer", "assign", "repairer"]) assert.equal(tutorialNeedsCarrierHire(id, busy), false, `${id} isci aldirdi`);
  // Tek otomatik enerji tasiyicisi enerjide kalmali: bos sayilmiyor.
  const autoEnergy = auto("energy");
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", facts({ workers: [posted("warehouse"), autoEnergy] })), true, "enerji tasiyani alinmamali");
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", facts({ workers: [posted("warehouse"), autoEnergy, idle()] })), false, "yeni alinan isci bos");
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", facts({ workers: [posted("energy"), autoEnergy] })), false, "enerji elle kapaliysa otomatik olan bos");
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", facts({ workers: [autoEnergy, { ...autoEnergy }] })), false, "ikinci otomatik enerji tasiyicisi bos");
  // Bos: bosta ya da otomatik tasiyan. Kaynaktaki ve elle atanmis isci is basinda.
  assert.equal(tutorialNeedsCarrierHire("materials", facts({ workers: [idle()] })), false, "bosta isci enerji tasimiyor, bos");
  assert.equal(tutorialNeedsCarrierHire("materials", facts({ workers: [autoEnergy, auto("factory")] })), false, "otomatik cephanelik tasiyicisi bos");
  assert.equal(tutorialNeedsCarrierHire("materials", facts({ workers: [autoEnergy, gatherer("gunpowder", false), gatherer("energy", false)] })), true, "kaynaktaki otomatik isci bos sayildi");
  assert.equal(tutorialNeedsCarrierHire("materials", facts({ workers: [posted("repair"), posted("factory")] })), true, "elle atanmis isci bos sayildi");

  // Bos isci varken: once secim seridi (secilen ya da yeni alinan isci), sonra liste; urun dugmesi yok.
  const free = facts({ production: "auraCrystal", workers: [posted("warehouse"), autoEnergy, auto("factory")] });
  const pickTargets = [".game-controls__drawer.worker-pick", ".worker-list", '[data-worker-tab="manage"]', '[data-launch="worker"]'];
  for (const id of ["materials", "ammoCarrier"]) assert.deepEqual([...getTutorialTargets(id, free)], pickTargets, id);
  // Tamirci de bir isciyi atatiyor: bos isci olmasa da İşe Al degil, liste ve serit.
  assert.deepEqual([...getTutorialTargets("repairer", busy)], pickTargets, "tamirci adimi İşe Al'i cerceveliyor");
  for (const id of TUTORIAL_STEPS) {
    for (const selector of [...getTutorialTargets(id, free), ...getTutorialTargets(id, busy)]) assert.doesNotMatch(selector, /data-worker-product/, id);
  }
  // Metin uretilen muhimmati ve hammaddesini aniyor (tek ad: ammoTypeLabels).
  const ammoBody = getTutorialCopy("ammoCarrier", true, { facts: free }).body;
  assert.match(ammoBody, /Cephane Divanı/);
  assert.match(ammoBody, /Aura kristali/);
  const materialsBody = getTutorialCopy("materials", true, { facts: free }).body;
  assert.match(materialsBody, /Hammadde Deposu/);
  assert.match(materialsBody, /Mistik öz/);
  assert.match(getTutorialCopy("gatherer", true, { facts: free }).body, /Aura kristali için/);
  assert.match(getTutorialCopy("gatherer", true, { facts: free }).body, /Mistik öz/);
  // Hedeflerin sahibi arayuzde: secim seridi ve isci listesi; urun dugmesi kalkti.
  const ui = readSource("apps/web/src/game-control-ui.ts");
  assert.match(ui, /strip\.className = "game-controls__drawer worker-pick";/);
  assert.match(ui, /list\.className = "worker-list";/);
  assert.doesNotMatch(ui, /dataset\.workerProduct/);
  // Sahne: iscinin gorev yeri atamadan, alinan isci secili geliyor; teslimat bilgisi.
  const scene = readSource("apps/web/src/scenes/GameScene.ts");
  assert.match(scene, /postKind: drone\.assignment\?\.postKind,/);
  assert.match(scene, /this\.workerPick = \{ workerId: message\.workerId \};/);
  assert.match(scene, /if \(progress\?\.action === "ammoDelivered" && !this\.tutorialAmmoDelivered\) \{/);
  assert.match(scene, /ammoDelivered: this\.tutorialAmmoDelivered/);
});

test("zincir ogretici kadrosuyla: otomatik isci sayilmiyor, bos isci bitince alim, alinan isci cephanelige", () => {
  // Sunucunun kadrosu: dort baslangic iscisi otomatik (iki toplayici kaynakta,
  // enerji ve cephanelik tasiyicisi en yakin binada); atama adiminda alinan
  // isci elle enerji kristaline gitti.
  const roster = [gatherer("energy", false), auto("energy"), gatherer("gunpowder", false), auto("factory"), gatherer("energy")];
  const view = () => facts({ definitionIds: ["zeynep-1", "wall-1", "zeynep-10", "warehouse-1", "zeynep-9"], hired: 1, manualAssignments: 1, production: "bullet", workers: [...roster] });
  let run = at("gatherer");
  const tick = () => {
    run = advanceTutorial(run, { kind: "state", facts: view() });
    return stepOf(run);
  };
  // Toplama: barut yatagindaki otomatik isci sayilmiyor; oyuncu onu elle yataga atiyor.
  assert.equal(tick(), "gatherer");
  roster[2] = gatherer("gunpowder");
  assert.equal(tick(), "materials");
  // Hammadde tasima: otomatik cephanelik tasiyicisi bos (enerji tasiyan kaliyor); oyuncu onu depoya atiyor.
  assert.equal(tutorialNeedsCarrierHire("materials", view()), false);
  assert.equal(getTutorialTargets("materials", view())[0], ".game-controls__drawer.worker-pick");
  assert.equal(tick(), "materials");
  roster[3] = posted("warehouse");
  assert.equal(tick(), "ammoCarrier");
  // Muhimmat tasima: bos yalnizca enerji tasiyan; adim once isci aldiriyor, alim adimi gecirmiyor.
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", view()), true);
  assert.deepEqual([...getTutorialTargets("ammoCarrier", view())], [...TUTORIAL_TARGETS.hire]);
  const waiting = getTutorialCopy("ammoCarrier", true, { facts: view() }).body;
  assert.match(waiting, /İşe Al/);
  run = advanceTutorial(run, progress("hire"));
  assert.equal(stepOf(run), "ammoCarrier", "alim tasima adimini gecirdi");
  roster.push(idle());
  assert.equal(tutorialNeedsCarrierHire("ammoCarrier", view()), false, "yeni isci bos sayilmadi");
  assert.equal(getTutorialTargets("ammoCarrier", view())[0], ".game-controls__drawer.worker-pick");
  assert.notEqual(getTutorialCopy("ammoCarrier", true, { facts: view() }).body, waiting);
  assert.equal(tick(), "ammoCarrier");
  roster[5] = posted("factory");
  assert.equal(tick(), "delivery");
});

test("cok sayfali bilgi: zincir iki sayfa, teslimat once bekler sonra iki sayfa", () => {
  let run = at("chain");
  assert.equal(getTutorialCopy("chain", true, { page: 0 }).ack, "İLERİ");
  assert.match(getTutorialCopy("chain", true, { page: 0 }).body, /Yatak → İşçi → Hammadde Deposu → İşçi → Cephanelik → İşçi → Kule/);
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
