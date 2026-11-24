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
 * Sahibin istegi (2026-11-24): tek tip isci. Alimda uzmanlik penceresi,
 * seritte urun secimi yok; is atandigi yerden geliyor.
 *
 * Kilitlenen sozler:
 *   1. Baslaticida "İşçi" / "Worker"; cekmecede uc bolum, baslik satirinda.
 *      Varsayilan bolum iscisi olana Yonetim, olmayana Ise Al; secim mac
 *      boyunca hatirlaniyor.
 *   2. Isci alimi Envanter'de degil, tam ekran perde de yok; bekleyen
 *      uzmanlik durumu ve isareti (" •") yok. Alinan isci secili geliyor.
 *   3. Kadro alt barin cizim hattinda: kendi DOM'u, kendi yeniden kurmasi yok.
 *      Parmak basiliyken yeniden kurma erteleniyor; yuk ve kalan yerinde
 *      yaziliyor; dugmeler `pointerup`ta calisiyor; `<select>` yok.
 *   4. Hedef beklenirken cekmece seride iniyor (urun dugmesi yok), uygun yerler
 *      haritada isin renginde halkali; cekmece degisince secim kapanir.
 *   5. Haritada isciye dokunmak onu seciyor; hedef beklerken baska isciye
 *      dokunmak secimi ona geciriyor.
 *   6. Brifingin isci adimlari yeni cekmeceyi gosteriyor.
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
const mapPointer = between(scene, "private handleMapPointer(pointer: Phaser.Input.Pointer) {", "if (this.hitSellButton(pointer)) {");
const pickTap = between(scene, "private resolveWorkerPickTap(pointer: Phaser.Input.Pointer) {", "private getWorkerRosterState()");

const web = await importWebModule("tests/fixtures/worker-roster-entry.ts");
const { tr, en, setLocaleForTest, getTutorialCopy, pickTutorialTarget, TUTORIAL_TARGETS } = web;

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
  assert.match(launcher, /makeLaunchButton\(t\("controls\.launch\.worker"\), "worker"\)/);
  assert.match(ui, /type DrawerId = "towers" \| "skills" \| "inventory" \| "creative" \| "worker";/);
  assert.equal(ui.includes("\"workerDevelopment\")"), false, "eski cekmece kimligi kalmis");
  // Tek tip isci rolsuz kalmiyor: bekleyen uzmanlik isareti ne baslaticida ne Ise Al bolumunde.
  assert.doesNotMatch(launcher + drawerBuilder, /pendingSpecialization|" •"/);
  assert.match(drawerBuilder, /makeTab\("hire", t\("controls\.workerTab\.hire"\)\)/);
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

test("isci alimi Envanter'de degil; tam ekran perde ve uzmanlik secimi kalkti", () => {
  assert.doesNotMatch(inventoryBuilder, /workerHire|worker-hire|hireWorker/);
  // Alim dugmesi tek yerde, Ise Al bolumunde.
  assert.equal((ui.match(/game-controls__worker-hire\b(?!-)/g) ?? []).length, 1);
  assert.match(hireBuilder, /`game-controls__worker-hire\$\{/);
  assert.match(hireBuilder, /\(\) => dispatch\(\{ action: "hireWorker" \}\)/);
  assert.match(hireBuilder, /makeWorkerTierButton\(t\("controls\.workerHire\.tierNormal"/);
  assert.match(hireBuilder, /makeWorkerTierButton\(t\("controls\.workerHire\.tierAdvanced"/);
  // Tek tip isci: kademe her zaman seciliyor, dugme yalnizca bedel yetince acik;
  // bedelsiz "uzmanligini sec" yolu yok.
  assert.match(hireBuilder, /body\.push\(intro\);\n(?:\s*\/\/[^\n]*\n)*\s+body\.push\(makeRow\(\[\n\s+makeWorkerTierButton/);
  assert.match(hireBuilder, /\n\s+hire\.affordable,\n\s+\(\) => dispatch\(\{ action: "hireWorker" \}\)/);
  assert.match(hireBuilder, /intro\.textContent = t\("controls\.workerHire\.intro", \{ hired: hire\.hired \}\);/);
  assert.match(hireBuilder, /note\.textContent = t\("controls\.workerHire\.description"\);/);
  assert.doesNotMatch(hireBuilder, /pending|[sS]pecializ/);
  // Bekleyen uzmanlik durumu ne arayuzun durumunda ne sahnenin urettiginde.
  assert.doesNotMatch(between(ui, "workerHire?: {", "};"), /pendingSpecialization|generic|roles/);
  assert.doesNotMatch(between(scene, "private getWorkerHireState() {", "\n  }\n"), /pendingSpecialization|generic|roles|ACTIVE_WORKER_ROLES/);
  for (const key of ["controls.workerHire.pendingIntro", "controls.workerHire.pendingName", "controls.workerHire.pendingDescription"]) {
    assert.equal(key in tr, false, `${key} kalmis`);
    assert.equal(key in en, false, `${key} Ingilizcesi kalmis`);
  }
  // Perde ve onu acan eylemler yok.
  for (const gone of ["gold-shop inventory", "openWorkerHire", "closeWorkerHire", "workerHire?.open"]) {
    assert.equal(ui.includes(gone), false, `arayuzde kalmis: ${gone}`);
  }
  for (const gone of ["openWorkerHire", "closeWorkerHire", "workerHireOpen"]) {
    assert.equal(scene.includes(gone), false, `sahnede kalmis: ${gone}`);
  }
});

test("alinan isci secili geliyor: uzmanlik penceresi yok, uygun yerler haritada halkali", () => {
  // Alim istegi yalnizca kademe; rol yok.
  assert.match(scene, /this\.room\?\.send\("worker:hire", \{ advanced: this\.workerHireAdvanced \}\);/);
  // Uzmanlik penceresi ve mesajlari kalkti.
  assert.equal(scene.includes("worker:specialization"), false, "uzmanlik penceresi kalmis");
  assert.equal(scene.includes("WORKER_SPECIALIZATION_CHOICES"), false);
  // Bildirimdeki kimlikle secime giriliyor. Isci bir sonraki anlik goruntude
  // geliyor: o gelene kadar secim bekliyor, sonra satir yoksa kapaniyor.
  const hired = between(scene, 'room.onMessage("worker:hired", ', 'room.onMessage("worker:skill-choice", ');
  assert.match(hired, /if \(typeof message\.workerId === "string"\) \{\n\s+this\.workerPick = \{ workerId: message\.workerId \};\n\s+this\.workerPickAwaitUntil = performance\.now\(\) \+ 3000;\n\s+this\.emitControlState\(\);/);
  const rosterState = between(scene, "private getWorkerRosterState(): WorkerRosterState | undefined {", "private findTappedWorkerAt(");
  assert.match(rosterState, /pick: this\.workerPick/);
  assert.match(rosterState, /if \(this\.workerPick && !roster\.picking && performance\.now\(\) > this\.workerPickAwaitUntil\) this\.workerPick = undefined;/);
  // Metinler yeni akisi soyluyor: uzmanlik degil, dokunus.
  assert.equal(tr["scene.worker.hired"], "{worker} alındı ({cost}g). Bir kaynağa ya da binaya dokun.");
  assert.equal(en["scene.worker.hired"], "{worker} hired ({cost}g). Tap a resource or building.");
  assert.equal(tr["controls.workerHire.description"], "Alınan işçi seçili gelir: bir kaynağa ya da binaya dokunarak işini ver.");
  assert.equal(en["controls.workerHire.description"], "The new worker comes selected: tap a resource or building to give it a job.");
  for (const key of ["scene.worker.specializationTitle", "scene.worker.specializationBody", "scene.worker.specializationSkipped"]) {
    assert.equal(key in tr, false, `${key} kalmis`);
    assert.equal(key in en, false, `${key} Ingilizcesi kalmis`);
  }

  // Secim varken her karede: tukenmemis kaynaklar toplayicinin, Tamir Merkezi
  // tamircinin, oteki gorev binalari tasiyicinin renginde halka.
  assert.match(between(scene, "\n  update() {", "\n  }\n"), /this\.renderWorkerPickMarks\(now\);/);
  const marks = between(scene, "private renderWorkerPickMarks(now: number) {", "private drawMap() {");
  assert.match(marks, /if \(!this\.workerPick\) \{\n\s+if \(marks\?\.visible\) marks\.clear\(\)\.setVisible\(false\);\n\s+return;/);
  assert.match(marks, /if \(node\.remaining !== undefined && node\.remaining <= 0\) continue;\n\s+graphics\.lineStyle\(2, WORKER_LOOKS\.gatherer\.color,/);
  // Bina kurali haritaya dokunusla ayni (`isWorkerPostTower`); yalnizca kendi ve ayakta binalar.
  assert.match(marks, /if \(tower\.ownerId !== this\.localSessionId \|\| \(tower\.hp \?\? 1\) <= 0 \|\| !isWorkerPostTower\(tower\)\) continue;/);
  assert.match(marks, /const color = tower\.definitionId === REPAIR_DEPOT_TOWER_ID \? WORKER_LOOKS\.repairer\.color : WORKER_LOOKS\.carrier\.color;/);
  // Hareket azaltmada nabiz yok.
  assert.match(marks, /const pulse = this\.feedback\?\.reducedMotion \? 1 :/);
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
  // Yerel acilir liste yok: acikken panel yeniden kurulunca kapaniyordu.
  assert.doesNotMatch(workerBuilders, /createElement\("select"\)|createElement\("option"\)/);
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

test("hedef seridi: cekmece yerine tek satir, urun secimi yok; cekmece degisince secim kapanir", () => {
  // Secim varken cekmece seride iniyor, bolumler kurulmuyor.
  assert.match(drawerBuilder, /if \(picking\) return \{ id: "worker:pick", drawer: buildWorkerPickStrip\(picking\) \};/);
  assert.match(pickBuilder, /strip\.className = "game-controls__drawer worker-pick";/);
  assert.match(pickBuilder, /makeActionButton\(t\("controls\.roster\.cancel"\), "worker-pick__cancel", true, \(\) => dispatch\(\{ action: "cancelWorkerAssign" \}\)\)/);
  // Serit kimi (isin adiyla) ve tek yonergeyi yaziyor; urun dugmeleri ve eylemi kalkti.
  assert.match(pickBuilder, /role: formatWorkerRole\(picking\.role, picking\.postKind\)/);
  assert.match(pickBuilder, /what\.textContent = getWorkerPickHint\(\);/);
  assert.doesNotMatch(pickBuilder, /getWorkerProductOptions|setWorkerProduct|workerProduct|worker-pick__product|aria-pressed/);
  for (const [name, source] of [["arayuz", ui], ["sahne", scene]]) {
    assert.equal(source.includes("setWorkerProduct"), false, `${name}: urun eylemi kalmis`);
  }
  // Serit gorunmeden secim acik kalmaz: baska cekmece acilinca iptal,
  // secim varken Isci cekmecesi acik.
  const toggle = between(ui, "const toggleDrawer = ", "/** Cekmece kabugu");
  assert.match(toggle, /if \(latestState\?\.workerRoster\?\.picking\) dispatch\(\{ action: "cancelWorkerAssign" \}\);/);
  assert.match(render, /if \(state\.workerRoster\?\.picking\) openDrawer = "worker";/);
  // Serit haritayi kapatmiyor: tek satir, kaydirma yok.
  const rule = between(css, ".game-controls__drawer.worker-pick {", "}");
  assert.match(rule, /overflow: visible;/);
  // Sahne: secim acikken haritaya dokunus atamadir; atama ve iptal secimi kapatir.
  assert.match(mapPointer, /if \(this\.workerPick && this\.isBattlePointer\(pointer\)\) \{\n\s+this\.resolveWorkerPickTap\(pointer\);\n\s+return;\n\s+\}/);
  assert.match(pickTap, /if \(target\.kind === "assign"\) \{\n\s+this\.room\?\.send\("worker:assign", target\.message\);\n\s+this\.workerPick = undefined;/);
  // Hedef yalnizca dokunulan yerden: atama cagrisina rol ya da urun girmiyor.
  assert.doesNotMatch(between(pickTap, "resolveWorkerMapTarget({", "});"), /role|product/);
  // Tukenmis kaynak: istek gitmiyor, kisa bildirim; secim acik kaliyor.
  assert.match(pickTap, /\} else if \(target\.kind === "depleted"\) \{\n\s+this\.showNotice\(t\("server\.worker\.nodeDepleted"\)\);\n\s+\}/);
  // Isci almayan yapi: bildirim hangi yapilarin isci aldigini soyluyor.
  assert.match(pickTap, /\} else if \(target\.kind === "wrongBuilding"\) \{\n\s+this\.showNotice\(t\("scene\.worker\.wrongBuilding"\)\);/);
  assert.equal(tr["scene.worker.wrongBuilding"], "Bu binaya işçi atanmaz: kaynak, depo, enerji binası, cephanelik ya da Tamir Merkezi seç.");
  assert.equal(en["scene.worker.wrongBuilding"], "Workers can't take this building: pick a resource, warehouse, energy building, armory or Repair Depot.");
  assert.match(scene, /room\.onMessage\("worker:rejected", /);
});

test("haritada isciye dokunmak onu seciyor; ozel kipler once; hedef beklerken kaynak ve bina once", () => {
  const tap = between(scene, "private handleMapPointer(pointer: Phaser.Input.Pointer) {", "private handleSkillButton(");
  // Bekleyen eylem yokken isciye dokunus onu secer.
  assert.match(tap, /if \(!this\.pendingAction\) \{\n\s+const tapped = this\.findTappedWorkerAt\(pointer\.worldX, pointer\.worldY\);\n\s+if \(tapped\) \{\n\s+this\.workerPick = \{ workerId: tapped\.id \};\n\s+this\.emitControlState\(\);\n\s+return;/);
  // Ozel kiplerin hepsi isci seciminden once: kip acikken yoldan gecen isci
  // dokunusu yutmuyor (atama, kart hedefi, sat, ulti, esya, yasak, yonlendirme,
  // bekleme penceresi, arena disi, infaz hedefi).
  const select = tap.indexOf("const tapped = this.findTappedWorkerAt(");
  for (const branch of [
    "this.resolveWorkerPickTap(pointer);",
    "this.resolveCardTargetTap(pointer);",
    "this.requestSellSelectedTower();",
    'this.room?.send("useUltimate"',
    'this.room?.send("shop:place"',
    'this.room?.send("worker:banCell"',
    'this.room?.send("useSkill", { slot: 0',
    "performance.now() < this.ignoreMapPointerUntil",
    "if (!this.isBattlePointer(pointer)) {",
    "this.resolveExecuteTap(pointer);"
  ]) {
    const at = tap.indexOf(branch);
    assert.ok(at >= 0 && at < select, `${branch} isci seciminden once`);
  }
  // Kule secimi sonra; yapinin ustundeki dokunusu `findTappedWorker` yapiya birakiyor.
  assert.ok(select < tap.indexOf("const tower = this.findTowerAt(pointer.worldX, pointer.worldY);"));
  // Dokunus kaydi ayni dali goruyor.
  const outcome = between(scene, "private describeTapOutcome(pointer: Phaser.Input.Pointer) {", "private handleMapPointerMove(");
  assert.match(outcome, /if \(!this\.pendingAction && this\.findTappedWorkerAt\(pointer\.worldX, pointer\.worldY\)\) return "isci secimi";/);
  assert.ok(outcome.indexOf('return "ARENA DISI"') < outcome.indexOf('return "isci secimi"'));
  assert.ok(outcome.indexOf('return "isci secimi"') < outcome.indexOf('return "kule secimi"'));
  // Kendi iscisi, govdeden genis yaricap; yapinin ustundeki dokunus yapiya gidiyor.
  const finder = between(scene, "private findTappedWorkerAt(x: number, y: number) {", "private handleMapPointer(");
  assert.match(finder, /return findTappedWorker\(\{/);
  assert.match(finder, /radius: this\.getMapCellSize\(\) \* 0\.55,/);
  assert.match(finder, /drones: this\.workerRosterSource\?\.drones \?\? \[\],/);
  assert.match(finder, /ownerId: this\.localSessionId,/);
  assert.match(finder, /hitTower: Boolean\(this\.findTowerAt\(x, y\)\)/);
  // Hedef beklerken once kaynak ya da bina: kaynagin ustunde toplayan isci hep
  // var, ona dokunus atamadir. Yakinda hedef yoksa baska isciye dokunmak
  // secimi ona geciriyor; atama gitmiyor.
  assert.match(pickTap, /if \(target\.kind === "none"\) \{\n\s+const tapped = this\.findTappedWorkerAt\(pointer\.worldX, pointer\.worldY\);\n\s+if \(tapped && tapped\.id !== worker\.id\) \{\n\s+this\.workerPick = \{ workerId: tapped\.id \};\n\s+this\.emitControlState\(\);\n\s+\}\n\s+return;\n\s+\}/);
  assert.ok(pickTap.indexOf("resolveWorkerMapTarget(") < pickTap.indexOf("tapped.id !== worker.id"), "kaynaktaki isciye dokunus atama olmali");
  // Listeden secim: her lojistik iscisi (bosta olan da); secim yalnizca kimlik.
  const listSelect = between(scene, 'case "selectWorker": {', 'case "cancelWorkerAssign":');
  assert.match(listSelect, /!getWorkerRosterRole\(worker\)\) break;/);
  assert.match(listSelect, /this\.workerPick = \{ workerId: worker\.id \};/);
  // Yonetim'in yonergesi iki yolu da soyluyor.
  assert.match(tr["controls.roster.intro"], /listeden ya da haritada dokunarak/);
  assert.match(en["controls.roster.intro"], /from the list or by tapping it on the map/);
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
  for (const selector of [".worker-tabs {", ".game-controls button.worker-tab {", ".game-controls button.worker-row {", ".game-controls button.worker-row--idle {", ".game-controls__drawer.worker-pick {", ".game-controls button.game-controls__worker-hire {"]) {
    assert.ok(block.includes(selector), `kural yok: ${selector}`);
  }
  // Uzun listede parmak satirin ustunden cekmeceyi kaydirabiliyor.
  assert.match(between(block, ".game-controls button.worker-row {", "}"), /touch-action: pan-y;/);
});

test("egitim: isci adimlari Isci cekmecesi -> bolum -> asil dugme", () => {
  const tutorial = read("apps/web/src/tutorial.ts");
  assert.deepEqual([...TUTORIAL_TARGETS.hire], [".game-controls__worker-hire", '[data-worker-tab="hire"]', '[data-launch="worker"]']);
  assert.deepEqual([...TUTORIAL_TARGETS.assign], [".game-controls__drawer.worker-pick", ".worker-list", '[data-worker-tab="manage"]', '[data-launch="worker"]']);
  assert.deepEqual([...TUTORIAL_TARGETS.workerTree], [".worker-development__viewport", '[data-worker-tab="tree"]', '[data-launch="worker"]']);
  // Tamirci alinmiyor, atanir: adim Ise Al'i degil listeyi ve seridi gosteriyor.
  assert.deepEqual([...TUTORIAL_TARGETS.repairer], [...TUTORIAL_TARGETS.assign]);
  // Urun dugmesi kalkti; hicbir adim onu hedeflemiyor.
  for (const [id, selectors] of Object.entries(TUTORIAL_TARGETS)) {
    assert.ok(selectors.every((selector) => !selector.includes("data-worker-product")), id);
  }
  // Derinden yuzeye: ekranda gorunen ilk hedef cerceveleniyor.
  const visible = new Set(['[data-launch="worker"]']);
  const find = (selector) => (visible.has(selector) ? selector : undefined);
  assert.equal(pickTutorialTarget(TUTORIAL_TARGETS.hire, find)?.selector, '[data-launch="worker"]', "cekmece kapali: baslatici");
  visible.add('[data-worker-tab="hire"]');
  assert.equal(pickTutorialTarget(TUTORIAL_TARGETS.hire, find)?.selector, '[data-worker-tab="hire"]', "baska bolum acik: bolum dugmesi");
  visible.add(".game-controls__worker-hire");
  assert.equal(pickTutorialTarget(TUTORIAL_TARGETS.hire, find)?.selector, ".game-controls__worker-hire", "Ise Al acik: alim dugmesi");
  assert.equal(pickTutorialTarget(TUTORIAL_TARGETS.card, find), undefined);
  // Hedeflerin sahipleri arayuzde gercekten var.
  assert.match(ui, /button\.dataset\.launch = id;/);
  assert.match(drawerBuilder, /button\.dataset\.workerTab = id;/);
  assert.match(hireBuilder, /`game-controls__worker-hire\$\{/);
  assert.match(manageBuilder, /list\.className = "worker-list";/);
  assert.match(ui, /viewport\.className = "worker-development__viewport";/);
  // Hedef secimi tabloyu okuyor; Envanter'e bakan isci hedefi yok.
  assert.match(tutorial, /pickTutorialTarget\(getTutorialTargets\(id, controls\.tutorialFacts\)/);
  for (const id of ["hire", "assign", "workerTree", "repairer", "gatherer", "materials", "ammoCarrier"]) {
    assert.ok(TUTORIAL_TARGETS[id].every((selector) => !/inventory|gold-shop/.test(selector)), id);
  }
  // Isci adimlarinin metni iki dilde kisa; hicbiri Envanter'i anmiyor. Isci
  // turleri adimi tek tip isciyi anlatiyor: is atandigi yerden.
  for (const [locale, word, single] of [["tr", /Envanter/, /işi atadığın yerden gelir/], ["en", /Inventory/, /where you assign it sets its job/]]) {
    setLocaleForTest(locale);
    try {
      for (const id of ["workerTypes", "hire", "assign", "workerTree", "repairer"]) {
        const copy = getTutorialCopy(id);
        assert.doesNotMatch(copy.body, word, `${locale}: ${copy.body}`);
        assert.ok(copy.body.length <= 170, `${locale}/${id}`);
      }
      assert.match(getTutorialCopy("workerTypes").body, single, `${locale}: tek tip isci anlatilmiyor`);
      assert.ok(getTutorialCopy("workerTypes").ack, "isci turleri bilgi adimi");
      assert.equal(getTutorialCopy("hire").ack, undefined, "alim eylemle geciyor");
    } finally {
      setLocaleForTest("tr");
    }
  }
  assert.equal(getTutorialCopy("hire").body, "İşçi › İşe Al'da İşçi Al'a bas. Yeni işçi seçili gelir: bir kaynağa ya da binaya dokun. Her alım bir sonrakini pahalılaştırır.");
});
