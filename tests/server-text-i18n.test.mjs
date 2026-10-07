/**
 * Sunucunun yazdigi metinler istemcide secili dilde.
 *
 * Sunucu Turkce yaziyor ve dili degistirmiyor; metin alani eskisiyle
 * birebir ayni. Yanina anahtar (`key`) ve kimlikler ekleniyor, istemci
 * Ingilizceyi onlardan kuruyor. Snapshot'taki kule durumu ve ozeti anahtar
 * tasimiyor (tel buyumesin); istemci Turkce metni kaliplarla ceviriyor.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SERVER_FULL_MESSAGE, SERVER_TEXT, activityLabels, cardCatalog, getRoomRejectionKey } from "../packages/shared/dist/index.js";
import { createRoom, findBuildableSpot } from "./helpers/match-room-harness.mjs";
import { importWebModule } from "./helpers/web-module.mjs";

const web = await importWebModule("tests/fixtures/i18n-entry.ts");
web.installCatalogLocale();
const { tr, en, setLocaleForTest } = web;

const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

function inLocale(locale, run) {
  setLocaleForTest(locale);
  try {
    return run();
  } finally {
    setLocaleForTest("tr");
  }
}

// Degisiklikten onceki sunucu metinleri: Turkce cikti birebir ayni kalmali.
const FORMER_TURKISH = {
  "room.full": "Oda dolu.",
  "room.matchOver": "Maç bitti.",
  "room.serverFull": "Sunucu dolu, biraz sonra tekrar dene.",
  "room.serverError": "Sunucu hatası: maç sonlandırıldı.",
  "lobby.characterTaken": "Bu karakter zaten secildi.",
  "lobby.hostOnlyStart": "Sadece oda kurucusu baslatabilir.",
  "lobby.notAllReady": "Baslatmak icin herkes hazir olmali.",
  "card.noPendingChoice": "Bekleyen kart seçimi bulunamadı. Bağlantı yenileniyor olabilir.",
  "card.invalidChoice": "Bu kart artık geçerli bir seçenek değil.",
  "card.towerCannotTake": "Seçilen kule bu kartı alamıyor. Başka bir kule seç.",
  "preview.tooSoon": "Biraz sonra tekrar dene.",
  "preview.invalidTarget": "Geçersiz hedef.",
  "preview.cardRejected": "Bu kule kartı alamıyor.",
  "preview.itemRejected": "Bu kule eşyayı alamıyor.",
  "preview.optionGone": "Seçenek artık mevcut değil.",
  "preview.disclaimer": "Anlık koşullar gösterilir; koşullu davranışlar ve gelecekte birikecek yükler açıklamaya tabidir.",
  "preview.stat.damage": "Hasar / etki",
  "preview.stat.interval": "Atış / etki aralığı (sn)",
  "preview.stat.range": "Menzil",
  "preview.stat.maxHp": "Azami can",
  "preview.stat.shots": "Mermi / tetikleme",
  "preview.stat.ammo": "Mühimmat / tetikleme",
  "preview.stat.energy": "Enerji / tetikleme",
  "preview.stat.heat": "Isı / tetikleme",
  "preview.stat.cooling": "Soğutma / sn",
  "preview.stat.sustained": "Sürekli tetikleme / sn"
};

test("sunucu metinleri eskisiyle birebir; istemcinin Turkce sozlugu ayni metni tasiyor", () => {
  assert.deepEqual(SERVER_TEXT, FORMER_TURKISH);
  assert.equal(SERVER_TEXT["room.serverFull"], SERVER_FULL_MESSAGE);
  for (const [key, text] of Object.entries(SERVER_TEXT)) {
    assert.equal(tr[`server.${key}`], text, `server.${key} Turkcesi sunucununkinden farkli`);
    assert.ok(en[`server.${key}`] && !TURKISH_LETTERS.test(en[`server.${key}`]), `server.${key} Ingilizcesi yok`);
  }
});

function capture() {
  const sent = [];
  return { sent, client: { sessionId: "p1", send(type, payload) { sent.push({ type, payload }); } } };
}

test("lobi redleri anahtar tasiyor", () => {
  const room = createRoom("warrior");
  room.gameStarted = false;
  room.state.players.set("p2", { ...room.state.players.get("p1"), id: "p2", characterId: "zeynep", ready: false });
  room.hostSessionId = "p2";
  const { sent, client } = capture();
  room.setLobbyCharacter(client, "zeynep");
  room.startLobbyMatch(client);
  room.hostSessionId = "p1";
  room.startLobbyMatch(client);
  assert.deepEqual(sent.map(({ type, payload }) => [type, payload]), [
    ["lobby:error", { message: "Bu karakter zaten secildi.", key: "lobby.characterTaken" }],
    ["lobby:error", { message: "Sadece oda kurucusu baslatabilir.", key: "lobby.hostOnlyStart" }],
    ["lobby:error", { message: "Baslatmak icin herkes hazir olmali.", key: "lobby.notAllReady" }]
  ]);
});

test("kart redleri anahtar tasiyor; Turkce gerekce ayni", () => {
  const room = createRoom("warrior");
  const { sent, client } = capture();
  room.chooseCard(client, { cardId: "yok" });
  room.pendingCardChoices.set("p1", []);
  room.chooseCard(client, { cardId: "yok" });
  const targeted = cardCatalog.find((card) => card.scope.kind === "targeted");
  room.pendingCardChoices.set("p1", [targeted]);
  room.chooseCard(client, { cardId: targeted.id, towerId: "olmayan-kule" });
  const rejected = sent.filter(({ type }) => type === "card:rejected").map(({ payload }) => payload);
  assert.deepEqual(rejected, [
    { reason: FORMER_TURKISH["card.noPendingChoice"], key: "card.noPendingChoice" },
    { reason: FORMER_TURKISH["card.invalidChoice"], key: "card.invalidChoice" },
    { reason: FORMER_TURKISH["card.towerCannotTake"], key: "card.towerCannotTake" }
  ]);
});

test("oda katilim redleri bilinen metinle; istemci metinden anahtari cozuyor", () => {
  assert.equal(getRoomRejectionKey("Oda dolu."), "room.full");
  assert.equal(getRoomRejectionKey("Maç bitti."), "room.matchOver");
  assert.equal(getRoomRejectionKey(SERVER_FULL_MESSAGE), "room.serverFull");
  assert.equal(getRoomRejectionKey("baska bir hata"), undefined);
  const room = createRoom("warrior");
  room.matchResult = "victory";
  assert.throws(() => room.joinStartedMatch({ sessionId: "x" }, { characterId: "warrior" }), (error) => error.message === "Maç bitti.");
});

function setupPreviewRoom() {
  const room = createRoom("warrior");
  const client = { sessionId: "p1", send() {} };
  room.placeTower(client, { ...findBuildableSpot(room, "warrior-1"), definitionId: "warrior-1" });
  return { room, tower: [...room.towers.values()].at(-1) };
}

function requestPreview(room, message) {
  let preview;
  room.previewRequestTimes.clear();
  room.sendTowerPreview({ sessionId: "p1", send: (_type, value) => { preview = value; } }, { requestId: "1", ...message });
  return preview;
}

test("onizleme: Turkce metin ayni, yaninda satir anahtarlari ve kimlikler", () => {
  const { room, tower } = setupPreviewRoom();
  const card = cardCatalog.find((entry) => entry.id === "kalibre-artisi");
  room.pendingCardChoices.set("p1", [card]);
  const preview = requestPreview(room, { towerId: tower.id, cardId: card.id });
  assert.equal(preview.title, `${card.name} · ${tower.definition.name}`);
  assert.equal(preview.description, `${card.description} ${FORMER_TURKISH["preview.disclaimer"]}`);
  assert.equal(preview.lineKeys.length, preview.lines.length);
  preview.lines.forEach((line, index) => {
    const label = FORMER_TURKISH[preview.lineKeys[index]];
    assert.ok(label, `bilinmeyen satir anahtari ${preview.lineKeys[index]}`);
    assert.match(line, new RegExp(`^${label.replace(/[()/]/g, "\\$&")}: -?[\\d.]+ → -?[\\d.]+$`));
  });
  assert.equal(preview.cardId, card.id);
  assert.equal(preview.definitionId, "warrior-1");

  const rejected = requestPreview(room, { towerId: tower.id, cardId: "teklif-edilmemis" });
  assert.deepEqual(rejected, { requestId: "1", error: "Bu kule kartı alamıyor.", errorKey: "preview.cardRejected" });
  const invalid = requestPreview(room, { towerId: "yok", cardId: card.id });
  assert.deepEqual(invalid, { requestId: "1", error: "Geçersiz hedef.", errorKey: "preview.invalidTarget" });
  let tooSoon;
  room.sendTowerPreview({ sessionId: "p1", send: (_type, value) => { tooSoon = value; } }, { requestId: "2", towerId: tower.id, cardId: card.id });
  assert.deepEqual(tooSoon, { requestId: "2", error: "Biraz sonra tekrar dene.", errorKey: "preview.tooSoon" });
});

test("onizleme Ingilizcede: baslik, aciklama, etiketler ve red; sayilar aynen, Turkcede degismiyor", () => {
  const { room, tower } = setupPreviewRoom();
  const card = cardCatalog.find((entry) => entry.id === "kalibre-artisi");
  room.pendingCardChoices.set("p1", [card]);
  const preview = requestPreview(room, { towerId: tower.id, cardId: card.id });

  const turkish = inLocale("tr", () => web.localizeTowerPreview(preview));
  assert.deepEqual(turkish, { title: preview.title, description: preview.description, lines: preview.lines, error: undefined });

  const english = inLocale("en", () => web.localizeTowerPreview(preview));
  const englishCard = inLocale("en", () => ({ name: web.getCardDefinition(card.id).name, description: web.getCardDefinition(card.id).description }));
  assert.notEqual(englishCard.name, card.name);
  assert.equal(english.title, `${englishCard.name} · ${web.enTowers["warrior-1"].name}`);
  assert.ok(english.description.startsWith(englishCard.description));
  assert.ok(english.description.endsWith(en["server.preview.disclaimer"]));
  english.lines.forEach((line, index) => {
    assert.equal(line.slice(line.indexOf(":")), preview.lines[index].slice(preview.lines[index].indexOf(":")), "sayilar degismemeli");
    assert.ok(line.startsWith(`${en[`server.${preview.lineKeys[index]}`]}:`));
    assert.ok(!TURKISH_LETTERS.test(line), line);
  });

  const rejected = requestPreview(room, { towerId: tower.id, cardId: "teklif-edilmemis" });
  assert.equal(inLocale("en", () => web.localizeTowerPreview(rejected)).error, "This tower cannot take the card.");
  assert.equal(inLocale("tr", () => web.localizeTowerPreview(rejected)).error, "Bu kule kartı alamıyor.");
  // Eski sunucu: anahtar yok, Turkce metin kaliyor.
  assert.equal(inLocale("en", () => web.localizeTowerPreview({ requestId: "1", error: "Bilinmeyen" })).error, "Bilinmeyen");
});

test("onizlemede takilamayan esya: anahtar ve parametre, istemci kendi dilinde yaziyor", () => {
  const { room, tower } = setupPreviewRoom();
  const player = room.state.players.get("p1");
  // Envanterdeki esya onizlenebiliyor; kule dolunca ayni esya reddediliyor.
  const itemId = "kan-bankasi";
  player.inventoryItemIds.push(itemId);
  assert.equal(requestPreview(room, { towerId: tower.id, itemId }).error, undefined);
  tower.equippedShopItemIds = Array.from({ length: 10 }, () => itemId);
  const rejected = requestPreview(room, { towerId: tower.id, itemId });
  assert.equal(rejected.errorKey, "preview.equipRejected");
  assert.equal(rejected.errorParams.itemId, itemId);
  assert.equal(typeof rejected.errorParams.reason, "string");
  assert.match(rejected.error, TURKISH_LETTERS);
  assert.equal(inLocale("tr", () => web.localizeTowerPreview(rejected)).error, rejected.error);
  const english = inLocale("en", () => web.localizeTowerPreview(rejected)).error;
  assert.notEqual(english, rejected.error);
  assert.ok(!TURKISH_LETTERS.test(english), english);
});

test("anahtarli sunucu metni: Ingilizcede her anahtar, Turkcede sunucunun metni, tanimayan yedege", () => {
  for (const [key, text] of Object.entries(SERVER_TEXT)) {
    assert.equal(inLocale("tr", () => web.localizeServerText(text, key)), text);
    assert.equal(inLocale("en", () => web.localizeServerText(text, key)), en[`server.${key}`]);
  }
  assert.equal(inLocale("en", () => web.localizeServerText("Eski metin", "yok.boyle")), "Eski metin");
  assert.equal(inLocale("en", () => web.localizeServerText("Eski metin")), "Eski metin");
  assert.equal(inLocale("en", () => web.localizeServerText(undefined)), undefined);

  assert.equal(inLocale("en", () => web.describeServerError(new Error("Oda dolu."))), "Room is full.");
  assert.equal(inLocale("en", () => web.describeServerError(new Error("Maç bitti."))), "The match is over.");
  assert.equal(inLocale("en", () => web.describeServerError(new Error(SERVER_FULL_MESSAGE))), en["server.room.serverFull"]);
  assert.equal(inLocale("en", () => web.describeServerError(new Error("socket hang up"))), "socket hang up");
  assert.equal(inLocale("tr", () => web.describeServerError(new Error("Oda dolu."))), "Oda dolu.");
});

/** Kalibin Turkce sabit parcalari sunucunun kaynaginda: metin degisirse test yakalar. */
test("durum ve ozet kaliplari sunucunun metniyle ayni", () => {
  const source = readFileSync(new URL("../apps/server/src/rooms/MatchRoom.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const templates = Object.entries(tr).filter(([key]) => key.startsWith("server.status.") || key.startsWith("server.insight."));
  assert.ok(templates.length > 40);
  // "Favori Evrim N" sunucuda iki parca: `${favori ? "Favori " : ""}Evrim ${n}`.
  assert.ok(source.includes('"Favori " : ""}Evrim ${'));
  for (const [key, template] of templates.filter(([key]) => key !== "server.status.favoriteEvolution")) {
    // Uc noktalama sunucuda ayri ifadede olabiliyor (`${label}: ${...}`); govde birebir.
    for (const chunk of template.split(/\{\w+\}/).map((part) => part.replace(/^[\s:]+|[\s:(]+$/g, "")).filter((part) => part.length >= 3)) {
      assert.ok(source.includes(chunk), `${key}: "${chunk}" sunucuda yok`);
    }
  }
  for (const [activity, label] of Object.entries(activityLabels)) {
    assert.equal(tr[`server.activity.${activity}`], label, `etkinlik ${activity}`);
    assert.equal(en[`server.activity.${activity}`], web.enActivityLabels[activity], `etkinlik ${activity} (en)`);
  }
});

const STATUS_SAMPLES = [
  "Devre Disi", "Cephane Hammaddesi Yok", "Fabrika 12/40", "Fabrika Enerjisiz", "Fabrika 3/40 · Kalkan 25",
  "Cephane Hammaddesi Yok · Kalkan 4", "Enerji Deposu 80/100", "Beklemede", "Acil Şarjör 3", "Özel mühimmat 6",
  "Saldırı Kervanı", "Tahliye Kervanı", "Tahkimat 30", "Gedik Mühendisi", "Isiniyor 2sn", "Acil Köprü", "Son Çekirdek",
  "İletken Damar", "Röle hattı", "Yük kesildi", "Frekans paylaşımı", "Tukenmis", "Hararet", "Performans Kapali",
  "Asiri Sicak", "Muhimmat Yok", "Enerji Yok", "Odaklan", "Odaklan x5", "Gotik Kabus", "Ucgen bekliyor",
  "Isı freni %40", "Ayna 55% · Isı freni %12", "Bag 1/2 | Ruh 4 | Onay · Isı freni %30", "Bag 0/1 | Ruh 0 | Stres",
  "Favori Evrim 2", "Evrim 3", "Favori", "Link 2/2 7T", "Sentez 1+1", "Sentez 2+2", "Kopya 1", "Sunucu 10T", "Sunucu 5T",
  "Dizilim 3 Lv.4", "Dizilim 2 Lv.1", "Pasif",
  // `getTowerStatus`in obur dallari: kalan Sentez/Kopya kipleri, frensiz Ayna,
  // kalkanli enerjisiz fabrika ve Ingilizce kalan Streak'in yanindaki fren.
  "Sentez 1+2", "Kopya 2", "Ayna 100%", "Fabrika Enerjisiz · Kalkan 12", "Cephane Hammaddesi Yok · Kalkan 1",
  "Enerji Deposu 0/100", "Streak +20%/+10% · Isı freni %10", "Streak +15% · Isı freni %99", "Ayna 40% · Isı freni %1"
];

const INSIGHT_SAMPLES = [
  "Saldırı döngüsü | Mühimmat: 2.5 yolda | Enerji: kaynak deposu boş",
  "Hedef bekliyor | Muhimmat Yok | Mühimmat: kaynak binası yok | Yalnızlık kapalı: Takipçi, Takipçi | Bu dalga: döngü 4 sn · hedef 12 sn · mühimmat 0 sn · enerji 0 sn · soğuma 1 sn",
  "Soğuyor | Isı freni %20 | Mühimmat: sevkiyat kapalı | Enerji: yol kapalı | Yalnızlık açık: hasar ×1.25",
  "Mühimmat bekliyor | Mühimmat: kaynak yolu kapalı | Enerji: taşıma sırası bekliyor",
  "Enerji bekliyor | Enerji: taşıyıcı yok | Dizilim 3: en düşük seviye 2 (Takipçi, Takipçi)",
  "Devre dışı / beklemede | Devre Disi | Dizilim yok: 1 bağlı kule; geçerli ikili veya üçlü yerleşim gerekiyor",
  "Destek döngüsü",
  // `getTowerInsight`in birlesik halleri: etkinlik | durum | enerji | muhimmat
  // | yalnizlik | dizilim | bu dalga. QA'nin gordugu "Ucgen bekliyor" ve
  // "kaynak binası yok" dahil.
  "Hedef bekliyor | Ucgen bekliyor | Enerji: kaynak binası yok | Mühimmat: kaynak binası yok",
  "Hedef bekliyor | Ucgen bekliyor | Enerji: kaynak binası yok | Dizilim yok: 2 bağlı kule; geçerli ikili veya üçlü yerleşim gerekiyor",
  "Fabrika 3/40 · Kalkan 25 | Enerji: taşıyıcı yok",
  "Fabrika Enerjisiz | Enerji: 12.0 yolda",
  "Enerji Deposu 40/100 | Enerji: kaynak deposu boş",
  "Saldırı döngüsü | Bag 1/2 | Ruh 4 | Onay · Isı freni %30 | Mühimmat: 12.0 yolda",
  "Saldırı döngüsü | Overdrive | Bu dalga: döngü 9 sn · hedef 0 sn · mühimmat 0 sn · enerji 0 sn · soğuma 0 sn",
  "Saldırı döngüsü | Streak +20% · Isı freni %50 | Yalnızlık açık: hasar ×1.25",
  "Destek döngüsü | Sunucu 10T | Enerji: 3.5 yolda",
  "Isiniyor 3sn | Enerji: kaynak deposu boş | Mühimmat: yol kapalı",
  "Saldırı döngüsü | Sentez 1+2 | Dizilim 3: en düşük seviye 1 (Hiza Emri)",
  "Saldırı döngüsü | Dizilim 2 Lv.3 | Dizilim 2: en düşük seviye 3 (Hiza Emri, Hiza Emri)",
  "Soğuyor | Asiri Sicak | Enerji: taşıma sırası bekliyor",
  "Enerji bekliyor | Enerji Yok | Enerji: kaynak yolu kapalı",
  "Saldırı döngüsü | Acil Şarjör 3 | Mühimmat: sevkiyat kapalı",
  "Saldırı döngüsü | Saldırı Kervanı", "Saldırı döngüsü | Tahliye Kervanı | Mühimmat: 4.0 yolda",
  "Saldırı döngüsü | Tahkimat 30", "Saldırı döngüsü | Gedik Mühendisi", "Saldırı döngüsü | Acil Köprü",
  "Saldırı döngüsü | Son Çekirdek", "Saldırı döngüsü | İletken Damar", "Saldırı döngüsü | Röle hattı",
  "Saldırı döngüsü | Yük kesildi", "Saldırı döngüsü | Frekans paylaşımı", "Devre dışı / beklemede | Tukenmis",
  "Soğuyor | Hararet", "Devre dışı / beklemede | Performans Kapali", "Saldırı döngüsü | Odaklan x5",
  "Saldırı döngüsü | Gotik Kabus", "Saldırı döngüsü | Favori Evrim 2", "Saldırı döngüsü | Link 1/2 3T",
  "Saldırı döngüsü | Pasif"
];

test("kule durumu ve ozeti: Ingilizcede kaliplardan, Turkcede birebir ayni", () => {
  for (const text of [...STATUS_SAMPLES, ...INSIGHT_SAMPLES]) {
    assert.equal(inLocale("tr", () => web.localizeTowerStatusText(text)), text);
    const english = inLocale("en", () => web.localizeTowerStatusText(text));
    assert.notEqual(english, text, text);
    assert.ok(!TURKISH_LETTERS.test(english), `${text} -> ${english}`);
  }
  const en1 = (text) => inLocale("en", () => web.localizeTowerStatusText(text));
  assert.equal(en1("Fabrika 3/40 · Kalkan 25"), "Factory 3/40 · Shield 25");
  assert.equal(en1("Isı freni %40"), "Heat brake 40%");
  assert.equal(en1("Bag 1/2 | Ruh 4 | Onay · Isı freni %30"), "Bind 1/2 | Souls 4 | Approval · Heat brake 30%");
  assert.equal(en1("Yalnızlık kapalı: Takipçi, Takipçi"), `Isolation off: ${web.enTowers["warrior-1"].name}, ${web.enTowers["warrior-1"].name}`);
  assert.equal(en1("Bu dalga: döngü 4 sn · hedef 12 sn · mühimmat 0 sn · enerji 0 sn · soğuma 1 sn"),
    "This wave: cycle 4s · target 12s · ammo 0s · energy 0s · cooling 1s");
  // QA'nin kule panelinde Turkce gordugu satirlar.
  assert.equal(en1("Ucgen bekliyor"), "Awaiting triangle");
  assert.equal(en1("Hedef bekliyor | Ucgen bekliyor | Enerji: kaynak binası yok | Mühimmat: kaynak binası yok"),
    "Awaiting target | Awaiting triangle | Energy: no source building | Ammo: no source building");
  assert.equal(en1("Saldırı döngüsü | Streak +20% · Isı freni %50 | Yalnızlık açık: hasar ×1.25"),
    "Attack cycle | Streak +20% · Heat brake 50% | Isolation on: damage ×1.25");
  // Ingilizce kalanlar ve tanimayan metin degismiyor.
  assert.equal(en1("Overdrive"), "Overdrive");
  assert.equal(en1("Streak +20%/+10%"), "Streak +20%/+10%");
  assert.equal(en1("Yeni bir durum"), "Yeni bir durum");
  assert.equal(en1(""), "");
  assert.equal(en1(undefined), "");
});

test("sunucunun gercek durum ve ozet metinleri Ingilizcede cevriliyor", () => {
  const room = createRoom("warrior");
  const client = { sessionId: "p1", send() {} };
  for (let i = 0; i < 2; i++) room.placeTower(client, { ...findBuildableSpot(room, "warrior-1"), definitionId: "warrior-1" });
  room.ensureLogisticsWorkers();
  room.updateDefenseInsights(1);
  const [tower] = room.towers.values();
  const texts = [];
  const read = () => {
    room.towerInsightCache = new WeakMap();
    texts.push(room.getTowerStatus(tower), room.getTowerInsight(tower));
  };
  read();
  tower.ammo = 0; read();
  tower.ammo = tower.maxAmmo; tower.temperature = 90; read();
  tower.wakeReadyAt = Date.now() + 2500; read();
  tower.standby = true; read();
  tower.hp = 0; read();
  for (const text of texts.filter(Boolean)) {
    assert.equal(inLocale("tr", () => web.localizeTowerStatusText(text)), text);
    const english = inLocale("en", () => web.localizeTowerStatusText(text));
    assert.ok(!TURKISH_LETTERS.test(english) && !/Muhimmat|Isiniyor|Devre Disi|Beklemede/.test(english), `${text} -> ${english}`);
  }
  assert.ok(texts.some((text) => text.includes("Yalnızlık")) && texts.some((text) => text.includes("Bu dalga")), texts.join("\n"));
});

test("kule panelinin durum ve ozet satiri secili dilde", () => {
  const input = {
    towerId: "t1", definitionId: "warrior-1", characterId: "warrior", name: "Takipçi", level: 4, color: "#22c55e",
    live: { temperature: 20, ammo: 0, maxAmmo: 40, status: "Muhimmat Yok", insight: "Hedef bekliyor | Mühimmat: taşıyıcı yok" },
    notes: []
  };
  const turkish = inLocale("tr", () => web.buildTowerSheetModel(input));
  assert.equal(turkish.status, "Muhimmat Yok");
  assert.equal(turkish.insight, "Hedef bekliyor | Mühimmat: taşıyıcı yok");
  const english = inLocale("en", () => web.buildTowerSheetModel(input));
  assert.equal(english.status, "No ammo");
  assert.equal(english.insight, "Awaiting target | Ammo: no carrier");
});

test("savunma ozeti ve kosu raporu kule adini tanim kimligiyle; Turkcede dokunulmuyor", () => {
  const room = createRoom("warrior");
  const client = { sessionId: "p1", send() {} };
  room.placeTower(client, { ...findBuildableSpot(room, "warrior-1"), definitionId: "warrior-1" });
  const [tower] = room.towers.values();
  room.updateDefenseInsights(1);
  room.recordTowerDamage(tower.id, 40);
  room.finishDefenseSummary();
  const summary = JSON.parse(JSON.stringify(room.lastDefenseSummary.get("p1")));
  assert.equal(summary.rows[0].definitionId, "warrior-1");
  assert.equal(summary.rows[0].name, tower.definition.name);

  const englishName = web.enTowers["warrior-1"].name;
  assert.equal(inLocale("tr", () => web.localizeDefenseSummary(summary)), summary);
  assert.equal(inLocale("en", () => web.localizeDefenseSummary(summary)).rows[0].name, englishName);
  const turkishLines = inLocale("tr", () => web.defenseSummaryLines(summary));
  assert.ok(turkishLines[1].includes(tower.definition.name));
  assert.ok(inLocale("en", () => web.defenseSummaryLines(summary))[1].includes(englishName));
  // Eski sunucu: kimlik yok, ad oldugu gibi.
  const legacy = { ...summary, rows: [{ ...summary.rows[0], definitionId: undefined }] };
  assert.equal(inLocale("en", () => web.localizeDefenseSummary(legacy)).rows[0].name, tower.definition.name);

  const top = { towerId: "t", definitionId: "warrior-1", name: tower.definition.name, slot: 0, damage: 900, level: 4 };
  const run = { players: [{ slot: 0, topTower: top }, { slot: 1 }], mvp: top, firstLevel10: { wave: 3, slot: 0, towerId: "t", definitionId: "warrior-1", name: tower.definition.name } };
  assert.equal(inLocale("tr", () => web.localizeRunSummary(run)), run);
  const english = inLocale("en", () => web.localizeRunSummary(run));
  assert.equal(english.players[0].topTower.name, englishName);
  assert.equal(english.mvp.name, englishName);
  assert.equal(english.firstLevel10.name, englishName);
  assert.equal(run.mvp.name, tower.definition.name, "girdi degismemeli");
});

test("dalga karnesi: MVP kulesi Ingilizcede katalog adiyla, Turkcede sunucunun adiyla", () => {
  // Sunucunun dalga sonu ozeti: ad Turkce, yaninda tanim kimligi.
  const summary = { wave: 3, rows: [{ towerId: "t1", ownerId: "p1", name: "Hiza Emri", definitionId: "zeynep-1", damage: 1240, repaired: 0,
    auraEnemySeconds: 0, markAssistDamage: 0, seconds: { cycle: 9, target: 0, ammo: 0, energy: 0, heat: 0, disabled: 0, support: 0 } }] };
  const card = (locale) => inLocale(locale, () => web.buildWaveReportCard({
    wave: 3, localSlot: 0, coop: false, creative: false, defense: web.localizeDefenseSummary(summary)
  }));
  const mvp = (built) => built.chips.find((chip) => chip.kind === "mvp");
  const turkish = card("tr");
  assert.equal(mvp(turkish).text, "MVP Hiza Emri 1.240");
  const english = card("en");
  const englishName = web.enTowers["zeynep-1"].name;
  assert.notEqual(englishName, "Hiza Emri");
  assert.equal(mvp(english).text, `MVP ${englishName} 1,240`);
  assert.ok(english.label.includes(englishName) && !english.label.includes("Hiza"), english.label);
});
