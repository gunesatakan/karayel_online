/**
 * Dalga karnesi: kart secim perdesinin basligindaki serit.
 *
 * Karne yeni bir pencere degil; dalga sonu molasinin ilk satiri. Bu testler
 * sozlerini kilitliyor:
 *
 *   1. Satir planin ornegi gibi: "Kusursuz ×6 · 23 öldürme · ◆ +412 · MVP
 *      Takipçi 1.240". Sayilarin hepsi var olan olgulardan (sunucunun
 *      karnesi, savunma ozeti, dalga damgasinin altini).
 *   2. Tek one cikan satir, oncelik sirasiyla: kendi ultinin derecesi, "Kıl
 *      payı" (dalga can goturdu, nexus %30'un altinda), takip isaretinin
 *      takima kattigi hasar. Uymayan atlaniyor.
 *   3. Temiz seri sessizce artiyor; parilti yalnizca 5/10/15/20'de, yaratici
 *      kosuda hic.
 *   4. Co-op'ta karne senin: kendi oldurmen, takimin toplami ya da arkadasin
 *      sayisi yok.
 *   5. Her parca kendi dalgasinin verisiyle; ulti, sunucunun mesaj sirasiyla
 *      dalgasina baglaniyor, yeniden gonderim silmiyor.
 *   6. Gercek oda: ozet ve karne kart seciminden once gidiyor ve karne onlardan
 *      kuruluyor.
 *
 * Karne taninma: hicbir fonksiyon oda durumuna dokunmuyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CLEAN_STREAK_MILESTONE_STEP,
  FINAL_WAVE,
  NEAR_MISS_HEALTH_RATIO,
  WaveReportTracker,
  buildWaveReportCard,
  createDefenseRow,
  isCleanStreakMilestone,
  pickWaveReportHighlight,
  sanitizeWaveRecord,
  towerCatalog
} from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";

function satir(name, damage, markAssistDamage = 0) {
  return { ...createDefenseRow(`kule-${name}`, "p1", name), damage, markAssistDamage };
}

const cipler = (card) => card.chips.map((chip) => chip.text).join(" · ");

const MUKEMMEL_SUTUN = { kind: "column", hits: 6, kills: 4, best: 6 };

test("karne: planin ornek satiri, var olan olgulardan", () => {
  const card = buildWaveReportCard({
    wave: 7,
    record: { w: 7, l: 0, k: 23, p: [23], c: 6 },
    localSlot: 0,
    coop: false,
    creative: false,
    defense: { wave: 7, rows: [satir("Takipçi", 1240), satir("Gözcü", 300)] },
    gold: 412
  });
  assert.equal(cipler(card), "Kusursuz ×6 · 23 öldürme · ◆ +412 · MVP Takipçi 1.240");
  // 375 px'te tek satira sigmasi icin raporun satir siniriyla ayni olcu.
  assert.ok(cipler(card).length <= 56, cipler(card));
  assert.equal(card.highlight, undefined, "uyan satir yoksa one cikan satir yok");
  assert.equal(card.milestone, undefined);
  assert.ok(card.label.startsWith("Dalga 7 karnesi: "));
  assert.ok(card.label.includes("+412 altın"), "ekran okuyucu simgeyi degil altini duyuyor");

  // Sifir altin yazilmiyor, sifir oldurme yaziliyor (tum dalganin sizdigi da bir haber).
  const bos = buildWaveReportCard({ wave: 2, record: { w: 2, l: 4, k: 0, p: [0], c: 0 }, localSlot: 0, coop: false, creative: false, gold: 0 });
  assert.equal(cipler(bos), "4 sızıntı · 0 öldürme");
});

test("karne: sizintili dalga seriyi soylemiyor, kalkan ayrintisi okuyucuda", () => {
  const card = buildWaveReportCard({ wave: 4, record: { w: 4, l: 2, s: 1, h: 8, k: 11, p: [11], c: 0 }, localSlot: 0, coop: false, creative: false });
  assert.equal(card.chips[0].kind, "leak");
  assert.equal(card.chips[0].text, "2 sızıntı");
  assert.ok(card.chips[0].label.includes("1 tanesini kalkan tuttu"));
  assert.equal(card.chips.some((chip) => chip.text.includes("Kusursuz")), false);

  // Olunen dalga ne temiz ne "0 sızıntı".
  const olum = buildWaveReportCard({ wave: 9, record: { w: 9, l: 0, k: 3, p: [3], c: 0, d: 1 }, localSlot: 0, coop: false, creative: false });
  assert.equal(olum.chips.some((chip) => chip.kind === "clean" || chip.kind === "leak"), false);
});

test("karne: co-op'ta kendi sayin, takimin toplami ya da arkadasin sayisi yok", () => {
  const card = buildWaveReportCard({
    wave: 3,
    record: { w: 3, l: 0, k: 19, p: [12, 7], c: 3 },
    localSlot: 1,
    coop: true,
    creative: false,
    defense: { wave: 3, rows: [satir("Nişancı", 900)] },
    gold: 95
  });
  assert.equal(cipler(card), "Kusursuz ×3 · 7 öldürmen · ◆ +95 · MVP Nişancı 900");
  for (const yabanci of ["19", "12"]) {
    assert.equal(card.label.includes(yabanci), false, `${yabanci} karnede olmamali`);
  }
  // Co-op'ta karne yoksa damganin (takimin) oldurmesi senin sayin diye yazilmiyor.
  const karnesiz = buildWaveReportCard({ wave: 3, localSlot: 1, coop: true, creative: false, kills: 19, gold: 95 });
  assert.equal(cipler(karnesiz), "◆ +95");
  // Soloda karne yoksa damganin oldurmesi.
  assert.equal(cipler(buildWaveReportCard({ wave: 3, localSlot: 0, coop: false, creative: false, kills: 19 })), "19 öldürme");
});

test("karne: temiz seri sessiz artiyor, parilti yalnizca 5/10/15/20'de", () => {
  assert.equal(CLEAN_STREAK_MILESTONE_STEP, 5);
  const esikler = [];
  for (let seri = 1; seri <= FINAL_WAVE; seri += 1) {
    const card = buildWaveReportCard({ wave: seri, record: { w: seri, l: 0, k: 5, p: [5], c: seri }, localSlot: 0, coop: false, creative: false });
    assert.equal(card.chips[0].text, `Kusursuz ×${seri}`, "seri her temiz dalgada bir artiyor");
    if (card.milestone) {
      esikler.push(card.milestone);
      assert.equal(card.chips[0].milestone, true);
    } else {
      assert.equal(card.chips[0].milestone, undefined);
    }
  }
  assert.deepEqual(esikler, [5, 10, 15, 20]);
  assert.equal(isCleanStreakMilestone(25), false, "yaratici geri sarmada 20'nin otesi kutlanmiyor");
  assert.equal(isCleanStreakMilestone(0), false);

  // Yaratici kosuda dusmani sen seciyorsun: seri yaziliyor ama kutlanmiyor.
  const yaratici = buildWaveReportCard({ wave: 10, record: { w: 10, l: 0, k: 5, p: [5], c: 10 }, localSlot: 0, coop: false, creative: true });
  assert.equal(yaratici.chips[0].text, "Kusursuz ×10");
  assert.equal(yaratici.milestone, undefined);
});

test("one cikan satir: ulti > kil payi > takip katkisi; uymayan atlaniyor", () => {
  const record = { w: 12, l: 3, h: 40, k: 30, p: [30], c: 0 };
  const defense = { wave: 12, rows: [satir("Takipçi", 2000, 800), satir("Gözcü", 500, 440)] };
  const health = { health: 24, maxHealth: 100 };

  const ulti = pickWaveReportHighlight({ record, defense, health, ultimate: MUKEMMEL_SUTUN });
  assert.deepEqual(ulti, { kind: "ultimate", text: "SÜTUN · 6 isabet · 4 öldü · MÜKEMMEL NİŞAN", tier: "perfect" });

  // Iskalanan ulti an degil: sira Kil payi'na geciyor.
  const iska = pickWaveReportHighlight({ record, defense, health, ultimate: { kind: "meteor", hits: 0, kills: 0 } });
  assert.deepEqual(iska, { kind: "nearMiss", text: "Kıl payı · nexus %24 canla dayandı" });

  // Esik tam %30'da degil, altinda; yuvarlama esigi asmis gibi gostermiyor.
  assert.equal(NEAR_MISS_HEALTH_RATIO, 0.3);
  assert.equal(pickWaveReportHighlight({ record, health: { health: 30, maxHealth: 100 } }), undefined);
  assert.equal(pickWaveReportHighlight({ record, health: { health: 29.6, maxHealth: 100 } }).text, "Kıl payı · nexus %29 canla dayandı");

  // Can goturmeyen dalga kil payi degil: can daha onceki dalgalarda gitmisti
  // ya da kalkan tuttu.
  assert.equal(pickWaveReportHighlight({ record: { w: 12, l: 0, k: 30, p: [30], c: 1 }, health: { health: 10, maxHealth: 100 } }), undefined);
  assert.equal(pickWaveReportHighlight({ record: { w: 12, l: 2, s: 2, k: 30, p: [30], c: 0 }, health: { health: 10, maxHealth: 100 } }), undefined);

  // Takip katkisi yalnizca co-op'ta (bilincli degisiklik: onceden soloda da yaziliyordu).
  const takip = pickWaveReportHighlight({ record, defense, health: { health: 80, maxHealth: 100 }, coop: true });
  assert.deepEqual(takip, { kind: "assist", text: "Takip işaretin takıma +1.240 hasar kattı" });

  assert.equal(pickWaveReportHighlight({ record, defense: { wave: 12, rows: [satir("Takipçi", 2000)] }, health: { health: 80, maxHealth: 100 }, coop: true }), undefined);

  // Soloda "takım" yok: sunucu oyuncunun kendi kulelerinin kendi isaretine
  // vurusunu da sayiyor, satir neredeyse her dalga ayni seyi tekrar ederdi.
  assert.equal(pickWaveReportHighlight({ record, defense, health: { health: 80, maxHealth: 100 }, coop: false }), undefined);
  assert.equal(pickWaveReportHighlight({ record, defense, health: { health: 80, maxHealth: 100 } }), undefined, "bayrak yoksa solo sayiliyor");
  const soloKart = buildWaveReportCard({ wave: 12, record, localSlot: 0, coop: false, creative: false, defense, health: { health: 80, maxHealth: 100 } });
  assert.equal(soloKart.highlight, undefined, "solo karnede takip katkisi satiri yok");
  const coopKart = buildWaveReportCard({ wave: 12, record: { ...record, p: [30, 4] }, localSlot: 0, coop: true, creative: false, defense, health: { health: 80, maxHealth: 100 } });
  assert.equal(coopKart.highlight.kind, "assist", "co-op karnesi bayragi one cikan satira tasiyor");

  // Kartta da: tek satir ve etiketin sonunda.
  const card = buildWaveReportCard({ wave: 12, record, localSlot: 0, coop: false, creative: false, defense, health, ultimate: MUKEMMEL_SUTUN });
  assert.equal(card.highlight.kind, "ultimate");
  assert.ok(card.label.endsWith(". SÜTUN · 6 isabet · 4 öldü · MÜKEMMEL NİŞAN"));
});

test("karne: baska dalganin karnesi, ozeti ve ultisi karismiyor", () => {
  const card = buildWaveReportCard({
    wave: 7,
    record: { w: 6, l: 0, k: 23, p: [23], c: 6 },
    localSlot: 0,
    coop: false,
    creative: false,
    defense: { wave: 6, rows: [satir("Takipçi", 1240)] },
    gold: 412,
    ultimate: MUKEMMEL_SUTUN
  });
  assert.equal(cipler(card), "◆ +412");
  assert.equal(card.highlight, undefined, "karnesi olmayan dalgaya ulti yazilmiyor");
  assert.equal(buildWaveReportCard({ wave: 7, localSlot: 0, coop: false, creative: false }), undefined, "hicbir parca yoksa karne yok");
  assert.equal(buildWaveReportCard({ wave: undefined, record: { w: 7, l: 0, k: 1, p: [1], c: 1 }, localSlot: 0, coop: false, creative: false }), undefined);
});

test("defter: ulti karnesinden once gelen dalgaya yaziliyor, yeniden gonderim silmiyor", () => {
  const tracker = new WaveReportTracker();
  const girdi = { localSlot: 0, coop: false, creative: false };
  tracker.noteUltimate({ kind: "meteor", hits: 0, kills: 0 }); // iska: an degil
  tracker.noteUltimate(MUKEMMEL_SUTUN);
  assert.equal(tracker.receiveReport({ w: 5, l: 0, k: 8, p: [8], m: "all", c: 5 }), true);
  assert.equal(tracker.build({ ...girdi, wave: 5 }).highlight.kind, "ultimate");

  // Yeniden baglanma ayni karneyi tekrar yolluyor: yeni dalga degil.
  assert.equal(tracker.receiveReport({ w: 5, l: 0, k: 8, p: [8], m: "all", c: 5 }), false);
  assert.equal(tracker.build({ ...girdi, wave: 5 }).highlight.kind, "ultimate");

  // Karneden sonra, 6. dalga basladiktan sonra atilan ulti siradaki dalganin.
  // (Bilincli guncelleme: dalga baslangici artik acikca isaretleniyor; ondan
  // once gelen sonuc biten dalganin kapanisina yaziliyor, ayri testte.)
  tracker.noteWaveStarted();
  assert.equal(tracker.noteUltimate({ kind: "meteor", hits: 7, kills: 3 }), false, "savastaki ulti bekliyor");
  assert.equal(tracker.build({ ...girdi, wave: 5 }).highlight.text, "SÜTUN · 6 isabet · 4 öldü · MÜKEMMEL NİŞAN");
  assert.equal(tracker.receiveReport({ w: 6, l: 0, k: 9, p: [9], c: 6 }), true);
  assert.equal(tracker.build({ ...girdi, wave: 6 }).highlight.text, "METEOR · 7 isabet · 3 öldü");
  assert.equal(tracker.receiveReport({ w: 7, l: 1, h: 8, k: 9, p: [9], c: 0 }), true);
  assert.equal(tracker.build({ ...girdi, wave: 7 }).highlight, undefined, "ulti bir sonraki dalgaya tasinmiyor");

  // Damganin altini ve cani kendi dalgasinda; can temizlenme anindan.
  tracker.noteClear({ wave: 6, gold: 99 });
  tracker.noteClear({ wave: 7, gold: 140, kills: 9, health: 20, maxHealth: 100 });
  const yedi = tracker.build({ ...girdi, wave: 7, health: { health: 95, maxHealth: 100 } });
  assert.equal(cipler(yedi), "1 sızıntı · 9 öldürme · ◆ +140");
  assert.equal(yedi.highlight.kind, "nearMiss", "can temizlenme anindan okunuyor");
  assert.equal(tracker.latestWave, 7);
  // Perde dalgasi bilinmiyorsa son karne.
  assert.equal(tracker.build(girdi).wave, 7);

  // Bozuk karne yok sayiliyor, son karne kaliyor.
  for (const bozuk of [null, [], { w: "7" }, { w: 0, l: 0, k: 0, c: 0 }, { w: 8, l: 1 }]) {
    assert.equal(tracker.receiveReport(bozuk), false, JSON.stringify(bozuk));
  }
  assert.equal(tracker.latestWave, 7);
  assert.deepEqual(sanitizeWaveRecord({ w: 3, l: -2, k: 4.4, p: [1, "x", 2], c: 1, m: "air", d: 2 }), { w: 3, l: 0, k: 4, p: [1, 0, 2], c: 1 });

  tracker.reset();
  assert.equal(tracker.build({ ...girdi, wave: 7 }), undefined, "yeni oda eski karneyi tasimiyor");
});

test("defter: karneden sonra, kurulumda gelen ulti sonucu biten dalganin; sonraki dalgaya tasinmiyor", () => {
  const tracker = new WaveReportTracker();
  const girdi = { localSlot: 0, coop: false, creative: false };
  // 7. dalganin son saniyelerinde atilan suresi olan ulti: karne once geliyor,
  // sonuc ulti bitince, kurulumda.
  assert.equal(tracker.receiveReport({ w: 7, l: 0, k: 12, p: [12], c: 7 }), true);
  assert.equal(tracker.build({ ...girdi, wave: 7 }).highlight, undefined);
  assert.equal(tracker.noteUltimate({ kind: "meteor", hits: 7, kills: 0 }), true, "kapanis araliginda biten dalgaya gidiyor");
  assert.equal(tracker.build({ ...girdi, wave: 7 }).highlight.text, "METEOR · 7 isabet · 0 öldü");
  // Kurulumda isabetsiz bir atis biten dalganin anini ezmiyor.
  assert.equal(tracker.noteUltimate({ kind: "meteor", hits: 0, kills: 0 }), true);
  assert.equal(tracker.build({ ...girdi, wave: 7 }).highlight.text, "METEOR · 7 isabet · 0 öldü");

  // 8. dalga basliyor; bu dalgada ulti yok.
  tracker.noteWaveStarted();
  assert.equal(tracker.receiveReport({ w: 8, l: 1, h: 8, k: 10, p: [10], c: 0 }), true);
  assert.equal(tracker.build({ ...girdi, wave: 8 }).highlight, undefined, "7. dalganin ultisi 8'in karnesinde degil");
  assert.equal(tracker.build({ ...girdi, wave: 8, health: { health: 20, maxHealth: 100 } }).highlight.kind, "nearMiss", "8'in kendi ani yerinde");

  // Ayni karnenin yeniden gonderimi kapanis araligini yeniden acmiyor.
  tracker.noteWaveStarted();
  assert.equal(tracker.receiveReport({ w: 8, l: 1, h: 8, k: 10, p: [10], c: 0 }), false);
  assert.equal(tracker.noteUltimate({ kind: "meteor", hits: 3, kills: 1 }), false, "yeniden gonderimden sonra ulti yeni dalgayi bekliyor");

  // Karne yokken (ilk dalga) kapanis araligi yok.
  const bos = new WaveReportTracker();
  assert.equal(bos.noteUltimate({ kind: "meteor", hits: 3, kills: 1 }), false);
  tracker.reset();
  assert.equal(tracker.noteUltimate({ kind: "meteor", hits: 3, kills: 1 }), false, "yeni oda kapanis araligini tasimiyor");
});

test("sunucu -> karne: ozet ve karne kart seciminden once, karne onlardan kuruluyor", () => {
  const room = createRoom("onur");
  const kayit = [];
  const client = { sessionId: "p1", send(type, payload) { kayit.push({ type, payload }); } };
  room.clients = [client];
  room.broadcast = (type, payload) => kayit.push({ type, payload });
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0 });

  const definition = towerCatalog.onur[0];
  const spot = findBuildableSpot(room, definition.id);
  assert.ok(spot, "kule icin kare yok");
  room.placeTower(client, { ...spot, definitionId: definition.id });
  const tower = [...room.towers.values()].at(-1);
  room.spawnEnemy();
  const hedef = [...room.enemies.values()].at(-1);
  Object.assign(hedef, { type: "grunt", hp: 1_000_000, maxHp: 1_000_000, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
  for (let index = 0; index < 3; index += 1) room.damageEnemyFromTower(tower, hedef, 40, 0);
  room.spawnEnemy();
  const kirilgan = [...room.enemies.values()].at(-1);
  Object.assign(kirilgan, { type: "grunt", hp: 5, maxHp: 5, shield: 0, maxShield: 0, armor: 0, damageResistances: {}, hitTypeResistances: {}, statusResistances: {} });
  room.damageEnemy(kirilgan, 50, 0, "skill", "p1", "true");

  // Odanin kendi kapanis yolu: 2 sn'lik mola sahte saatle geciyor.
  room.enemies.clear();
  room.waveSpawned = room.waveTarget;
  room.waveClearedAt = 0;
  const gercekNow = Date.now;
  let simdi = gercekNow();
  Date.now = () => simdi;
  try {
    room.updateSpawning(16);
    simdi += 3000;
    room.updateSpawning(16);
  } finally {
    Date.now = gercekNow;
  }

  const tipler = kayit.map((mesaj) => mesaj.type).filter((type) => ["defense:summary", "wave:report", "card:choices"].includes(type));
  assert.deepEqual(tipler, ["defense:summary", "wave:report", "card:choices"], "karne perdeden once hazir");
  const ozet = kayit.find((mesaj) => mesaj.type === "defense:summary").payload;
  const karne = kayit.find((mesaj) => mesaj.type === "wave:report").payload;

  const tracker = new WaveReportTracker();
  assert.equal(tracker.receiveReport(karne), true);
  const card = tracker.build({ wave: 1, localSlot: 0, coop: false, creative: false, defense: ozet });
  const [enIyi] = ozet.rows;
  assert.ok(enIyi.damage > 0, "kule hasari ozete yazilmadi");
  assert.equal(cipler(card), `Kusursuz ×1 · 1 öldürme · MVP ${definition.name} ${enIyi.damage.toLocaleString("tr-TR")}`);
  assert.equal(enIyi.damage, Math.round(tower.damageDealt), "MVP sayisi kulenin gercek hasari");
});

test("kaynak: karne kart perdesinin basliginda, yeni pencere acmiyor, hareket azaltmaya uyuyor", async () => {
  const scene = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(scene.includes('room.onMessage("wave:report"'), "istemci karneyi dinliyor");
  const draft = scene.slice(scene.indexOf("private showCardChoices("), scene.indexOf("private scheduleCardRevealCues("));
  assert.ok(draft.includes("data-wave-report-slot"), "karne kart perdesinin basliginda");
  assert.ok(draft.includes("this.mountWaveReportCard(header, animate)"), "parilti yalnizca ilk dagitimda ve hareket azaltma kapaliyken");
  assert.ok(draft.includes("openDefenseDialog("), "seride dokunmak Savunma Özeti'ni aciyor");
  assert.ok(draft.includes("CARD_PICKABLE_AFTER_MS"), "haritaya yapilan son dokunus seridi basmiyor");
  // Dalga baslangici mesajlarla ayni siradaki snapshot'tan, oynatilandan degil.
  const queue = scene.slice(scene.indexOf("private queueSnapshot("), scene.indexOf("private hydrateSnapshot("));
  assert.ok(queue.includes("this.waveReports.noteWaveStarted()"), "kapanis araligi gelen snapshot'la kapaniyor");
  const ulti = scene.slice(scene.indexOf("private receiveUltimateResult("), scene.indexOf("private receiveTeamUltimate("));
  assert.ok(ulti.includes("if (this.waveReports.noteUltimate(message)) this.refreshWaveReportCard();"), "gec gelen ulti acik seridi tazeliyor");

  const ui = (await readFile(new URL("../apps/web/src/wave-report-ui.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.equal(/showModal|innerHTML/.test(ui), false, "karne kendi penceresini acmiyor, metni HTML olarak yazmiyor");
  assert.ok(ui.includes("textContent"));

  const css = (await readFile(new URL("../apps/web/src/style.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const dar = css.slice(css.indexOf(".card-draft__header--report { margin-bottom"));
  assert.ok(/@media \(max-width: 620px\) \{\s*\.card-draft__header--report/.test(css), "dar ekranda karne alt basligin yerini aliyor");
  assert.ok(dar.includes(".card-draft__header--report p"), "alt baslik gorunmuyor ama okuyucuda");
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\.card-draft \.wave-report/.test(css), "hareket azaltmada parilti yok");
});
