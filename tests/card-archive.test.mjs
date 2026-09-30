/**
 * Kart Arsivi ve "YENİ" etiketi.
 *
 * Arsiv tarayicida duruyor; bu testler kuralin sozlerini kilitliyor:
 *
 *   1. Arsiv yalnizca buyuyor: gorulen kart ya da esya hicbir yoldan
 *      "gorulmedi"ye donmuyor; "YENİ" yalnizca hic gorulmemise iniyor.
 *   2. Sayac katalogdan: "64/113" kartlar, esyalar ayri; bicimi dogru ama
 *      katalogda olmayan kimlik silinmiyor ama sayilmiyor.
 *   3. "Kac kosuda secildi" kosu basina bir kez, yigilan kart bir kez;
 *      yaratici kosu ve takim arkadasinin destesi sayilmiyor.
 *   4. Menu gorunumunde gorulmemis satirin adi ve aciklamasi yok: siluet
 *      yalnizca nadirligi (esyada kategoriyi) soyluyor.
 *   5. Bir sunumun etiketi o sunum ekranda kaldikca kaliyor; depo sunum
 *      basina bir kez okunuyor.
 *   6. Bozuk ya da kurcalanmis depo menuyu kirmiyor.
 *   7. Arsiv guc degil: sunucu ve cekilis arsivi bilmiyor, etiket sessiz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ARCHIVE_RUN_ID_LIMIT,
  ArchiveOfferLatch,
  CARD_ARCHIVE_VERSION,
  MAX_ARCHIVE_IDS,
  buildCardArchiveView,
  cardCatalog,
  createEmptyCardArchive,
  drawCards,
  drawShopOffers,
  findUnseenArchiveIds,
  formatArchiveProgress,
  getArchivePercent,
  getArchiveProgress,
  getArchiveRun,
  getCardRarity,
  markArchiveSeen,
  recordArchiveRun,
  sanitizeCardArchive,
  serializeCardArchive,
  shopCatalog
} from "../packages/shared/dist/index.js";
import { createRoom } from "./helpers/match-room-harness.mjs";

const kartlar = (count) => cardCatalog.slice(0, count).map((card) => card.id);

test("gorulme: yalnizca hic gorulmemis olan YENİ, sirayla ve bir kez; arsiv geri gitmiyor", () => {
  const bos = createEmptyCardArchive();
  const [a, b, c] = kartlar(3);

  const ilk = markArchiveSeen(bos, "cards", [a, b, a]);
  assert.deepEqual(ilk.fresh, [a, b], "ayni elde iki kez gelen kart bir kez yeni");
  assert.deepEqual(ilk.archive.cards, [a, b]);
  assert.deepEqual(bos.cards, [], "girdi arsiv degismiyor");

  const ikinci = markArchiveSeen(ilk.archive, "cards", [c, b, a]);
  assert.deepEqual(ikinci.fresh, [c], "daha once gorulen kart yeni degil");
  assert.deepEqual(ikinci.archive.cards, [a, b, c], "ilk gorulme sirasi korunuyor");

  const tekrar = markArchiveSeen(ikinci.archive, "cards", [a, b, c]);
  assert.deepEqual(tekrar.fresh, []);
  assert.equal(tekrar.archive, ikinci.archive, "yeni bir sey yoksa ayni nesne: depoya yazmaya gerek yok");

  // Kartlar ve esyalar ayri listeler: ayni kimlik biri icin gorulmus, oteki icin degil.
  const esya = shopCatalog[0].id;
  const esyali = markArchiveSeen(ikinci.archive, "items", [esya, "<script>", 42, null]);
  assert.deepEqual(esyali.fresh, [esya], "bicimi bozuk kimlik arsive girmiyor");
  assert.deepEqual(esyali.archive.cards, [a, b, c]);
  assert.deepEqual(findUnseenArchiveIds(esyali.archive, "items", [esya, shopCatalog[1].id]), [shopCatalog[1].id]);
});

test("sayac: katalogdan '64/113' ve '30/85'; bilinmeyen kimlik korunuyor ama sayilmiyor", () => {
  assert.equal(cardCatalog.length, 113, "plan ve menu metni bu sayiyla yazildi");
  assert.equal(shopCatalog.length, 85);

  let arsiv = markArchiveSeen(createEmptyCardArchive(), "cards", [...kartlar(64), "gelecekteki-kart"]).archive;
  arsiv = markArchiveSeen(arsiv, "items", shopCatalog.slice(0, 30).map((item) => item.id)).archive;
  assert.deepEqual(getArchiveProgress(arsiv, "cards"), { seen: 64, total: 113 });
  assert.equal(formatArchiveProgress(getArchiveProgress(arsiv, "cards")), "64/113");
  assert.equal(formatArchiveProgress(getArchiveProgress(arsiv, "items")), "30/85");
  assert.ok(arsiv.cards.includes("gelecekteki-kart"), "eski bir sekme yeni surumun gordugunu silmesin");

  // Yuzde asagi yuvarlaniyor: son kart gorulmeden %100 yazmiyor.
  assert.equal(getArchivePercent({ seen: 112, total: 113 }), 99);
  assert.equal(getArchivePercent({ seen: 113, total: 113 }), 100);
  assert.equal(getArchivePercent({ seen: 0, total: 0 }), 0);

  // Butun katalog arsivlenebilir: her kart ve esya kimligi bicime uyuyor.
  const tam = markArchiveSeen(markArchiveSeen(createEmptyCardArchive(), "cards", cardCatalog.map((card) => card.id)).archive, "items", shopCatalog.map((item) => item.id)).archive;
  assert.deepEqual(getArchiveProgress(tam, "cards"), { seen: 113, total: 113 });
  assert.deepEqual(getArchiveProgress(tam, "items"), { seen: 85, total: 85 });
});

test("gercek cekilis: sunulan her kart ve esya arsive giriyor, ikinci sunumda yeni degil", () => {
  let tohum = 7;
  const random = () => {
    tohum = (tohum * 16807) % 2147483647;
    return tohum / 2147483647;
  };
  const el = drawCards({ preferredAxes: ["dps"], towers: [], ownedCardIds: [], random });
  const vitrin = drawShopOffers({ wave: 3, preferredAxes: ["dps"], towers: [], ownedItemIds: [], random });
  assert.ok(el.length > 0 && vitrin.length > 0);

  const kartli = markArchiveSeen(createEmptyCardArchive(), "cards", el.map((card) => card.id));
  assert.deepEqual(kartli.fresh, el.map((card) => card.id), "ilk el tamamen yeni");
  const esyali = markArchiveSeen(kartli.archive, "items", vitrin.map((item) => item.id));
  assert.equal(esyali.fresh.length, vitrin.length);
  assert.deepEqual(markArchiveSeen(esyali.archive, "cards", el.map((card) => card.id)).fresh, []);
});

test("secim sayaci: kosu basina bir kez, yigilan kart bir kez, secilen kart gorulmus sayiliyor", () => {
  const [a, b] = kartlar(2);
  const ilk = recordArchiveRun(createEmptyCardArchive(), { id: "kosu-1", cards: [a, a, b] });
  assert.equal(ilk.counted, true);
  assert.deepEqual(ilk.archive.picks, { [a]: 1, [b]: 1 }, "soru 'kac kez' degil, 'kac kosuda'");
  assert.deepEqual(ilk.archive.cards, [a, b], "secim isaretlenemeden sayfa kapandiysa bile gorulmus");

  const ayni = recordArchiveRun(ilk.archive, { id: "kosu-1", cards: [a] });
  assert.equal(ayni.counted, false, "yeniden baglanmada tekrar gelen sonuc ikinci kez sayilmiyor");
  assert.equal(ayni.archive, ilk.archive);

  const ikinci = recordArchiveRun(ilk.archive, { id: "kosu-2", cards: [a] });
  assert.deepEqual(ikinci.archive.picks, { [a]: 2, [b]: 1 });

  assert.equal(recordArchiveRun(ikinci.archive, undefined).counted, false);
  assert.equal(recordArchiveRun(ikinci.archive, { id: "bozuk kimlik!", cards: [a] }).counted, false);

  // Kimlik listesi sinirli; sinirin disina dusen eski kosu bir daha gelmiyor zaten.
  let arsiv = createEmptyCardArchive();
  for (let index = 0; index < ARCHIVE_RUN_ID_LIMIT + 5; index += 1) {
    arsiv = recordArchiveRun(arsiv, { id: `kosu-${index}`, cards: [a] }).archive;
  }
  assert.equal(arsiv.runs.length, ARCHIVE_RUN_ID_LIMIT);
  assert.equal(arsiv.runs.at(-1), `kosu-${ARCHIVE_RUN_ID_LIMIT + 4}`);
  assert.equal(arsiv.picks[a], ARCHIVE_RUN_ID_LIMIT + 5);
});

test("kosudan arsive: yerel yuvanin destesi; yaratici kosu ve takim arkadasi disarida", () => {
  const run = {
    id: "kosu-9",
    players: [
      { slot: 0, cards: ["seri-atis"] },
      { slot: 1, cards: ["kalin-zirh", "kalin-zirh"] }
    ]
  };
  assert.deepEqual(getArchiveRun(run, { slot: 1 }), { id: "kosu-9", cards: ["kalin-zirh", "kalin-zirh"] });
  assert.deepEqual(getArchiveRun(run, { slot: 0 }), { id: "kosu-9", cards: ["seri-atis"] });
  assert.equal(getArchiveRun(run, { slot: 3 }), undefined, "yuvasi olmayan oyuncu baskasinin destesini almiyor");
  assert.equal(getArchiveRun({ ...run, creative: true }, { slot: 0 }), undefined, "rapor yaratici diyorsa sayilmiyor");
  assert.equal(getArchiveRun(run, { slot: 0, creative: true }), undefined, "istemci yaratici diyorsa sayilmiyor");
  assert.equal(getArchiveRun(undefined, { slot: 0 }), undefined);
});

test("gercek oda: sunucunun kosu raporu arsive yerel destesiyle giriyor", () => {
  const room = createRoom("warrior");
  const yayinlar = [];
  room.broadcast = (type, payload) => yayinlar.push({ type, payload });
  room.clients = [];
  const player = room.state.players.get("p1");
  Object.assign(player, { slot: 0, connected: true, shopOffers: [], shopRerolls: 0, nexusShieldCharges: 0, ownedCardIds: ["seri-atis", "kalin-zirh", "seri-atis"] });
  room.wave = 5;
  room.finishMatch("defeat");
  const run = yayinlar.find((yayin) => yayin.type === "match:defeat").payload.run;
  const kosu = getArchiveRun(run, { slot: 0 });
  assert.equal(kosu.id, run.id);
  const arsiv = recordArchiveRun(createEmptyCardArchive(), kosu).archive;
  assert.deepEqual(arsiv.picks, { "seri-atis": 1, "kalin-zirh": 1 });
});

test("menu gorunumu: gorulmemis satirda ad yok, gruplar nadirlige ve kategoriye gore", () => {
  const nadir = cardCatalog.find((card) => getCardRarity(card) === "rare");
  const yaygin = cardCatalog.find((card) => getCardRarity(card) === "common");
  let arsiv = markArchiveSeen(createEmptyCardArchive(), "cards", [nadir.id]).archive;
  arsiv = recordArchiveRun(arsiv, { id: "kosu-1", cards: [nadir.id] }).archive;
  arsiv = recordArchiveRun(arsiv, { id: "kosu-2", cards: [nadir.id] }).archive;
  const view = buildCardArchiveView(arsiv);

  assert.deepEqual(view.cards.groups.map((group) => group.key), ["common", "uncommon", "rare"]);
  assert.deepEqual(view.cards.groups.map((group) => group.label), ["Yaygın", "Seyrek", "Nadir"]);
  assert.deepEqual(view.items.groups.map((group) => group.key), ["power", "class", "utility", "map", "risk"]);
  assert.equal(view.cards.total, 113);
  assert.equal(view.items.total, 85);
  assert.equal(view.cards.groups.reduce((sum, group) => sum + group.total, 0), 113, "her kart tam bir grupta");

  const nadirGrup = view.cards.groups.find((group) => group.key === "rare");
  assert.equal(nadirGrup.seen, 1);
  assert.deepEqual(nadirGrup.entries[0], {
    id: nadir.id, seen: true, group: "rare", tag: "Nadir", name: nadir.name, description: nadir.description, picks: 2
  }, "gorulen once; kac kosuda secildigi yaziyor");

  const kilitli = view.cards.groups.find((group) => group.key === "common").entries.find((entry) => entry.id === yaygin.id);
  assert.deepEqual(Object.keys(kilitli).sort(), ["group", "id", "seen", "tag"], "siluet adi ve aciklamayi tasimiyor");
  assert.equal(kilitli.tag, "Yaygın");
  assert.equal(JSON.stringify(view).includes(yaygin.name), false, "gorulmemis kartin adi gorunumde hic yok");

  // Esyada secim sayaci yok: sayilmayan bir seye "0 kez" demiyor.
  const esyali = buildCardArchiveView(markArchiveSeen(createEmptyCardArchive(), "items", [shopCatalog[0].id]).archive);
  const esya = esyali.items.groups.flatMap((group) => group.entries).find((entry) => entry.seen);
  assert.equal(esya.picks, 0);
  assert.equal(esyali.items.seen, 1);
});

test("etiket kapisi: ayni sunum ayni etiketleri tutuyor, depo sunum basina bir kez", () => {
  const latch = new ArchiveOfferLatch();
  let okuma = 0;
  const hesap = (ids) => () => {
    okuma += 1;
    return ids;
  };
  const ilk = latch.resolve("7:a,b,c", hesap(["a"]));
  assert.deepEqual([...ilk], ["a"]);
  // Hedef listesinden geri donus ya da panelin yeniden kurulmasi: etiket yerinde, depo okunmuyor.
  assert.deepEqual([...latch.resolve("7:a,b,c", hesap([]))], ["a"]);
  assert.equal(okuma, 1);
  // Yeni sunum (yenileme ya da sonraki dalga): onceki sunumun etiketi tasinmiyor.
  assert.deepEqual([...latch.resolve("8:a,b,c", hesap([]))], []);
  assert.equal(okuma, 2);
  latch.reset();
  assert.deepEqual([...latch.resolve("8:a,b,c", hesap(["b"]))], ["b"]);
});

test("magaza etiketi: satin alma vitrini daraltiyor ama kalanlarin YENİ etiketi yerinde", () => {
  const latch = new ArchiveOfferLatch();
  let okuma = 0;
  const hesap = (fresh) => () => {
    okuma += 1;
    return fresh;
  };
  // 6. dalga vitrini: 5 esya, biri (e) zaten biliniyordu.
  const ilk = latch.resolveNarrowing("6:40", ["a", "b", "c", "d", "e"], hesap(["a", "b", "c", "d"]));
  assert.deepEqual([...ilk], ["a", "b", "c", "d"]);
  // Bilinen esya satin alindi: vitrin 4 esya, kapsam ayni. Depo yeniden okunmuyor,
  // etiketler dusmuyor (eskiden kimlik listesiyle anahtarlanip hepsi siliniyordu).
  const alimdan = latch.resolveNarrowing("6:40", ["a", "b", "c", "d"], hesap([]));
  assert.deepEqual([...alimdan], ["a", "b", "c", "d"]);
  assert.equal(okuma, 1);
  // Yeni esya satin alindi: yalnizca o duser.
  assert.deepEqual([...latch.resolveNarrowing("6:40", ["a", "c", "d"], hesap([]))], ["a", "c", "d"]);
  assert.equal(okuma, 1);
  // Ayni vitrin her cizimde ayni kumeyi donduruyor; yeniden kurulmuyor.
  assert.equal(latch.resolveNarrowing("6:40", ["a", "c", "d"], hesap([])), latch.resolveNarrowing("6:40", ["a", "c", "d"], hesap([])));
  // Yenileme yeni bir kapsam (bedel artti): yeniden hesap, onceki etiket tasinmiyor.
  assert.deepEqual([...latch.resolveNarrowing("6:60", ["f", "g", "a"], hesap(["f"]))], ["f"]);
  assert.equal(okuma, 2);
  // Ayni kapsamda ilk vitrinde olmayan bir kimlik: yeniden hesap.
  assert.deepEqual([...latch.resolveNarrowing("6:60", ["f", "h"], hesap(["h"]))], ["h"]);
  assert.equal(okuma, 3);
  // Sonraki dalga: ayni kimlikler bile yeni sunum.
  assert.deepEqual([...latch.resolveNarrowing("7:40", ["f", "h"], hesap([]))], []);
  assert.equal(okuma, 4);
  latch.reset();
  assert.deepEqual([...latch.resolveNarrowing("7:40", ["f"], hesap(["f"]))], ["f"]);
});

test("bozuk depo: arsiv bos ya da temiz okunuyor, surum ve tavan tutuluyor", () => {
  for (const bozuk of [undefined, null, 42, "metin", [], { v: 2, cards: ["seri-atis"] }, { cards: ["seri-atis"] }]) {
    assert.deepEqual(sanitizeCardArchive(bozuk), createEmptyCardArchive(), JSON.stringify(bozuk));
  }
  const [a, b] = kartlar(2);
  const kurcalanmis = sanitizeCardArchive({
    v: CARD_ARCHIVE_VERSION,
    cards: [a, a, "", "BUYUK-HARF", "<img>", 7, b],
    items: "degil-liste",
    picks: { [a]: 3.8, [b]: -2, "kotu id": 5, "yok-kart": "9", c: Number.POSITIVE_INFINITY },
    runs: ["kosu-1", "kosu-1", 5, "bozuk kimlik!", ...Array.from({ length: 50 }, (_, index) => `r-${index}`)]
  });
  assert.deepEqual(kurcalanmis.cards, [a, b]);
  assert.deepEqual(kurcalanmis.items, []);
  assert.deepEqual(kurcalanmis.picks, { [a]: 3, "yok-kart": 9 });
  assert.equal(kurcalanmis.runs.length, ARCHIVE_RUN_ID_LIMIT);
  assert.equal(kurcalanmis.runs.at(-1), "r-49");

  const sisik = sanitizeCardArchive({ v: CARD_ARCHIVE_VERSION, cards: Array.from({ length: MAX_ARCHIVE_IDS + 100 }, (_, index) => `kart-${index}`) });
  assert.equal(sisik.cards.length, MAX_ARCHIVE_IDS, "kurcalanmis depo menuyu yavaslatmiyor");

  const gidis = serializeCardArchive(kurcalanmis);
  assert.equal(gidis.v, CARD_ARCHIVE_VERSION);
  assert.deepEqual(sanitizeCardArchive(JSON.parse(JSON.stringify(gidis))), kurcalanmis, "depodan donus kaybetmiyor");
});

test("kaynak: depo surumlu ve try icinde, yaratici kapisi yazmadan once, etiket sessiz, arsiv guc degil", async () => {
  const store = (await readFile(new URL("../apps/web/src/card-archive.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(store.includes('"karayel_archive_v1"'));
  const chunks = store.split(/\nfunction |\nexport function /).filter((chunk) => chunk.includes("localStorage"));
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) assert.ok(/try \{[\s\S]*localStorage[\s\S]*\} catch/.test(chunk), chunk.slice(0, 40));
  const offered = store.slice(store.indexOf("export function markArchiveOffered("));
  assert.ok(offered.indexOf("context.creative") < offered.indexOf("readArchive("), "yaratici kosu depoya hic dokunmuyor");

  const scene = (await readFile(new URL("../apps/web/src/scenes/GameScene.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.equal(scene.includes("karayel_archive_v1"), false, "sahne depoya kendisi yazmiyor");
  const draft = scene.slice(scene.indexOf("private showCardChoices("), scene.indexOf("private scheduleCardRevealCues("));
  assert.ok(draft.includes('markArchiveOffered(\n      "cards"'), "kart eli sunuldugu an arsive yaziliyor");
  assert.ok(draft.includes("this.isArchiveSandbox()"), "yaratici kosu arsive yazmiyor");
  assert.ok(draft.includes("run-card__new"), "yeni kartta etiket");
  assert.ok(scene.includes('markArchiveOffered("items"'), "magaza vitrini de arsive yaziliyor");
  // Magazanin kapsami dalga ve yenileme bedeli; kimlik listesi degil (satin alma etiketleri silmesin).
  const shop = scene.slice(scene.indexOf("private resolveShopNovelty("), scene.indexOf("private", scene.indexOf("private resolveShopNovelty(") + 10));
  assert.equal(shop.includes("ids.join"), false, "vitrin kimlikleri anahtarda degil");
  assert.ok(shop.includes("shopRerollPrice"));
  assert.ok(shop.includes("this.shopArchiveLatch.resolveNarrowing("));
  assert.ok(scene.includes("recordArchiveRunResult(getArchiveRun("), "kosu sonunda secim sayaci");

  const controls = (await readFile(new URL("../apps/web/src/game-control-ui.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(controls.includes("gold-shop__new"), "magazada da ayni etiket");

  // Etiket sessiz: parlama, hareket yok; nadirlik altiniyla yarismiyor.
  const css = (await readFile(new URL("../apps/web/src/style.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  for (const selector of [".run-card__new {", ".gold-shop__new {"]) {
    const block = css.slice(css.indexOf(selector), css.indexOf("}", css.indexOf(selector)));
    assert.ok(block.length > selector.length, selector);
    assert.equal(/animation|box-shadow|fbbf24|glow/.test(block), false, `${selector} sessiz`);
  }

  const menu = (await readFile(new URL("../apps/web/src/menu-ui.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.ok(menu.includes('data-view="cardArchive"'), "menude Kart Arsivi girisi");
  assert.ok(menu.includes("readCardArchive()"));

  // Guc degil: sunucu, cekilis ve magaza arsivi bilmiyor.
  const server = (await readFile(new URL("../apps/server/src/rooms/MatchRoom.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.equal(/archive|Archive/.test(server), false, "sunucu arsivi bilmiyor");
  for (const path of ["../packages/shared/src/cards/index.ts", "../packages/shared/src/shop/index.ts"]) {
    const source = (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    assert.equal(source.includes("progress/archive"), false, `${path} arsivi okumuyor`);
  }
});
