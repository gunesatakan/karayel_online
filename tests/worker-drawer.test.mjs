/**
 * Isci cekmecesi: Yonetim · Ise Al · Agac (apps/web/src/game-control-ui.ts).
 *
 * Alt bardaki "İşçi Ağacı" dugmesi "İşçi" oldu ve uc seyi tek cekmecede
 * topluyor: isci atama (eski yuzen `.worker-roster` paneli), isci alimi (eski
 * Envanter dugmesi ve tam ekran perdesi) ve gelisim agaci.
 *
 * Yuzen panelin iki derdi vardi. Ilk mac brifinginin kutusu dugmesinin ustune
 * biniyordu. Ve her yuk degisiminde butun satirlari `replaceChildren` ile
 * yeniden yaratiyordu: parmagin altindaki dugme DOM'dan cikinca dokunus
 * kayboluyor, acik `<select>` kapaniyordu -- kule cekmecesinde duzeltilen
 * hatanin aynisi (tests/tower-drawer-touch.test.mjs).
 *
 * Kilitlenen sozler:
 *   1. Baslaticida "İşçi" / "Worker"; cekmecede uc bolum, baslik satirinda.
 *      Varsayilan bolum iscisi olana Yonetim, olmayana Ise Al; secim mac
 *      boyunca hatirlaniyor.
 *   2. Isci alimi Envanter'de degil, tam ekran perde de yok.
 *   3. Kadro alt barin cizim hattinda: kendi DOM'u, kendi yeniden kurmasi yok.
 *      Parmak basiliyken yeniden kurma erteleniyor; yuk ve kalan yerinde
 *      yaziliyor; dugmeler `pointerup`ta calisiyor; `<select>` yok.
 *   4. Hedef beklenirken cekmece seride iniyor; cekmece degisince secim kapanir.
 *   5. Brifingin isci adimi yeni cekmeceyi gosteriyor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { importWebModule } from "./helpers/web-module.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const ui = read("apps/web/src/game-control-ui.ts");
const scene = read("apps/web/src/scenes/GameScene.ts");
const css = read("apps/web/src/style.css");

/** Iki isaret arasindaki kaynak; isaretler yoksa test dusuyor. */
const between = (source, from, to) => {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `isaret yok: ${from}`);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `isaret yok: ${to}`);
  return source.slice(start, end);
};

const drawerBuilder = between(ui, "const buildWorkerDrawer = ", "const buildWorkerManageSection = ");
const manageBuilder = between(ui, "const buildWorkerManageSection = ", "const buildWorkerPickStrip = ");
const pickBuilder = between(ui, "const buildWorkerPickStrip = ", "const buildWorkerHireSection = ");
const hireBuilder = between(ui, "const buildWorkerHireSection = ", "const findWorkerDevelopmentOption = ");
const inventoryBuilder = between(ui, "const buildInventoryDrawer = ", "const buildOwnedCards = ");
const launcher = between(ui, "const buildLauncher = ", "const render = (state: ControlState) => {");
const render = between(ui, "const render = (state: ControlState) => {", "const keepDrawerScroll = ");
const workerBuilders = drawerBuilder + manageBuilder + pickBuilder + hireBuilder;

const web = await importWebModule("tests/fixtures/worker-roster-entry.ts");
const { tr, en, setLocaleForTest, getTutorialCopy, getTutorialWorkerStage, TUTORIAL_WORKER_TARGETS } = web;

test("baslatici: İşçi / Worker; eski İşçi Ağacı adi ve anahtari yok", () => {
  assert.equal(tr["controls.launch.worker"], "İşçi");
  assert.equal(en["controls.launch.worker"], "Worker");
  assert.equal("controls.launch.workerTree" in tr, false);
  assert.equal("controls.drawer.workerDevelopment" in tr, false);
  for (const [locale, table] of [["tr", tr], ["en", en]]) {
    for (const [key, text] of Object.entries(table)) {
      if (!key.startsWith("controls.launch.") && !key.startsWith("controls.drawer.")) continue;
      assert.doesNotMatch(text, /İşçi Ağacı|Worker Tree|Gelişim Ağacı|Development Tree/, `${locale} ${key}`);
    }
  }
  assert.match(launcher, /makeLaunchButton\(`\$\{t\("controls\.launch\.worker"\)\}[^`]*`, "worker"\)/);
  assert.match(ui, /type DrawerId = "towers" \| "skills" \| "inventory" \| "creative" \| "worker";/);
  assert.equal(ui.includes("\"workerDevelopment\")"), false, "eski cekmece kimligi kalmis");
  // Rolsuz isci isareti artik bu dugmede, Envanter'de degil.
  assert.match(launcher, /controls\.launch\.worker"\)\}\$\{state\.workerHire\?\.pendingSpecialization \? " •" : ""\}/);
  assert.match(launcher, /makeLaunchButton\(t\("controls\.launch\.inventory", \{ count: total \}\), "inventory"\)/);
});

test("cekmece: uc bolum baslik satirinda, TR ve EN adlariyla", () => {
  assert.deepEqual(["manage", "hire", "tree"].map((id) => tr[`controls.workerTab.${id}`]), ["Yönetim", "İşe Al", "Ağaç"]);
  assert.deepEqual(["manage", "hire", "tree"].map((id) => en[`controls.workerTab.${id}`]), ["Manage", "Hire", "Tree"]);
  assert.match(ui, /type WorkerTab = "manage" \| "hire" \| "tree";/);
  for (const id of ["manage", "hire", "tree"]) {
    assert.match(drawerBuilder, new RegExp(`makeTab\\("${id}", [^\\n]*controls\\.workerTab\\.${id}`), `${id} bolum dugmesi yok`);
  }
  // Uc bolumun govdesi: kadro, alim, agac.
  assert.match(drawerBuilder, /tab === "manage" \? buildWorkerManageSection\(state\) : tab === "hire" \? buildWorkerHireSection\(state\) : buildWorkerDevelopmentDrawer\(state\)/);
  // Sekmeler cekmecenin baslik satirina giriyor (ayri satir agacin yerini yerdi).
  assert.match(drawerBuilder, /const drawer = makeDrawer\(tabs, body, \(\) => toggleDrawer\("worker"\)\);/);
  assert.match(drawerBuilder, /tabs\.setAttribute\("role", "tablist"\);/);
  assert.match(drawerBuilder, /button\.setAttribute\("aria-selected", String\(tab === id\)\);/);
  // Brifing bolum dugmesini etiketinden bagimsiz buluyor.
  assert.match(drawerBuilder, /button\.dataset\.workerTab = id;/);
  assert.match(render, /\} else if \(openDrawer === "worker"\) \{\n\s+const built = buildWorkerDrawer\(state\);/);
});

test("varsayilan bolum: iscisi olana Yonetim, olmayana Ise Al; secim mac boyunca hatirlaniyor", () => {
  assert.match(ui, /const getWorkerTab = \(state: ControlState\): WorkerTab => workerTab \?\? \(\(state\.workerRoster\?\.rows\.length \?\? 0\) > 0 \? "manage" : "hire"\);/);
  // Secim kurucunun disinda: yeniden kurulumdan ve cekmecenin kapanmasindan sagkaliyor.
  const outside = ui.slice(0, ui.indexOf("const buildWorkerDrawer = "));
  assert.match(outside, /let workerTab: WorkerTab \| undefined;/);
  assert.doesNotMatch(workerBuilders, /let workerTab\b/);
  assert.match(drawerBuilder, /workerTab = id;\n\s+latestKey = "";\n\s+render\(latestState\);/);
  // Yeni mac varsayilandan baslar; cekmeceyi kapatmak secimi silmez.
  assert.match(render, /if \(!state\.visible\) workerTab = undefined;/);
  assert.equal((ui.match(/workerTab = undefined;/g) ?? []).length, 1, "bolum secimi mac bitmeden siliniyor");
});

test("isci alimi Envanter'de degil; tam ekran perde kalkti", () => {
  assert.doesNotMatch(inventoryBuilder, /workerHire|worker-hire|hireWorker/);
  // Alim dugmesi tek yerde, Ise Al bolumunde.
  assert.equal((ui.match(/game-controls__worker-hire\b(?!-)/g) ?? []).length, 1);
  assert.match(hireBuilder, /`game-controls__worker-hire\$\{/);
  assert.match(hireBuilder, /\(\) => dispatch\(\{ action: "hireWorker" \}\)/);
  assert.match(hireBuilder, /makeWorkerTierButton\(t\("controls\.workerHire\.tierNormal"/);
  assert.match(hireBuilder, /makeWorkerTierButton\(t\("controls\.workerHire\.tierAdvanced"/);
  // Bekleyen uzmanlik secimi satin alma degil: kademe gosterilmiyor, dugme hep acik.
  assert.match(hireBuilder, /if \(!pending\) \{\n\s+body\.push\(makeRow\(\[\n\s+makeWorkerTierButton/);
  assert.match(hireBuilder, /hire\.affordable \|\| pending,/);
  // Perde ve onu acan eylemler yok.
  for (const gone of ["gold-shop inventory", "openWorkerHire", "closeWorkerHire", "workerHire?.open"]) {
    assert.equal(ui.includes(gone), false, `arayuzde kalmis: ${gone}`);
  }
  for (const gone of ["openWorkerHire", "closeWorkerHire", "workerHireOpen"]) {
    assert.equal(scene.includes(gone), false, `sahnede kalmis: ${gone}`);
  }
});

test("yuzen kadro paneli yok: modulu, sinifi ve CSS'i kalkti", () => {
  assert.equal(existsSync(join(root, "apps/web/src/worker-assignment-ui.ts")), false);
  assert.equal(css.includes(".worker-roster"), false, "eski kadro CSS'i kalmis");
  for (const [name, source] of [["arayuz", ui], ["sahne", scene]]) {
    assert.equal(source.includes("worker-assignment-ui"), false, `${name} eski modulu ice aktariyor`);
    assert.equal(source.includes("WorkerAssignmentUi"), false, `${name} eski sinifi kullaniyor`);
  }
  // Kadronun saf modulu DOM'a dokunmuyor: cizim alt barin hattinda.
  const roster = read("apps/web/src/worker-roster.ts");
  assert.doesNotMatch(roster, /\bdocument\.|\bwindow\.|replaceChildren|createElement/);
  // Dil dallanmasi yok: metinler t() ve katalogdan.
  assert.doesNotMatch(roster, /getLocale\(\)|\btr \? /);
  assert.doesNotMatch(workerBuilders, /getLocale\(\)|\btr \? /);
  // Sahne kadroyu her karede degil, anlik goruntuyle birlikte yayinliyor.
  const frame = between(scene, "private renderPlaybackFrame(now: number) {", "private getPlaybackFrame(");
  assert.doesNotMatch(frame, /[wW]orkerRoster|workerPick/);
  assert.match(scene, /workerRoster: this\.getWorkerRosterState\(\),/);
});

test("dokunma: parmak basiliyken kadro yeniden kurulmuyor", () => {
  // Kadro ayri bir cizim hatti degil: tek kurulus yeri alt barin `render`i,
  // o da basili parmakta erteleniyor (kule cekmecesindeki koruma).
  const guard = render.indexOf("if (pressedPointers.size > 0) {\n      rebuildDeferred = true;\n      return;\n    }");
  assert.ok(guard > 0, "render basili parmakta yeniden kurmayi ertelemiyor");
  assert.ok(guard < render.indexOf("clearPanel();"), "erteleme paneli bosalttiktan sonra");
  assert.ok(guard < render.indexOf("buildWorkerDrawer(state)"), "kadro ertelemeden once kuruluyor");
  assert.equal((ui.match(/buildWorkerDrawer\(state\)/g) ?? []).length, 1, "kadro render disinda da kuruluyor");
  assert.equal((ui.match(/buildWorkerManageSection\(state\)/g) ?? []).length, 1);
  // Kendi dinleyicisi, zamanlayicisi ya da yeniden kurmasi yok.
  assert.doesNotMatch(manageBuilder + pickBuilder + hireBuilder, /replaceChildren|innerHTML|setInterval|requestAnimationFrame|render\(/);
  // Satirlar ve serit dugmeleri `pointerup`ta calisiyor: `click` yok,
  // `pointerdown`da da is yok (kule dugmesindeki gibi parmak altinda
  // yeniden kurma tetiklemesin).
  assert.doesNotMatch(workerBuilders, /"click"|"pointerdown"|\.onclick/);
  assert.match(manageBuilder, /button\.addEventListener\("pointerup", \(\) => dispatch\(\{ action: "selectWorker", workerId: row\.id \}\)\);/);
  // Urun secimi yerel acilir liste degil: acikken panel yeniden kurulunca kapaniyordu.
  assert.doesNotMatch(workerBuilders, /createElement\("select"\)|createElement\("option"\)/);
  assert.match(pickBuilder, /getWorkerProductOptions\(picking\.role\)/);
  assert.match(pickBuilder, /dispatch\(\{ action: "setWorkerProduct", product \}\)/);
  assert.match(pickBuilder, /button\.setAttribute\("aria-pressed", String\(active\)\);/);
});

test("canli sayilar yerinde yaziliyor: yapi anahtarinda degiller", () => {
  // Durumun tamami anahtara giriyor; kadro kendi yapi anahtariyla.
  const key = between(ui, "const buildStructureKey = ", "let latestSheetModel");
  assert.match(key, /if \(fieldName === "workerRoster"\) return getWorkerRosterStructureKey\(value as WorkerRosterState \| undefined\);/);
  // Yerinde yazma anahtar karsilastirmasindan ve ertelemeden once: parmak
  // basiliyken de sayilar akiyor.
  const sync = render.indexOf("syncWorkerRosterLive(state);");
  assert.ok(sync > 0, "render canli sayilari yazmiyor");
  assert.ok(sync < render.indexOf("if (key === latestKey) {"));
  const live = between(ui, "const syncWorkerRosterLive = ", "/**\n   * Gecici bildirim (toast).");
  assert.match(live, /if \(cells\.cargo\.textContent !== cargo\) cells\.cargo\.textContent = cargo;/);
  assert.match(live, /if \(cells\.reserve\.textContent !== reserve\) cells\.reserve\.textContent = reserve;/);
  assert.doesNotMatch(live, /createElement|append\(|remove\(|replaceChildren|innerHTML/);
  // Hucreler satir kurulurken kaydediliyor, her kurulusta bastan.
  assert.match(manageBuilder, /workerLiveCells\.set\(row\.id, \{ cargo, reserve \}\);/);
  assert.match(render, /workerLiveCells\.clear\(\);/);
  // Eski degisim anahtari (butun kule ve kaynaklarin JSON'u) yok.
  assert.doesNotMatch(scene, /JSON\.stringify\(\[getLocale\(\)/);
  assert.doesNotMatch(read("apps/web/src/worker-roster.ts"), /JSON\.stringify/);
});

test("hedef seridi: cekmece yerine tek satir; cekmece degisince secim kapanir", () => {
  // Secim varken cekmece seride iniyor, bolumler kurulmuyor.
  assert.match(drawerBuilder, /if \(picking\) return \{ id: "worker:pick", drawer: buildWorkerPickStrip\(picking\) \};/);
  assert.match(pickBuilder, /strip\.className = "game-controls__drawer worker-pick";/);
  assert.match(pickBuilder, /makeActionButton\(t\("controls\.roster\.cancel"\), "worker-pick__cancel", true, \(\) => dispatch\(\{ action: "cancelWorkerAssign" \}\)\)/);
  // Serit gorunmeden secim acik kalmaz: baska cekmece acilinca iptal,
  // secim varken Isci cekmecesi acik.
  const toggle = between(ui, "const toggleDrawer = ", "/** Cekmece kabugu");
  assert.match(toggle, /if \(latestState\?\.workerRoster\?\.picking\) dispatch\(\{ action: "cancelWorkerAssign" \}\);/);
  assert.match(render, /if \(state\.workerRoster\?\.picking\) openDrawer = "worker";/);
  // Serit haritayi kapatmiyor: bir ya da iki satir, kaydirma yok.
  const rule = between(css, ".game-controls__drawer.worker-pick {", "}");
  assert.match(rule, /overflow: visible;/);
  // Sahne: secim acikken haritaya dokunus atamadir; atama ve iptal secimi kapatir.
  const pointer = between(scene, "private handleMapPointer(pointer: Phaser.Input.Pointer) {", "if (this.hitSellButton(pointer)) {");
  assert.match(pointer, /if \(this\.workerPick && this\.isBattlePointer\(pointer\)\) \{\n\s+this\.resolveWorkerPickTap\(pointer\);\n\s+return;\n\s+\}/);
  const tap = between(scene, "private resolveWorkerPickTap(pointer: Phaser.Input.Pointer) {", "private getWorkerRosterState()");
  assert.match(tap, /if \(target\.kind === "assign"\) \{\n\s+this\.room\?\.send\("worker:assign", target\.message\);\n\s+this\.workerPick = undefined;/);
  // Tukenmis kaynak: istek gitmiyor, kisa bildirim; secim acik kaliyor.
  assert.match(tap, /\} else if \(target\.kind === "depleted"\) \{\n\s+this\.showNotice\(t\("server\.worker\.nodeDepleted"\)\);\n\s+\}/);
  assert.match(scene, /room\.onMessage\("worker:rejected", /);
});

test("gorunum: oteki cekmecelerle ayni dil, 44 px dokunma hedefi", () => {
  // Dokunma hedefi taban kuraldan geliyor; isci kurallari onu kucultmuyor.
  const base = between(css, "\n.game-controls button {", "}");
  assert.match(base, /min-height: 44px;/);
  assert.match(base, /border-radius: 0;/);
  const block = between(css, " * Isci cekmecesi: Yonetim · Ise Al · Agac.", "\n.game-controls__ultimate-power {");
  assert.doesNotMatch(block, /(^|[\s;{])(min-height|height):/m, "isci kurallari dugme boyunu degistiriyor");
  // Tek boy kurali cekmecenin tavani: Yonetim alti isciyi kaydirmadan gostersin.
  assert.deepEqual(block.match(/max-height:[^;]+;/g), ["max-height: min(54vh, 380px);"]);
  assert.match(between(block, ".game-controls__drawer--worker-manage {", "}"), /max-height: min\(54vh, 380px\);/);
  assert.doesNotMatch(block, /border-radius|animation|transition|box-shadow/, "kose, parilti ya da hareket eklenmis");
  for (const selector of [".worker-tabs {", ".game-controls button.worker-tab {", ".game-controls button.worker-row {", ".game-controls__drawer.worker-pick {", ".game-controls button.worker-pick__product {", ".game-controls button.game-controls__worker-hire {"]) {
    assert.ok(block.includes(selector), `kural yok: ${selector}`);
  }
  // Uzun listede parmak satirin ustunden cekmeceyi kaydirabiliyor.
  assert.match(between(block, ".game-controls button.worker-row {", "}"), /touch-action: pan-y;/);
});

test("brifing: isci adimi Isci cekmecesi -> Ise Al -> alim dugmesi", () => {
  const tutorial = read("apps/web/src/tutorial.ts");
  assert.deepEqual({ ...TUTORIAL_WORKER_TARGETS }, {
    launcher: '[data-launch="worker"]',
    hireTab: '[data-worker-tab="hire"]',
    hireButton: ".game-controls__worker-hire"
  });
  assert.equal(getTutorialWorkerStage({ drawerOpen: false, hireVisible: false }), "launcher");
  assert.equal(getTutorialWorkerStage({ drawerOpen: true, hireVisible: false }), "hireTab");
  assert.equal(getTutorialWorkerStage({ drawerOpen: true, hireVisible: true }), "hireButton");
  // Hedeflerin sahipleri arayuzde gercekten var.
  assert.match(ui, /button\.dataset\.launch = id;/);
  assert.match(drawerBuilder, /button\.dataset\.workerTab = id;/);
  assert.match(hireBuilder, /`game-controls__worker-hire\$\{/);
  // Envanter'e ve kalkan perdeye bakan secici kalmadi.
  const step = between(tutorial.slice(tutorial.indexOf("const findTarget = ")), "case \"workers\": {", "default:");
  assert.doesNotMatch(step, /inventory|gold-shop/);
  assert.match(step, /const open = launchOpen\("worker"\);/);
  assert.match(step, /TUTORIAL_WORKER_TARGETS\[stage\]/);
  // Uc asamanin metni; hicbiri Envanter'i ya da eski adi anmiyor.
  for (const [locale, word] of [["tr", /Envanter|İşçi Ağacı/], ["en", /Inventory|Worker Tree/]]) {
    setLocaleForTest(locale);
    try {
      const copies = [getTutorialCopy("workers", false), getTutorialCopy("workers", true, false), getTutorialCopy("workers", true, true)];
      assert.equal(new Set(copies.map((copy) => copy.body)).size, 3, `${locale}: asamalar ayni metni yaziyor`);
      for (const copy of copies) {
        assert.doesNotMatch(copy.body, word, `${locale}: ${copy.body}`);
        assert.ok(copy.body.length <= 170);
        assert.ok(copy.ack);
      }
    } finally {
      setLocaleForTest("tr");
    }
  }
  assert.equal(getTutorialCopy("workers", false).body, "İşçi'yi aç. İşçiler enerji ve mühimmatı kulelere taşır.");
  assert.equal(getTutorialCopy("workers", true, false).body, "İşe Al bölümüne geç.");
  // Tamamlanma mantigi ayni: alinan isci sayisi sahnenin durumundan okunuyor.
  assert.match(tutorial, /workersHired: Number\(controls\.workerHire\?\.hired\) \|\| 0/);
  assert.match(scene, /private getWorkerHireState\(\) \{[\s\S]{0,900}hired: hired\.length,/);
  // Uzmanlik secilmeden kapanan pencerenin bildirimi de yeni yeri soyluyor.
  assert.equal(tr["scene.worker.specializationSkipped"], "Uzmanlık seçilmedi. İşçi › İşe Al'dan seçebilirsin.");
  assert.equal(en["scene.worker.specializationSkipped"], "No specialization chosen. You can pick one from Worker › Hire.");
});
