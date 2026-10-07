/**
 * Ilk mac brifingi (apps/web/src/tutorial.ts): alti adim, oyuncunun
 * yaptigiyla ilerleyen saf durum makinesi.
 *
 * kule -> dalga -> lojistik -> kart -> magaza -> isci. Kart ve magaza
 * adimi pencere acilip kapaninca, dalga adimi kurulum bitince, lojistik ve
 * isci adimi ANLAŞILDI ile (isci alimi da sayilir) geciyor. Yaratici modda
 * ve mac disinda hicbir sey olmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importWebModule } from "./helpers/web-module.mjs";

const tutorial = await importWebModule("apps/web/src/tutorial.ts");
const { TUTORIAL_STEPS, advanceTutorial, createTutorialRun, isTutorialStepVisible, getTutorialCopy } = tutorial;
const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const base = { inMatch: true, creative: false, setupPhase: true, ownTowers: 0, cardDraftOpen: false, shopOpen: false, workersHired: 0 };
const fresh = () => createTutorialRun({ step: 0, done: false });
const stepOf = (run) => TUTORIAL_STEPS[run.step];

/** Gozlem dizisini sirayla uygular; `ack` olan adimda ANLAŞILDI basilmis. */
function play(run, frames) {
  for (const frame of frames) run = advanceTutorial(run, { ...base, ...frame }, Boolean(frame.ack));
  return run;
}

test("ilk mac bastan sona: alti adim oyuncunun eylemleriyle geciyor", () => {
  let run = fresh();
  assert.equal(stepOf(run), "tower");
  assert.equal(isTutorialStepVisible(run, base), true);

  run = play(run, [{ ownTowers: 1 }]);
  assert.equal(stepOf(run), "wave");
  assert.equal(isTutorialStepVisible(run, { ...base, ownTowers: 1 }), true);

  run = play(run, [{ ownTowers: 1 }, { ownTowers: 1, setupPhase: false }]);
  assert.equal(stepOf(run), "logistics", "Devam'a basildi, dalga basladi");
  assert.equal(isTutorialStepVisible(run, { ...base, setupPhase: false }), true);

  run = play(run, [{ setupPhase: false }, { setupPhase: false, ack: true }]);
  assert.equal(stepOf(run), "card");
  assert.equal(isTutorialStepVisible(run, { ...base, setupPhase: false }), false, "kart penceresini bekliyor");

  run = play(run, [{ setupPhase: false }, { cardDraftOpen: true }, { cardDraftOpen: true }]);
  assert.equal(stepOf(run), "card", "pencere acik, secim bekleniyor");
  run = play(run, [{}]);
  assert.equal(stepOf(run), "shop", "kart secildi");

  run = play(run, [{ shopOpen: true }, { shopOpen: true }]);
  assert.equal(stepOf(run), "shop");
  run = play(run, [{}]);
  assert.equal(stepOf(run), "workers", "magaza kapandi");

  run = play(run, [{}, { workersHired: 1 }]);
  assert.equal(run.done, true, "isci alindi");
});

test("lojistik okunmadan kart penceresi acilirsa adim ona yer birakiyor", () => {
  let run = createTutorialRun({ step: TUTORIAL_STEPS.indexOf("logistics"), done: false });
  run = play(run, [{ setupPhase: false }, { cardDraftOpen: true }]);
  assert.equal(stepOf(run), "card");
  run = play(run, [{ cardDraftOpen: true }, {}]);
  assert.equal(stepOf(run), "shop");
});

test("kart cikmayan dalga: magaza acilirsa ya da kurulum biterse kart adimi geciliyor", () => {
  const card = createTutorialRun({ step: TUTORIAL_STEPS.indexOf("card"), done: false });
  assert.equal(stepOf(play(card, [{ shopOpen: true }])), "shop");
  assert.equal(stepOf(play(card, [{ setupPhase: false }])), "card", "dalga suruyor; kurulum gelmedi");
  assert.equal(stepOf(play(card, [{}, { setupPhase: false }])), "shop", "kurulum geldi gitti, kart yok");
});

test("isci adimi: ANLAŞILDI ya da adim icinde yeni isci; onceden alinmis isci saymiyor", () => {
  const workers = createTutorialRun({ step: TUTORIAL_STEPS.indexOf("workers"), done: false });
  assert.equal(play(workers, [{ workersHired: 2 }, { workersHired: 2 }]).done, false);
  assert.equal(play(workers, [{ workersHired: 2 }, { workersHired: 3 }]).done, true);
  assert.equal(play(workers, [{ workersHired: 2, ack: true }]).done, true);
});

test("yarim kalan brifing: kart ve sonrasi kaldigi yerden, dalga adimi kuleden yeniden", () => {
  assert.equal(stepOf(createTutorialRun({ step: TUTORIAL_STEPS.indexOf("wave"), done: false })), "tower");
  assert.equal(stepOf(createTutorialRun({ step: TUTORIAL_STEPS.indexOf("card"), done: false })), "card");
  assert.equal(createTutorialRun({ step: 6, done: true }).done, true);
});

test("mac disinda, yaratici modda ve bitmis brifingte hicbir sey ilerlemiyor ya da gorunmuyor", () => {
  const run = fresh();
  assert.deepEqual(advanceTutorial(run, { ...base, inMatch: false, ownTowers: 3 }), run);
  assert.deepEqual(advanceTutorial(run, { ...base, creative: true, ownTowers: 3 }), run);
  assert.equal(isTutorialStepVisible(run, { ...base, creative: true }), false);
  const done = createTutorialRun({ step: 2, done: true });
  assert.equal(isTutorialStepVisible(done, base), false);
  assert.deepEqual(advanceTutorial(done, { ...base, setupPhase: false }), done);
});

test("kart ve magaza perdesi acikken kule ve dalga kutusu gizli", () => {
  const run = fresh();
  assert.equal(isTutorialStepVisible(run, { ...base, cardDraftOpen: true }), false);
  assert.equal(isTutorialStepVisible(run, { ...base, shopOpen: true }), false);
  assert.equal(isTutorialStepVisible(run, { ...base, setupPhase: false }), false);
});

test("metinler Turkce, kisa; bilgi adimlarinda ANLAŞILDI var", () => {
  for (const id of TUTORIAL_STEPS) {
    for (const open of [false, true]) {
      const copy = getTutorialCopy(id, open);
      assert.ok(copy.title.length > 0 && copy.body.length > 0, id);
      assert.ok(copy.body.length <= 170, `${id} kisa kalmali (${copy.body.length})`);
    }
  }
  assert.equal(getTutorialCopy("logistics", false).ack, "ANLAŞILDI");
  assert.equal(getTutorialCopy("workers", false).ack, "ANLAŞILDI");
  assert.equal(getTutorialCopy("tower", false).ack, undefined, "eylem adimi dugmeyle gecilmiyor");
});

test("baglanti: main kuruyor, launcher dugmeleri data-launch tasiyor, menude Eğitim var", () => {
  assert.match(readSource("apps/web/src/main.ts"), /setupTutorial\(game\);/);
  assert.match(readSource("apps/web/src/game-control-ui.ts"), /button\.dataset\.launch = id;/);
  const menu = readSource("apps/web/src/menu-ui.ts");
  // Dugme metni sozlukten (locales/areas/menu.ts); Turkcesi "Eğitim".
  assert.match(menu, /data-start-game data-replay-tutorial>\$\{t\("menu\.home\.tutorial"\)\}</);
  assert.match(readSource("apps/web/src/locales/areas/menu.ts"), /"menu\.home\.tutorial": "Eğitim"/);
  assert.match(menu, /hasAttribute\("data-replay-tutorial"\)\) resetTutorialProgress\(\)/);
});
