/**
 * Dusmanin yonlu govdesi: gorunen govdenin dis bukey cokgeni, govdeyle
 * birlikte donuyor.
 *
 * Sahibin karari (2026-10): isabet kutusu gorunen govde ve cizilen doku gibi
 * yuruyus yonune donuyor. Istemci dokuyu yurudugu yone ceviriyor (GameScene
 * `getEnemySpriteRotation`: dokunun +y ekseni yon, dururken son yon
 * korunuyor). Govde dokunun ekseninde bir cokgen (`ENEMY_BODY_OUTLINES`,
 * PNG'lerden uretilmis: maskenin dis bukey zarfi, disariya dogru en fazla 12
 * koseye indirilmis). Yandan gelen atis burnu ve kuyrugu, onden gelen dar
 * govdeyi goruyor; sivri burun ve koseli zirh da cizildigi yerde.
 *
 * Sunucu ve istemci ayni fonksiyonlari cagiriyor: sunucu her vurus
 * hesabinda, istemci Gosteri / Kin seciminde ve carpmanin hangi dusmana
 * oldugunu bulurken.
 *
 * Govde nesnesi (`EnemyBody`) dusman basina bir tane, dogumda kuruluyor ve
 * hep ayni bicimde (ayni alanlar, ayni sira, cift sayilar ve cokgenin
 * paylasilan nesnesi): yardimcilar yalnizca bunu okuyor. Sunucunun dusman
 * kaydi mac icinde onlarca bicim aliyor (sonradan eklenen alanlar);
 * yardimcilar o kaydi okusaydi her alan okumasi cok bicimli (megamorfik)
 * olur, her cift sayi yeni bir kutuya (tahsis) yazilirdi. Ayni sebeple
 * sekillerin sayilari (kama, ucgen, bant, bicak) cok sayida cift arguman
 * yerine modul duzeyindeki tek nesnelerden ya da tamponlardan okunuyor:
 * satir ici acilmayan cagrida her cift arguman bir kutu olurdu.
 *
 * Carpisma: r yaricapli bir seyle (isin bandi, alan halkasi) temas
 * cokgenin r ile Minkowski toplamina (yuvarlak koseli cokgen) karsi, kesin:
 * kenar basina ofset yarim duzlem, kose basina daire. Ucan merminin cizilen
 * govdesi dis bukey parcalarin birlesimi (`projectile-body`): ilk temas
 * parcalarin ve cokgenin koselerinde, kesin. Hesaplar cokgenin kendi
 * cercevesinde (yari kenar = 1) ya da merminin cercevesinde; tahsis yok.
 */
import { TOWER_GRID_SIZE } from "../index.js";
import type { EnemyRace } from "../combat.js";
import { ENEMY_BODY_OUTLINES, type EnemyBodyOutline, type EnemyHitboxArt } from "../enemy-hitboxes.js";
import { getEnemyArt, getEnemyDrawnSide, type EnemyBodyView } from "../enemy-display.js";
import { PROJECTILE_MAX_OFFSETS, prepareProjectileParts, type ProjectilePartTable, type ProjectileShape } from "../projectile-body/index.js";

/* ------------------------------------------------------------------ */
/* Cokgen                                                               */
/* ------------------------------------------------------------------ */

/**
 * Dokunun govde cokgeni, cizilen karenin yari kenarina oranli (dokunun
 * ekseninde: x yana, y ileri), saat yonunun tersine. Kenar `k` koseden
 * `k`den `k + 1`e; normal disa bakiyor, `h` normalin koseye izdusumu (cokgen
 * `n . p <= h` yarim duzlemlerinin kesisimi). Doku basina bir kez kuruluyor;
 * butun dusmanlar paylasiyor.
 */
export type EnemyBodyPolygon = {
  readonly count: number;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly nx: Float64Array;
  readonly ny: Float64Array;
  readonly h: Float64Array;
  readonly ex: Float64Array;
  readonly ey: Float64Array;
  readonly length: Float64Array;
  /** Kare merkezinden en uzak kose (yari kenar = 1): uzamsal sorgu payi. */
  readonly radius: number;
  /** Agirlik merkezi: delme sirasi ve esitlik bozma. */
  readonly centroidX: number;
  readonly centroidY: number;
  /**
   * Kare merkezi (dusmanin konumu) cokgenin icinde mi (butun dokularda evet).
   * Oyleyse konum bir sekle girdiginde govde de degiyor: sorular o durumda
   * cokgene bakmadan kesin evet diyor (vurulanlarin cogu).
   */
  readonly containsOrigin: boolean;
  /**
   * Kare merkezli, cokgenin icinde kalan en buyuk daire (yari kenar = 1; en
   * yakin kenar dogrusu, `min h`). Bu daireye degen sekil govdeye de
   * degiyor: alan halkasi ve bant sorulari cogu adayda kenarlara bakmadan
   * evet diyor. Daire yalnizca merkez icerdeyken var (`containsOrigin`);
   * disaridaysa 0 ve kisa yol hic denenmiyor: yaricapi 0 daire orada
   * "merkeze degen sekil govdeye degiyor" demek olurdu, merkezi disarida
   * kalan cokgende bu yanlis (uzaktaki govde kabul edilirdi).
   */
  readonly inRadius: number;
};

/** Kirpma tamponlarinin tasiyabildigi en fazla kose (uretec 12'de birakiyor; kirpma her kesimde bir ekliyor). */
const MAX_POLYGON_VERTICES = 24;

/** Duz kose listesinden cokgen; dis bukey ve saat yonunun tersine olmali. */
export function createEnemyBodyPolygon(outline: EnemyBodyOutline): EnemyBodyPolygon {
  const count = outline.length / 2;
  if (!(count >= 3) || count > MAX_POLYGON_VERTICES || !Number.isInteger(count)) throw new Error(`govde cokgeni ${count} koseli`);
  const vx = new Float64Array(count);
  const vy = new Float64Array(count);
  const nx = new Float64Array(count);
  const ny = new Float64Array(count);
  const h = new Float64Array(count);
  const ex = new Float64Array(count);
  const ey = new Float64Array(count);
  const length = new Float64Array(count);
  for (let k = 0; k < count; k += 1) {
    vx[k] = outline[2 * k];
    vy[k] = outline[2 * k + 1];
  }
  let radius = 0;
  let area = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let k = 0; k < count; k += 1) {
    const next = (k + 1) % count;
    const dx = vx[next] - vx[k];
    const dy = vy[next] - vy[k];
    const edge = Math.sqrt(dx * dx + dy * dy);
    if (!(edge > 0)) throw new Error("govde cokgeninde sifir uzunlukta kenar");
    ex[k] = dx / edge;
    ey[k] = dy / edge;
    length[k] = edge;
    nx[k] = dy / edge;
    ny[k] = -dx / edge;
    h[k] = nx[k] * vx[k] + ny[k] * vy[k];
    radius = Math.max(radius, Math.sqrt(vx[k] * vx[k] + vy[k] * vy[k]));
    const crossed = vx[k] * vy[next] - vy[k] * vx[next];
    area += crossed;
    centroidX += (vx[k] + vx[next]) * crossed;
    centroidY += (vy[k] + vy[next]) * crossed;
  }
  if (!(area > 0)) throw new Error("govde cokgeni saat yonunun tersine degil");
  for (let k = 0; k < count; k += 1) {
    for (let j = 0; j < count; j += 1) {
      if (nx[k] * vx[j] + ny[k] * vy[j] > h[k] + 1e-9) throw new Error("govde cokgeni dis bukey degil");
    }
  }
  let containsOrigin = true;
  let inRadius = Number.POSITIVE_INFINITY;
  for (let k = 0; k < count; k += 1) {
    if (!(h[k] >= 0)) containsOrigin = false;
    if (h[k] < inRadius) inRadius = h[k];
  }
  return Object.freeze({
    count, vx, vy, nx, ny, h, ex, ey, length, radius,
    centroidX: centroidX / (3 * area),
    centroidY: centroidY / (3 * area),
    containsOrigin,
    inRadius: containsOrigin ? inRadius : 0
  });
}

/** Irk -> tur -> cokgen (ilk istekte kuruluyor; dogumda anahtar dizgisi kurulmuyor). */
const POLYGONS: Partial<Record<EnemyRace, Partial<Record<EnemyHitboxArt, EnemyBodyPolygon>>>> = {};

/** Irk ve govde turunun cokgeni (paylasilan nesne). Bilinmeyen irk meka. */
export function getEnemyBodyPolygon(race: EnemyRace | string | undefined, art: EnemyHitboxArt): EnemyBodyPolygon {
  const key: EnemyRace = race !== undefined && Object.prototype.hasOwnProperty.call(ENEMY_BODY_OUTLINES, race) ? race as EnemyRace : "meka";
  const byArt = POLYGONS[key] ?? (POLYGONS[key] = {});
  return byArt[art] ?? (byArt[art] = createEnemyBodyPolygon(ENEMY_BODY_OUTLINES[key][art]));
}

/* ------------------------------------------------------------------ */
/* Govde nesnesi                                                        */
/* ------------------------------------------------------------------ */

/**
 * Dusmanin govdesi: konum (dokunun merkezi), birim yon, yonun olculdugu son
 * konum, cizilen karenin yari kenari (`scale`: dunya birimi / cokgen birimi),
 * merkezden en uzak noktasi (`reach`, uzamsal sorgu payi) ve cokgen. Dusman
 * basina tek nesne, `createEnemyBody` ile; alanlar hep ayni sirada.
 */
export type EnemyBody = {
  x: number;
  y: number;
  headingX: number;
  headingY: number;
  fromX: number;
  fromY: number;
  scale: number;
  reach: number;
  poly: EnemyBodyPolygon;
};

/**
 * Yonun izi: son yon ve onu olcmek icin bir onceki konum. Onceki konum
 * `NaN` ise yon hic olculmedi (sunucuda telde henuz gorulmemis dusman):
 * ilk guncelleme yalnizca konumu yaziyor, yon dondurulmemis dokuda kaliyor
 * (istemcinin izi dusmani ilk gordugu snapshot'ta ayni sekilde).
 */
export type BodyHeadingState = { headingX: number; headingY: number; fromX: number; fromY: number };

/**
 * Sunucunun simulasyon tiki (ms): oda `setSimulationInterval`a bunu veriyor
 * (Colyseus'un varsayilaniyla ayni, 1000 / 60). Yonun esigi ve istemcide
 * carpmanin ani (`getContactServerTime`) da bununla: tik degisirse hepsi
 * birlikte.
 */
export const SERVER_TICK_MS = 1000 / 60;

/**
 * Snapshot gonderme araligi (ms): 15 kare/sn. Sunucu (`MatchRoom`) bununla
 * gonderiyor (gercek aralik `SNAPSHOT_INTERVAL_MS`).
 *
 * 33 ms (30 Hz) idi. Istemci zaten yarim saniyelik bir oynatma tamponu tutuyor
 * ve iki snapshot arasini aradegerliyor, yani 30 Hz'in verdigi fazladan
 * puruzsuzlugu kimse gormuyordu -- karsiliginda her istemciye giden bant bir
 * kat buyuktu.
 *
 * Deger **60**, 66,67 degil. Aralik tik sinirlarinda kontrol ediliyor ve
 * sunucu 60 Hz kosuyor, yani gercek hiz her zaman bir tik katina yuvarlaniyor:
 * 50 ms uc tike (20 kare/sn), 60 ms dort tike (15 kare/sn), 66,67 ms ise bes
 * tike duserek 12 kare/sn veriyor. Istenen sayiyi yazmak istenen sayiyi
 * vermiyor; kat secmek gerekiyor.
 *
 * Bu, zayif baglantidaki oyuncu icin dogrudan kazanc: gonderilen her bayt onun
 * kuyruguna giriyor ve kuyruktaki her bayt kendi girdisinin gecikmesi demek.
 */
export const SNAPSHOT_SEND_INTERVAL_MS = 60;

/**
 * Gercek snapshot araligi (ms): gonderme araligini (`SNAPSHOT_SEND_INTERVAL_MS`)
 * asan ilk tik kati, 60 ms'de 4 tik (66,67 ms). Yonun esigi ardisik iki
 * snapshot'in saat farkindan (`getSnapshotHeadingMinStep`): bu aralikta 0,4.
 */
export const SNAPSHOT_INTERVAL_MS = Math.ceil(SNAPSHOT_SEND_INTERVAL_MS / SERVER_TICK_MS - 1e-9) * SERVER_TICK_MS;

/** Teldeki konumun adimi (`roundNetworkNumber`, 0,1 birim). */
export const WIRE_POSITION_QUANTUM = 0.1;

/**
 * Yon guncellemesinin yurume esigi (dunya birimi, |dx| + |dy|) sunucunun bir
 * tiki basina: bunun altindaki kipirti (dururken, cok yavasken) yonu
 * degistirmiyor; son yon korunuyor. Esik adimin suresiyle buyuyor
 * (`getBodyHeadingMinStep`).
 */
export const BODY_HEADING_MIN_STEP = 0.05;

/**
 * Telin olu bandi (snapshot adimi basina, |dx| + |dy|): teldeki konum
 * eksen basina 0,1'e yuvarli (`WIRE_POSITION_QUANTUM`), iki yuvarli konumun
 * farki gercek farktan eksen basina en fazla bir adim, toplamda iki adim
 * sapiyor. Bu bandin icindeki adim yonu degistirmiyor (son yon korunuyor):
 * bir iki adimlik farktan son yon alinmiyor, yavas yuruyen ya da duran
 * dusmanin dokusu yuvarlamanin kipirtisiyla donmuyor.
 */
export const BODY_HEADING_WIRE_DEAD_BAND = 2 * WIRE_POSITION_QUANTUM;

/** Hic yurumemis dusmanin yonu: dondurulmemis doku (+y). Istemcide aci 0. */
export const BODY_DEFAULT_HEADING_X = 0;
export const BODY_DEFAULT_HEADING_Y = 1;

/**
 * Donme esigi, gecen `elapsedMs` (sunucu saati) suren bir snapshot adimi
 * icin: yurume esigi o kadar tikte, arti telin olu bandinin tamami
 * (`BODY_HEADING_WIRE_DEAD_BAND`: adimin iki ucu da 0,1'e yuvarli).
 *
 * Sunucu yonu kendi gercek konumlariyla tik tik olcmuyor: snapshot
 * yayininda, istemcinin gordugu girdilerle (0,1'e yuvarli tel konumlari, bu
 * esik, ardisik iki yayinin `serverTime` farki: `getSnapshotHeadingMinStep`)
 * istemcinin iziyle (`EnemyHeadingTracker`) ayni guncellemeyi yapiyor ve iki
 * yayin arasinda yonu tutuyor; doku oynatilan snapshot adiminin bu yonunu
 * ciziyor. Eskiden sunucu gercek konumla tik basina 0,05 esigiyle donuyordu,
 * doku her karede gosterilen konum farkiyla: |dx| + |dy| hizi tik basina
 * 0,05 ile 0,1 arasinda (3-6 birim/sn, Zeynep'in %59-94 yavaslatmasi
 * altindaki yuruyus) sunucu govdeyi ceviriyor, istemcinin yuvarli adimi
 * esigi asmiyor, doku ve iz yavas yuruyus suresince eski yonde kaliyordu
 * (90 derecede govdenin kenari 2-9 birim kayiyordu). Simdi snapshot'lari
 * eksiksiz alan istemcinin izi sunucunun govdesiyle bire bir ayni, doku her
 * snapshot sinirinda. Kalan fark yalnizca snapshot kaciran istemcide (geri
 * basinc atlamasi, kopup gelme): onun adimi iki yayini birden asiyor;
 * sonraki ilk donus adiminda yeniden ayni (sonradan gelen istemcinin yon
 * tohumu: `createStaticEnemySnapshot`). Gecen sure yoksa donus yok.
 */
export function getBodyHeadingMinStep(elapsedMs: number) {
  if (!(elapsedMs > 0)) return Number.POSITIVE_INFINITY;
  return BODY_HEADING_MIN_STEP * (elapsedMs / SERVER_TICK_MS) + BODY_HEADING_WIRE_DEAD_BAND;
}

/**
 * Snapshot'tan snapshot'a adimin esigi: bu snapshot'in `serverTime`i ve bir
 * oncekinin (`undefined`: ilk snapshot, bir tik sayiliyor; saat geri
 * gittiyse de en az bir tik). Sunucunun govdesi (yayinda) ve istemcinin izi
 * (`EnemyHeadingTracker`, gelen snapshot'ta) ayni fonksiyonla: ikisinin
 * yonu bire bir ayni kalsin.
 */
export function getSnapshotHeadingMinStep(serverTime: number, previousServerTime: number | undefined) {
  const elapsed = previousServerTime === undefined ? SERVER_TICK_MS : Math.max(SERVER_TICK_MS, serverTime - previousServerTime);
  return getBodyHeadingMinStep(elapsed);
}

/**
 * Esige esit sayilan pay (dunya birimi). Yuvarli tel konumlarinin farki
 * 0,1'in kati, snapshot adiminin esigi tam 0,4: 0,4'luk adim (4,6 birim/sn
 * kosucu, 6 birim/sn yuruyen) kayan noktanin gurultusuyle (82,4 - 82 =
 * 0,4000000000000057) kimi snapshot'ta esigi asiyor, kimi snapshot'ta
 * asmiyordu: yon yuvarlamanin kipirtisina gore donuyordu. Esitlik (ve payin
 * icindeki fark) hep "donmuyor"; iki yan ayni kuralla.
 */
export const BODY_HEADING_STEP_EPSILON = 1e-9;

/** Adim yonu degistiriyor mu: istemcinin izinin ve sunucunun govdesinin ortak kurali. */
export function isBodyHeadingStep(dx: number, dy: number, minStep: number) {
  return Math.abs(dx) + Math.abs(dy) > minStep + BODY_HEADING_STEP_EPSILON;
}

/** Dokunun donusu (radyan) bu yon icin: +y ekseni yon, yani atan2 - 90 derece. */
export function getBodyHeadingRotation(headingX: number, headingY: number) {
  return Math.atan2(headingY, headingX) - Math.PI / 2;
}

/**
 * Govdenin olcusunu `out`a yazar (cokgen, cizilen karenin yarisi, en uzak
 * nokta); `reach`i dondurur. Sunucu dogumda ve ruh cekici buyudugunde,
 * istemci secim ve tanima aninda cagiriyor.
 */
export function writeEnemyBodyShape(out: EnemyBody, view: EnemyBodyView, cellSize = TOWER_GRID_SIZE) {
  const poly = getEnemyBodyPolygon(view.race, getEnemyArt(view.type, view.special));
  const scale = getEnemyDrawnSide(view, cellSize) / 2;
  out.poly = poly;
  out.scale = scale;
  out.reach = scale * poly.radius;
  return out.reach;
}

/** Yeni govde nesnesi (dogumda bir kez): yon dondurulmemis doku. */
export function createEnemyBody(view: EnemyBodyView, cellSize: number, x: number, y: number): EnemyBody {
  const body: EnemyBody = {
    x,
    y,
    headingX: BODY_DEFAULT_HEADING_X,
    headingY: BODY_DEFAULT_HEADING_Y,
    fromX: x,
    fromY: y,
    scale: 1,
    reach: 0,
    poly: getEnemyBodyPolygon(view.race, getEnemyArt(view.type, view.special))
  };
  writeEnemyBodyShape(body, view, cellSize);
  return body;
}

/**
 * Dikdortgen levha, govde biciminde (`EnemyBody`): atis kesen engelin
 * cizilen yuzu (meka kalkaninin govdesi ve kenar cizgileri, siperin on
 * cizgisi). Merkezi `cx, cy`; uzun ekseni birim `tx, ty` boyunca
 * `halfLength`, normali boyunca `halfThickness`. Ucan merminin cizilen
 * govdesinin levhaya ilk temasi dusman govdesiyle ayni kesin hesap
 * (`getMovingBodyContact`): uclar ve koseler dahil, merminin parcalari ve
 * diski kesik. Cokgen dunya biriminde (olcek 1), cokgenin +x'i `t`, +y'si
 * (yon) normal `(-ty, tx)`. Engel basina bir kez; ilerleyen engelde
 * (siper) yalnizca merkez yaziliyor. Boyu ya da kalinligi sifirsa
 * `undefined` (cizilmeyen levha atis kesmiyor).
 */
export function createPlateBody(cx: number, cy: number, tx: number, ty: number, halfLength: number, halfThickness: number): EnemyBody | undefined {
  if (!(halfLength > 0) || !(halfThickness > 0)) return undefined;
  return createPlateOutlineBody(cx, cy, tx, ty, [-halfLength, -halfThickness, halfLength, -halfThickness, halfLength, halfThickness, -halfLength, halfThickness]);
}

/**
 * Levhanin genel bicimi: dis bukey cizilen parca (siperin direkleri),
 * `outline` levhanin cercevesinde `[t, normal]` ciftleri, saat yonunun
 * tersine. Merkez `cx, cy` cercevenin kokeni. Yonu yoksa `undefined`.
 */
export function createPlateOutlineBody(cx: number, cy: number, tx: number, ty: number, outline: EnemyBodyOutline): EnemyBody | undefined {
  if (!(tx * tx + ty * ty > 0)) return undefined;
  const inverse = 1 / Math.sqrt(tx * tx + ty * ty);
  const ax = tx * inverse;
  const ay = ty * inverse;
  const poly = createEnemyBodyPolygon(outline);
  return {
    x: cx,
    y: cy,
    headingX: -ay,
    headingY: ax,
    fromX: cx,
    fromY: cy,
    scale: 1,
    reach: poly.radius,
    poly
  };
}

/**
 * Yonu konum degisiminden gunceller: istemcinin ve sunucunun ortak kurali
 * (son konumdan bu konuma `minStep`ten buyuk adim varsa yon o adim, yoksa
 * son yon korunuyor). Her cagrida "son konum" yaziliyor; son konum `NaN`
 * ise (hic olculmedi) adim yok, yalnizca konum yaziliyor. Yurume, itme,
 * geri yurume (Melis'in olusu) hepsi ayni: istemci hepsinde dokuyu
 * ceviriyor. Tahsis yok; adim varsa bir karekok. Esik adimin suresinden
 * (`getSnapshotHeadingMinStep`).
 */
export function updateBodyHeading(state: BodyHeadingState, x: number, y: number, minStep: number) {
  const dx = x - state.fromX;
  const dy = y - state.fromY;
  state.fromX = x;
  state.fromY = y;
  if (!isBodyHeadingStep(dx, dy, minStep)) return false;
  const inverse = 1 / Math.sqrt(dx * dx + dy * dy);
  state.headingX = dx * inverse;
  state.headingY = dy * inverse;
  return true;
}

/* ------------------------------------------------------------------ */
/* Cercevenin donusumu                                                  */
/* ------------------------------------------------------------------ */

// Cokgenin cercevesi: dokunun +x'i (yana) dunyada (hy, -hx), +y'si (ileri)
// (hx, hy); birim yari kenar (`scale`). Donusum yon korunuyor (determinant
// 1): saat yonunun tersi her iki cercevede ayni.

/** Cokgen cercevesindeki noktanin dunya x'i. */
function worldX(body: EnemyBody, localX: number, localY: number) {
  return body.x + (localX * body.headingY + localY * body.headingX) * body.scale;
}

function worldY(body: EnemyBody, localX: number, localY: number) {
  return body.y + (localY * body.headingY - localX * body.headingX) * body.scale;
}

/** Govdenin (cokgenin agirlik merkezi) dunya konumu. */
export function getBodyCentreX(body: EnemyBody) {
  return worldX(body, body.poly.centroidX, body.poly.centroidY);
}

export function getBodyCentreY(body: EnemyBody) {
  return worldY(body, body.poly.centroidX, body.poly.centroidY);
}

/* ------------------------------------------------------------------ */
/* Cokgen cercevesinde ilkel sorular (yari kenar birimi)                */
/* ------------------------------------------------------------------ */

/** Noktanin cokgene uzakliginin karesi; icerdeyse 0. */
function pointDistanceSq(poly: EnemyBodyPolygon, px: number, py: number) {
  let best = Number.POSITIVE_INFINITY;
  let outside = false;
  for (let k = 0; k < poly.count; k += 1) {
    if (poly.nx[k] * px + poly.ny[k] * py <= poly.h[k]) continue;
    outside = true;
    let t = (px - poly.vx[k]) * poly.ex[k] + (py - poly.vy[k]) * poly.ey[k];
    if (t < 0) t = 0;
    else if (t > poly.length[k]) t = poly.length[k];
    const dx = poly.vx[k] + poly.ex[k] * t - px;
    const dy = poly.vy[k] + poly.ey[k] * t - py;
    const distance = dx * dx + dy * dy;
    if (distance < best) best = distance;
  }
  return outside ? best : 0;
}

/** r yaricapli daire cokgene degiyor mu: kenar ofsetleri erken eliyor, kesin. */
function isPointWithin(poly: EnemyBodyPolygon, px: number, py: number, radius: number) {
  let best = Number.POSITIVE_INFINITY;
  let outside = false;
  for (let k = 0; k < poly.count; k += 1) {
    const side = poly.nx[k] * px + poly.ny[k] * py - poly.h[k];
    if (side > radius) return false;
    if (side <= 0) continue;
    outside = true;
    let t = (px - poly.vx[k]) * poly.ex[k] + (py - poly.vy[k]) * poly.ey[k];
    if (t < 0) t = 0;
    else if (t > poly.length[k]) t = poly.length[k];
    const dx = poly.vx[k] + poly.ex[k] * t - px;
    const dy = poly.vy[k] + poly.ey[k] * t - py;
    const distance = dx * dx + dy * dy;
    if (distance < best) best = distance;
  }
  return !outside || best <= radius * radius;
}

/** Noktanin parcaya uzakliginin karesi. */
function pointSegmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSq : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  return qx * qx + qy * qy;
}

/**
 * Parcanin tamponu (cokgen cercevesinde `ax, ay, bx, by`, yaricap): parca
 * sorulari sayilarini buradan okuyor (cift arguman kutusu yok).
 */
const SEGMENT = new Float64Array(5);

/**
 * Parca (`SEGMENT`) cokgenin `offset` kadar disariya acilmis keskin koseli
 * halini kesiyor mu (Cyrus-Beck). `offset` 0'da cokgenin kendisi.
 */
function segmentHitsOffset(poly: EnemyBodyPolygon, offset: number) {
  const ax = SEGMENT[0];
  const ay = SEGMENT[1];
  const dx = SEGMENT[2] - ax;
  const dy = SEGMENT[3] - ay;
  let enter = 0;
  let exit = 1;
  for (let k = 0; k < poly.count; k += 1) {
    const room = poly.h[k] + offset - (poly.nx[k] * ax + poly.ny[k] * ay);
    const rate = poly.nx[k] * dx + poly.ny[k] * dy;
    if (rate === 0) {
      if (room < 0) return false;
      continue;
    }
    const t = room / rate;
    if (rate > 0) {
      if (t < exit) exit = t;
    } else if (t > enter) {
      enter = t;
    }
    if (enter > exit) return false;
  }
  return true;
}

/** Parcanin (`SEGMENT`) cokgene uzakliginin karesi (kesisiyorsa 0): kose -> parca, uc -> cokgen. */
function segmentDistanceSq(poly: EnemyBodyPolygon) {
  if (segmentHitsOffset(poly, 0)) return 0;
  const ax = SEGMENT[0];
  const ay = SEGMENT[1];
  const bx = SEGMENT[2];
  const by = SEGMENT[3];
  let best = Math.min(pointDistanceSq(poly, ax, ay), pointDistanceSq(poly, bx, by));
  for (let k = 0; k < poly.count; k += 1) {
    const distance = pointSegmentDistanceSq(poly.vx[k], poly.vy[k], ax, ay, bx, by);
    if (distance < best) best = distance;
  }
  return best;
}

/** `SEGMENT` etrafindaki kapsul (yaricap `SEGMENT[4]`) cokgene degiyor mu: keskin ofsetten kacan kesin hayir, yakin olan kesin uzaklikla. */
function isSegmentWithin(poly: EnemyBodyPolygon) {
  const radius = SEGMENT[4];
  if (!segmentHitsOffset(poly, radius)) return false;
  if (!(radius > 0)) return true;
  return segmentDistanceSq(poly) <= radius * radius;
}

/** Kirpmanin iki tamponu (x, y ciftleri): tek is parcacigi, yeniden giris yok. */
const CLIP_A = new Float64Array(2 * (MAX_POLYGON_VERTICES + 8));
const CLIP_B = new Float64Array(2 * (MAX_POLYGON_VERTICES + 8));

/** Cokgeni (`originX, originY` cikarilmis) A tamponuna yazar; kose sayisi. */
function loadClip(poly: EnemyBodyPolygon, originX: number, originY: number) {
  for (let k = 0; k < poly.count; k += 1) {
    CLIP_A[2 * k] = poly.vx[k] - originX;
    CLIP_A[2 * k + 1] = poly.vy[k] - originY;
  }
  return poly.count;
}

/** Dis bukey cokgeni `n . p <= c` yarim duzlemine kirpar (Sutherland-Hodgman); yeni kose sayisi. */
function clipHalfPlane(source: Float64Array, count: number, nx: number, ny: number, c: number, target: Float64Array) {
  if (count === 0) return 0;
  let out = 0;
  let px = source[2 * (count - 1)];
  let py = source[2 * (count - 1) + 1];
  let ps = nx * px + ny * py - c;
  for (let i = 0; i < count; i += 1) {
    const qx = source[2 * i];
    const qy = source[2 * i + 1];
    const qs = nx * qx + ny * qy - c;
    if ((ps <= 0) !== (qs <= 0)) {
      const t = ps / (ps - qs);
      target[2 * out] = px + (qx - px) * t;
      target[2 * out + 1] = py + (qy - py) * t;
      out += 1;
    }
    if (qs <= 0) {
      target[2 * out] = qx;
      target[2 * out + 1] = qy;
      out += 1;
    }
    px = qx;
    py = qy;
    ps = qs;
  }
  return out;
}

/** Kirpilmis cokgenin (tamponda) orijine en yakin ve en uzak noktasinin karesi: `RANGE`a. */
const RANGE = { near: 0, far: 0 };

function writeOriginRange(buffer: Float64Array, count: number) {
  let far = 0;
  let near = Number.POSITIVE_INFINITY;
  let onOrOutside = false;
  for (let i = 0; i < count; i += 1) {
    const ax = buffer[2 * i];
    const ay = buffer[2 * i + 1];
    const distance = ax * ax + ay * ay;
    if (distance > far) far = distance;
    const j = i + 1 === count ? 0 : i + 1;
    const bx = buffer[2 * j];
    const by = buffer[2 * j + 1];
    // Orijin kenarin ic yaninda degilse (saat yonunun tersine cokgende solda
    // degil) o kenarin parcasina uzaklik. Esitlik de sayiliyor: kirpma dar
    // kamada cokgeni orijinden gecen dogruya indirebiliyor, orada butun
    // kenarlar orijinle ayni dogruda ve orijin parcanin disinda olabilir.
    if ((bx - ax) * -ay - (by - ay) * -ax <= 0) {
      onOrOutside = true;
      const edge = pointSegmentDistanceSq(0, 0, ax, ay, bx, by);
      if (edge < near) near = edge;
    }
  }
  RANGE.near = onOrOutside ? near : 0;
  RANGE.far = far;
}

/**
 * Kama ve halkanin tamponu (cokgen cercevesinde): orijin, kamanin basi ve
 * sonu (birim, aci <= 180 derece), halkanin ic ve dis yaricapi.
 */
const WEDGE = new Float64Array(8);

/**
 * Cokgen (orijin `WEDGE[0..1]`e tasinmis) dis bukey kamanin (yon `s`den
 * `e`ye) ve `[inner, outer]` halkasinin kesisimine degiyor mu: kamaya
 * kirpilmis cokgenin orijine uzakliklari o araligi kesiyor mu (kirpilmis
 * cokgen dis bukey ve bagli: uzakliklari bir aralik).
 */
function touchesWedgeRing(poly: EnemyBodyPolygon) {
  const sx = WEDGE[2];
  const sy = WEDGE[3];
  const ex = WEDGE[4];
  const ey = WEDGE[5];
  const inner = WEDGE[6];
  const outer = WEDGE[7];
  let count = loadClip(poly, WEDGE[0], WEDGE[1]);
  // `s`nin solu (saat yonunun tersi) ve `e`nin sagi; ortaortay yarim duzlem
  // dar kamanin karsi isinini disarida birakiyor.
  count = clipHalfPlane(CLIP_A, count, sy, -sx, 0, CLIP_B);
  count = clipHalfPlane(CLIP_B, count, -ey, ex, 0, CLIP_A);
  const bisectorX = sx + ex;
  const bisectorY = sy + ey;
  let buffer = CLIP_A;
  if (bisectorX * bisectorX + bisectorY * bisectorY > 1e-12) {
    count = clipHalfPlane(CLIP_A, count, -bisectorX, -bisectorY, 0, CLIP_B);
    buffer = CLIP_B;
  }
  if (count === 0) return false;
  writeOriginRange(buffer, count);
  return RANGE.far >= inner * inner && RANGE.near <= outer * outer;
}

/** Dis bukey cokgenin (cokgen cercevesinde, herhangi yonde) tamponu: x, y ciftleri. */
const CONVEX = new Float64Array(2 * 8);

/** Govdenin cokgeni ve `CONVEX`teki `count` koseli dis bukey cokgen kesisiyor mu: obur cokgenin yarim duzlemlerine kirpma. */
function touchesConvex(poly: EnemyBodyPolygon, count: number) {
  let orientation = 0;
  for (let i = 2; i < count && orientation === 0; i += 1) {
    orientation = (CONVEX[2] - CONVEX[0]) * (CONVEX[2 * i + 1] - CONVEX[1]) - (CONVEX[3] - CONVEX[1]) * (CONVEX[2 * i] - CONVEX[0]);
  }
  if (orientation === 0) return false;
  const sign = orientation > 0 ? 1 : -1;
  let size = loadClip(poly, 0, 0);
  let source = CLIP_A;
  let target = CLIP_B;
  for (let i = 0; i < count && size > 0; i += 1) {
    const j = i + 1 === count ? 0 : i + 1;
    const ax = CONVEX[2 * i];
    const ay = CONVEX[2 * i + 1];
    const dx = CONVEX[2 * j] - ax;
    const dy = CONVEX[2 * j + 1] - ay;
    // Kenar (a -> b) icin ic yan: saat yonunun tersine cokgende sol.
    size = clipHalfPlane(source, size, sign * dy, -sign * dx, sign * (dy * ax - dx * ay), target);
    const swap = source;
    source = target;
    target = swap;
  }
  return size > 0;
}

/* ------------------------------------------------------------------ */
/* Dunya sorulari                                                       */
/* ------------------------------------------------------------------ */

/**
 * `(px, py)` merkezli `radius` yaricapli daire gorunen govdeye degiyor mu
 * (alan halkasi, dron diski; `radius` 0'da nokta govdenin icinde mi). Daire
 * cokgenin ic dairesine degiyorsa kenarlara bakmadan evet (ic daire yalnizca
 * merkezi icerde olan cokgende: `containsOrigin`).
 */
export function isPointInBody(body: EnemyBody, px: number, py: number, radius = 0) {
  const dx = px - body.x;
  const dy = py - body.y;
  const reach = body.reach + radius;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq > reach * reach) return false;
  if (body.poly.containsOrigin) {
    const core = radius + body.poly.inRadius * body.scale;
    if (distanceSq <= core * core) return true;
  }
  const inverse = 1 / body.scale;
  const hx = body.headingX;
  const hy = body.headingY;
  return isPointWithin(body.poly, (dx * hy - dy * hx) * inverse, (dx * hx + dy * hy) * inverse, radius * inverse);
}

/** Noktanin govdenin kenarina uzakligi (dunya birimi; icerde de, disarida da pozitif). */
export function getBodyEdgeDistance(body: EnemyBody, px: number, py: number) {
  const dx = px - body.x;
  const dy = py - body.y;
  const hx = body.headingX;
  const hy = body.headingY;
  const inverse = 1 / body.scale;
  const lx = (dx * hy - dy * hx) * inverse;
  const ly = (dx * hx + dy * hy) * inverse;
  const outside = pointDistanceSq(body.poly, lx, ly);
  if (outside > 0) return Math.sqrt(outside) * body.scale;
  // Icerde: en yakin kenar dogrusu (dis bukey cokgende en kucuk ic uzaklik).
  const poly = body.poly;
  let inner = Number.POSITIVE_INFINITY;
  for (let k = 0; k < poly.count; k += 1) {
    const gap = poly.h[k] - (poly.nx[k] * lx + poly.ny[k] * ly);
    if (gap < inner) inner = gap;
  }
  return inner * body.scale;
}

/**
 * Parca (x1,y1)-(x2,y2) etrafindaki `radius` yaricapli kapsul gorunen
 * govdeye degiyor mu (parcanin govdeye uzakligi <= radius).
 */
export function isSegmentTouchingBody(body: EnemyBody, x1: number, y1: number, x2: number, y2: number, radius = 0) {
  const reach = body.reach + radius;
  const distanceSq = pointSegmentDistanceSq(body.x, body.y, x1, y1, x2, y2);
  if (distanceSq > reach * reach) return false;
  // Ic daire yalnizca merkezi icerde olan cokgende (`inRadius`).
  if (body.poly.containsOrigin) {
    const core = radius + body.poly.inRadius * body.scale;
    if (distanceSq <= core * core) return true;
  }
  const inverse = 1 / body.scale;
  const hx = body.headingX;
  const hy = body.headingY;
  const ax = x1 - body.x;
  const ay = y1 - body.y;
  const bx = x2 - body.x;
  const by = y2 - body.y;
  SEGMENT[0] = (ax * hy - ay * hx) * inverse;
  SEGMENT[1] = (ax * hx + ay * hy) * inverse;
  SEGMENT[2] = (bx * hy - by * hx) * inverse;
  SEGMENT[3] = (bx * hx + by * hy) * inverse;
  SEGMENT[4] = radius * inverse;
  return isSegmentWithin(body.poly);
}

/**
 * Isin bandi: iki uc arasi, yari genislik `halfWidth`, uclari kesik (cizilen
 * isin: dikdortgen). Sicak yollar (yanik zemin, isin) bandi bir kez
 * yaziyor, aday basina yalnizca govdeyi veriyor.
 */
export type BodyBand = { x1: number; y1: number; x2: number; y2: number; halfWidth: number };

export function createBodyBand(): BodyBand {
  return { x1: 0, y1: 0, x2: 0, y2: 0, halfWidth: 0 };
}

const BAND = createBodyBand();

/**
 * Bant gorunen govdeye degiyor mu. Ayirici eksen: bandin iki ekseni ve
 * cokgenin kenar normalleri; kesin, karekok bir tane. Cokgenin ic dairesi
 * banda degiyorsa (cogu aday) eksenlere bakmadan evet. Boyu sifir bant
 * (yonu yok) `halfWidth` yaricapli daire: sonuc dusmanin yonune bagli degil.
 */
export function isBodyTouchingBandShape(body: EnemyBody, band: BodyBand) {
  const x1 = band.x1;
  const y1 = band.y1;
  const x2 = band.x2;
  const y2 = band.y2;
  const halfWidth = band.halfWidth;
  const reach = body.reach + halfWidth;
  if (pointSegmentDistanceSq(body.x, body.y, x1, y1, x2, y2) > reach * reach) return false;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const spanSq = dx * dx + dy * dy;
  if (!(spanSq > 1e-18)) return isPointInBody(body, x1, y1, halfWidth);
  const span = Math.sqrt(spanSq);
  const poly = body.poly;
  // Ic daire bandin dikdortgenine degiyor mu: merkezin dikdortgene uzakligi
  // <= ic yaricap (ic daire yalnizca merkezi icerde olan cokgende).
  if (poly.containsOrigin) {
    const along = ((body.x - x1) * dx + (body.y - y1) * dy) / span;
    const across = Math.abs((body.x - x1) * dy - (body.y - y1) * dx) / span;
    const outAlong = along < 0 ? -along : along > span ? along - span : 0;
    const outAcross = across > halfWidth ? across - halfWidth : 0;
    const core = poly.inRadius * body.scale;
    if (outAlong * outAlong + outAcross * outAcross <= core * core) return true;
  }
  const inverse = 1 / body.scale;
  const hx = body.headingX;
  const hy = body.headingY;
  const mx = (x1 + x2) / 2 - body.x;
  const my = (y1 + y2) / 2 - body.y;
  const cx = (mx * hy - my * hx) * inverse;
  const cy = (mx * hx + my * hy) * inverse;
  const ux = (dx * hy - dy * hx) / span;
  const uy = (dx * hx + dy * hy) / span;
  const vx = -uy;
  const vy = ux;
  const halfLength = (span / 2) * inverse;
  const halfSide = halfWidth * inverse;
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < poly.count; k += 1) {
    const px = poly.vx[k] - cx;
    const py = poly.vy[k] - cy;
    const a = px * ux + py * uy;
    const b = px * vx + py * vy;
    if (a < minU) minU = a;
    if (a > maxU) maxU = a;
    if (b < minV) minV = b;
    if (b > maxV) maxV = b;
  }
  if (minU > halfLength || maxU < -halfLength || minV > halfSide || maxV < -halfSide) return false;
  for (let k = 0; k < poly.count; k += 1) {
    const nx = poly.nx[k];
    const ny = poly.ny[k];
    const near = nx * cx + ny * cy - halfLength * Math.abs(nx * ux + ny * uy) - halfSide * Math.abs(nx * vx + ny * vy);
    if (near > poly.h[k]) return false;
  }
  return true;
}

/** `isBodyTouchingBandShape`, sayilarla (seyrek cagrilar ve testler). */
export function isBandTouchingBody(body: EnemyBody, x1: number, y1: number, x2: number, y2: number, halfWidth: number) {
  BAND.x1 = x1;
  BAND.y1 = y1;
  BAND.x2 = x2;
  BAND.y2 = y2;
  BAND.halfWidth = halfWidth;
  return isBodyTouchingBandShape(body, BAND);
}

/**
 * Kama: orijin `x, y`; yon `start`tan `end`e (birim), aci `sweep` radyan,
 * saat yonunun tersine; yaricap `[inner, outer]`. Supurulen dilimde
 * (`isBodyTouchingSweepShape`) `inflate` kadar sisirilmis `[0, outer]`.
 * Kin dalgasinin yayi, Debug Laser supurmesi, koni sorgusu, yorunge
 * bicaginin taradigi halka. Cagiran tek nesneye yaziyor (`createBodySector`),
 * aday basina yalnizca govdeyi veriyor.
 */
export type BodySector = {
  x: number;
  y: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  sweep: number;
  inner: number;
  outer: number;
  inflate: number;
};

export function createBodySector(): BodySector {
  return { x: 0, y: 0, startX: 1, startY: 0, endX: 1, endY: 0, sweep: 0, inner: 0, outer: 0, inflate: 0 };
}

/**
 * Bu acidan kucuk kama tek bir isin: kirpma sifir alanli kamada yuvarlama
 * isaretine bagli kaliyordu; isin parcasi kesin (1000 birimde 0,0001).
 */
const SWEEP_EPSILON = 1e-7;

/**
 * Kamanin ve halkanin kesisimi gorunen govdeye degiyor mu. Govdenin sinir
 * dairesi erken eliyor ya da kabul ediyor; kalan adaylarda cokgen kamaya
 * kirpiliyor (180 dereceden genis kama iki yarida), kirpilmisin orijine en
 * yakin ve en uzak noktasi halkayla karsilastiriliyor. Kesin; tahsis yok.
 * Acisi sifir kama `[inner, outer]` isin parcasi.
 */
export function isBodyTouchingSectorShape(body: EnemyBody, sector: BodySector) {
  const px = sector.x;
  const py = sector.y;
  const startX = sector.startX;
  const startY = sector.startY;
  const endX = sector.endX;
  const endY = sector.endY;
  const sweep = sector.sweep;
  const inner = sector.inner;
  const outer = sector.outer;
  const cx = body.x - px;
  const cy = body.y - py;
  const reach = body.reach;
  const distanceSq = cx * cx + cy * cy;
  const far = outer + reach;
  if (distanceSq > far * far) return false;
  if (inner > reach) {
    const near = inner - reach;
    if (distanceSq < near * near) return false;
  }
  if (!(sweep > SWEEP_EPSILON)) {
    return isSegmentTouchingBody(body, px + startX * inner, py + startY * inner, px + startX * outer, py + startY * outer, 0);
  }
  const fromStart = startX * cy - startY * cx;
  const toEnd = cx * endY - cy * endX;
  // Konum bolgenin icinde: govde de degiyor.
  if (body.poly.containsOrigin && distanceSq >= inner * inner && distanceSq <= outer * outer
    && (sweep <= Math.PI ? fromStart >= 0 && toEnd >= 0 && cx * (startX + endX) + cy * (startY + endY) >= 0 : fromStart >= 0 || toEnd >= 0)) {
    return true;
  }
  if (sweep <= Math.PI) {
    if (fromStart < -reach || toEnd < -reach) return false;
    // Sinir dairesi tumuyle icerde.
    if (fromStart >= reach && toEnd >= reach && cx * (startX + endX) + cy * (startY + endY) >= 0) {
      const distance = Math.sqrt(distanceSq);
      if (distance - reach >= inner && distance + reach <= outer) return true;
    }
  }
  const poly = body.poly;
  const inverse = 1 / body.scale;
  const hx = body.headingX;
  const hy = body.headingY;
  // Orijin cokgen cercevesinde; yonler donuyor, olcek yok.
  WEDGE[0] = (-cx * hy + cy * hx) * inverse;
  WEDGE[1] = (-cx * hx - cy * hy) * inverse;
  const sx = startX * hy - startY * hx;
  const sy = startX * hx + startY * hy;
  const ex = endX * hy - endY * hx;
  const ey = endX * hx + endY * hy;
  WEDGE[6] = inner * inverse;
  WEDGE[7] = outer * inverse;
  if (sweep <= Math.PI) {
    WEDGE[2] = sx;
    WEDGE[3] = sy;
    WEDGE[4] = ex;
    WEDGE[5] = ey;
    return touchesWedgeRing(poly);
  }
  // Genis kama: ortadaki yonden iki yari.
  const half = sweep / 2;
  const c = Math.cos(half);
  const s = Math.sin(half);
  const mx = sx * c - sy * s;
  const my = sx * s + sy * c;
  WEDGE[2] = sx;
  WEDGE[3] = sy;
  WEDGE[4] = mx;
  WEDGE[5] = my;
  if (touchesWedgeRing(poly)) return true;
  WEDGE[2] = mx;
  WEDGE[3] = my;
  WEDGE[4] = ex;
  WEDGE[5] = ey;
  return touchesWedgeRing(poly);
}

/**
 * Donen ya da yayilan bir isinin (orijin, yon `start`tan `end`e, aci
 * `sweep`, boy `outer`) taradigi dilim, `inflate` kadar sisirilmis
 * (dilimin `inflate` yaricapli daireyle Minkowski toplami), gorunen govdeye
 * degiyor mu. Debug Laser supurmesi, koni sorgusu.
 *
 * Kesin: govde dilimin kenar parcalarindan birine `inflate` kadar yakin ya
 * da dilimin acisinda ve `[0, outer + inflate]` uzakliginda (yay da o
 * aralikta: yaya `inflate` kadar yakin nokta ya acida ya da yayin ucundaki
 * kenar parcasinin yakininda). Acisi sifir dilim `inflate` yaricapli kapsul.
 */
export function isBodyTouchingSweepShape(body: EnemyBody, sector: BodySector) {
  const px = sector.x;
  const py = sector.y;
  const length = sector.outer;
  const inflate = sector.inflate;
  const cx = body.x - px;
  const cy = body.y - py;
  const far = length + inflate + body.reach;
  if (cx * cx + cy * cy > far * far) return false;
  if (!(sector.sweep > SWEEP_EPSILON)) return isSegmentTouchingBody(body, px, py, px + sector.startX * length, py + sector.startY * length, inflate);
  if (inflate > 0) {
    if (isSegmentTouchingBody(body, px, py, px + sector.startX * length, py + sector.startY * length, inflate)) return true;
    if (isSegmentTouchingBody(body, px, py, px + sector.endX * length, py + sector.endY * length, inflate)) return true;
  }
  const inner = sector.inner;
  const outer = sector.outer;
  sector.inner = 0;
  sector.outer = length + inflate;
  const touched = isBodyTouchingSectorShape(body, sector);
  sector.inner = inner;
  sector.outer = outer;
  return touched;
}

/**
 * Dunyada dis bukey bir cokgen (en fazla 8 kose; herhangi yonde) ve sinir
 * dairesi (`cx, cy, radius`): yorunge bicagi. Cagiran tek nesneye yaziyor.
 */
export type BodyConvex = { count: number; readonly x: Float64Array; readonly y: Float64Array; cx: number; cy: number; radius: number };

export function createBodyConvex(): BodyConvex {
  return { count: 0, x: new Float64Array(8), y: new Float64Array(8), cx: 0, cy: 0, radius: 0 };
}

/** Koselerden sinir dairesi (agirlik merkezi ve en uzak kose). */
export function updateBodyConvexBounds(shape: BodyConvex) {
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < shape.count; i += 1) {
    cx += shape.x[i];
    cy += shape.y[i];
  }
  cx /= Math.max(1, shape.count);
  cy /= Math.max(1, shape.count);
  let radius = 0;
  for (let i = 0; i < shape.count; i += 1) radius = Math.max(radius, Math.hypot(shape.x[i] - cx, shape.y[i] - cy));
  shape.cx = cx;
  shape.cy = cy;
  shape.radius = radius;
}

/** Gorunen govde dunyadaki dis bukey cokgene degiyor mu: kesin (kirpma). */
export function isBodyTouchingConvexShape(body: EnemyBody, shape: BodyConvex) {
  const dx = body.x - shape.cx;
  const dy = body.y - shape.cy;
  const far = body.reach + shape.radius;
  if (dx * dx + dy * dy > far * far) return false;
  const inverse = 1 / body.scale;
  const hx = body.headingX;
  const hy = body.headingY;
  for (let i = 0; i < shape.count; i += 1) {
    const ax = shape.x[i] - body.x;
    const ay = shape.y[i] - body.y;
    CONVEX[2 * i] = (ax * hy - ay * hx) * inverse;
    CONVEX[2 * i + 1] = (ax * hx + ay * hy) * inverse;
  }
  return touchesConvex(body.poly, shape.count);
}

/** Govdenin birim `u` uzerindeki izdusumunun en kucugu (dunya koordinatinda, orijinden). */
export function getBodyProjectionMin(body: EnemyBody, ux: number, uy: number) {
  const poly = body.poly;
  const lx = (ux * body.headingY - uy * body.headingX) * body.scale;
  const ly = (ux * body.headingX + uy * body.headingY) * body.scale;
  let best = Number.POSITIVE_INFINITY;
  for (let k = 0; k < poly.count; k += 1) {
    const value = poly.vx[k] * lx + poly.vy[k] * ly;
    if (value < best) best = value;
  }
  return body.x * ux + body.y * uy + best;
}

/** Govdenin birim `u` uzerindeki izdusumunun en buyugu. */
export function getBodyProjectionMax(body: EnemyBody, ux: number, uy: number) {
  return -getBodyProjectionMin(body, -ux, -uy);
}

/* ------------------------------------------------------------------ */
/* Kin dalgasi ve Kin gosterisi: cizildikleri sekil                     */
/* ------------------------------------------------------------------ */

/**
 * Kin dalgasinin vurdugu yer, cizildigi gibi (combat-vfx
 * `drawPressureWave`): orijinden on kenara (isinin gorunen boyu) yay, yari
 * aci `atan2(width / 2, front)`; yayin cizilen kalinligi kadar (on cizginin
 * yarisi onde, arkasindaki dolu cizgiler geride; zeynep-shots
 * `getKinWaveBandAhead` / `getKinWaveBandBehind`). Isinin telden gelen
 * sayilarindan (sunucu ayni sayilari teldeki yuvarlamayla kullaniyor).
 */
export type KinWaveSector = BodySector;

export const createKinWaveSector = createBodySector;

/**
 * Isinin uclarindan ve genisliginden dalganin yayi (`out`a): `behind` on
 * kenarin gerisi, `ahead` onu (dunya birimi). On kenar 1 birimden kisa ise
 * (cizilmiyor) false.
 */
export function writeKinWaveSector(out: BodySector, x1: number, y1: number, x2: number, y2: number, width: number, behind: number, ahead: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const front = Math.sqrt(dx * dx + dy * dy);
  if (front < 1) return false;
  const ux = dx / front;
  const uy = dy / front;
  const half = Math.atan2(width / 2, front);
  const c = Math.cos(half);
  const s = Math.sin(half);
  out.x = x1;
  out.y = y1;
  out.startX = ux * c + uy * s;
  out.startY = uy * c - ux * s;
  out.endX = ux * c - uy * s;
  out.endY = uy * c + ux * s;
  out.sweep = 2 * half;
  out.inner = Math.max(0, front - behind);
  out.outer = front + ahead;
  out.inflate = 0;
  return true;
}

/** Govde dalganin cizilen yayina (bandina) degiyor mu. */
export function isBodyTouchingKinWave(body: EnemyBody, sector: BodySector) {
  return isBodyTouchingSectorShape(body, sector);
}

/**
 * Kin gosterisinin vurdugu ucgen, cizildigi gibi (beam-renderer
 * `drawKinShowcaseLight`): tepe isinin basi, uzak kenar isinin ucunda,
 * koseleri uca dik `width / 2` uzaklikta (duz uzak kenarli ucgen). Kenarlarin
 * ice bakan birim normalleri ve uzakliklari onceden: aday basina merkezin
 * uc kenara uzakligi, gerekirse kirpma.
 */
export type BodyTriangle = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  /** Tepeden en uzak kose (sinir dairesi tepede). */
  radius: number;
  /** Kenarlarin ice bakan birim normalleri ve `n . p <= d` sinirlari (ic: d - n . p >= 0). */
  n0x: number;
  n0y: number;
  d0: number;
  n1x: number;
  n1y: number;
  d1: number;
  n2x: number;
  n2y: number;
  d2: number;
};

export function createBodyTriangle(): BodyTriangle {
  return { ax: 0, ay: 0, bx: 0, by: 0, cx: 0, cy: 0, radius: 0, n0x: 0, n0y: 0, d0: 0, n1x: 0, n1y: 0, d1: 0, n2x: 0, n2y: 0, d2: 0 };
}

/** Isinin sayilarindan gosterinin ucgeni (`out`a); boy 1'den kisaysa false (cizilmiyor). */
export function writeKinShowcaseTriangle(out: BodyTriangle, x1: number, y1: number, x2: number, y2: number, width: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const range = Math.sqrt(dx * dx + dy * dy);
  if (range < 1) return false;
  const spread = width / 2;
  const nx = (-dy / range) * spread;
  const ny = (dx / range) * spread;
  // Saat yonunun tersine: tepe, ucun sagi, ucun solu.
  out.ax = x1;
  out.ay = y1;
  out.bx = x2 - nx;
  out.by = y2 - ny;
  out.cx = x2 + nx;
  out.cy = y2 + ny;
  out.radius = Math.sqrt(range * range + spread * spread);
  // Yon tersine donmusse (genislik eksi) koseleri degistir: ucgen saat yonunun tersine kalsin.
  if ((out.bx - out.ax) * (out.cy - out.ay) - (out.by - out.ay) * (out.cx - out.ax) < 0) {
    const bx = out.bx;
    const by = out.by;
    out.bx = out.cx;
    out.by = out.cy;
    out.cx = bx;
    out.cy = by;
  }
  // Saat yonunun tersine ucgende ic yan solda: kenarin (a -> b) dis normali (ey, -ex) / boy.
  let ex = out.bx - out.ax;
  let ey = out.by - out.ay;
  let length = Math.sqrt(ex * ex + ey * ey);
  out.n0x = ey / length;
  out.n0y = -ex / length;
  out.d0 = out.n0x * out.ax + out.n0y * out.ay;
  ex = out.cx - out.bx;
  ey = out.cy - out.by;
  length = Math.sqrt(ex * ex + ey * ey);
  out.n1x = ey / length;
  out.n1y = -ex / length;
  out.d1 = out.n1x * out.bx + out.n1y * out.by;
  ex = out.ax - out.cx;
  ey = out.ay - out.cy;
  length = Math.sqrt(ex * ex + ey * ey);
  out.n2x = ey / length;
  out.n2y = -ex / length;
  out.d2 = out.n2x * out.cx + out.n2y * out.cy;
  return true;
}

/**
 * Govde ucgene degiyor mu: sinir dairesi bir kenarin tumuyle disindaysa hic,
 * uc kenarin da icindeyse (en az erisim kadar) ya da kare merkezi ucgendeyse
 * evet; kalan adaylarda cokgen ucgenin uc yarim duzlemine kirpiliyor. Kesin.
 */
export function isBodyInTriangle(body: EnemyBody, tri: BodyTriangle) {
  const reach = body.reach;
  const ax = body.x - tri.ax;
  const ay = body.y - tri.ay;
  const far = tri.radius + reach;
  if (ax * ax + ay * ay > far * far) return false;
  const e0 = tri.d0 - (tri.n0x * body.x + tri.n0y * body.y);
  const e1 = tri.d1 - (tri.n1x * body.x + tri.n1y * body.y);
  const e2 = tri.d2 - (tri.n2x * body.x + tri.n2y * body.y);
  if (e0 < -reach || e1 < -reach || e2 < -reach) return false;
  if (e0 >= reach && e1 >= reach && e2 >= reach) return true;
  if (e0 >= 0 && e1 >= 0 && e2 >= 0 && body.poly.containsOrigin) return true;
  const inverse = 1 / body.scale;
  const hx = body.headingX;
  const hy = body.headingY;
  const px = tri.ax - body.x;
  const py = tri.ay - body.y;
  const qx = tri.bx - body.x;
  const qy = tri.by - body.y;
  const rx = tri.cx - body.x;
  const ry = tri.cy - body.y;
  CONVEX[0] = (px * hy - py * hx) * inverse;
  CONVEX[1] = (px * hx + py * hy) * inverse;
  CONVEX[2] = (qx * hy - qy * hx) * inverse;
  CONVEX[3] = (qx * hx + qy * hy) * inverse;
  CONVEX[4] = (rx * hy - ry * hx) * inverse;
  CONVEX[5] = (rx * hx + ry * hy) * inverse;
  return touchesConvex(body.poly, 3);
}

const TRIANGLE = createBodyTriangle();

/**
 * Kin gosterisi gorunen govdeye degiyor mu, isinin sayilariyla (istemcinin
 * spot isigi, testler). Sunucunun hedef secimi ucgeni yon basina bir kez
 * yaziyor (`writeKinShowcaseTriangle`, `isBodyInTriangle`).
 */
export function isBodyInKinShowcase(body: EnemyBody, x1: number, y1: number, x2: number, y2: number, width: number) {
  if (!writeKinShowcaseTriangle(TRIANGLE, x1, y1, x2, y2, width)) return false;
  return isBodyInTriangle(body, TRIANGLE);
}

/* ------------------------------------------------------------------ */
/* Ucan mermi                                                           */
/* ------------------------------------------------------------------ */

/**
 * Kirpilmis bir cokgenin (tamponda) noktaya uzakliginin karesi (icerdeyse 0).
 * Dis bukey, saat yonunun tersine.
 */
function bufferPointDistanceSq(buffer: Float64Array, count: number, px: number, py: number) {
  let best = Number.POSITIVE_INFINITY;
  let onOrOutside = false;
  for (let i = 0; i < count; i += 1) {
    const ax = buffer[2 * i];
    const ay = buffer[2 * i + 1];
    const j = i + 1 === count ? 0 : i + 1;
    const bx = buffer[2 * j];
    const by = buffer[2 * j + 1];
    if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) <= 0) {
      onOrOutside = true;
      const edge = pointSegmentDistanceSq(px, py, ax, ay, bx, by);
      if (edge < best) best = edge;
    }
  }
  return onOrOutside ? best : 0;
}

/** Isinin (o + t u) cokgene giris parametresi (Cyrus-Beck); kesmiyorsa `Infinity`. */
function rayPolygonEntry(poly: EnemyBodyPolygon, ox: number, oy: number, ux: number, uy: number) {
  let enter = Number.NEGATIVE_INFINITY;
  let exit = Number.POSITIVE_INFINITY;
  for (let k = 0; k < poly.count; k += 1) {
    const room = poly.h[k] - (poly.nx[k] * ox + poly.ny[k] * oy);
    const rate = poly.nx[k] * ux + poly.ny[k] * uy;
    if (rate === 0) {
      if (room < 0) return Number.POSITIVE_INFINITY;
      continue;
    }
    const t = room / rate;
    if (rate > 0) {
      if (t < exit) exit = t;
    } else if (t > enter) {
      enter = t;
    }
  }
  return enter <= exit ? enter : Number.POSITIVE_INFINITY;
}

/**
 * On diski kesilmis kapsulun (disk `wide`da, yaricap `radius`, `-reach`in
 * gerisi yok) ilk temas yolu (cokgen birimi); temas yoksa -1. Dogrunun
 * keskin ofsetle kesistigi zaten bilinen adaylarda calisiyor.
 *
 * Kesilmis disk dis bukey bir "D": on yayi ve kesim kirisi. Ileri giderken
 * ilk temas on yayda, yay ile kirisin koselerinde ya da hic: tikin basinda
 * degmiyorsa cokgen ortak yanallarin hepsinde onde (ya da hepsinde arkada),
 * temas yolu yanala gore dis bukey bir fonksiyon. En kucugu ya bir
 * kosenin yaya degdigi yanalda, ya bir kenarin diske teget oldugu yanalda,
 * ya da kirisin ucundaki kosede; uc aday da deneniyor (kesin).
 */
function getClippedDiscContact(poly: EnemyBodyPolygon, fx: number, fy: number, ux: number, uy: number, wide: number, radius: number, reach: number) {
  // Kirisin diskin merkezine gore yeri (ucus yonunde). Kiris merkezin
  // gerisindeyse on yay butun yanallarda (en genis yer merkezde) duruyor,
  // ilk temas kesilmemis diskinkiyle ayni yerde; onundeyse yay kirisin yari
  // boyu kadar yanalda bitiyor ve ilk temas kirisin uclarinda da olabilir.
  const chord = -reach - wide;
  if (chord >= radius) return -1;
  const ahead = chord > 0;
  const half = ahead ? Math.sqrt(radius * radius - chord * chord) : radius;
  const vx = -uy;
  const vy = ux;
  const cx = fx + ux * wide;
  const cy = fy + uy * wide;
  // Tikin basinda degiyor mu: cokgenin kesimin onundeki kismi diske degiyor mu.
  let count = loadClip(poly, 0, 0);
  count = clipHalfPlane(CLIP_A, count, -ux, -uy, reach - (ux * fx + uy * fy), CLIP_B);
  if (count > 0 && bufferPointDistanceSq(CLIP_B, count, cx, cy) <= radius * radius) return 0;
  let best = Number.POSITIVE_INFINITY;
  // Kose yaya degiyor (yanali kirisin icinde).
  for (let k = 0; k < poly.count; k += 1) {
    const rx = poly.vx[k] - cx;
    const ry = poly.vy[k] - cy;
    const side = rx * vx + ry * vy;
    if (side > half || side < -half) continue;
    const t = rx * ux + ry * uy - Math.sqrt(radius * radius - side * side);
    if (t < best) best = t;
  }
  // Kenar diske teget (teget noktasi yayda ve kenarin uzerinde).
  for (let k = 0; k < poly.count; k += 1) {
    const rate = poly.nx[k] * ux + poly.ny[k] * uy;
    if (!(rate < 0)) continue;
    const side = -radius * (poly.nx[k] * vx + poly.ny[k] * vy);
    if (side > half || side < -half) continue;
    const t = (poly.h[k] + radius - (poly.nx[k] * cx + poly.ny[k] * cy)) / rate;
    const qx = cx + ux * t - radius * poly.nx[k];
    const qy = cy + uy * t - radius * poly.ny[k];
    const along = (qx - poly.vx[k]) * poly.ex[k] + (qy - poly.vy[k]) * poly.ey[k];
    if (along < 0 || along > poly.length[k]) continue;
    if (t < best) best = t;
  }
  // Kirisin uclari (kiris onde iken yayin bittigi koseler).
  if (ahead) {
    const backX = fx - ux * reach;
    const backY = fy - uy * reach;
    const left = rayPolygonEntry(poly, backX + vx * half, backY + vy * half, ux, uy);
    if (left < best) best = left;
    const right = rayPolygonEntry(poly, backX - vx * half, backY - vy * half, ux, uy);
    if (right < best) best = right;
  }
  // Degmiyor ve cokgen arkada: adaylar eksi.
  return best >= 0 && best !== Number.POSITIVE_INFINITY ? best : -1;
}

/**
 * Keskin ofsetle bulunan kesisimin (`t`, kenar `edge`) yuvarlak koseli
 * cokgende karsiligi: seritteyse ayni, cikintidaysa kosenin dairesi (giriste
 * kucuk kok, `direction` -1; cikista buyuk kok, 1). Daireye degmiyorsa
 * girise `Infinity`, cikisa `-Infinity`.
 */
function resolveRoundedCrossing(poly: EnemyBodyPolygon, fx: number, fy: number, ux: number, uy: number, radius: number, t: number, edge: number, direction: -1 | 1) {
  if (!(radius > 0)) return t;
  const qx = fx + ux * t;
  const qy = fy + uy * t;
  const along = (qx - poly.vx[edge]) * poly.ex[edge] + (qy - poly.vy[edge]) * poly.ey[edge];
  if (along >= 0 && along <= poly.length[edge]) return t;
  const corner = along < 0 ? edge : edge + 1 === poly.count ? 0 : edge + 1;
  const dx = fx - poly.vx[corner];
  const dy = fy - poly.vy[corner];
  const b = dx * ux + dy * uy;
  const discriminant = b * b - (dx * dx + dy * dy - radius * radius);
  if (discriminant < 0) return direction < 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return -b + direction * Math.sqrt(discriminant);
}

/**
 * Disk ya da kapsul parcasinin (Ucube'nin basi, gulle; Melis dokularinin
 * kapsulu ve ignesi) ilk temas yolu (dunya birimi; tikin basinda degiyorsa
 * 0); temas yoksa `Infinity`. Disk merkezi `wide`da, yaricapi `radius`;
 * kapsulun (`disc` 2) ekseni merkezin `reach` gerisine kadar, onunde
 * `[wide, nose]` igne. Disk de kesimin gerisine tasiyorsa kesiliyor.
 *
 * Kapsul ekseni ucus dogrultusunda gidiyor: temas, eksen dogrusunun
 * yuvarlak koseli cokgenle (cokgen + `radius`) kesistigi araligin eksenin
 * araligiyla ortusmesi. Dogru once keskin koseli sisirilmis cokgenle
 * kesiliyor (kenar basina bir bolme); kacan aday orada eleniyor. Giris
 * bir kenarin seridindeyse kesin, kosenin cikintisindaysa o kosenin dairesi
 * (bir karekok). Igne ayni dongude cokgenin kendisiyle. Tahsis yok.
 */
function getCapsuleContact(body: EnemyBody, fromX: number, fromY: number, ux: number, uy: number, shape: ProjectileShape, reach: number) {
  const poly = body.poly;
  const inverse = 1 / body.scale;
  const hx = body.headingX;
  const hy = body.headingY;
  const dx = body.x - fromX;
  const dy = body.y - fromY;
  const fx = (dy * hx - dx * hy) * inverse;
  const fy = -(dx * hx + dy * hy) * inverse;
  const lx = ux * hy - uy * hx;
  const ly = ux * hx + uy * hy;
  const r = shape.radius * inverse;
  const w = shape.wide * inverse;
  const n = shape.nose * inverse;
  const back = reach * inverse;
  const needle = shape.disc === 2 && n > w + r;
  let enterR = Number.NEGATIVE_INFINITY;
  let exitR = Number.POSITIVE_INFINITY;
  let entering = -1;
  let exiting = -1;
  let enterP = Number.NEGATIVE_INFINITY;
  let exitP = Number.POSITIVE_INFINITY;
  let missP = false;
  for (let k = 0; k < poly.count; k += 1) {
    const roomP = poly.h[k] - (poly.nx[k] * fx + poly.ny[k] * fy);
    const roomR = roomP + r;
    const rate = poly.nx[k] * lx + poly.ny[k] * ly;
    if (rate === 0) {
      if (roomR < 0) return Number.POSITIVE_INFINITY;
      if (roomP < 0) missP = true;
      continue;
    }
    const inverseRate = 1 / rate;
    const tR = roomR * inverseRate;
    const tP = roomP * inverseRate;
    if (rate > 0) {
      if (tR < exitR) {
        exitR = tR;
        exiting = k;
      }
      if (tP < exitP) exitP = tP;
    } else {
      if (tR > enterR) {
        enterR = tR;
        entering = k;
      }
      if (tP > enterP) enterP = tP;
    }
  }
  // Dogru sisirilmis cokgeni de kesmiyor: ne kapsul ne igne.
  if (!(enterR <= exitR) || entering < 0 || exiting < 0) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  if (w - r < -back) {
    // Disk kesiliyor (dogarken ya da diski kuyrugundan geride duran doku).
    const contact = getClippedDiscContact(poly, fx, fy, lx, ly, w, r, back);
    if (contact >= 0) best = contact;
  } else {
    const entry = resolveRoundedCrossing(poly, fx, fy, lx, ly, r, enterR, entering, -1);
    if (entry !== Number.POSITIVE_INFINITY) {
      if (entry - w > 0) best = entry - w;
      else {
        // Tikin basinda dogru govdenin icinde: eksenin arka ucu cikistan once mi.
        const exit = resolveRoundedCrossing(poly, fx, fy, lx, ly, r, exitR, exiting, 1);
        const axisRear = shape.disc === 1 ? w : Math.min(w, r - back);
        if (exit !== Number.NEGATIVE_INFINITY && exit >= axisRear) best = 0;
      }
    }
  }
  if (needle && !missP && enterP <= exitP) {
    const start = enterP - n;
    if (start > 0) {
      if (start < best) best = start;
    } else if (exitP >= Math.max(w, -back)) {
      best = 0;
    }
  }
  return best === Number.POSITIVE_INFINITY ? best : best * body.scale;
}

/** Cokgenin koseleri merminin cercevesinde (dunya birimi): ucus yonunde ve solda. */
const ALONG = new Float64Array(MAX_POLYGON_VERTICES);
const LATERAL = new Float64Array(MAX_POLYGON_VERTICES);
/** Parcalarin yanallarinda cokgenin arka (giris) ve on (cikis) siniri. */
const ENTRY = new Float64Array(PROJECTILE_MAX_OFFSETS);
const EXIT = new Float64Array(PROJECTILE_MAX_OFFSETS);

/** Son parca taramasinin kazanan temasi: tur (0 parcanin yanali cokgenin kenarinda, 1 cokgenin kosesi parcanin onunde, 2 tikin basinda ortusme) ve indeks. */
let contactKind = 0;
let contactIndex = -1;

/**
 * Merminin koselerini (`ALONG`, `LATERAL`) cokgenin koselerinden yazar:
 * merminin cercevesi `from`da, `u` ileri, sol yanal `(-uy, ux)`.
 */
function loadProjectileFrame(body: EnemyBody, fromX: number, fromY: number, ux: number, uy: number) {
  const poly = body.poly;
  const s = body.scale;
  const hx = body.headingX;
  const hy = body.headingY;
  const ax = (hy * ux - hx * uy) * s;
  const ay = (hx * ux + hy * uy) * s;
  const dx = body.x - fromX;
  const dy = body.y - fromY;
  const a0 = dx * ux + dy * uy;
  const b0 = dy * ux - dx * uy;
  for (let k = 0; k < poly.count; k += 1) {
    const vx = poly.vx[k];
    const vy = poly.vy[k];
    ALONG[k] = a0 + vx * ax + vy * ay;
    LATERAL[k] = b0 - vx * ay + vy * ax;
  }
}

/**
 * Merminin dis bukey parcalarinin (`table`) bu tikte cokgene ilk degdigi
 * yol (dunya birimi; tikin basinda bir parca degiyorsa 0); degmiyorsa
 * `Infinity`.
 *
 * Merminin cercevesinde parca `p` yanal `y`de `[R(y), F(y)]`; cokgen
 * `[P_arka(y), P_on(y)]`. Ileri `t` kadar giden parca o yanalda cokgene
 * `P_arka(y) - F(y)`de girip `P_on(y) - R(y)`de cikiyor. `P_arka - F` dis
 * bukey (dis bukey eksi ic bukey): en kucugu ya cokgenin bir kosesinin
 * yanalinda (kose parcanin on kenarina degiyor) ya da parcanin bir
 * kosesinin yanalinda (parcanin kosesi cokgenin kenarina degiyor) ya da
 * ortak yanal araligin ucunda (ikisinden biri). Ucu de kesin, kenar basina
 * birkac carpma; ilk temas parcalarin en kucugu. Tikin basinda ortusme:
 * giris <= 0 <= cikis. Tahsis yok.
 */
function getPartsContact(body: EnemyBody, fromX: number, fromY: number, ux: number, uy: number, table: ProjectilePartTable, travel: number) {
  const count = body.poly.count;
  loadProjectileFrame(body, fromX, fromY, ux, uy);
  let alongMin = Number.POSITIVE_INFINITY;
  let alongMax = Number.NEGATIVE_INFINITY;
  let lateralMin = Number.POSITIVE_INFINITY;
  let lateralMax = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < count; k += 1) {
    const a = ALONG[k];
    const b = LATERAL[k];
    if (a < alongMin) alongMin = a;
    if (a > alongMax) alongMax = a;
    if (b < lateralMin) lateralMin = b;
    if (b > lateralMax) lateralMax = b;
  }
  // Parcalarin birlesiminin yanindan geciyor, tumuyle arkasinda ya da bu tikte erisemeyecegi kadar onunde.
  if (lateralMax < table.minY || lateralMin > table.maxY || alongMax < table.minX || alongMin - table.maxX > travel) return Number.POSITIVE_INFINITY;
  const offsets = table.offsetCount;
  const oy = table.oy;
  for (let j = 0; j < offsets; j += 1) {
    ENTRY[j] = Number.POSITIVE_INFINITY;
    EXIT[j] = Number.NEGATIVE_INFINITY;
  }
  // Parcalarin yanallarinda cokgenin siniri: o yanali kesen iki kenar.
  let previous = count - 1;
  for (let k = 0; k < count; k += 1) {
    const ak = ALONG[previous];
    const bk = LATERAL[previous];
    const an = ALONG[k];
    const bn = LATERAL[k];
    previous = k;
    const low = bk < bn ? bk : bn;
    const high = bk < bn ? bn : bk;
    if (high < table.minY || low > table.maxY) continue;
    if (high - low > 1e-12) {
      const slope = (an - ak) / (bn - bk);
      for (let j = 0; j < offsets; j += 1) {
        const y = oy[j];
        if (y < low || y > high) continue;
        const x = ak + (y - bk) * slope;
        if (x < ENTRY[j]) ENTRY[j] = x;
        if (x > EXIT[j]) EXIT[j] = x;
      }
    } else {
      const near = ak < an ? ak : an;
      const far = ak < an ? an : ak;
      for (let j = 0; j < offsets; j += 1) {
        const y = oy[j];
        if (y < low - 1e-12 || y > high + 1e-12) continue;
        if (near < ENTRY[j]) ENTRY[j] = near;
        if (far > EXIT[j]) EXIT[j] = far;
      }
    }
  }
  let best = Number.POSITIVE_INFINITY;
  let bestKind = 0;
  let bestIndex = -1;
  let offsetBegin = 0;
  let frontBegin = 0;
  let rearBegin = 0;
  for (let p = 0; p < table.count; p += 1) {
    const offsetEnd = table.offsetEnd[p];
    const frontEnd = table.frontEnd[p];
    const rearEnd = table.rearEnd[p];
    const low = table.ylo[p];
    const high = table.yhi[p];
    let enter = Number.POSITIVE_INFINITY;
    let leave = Number.NEGATIVE_INFINITY;
    let kind = 0;
    let index = -1;
    if (!(lateralMax < low || lateralMin > high)) {
      for (let j = offsetBegin; j < offsetEnd; j += 1) {
        const entry = ENTRY[j];
        if (!(entry <= EXIT[j])) continue;
        const value = entry - table.of[j];
        if (value < enter) {
          enter = value;
          kind = 0;
          index = j;
        }
        const exit = EXIT[j] - table.or[j];
        if (exit > leave) leave = exit;
      }
      const fmax = table.fmax[p];
      const rmin = table.rmin[p];
      for (let k = 0; k < count; k += 1) {
        const b = LATERAL[k];
        if (b < low || b > high) continue;
        const a = ALONG[k];
        if (a - fmax < enter) {
          let front = Number.POSITIVE_INFINITY;
          for (let i = frontBegin; i < frontEnd; i += 1) {
            const value = table.fc[i] + table.fs[i] * b;
            if (value < front) front = value;
          }
          if (a - front < enter) {
            enter = a - front;
            kind = 1;
            index = k;
          }
        }
        if (a - rmin > leave) {
          let rear = Number.NEGATIVE_INFINITY;
          for (let i = rearBegin; i < rearEnd; i += 1) {
            const value = table.rc[i] + table.rs[i] * b;
            if (value > rear) rear = value;
          }
          if (a - rear > leave) leave = a - rear;
        }
      }
    }
    offsetBegin = offsetEnd;
    frontBegin = frontEnd;
    rearBegin = rearEnd;
    if (enter === Number.POSITIVE_INFINITY) continue;
    let contact: number;
    if (enter > 0) contact = enter;
    else if (leave >= 0) {
      contact = 0;
      kind = 2;
    } else continue;
    if (contact < best) {
      best = contact;
      bestKind = kind;
      bestIndex = index;
    }
  }
  contactKind = bestKind;
  contactIndex = bestIndex;
  return best;
}

/** Yonu birim degilse birime: gudumlu merminin hedefin tam ustunde oldugu tikte yon (0, 0) gelebiliyor; o zaman +x. */
const DIRECTION = { x: 1, y: 0 };

function normaliseDirection(ux: number, uy: number) {
  const lengthSq = ux * ux + uy * uy;
  if (lengthSq > 0.999999 && lengthSq < 1.000001) {
    DIRECTION.x = ux;
    DIRECTION.y = uy;
  } else if (lengthSq > 1e-24) {
    const inverse = 1 / Math.sqrt(lengthSq);
    DIRECTION.x = ux * inverse;
    DIRECTION.y = uy * inverse;
  } else {
    DIRECTION.x = 1;
    DIRECTION.y = 0;
  }
}

/**
 * Ucan merminin cizilen govdesinin bu tikte govdeye ilk degdigi yol (dunya
 * birimi, 0..`travel`); degmiyorsa -1. Tikin basinda zaten degiyorsa 0.
 *
 * Mermi `from`dan birim `u` yonunde `travel` kadar ilerliyor. Sekli cizilen
 * govdesi (`ProjectileShape`): dis bukey parcalarin birlesimi ve varsa disk
 * ya da kapsul; merkezin `reach` gerisine uzanmiyor (`getProjectileReach`:
 * ucus ve cizilen kuyrugun kucugu), parcalar o sinirda kesiliyor. Yon birim
 * degilse birime cekiliyor; hic yoksa (0, 0: gudumlu mermi hedefinin tam
 * merkezinde) +x: ortusme yine bulunuyor, mermi takilmiyor. Tahsis yok:
 * her mermi x her aday x her tik.
 */
export function getMovingBodyContact(body: EnemyBody, fromX: number, fromY: number, ux: number, uy: number, travel: number, shape: ProjectileShape, reach: number) {
  normaliseDirection(ux, uy);
  const dirX = DIRECTION.x;
  const dirY = DIRECTION.y;
  // Seridin disindaki govde (cogu aday): donusum yok.
  const dx = body.x - fromX;
  const dy = body.y - fromY;
  const margin = body.reach + shape.halfWidth;
  const side = dx * dirY - dy * dirX;
  if (side > margin || side < -margin) return -1;
  const ahead = dx * dirX + dy * dirY;
  if (ahead < -reach - body.reach || ahead > travel + shape.front + body.reach) return -1;
  let best = Number.POSITIVE_INFINITY;
  const table = prepareProjectileParts(shape, reach);
  if (table.count > 0) best = getPartsContact(body, fromX, fromY, dirX, dirY, table, travel);
  if (shape.disc !== 0 && best > 0) {
    const capsule = getCapsuleContact(body, fromX, fromY, dirX, dirY, shape, reach);
    if (capsule < best) best = capsule;
  }
  return best <= travel ? best : -1;
}

/** Temas noktasinin yazildigi tek nesne (cokgen cercevesinde). */
const CLOSEST = { x: 0, y: 0, distance: 0 };

/** Cokgenin noktaya en yakin noktasi (`CLOSEST`a; icerdeyse noktanin kendisi, uzaklik 0). */
function writeClosestToPoint(poly: EnemyBodyPolygon, px: number, py: number) {
  let best = Number.POSITIVE_INFINITY;
  CLOSEST.x = px;
  CLOSEST.y = py;
  for (let k = 0; k < poly.count; k += 1) {
    if (poly.nx[k] * px + poly.ny[k] * py <= poly.h[k]) continue;
    let t = (px - poly.vx[k]) * poly.ex[k] + (py - poly.vy[k]) * poly.ey[k];
    if (t < 0) t = 0;
    else if (t > poly.length[k]) t = poly.length[k];
    const qx = poly.vx[k] + poly.ex[k] * t;
    const qy = poly.vy[k] + poly.ey[k] * t;
    const distance = (qx - px) * (qx - px) + (qy - py) * (qy - py);
    if (distance < best) {
      best = distance;
      CLOSEST.x = qx;
      CLOSEST.y = qy;
    }
  }
  CLOSEST.distance = best === Number.POSITIVE_INFINITY ? 0 : Math.sqrt(best);
}

/** Cokgenin parcaya (a, b; cokgenin disinda) en yakin noktasi `CLOSEST`a. */
function writeClosestToSegment(poly: EnemyBodyPolygon, ax: number, ay: number, bx: number, by: number) {
  writeClosestToPoint(poly, ax, ay);
  let bestX = CLOSEST.x;
  let bestY = CLOSEST.y;
  let best = CLOSEST.distance;
  writeClosestToPoint(poly, bx, by);
  if (CLOSEST.distance < best) {
    best = CLOSEST.distance;
    bestX = CLOSEST.x;
    bestY = CLOSEST.y;
  }
  for (let k = 0; k < poly.count; k += 1) {
    const distance = Math.sqrt(pointSegmentDistanceSq(poly.vx[k], poly.vy[k], ax, ay, bx, by));
    if (distance < best) {
      best = distance;
      bestX = poly.vx[k];
      bestY = poly.vy[k];
    }
  }
  CLOSEST.x = bestX;
  CLOSEST.y = bestY;
  CLOSEST.distance = best;
}

/**
 * Cokgenin icindeki noktayi en yakin kenarina tasir (`CLOSEST`a): dis bukey
 * cokgende en kucuk ic bosluklu kenarin dogrusuna dik izdusum, o kenarin
 * uzerinde. Disaridaki ya da sinirdaki nokta oldugu gibi.
 */
function writeBoundaryPoint(poly: EnemyBodyPolygon, px: number, py: number) {
  let gap = Number.POSITIVE_INFINITY;
  let edge = -1;
  for (let k = 0; k < poly.count; k += 1) {
    const inner = poly.h[k] - (poly.nx[k] * px + poly.ny[k] * py);
    if (inner < gap) {
      gap = inner;
      edge = k;
    }
  }
  CLOSEST.x = px;
  CLOSEST.y = py;
  if (gap > 0 && edge >= 0) {
    CLOSEST.x = px + poly.nx[edge] * gap;
    CLOSEST.y = py + poly.ny[edge] * gap;
  }
}

/**
 * Ortusmenin en iyi aday noktasi (merminin cercevesinde) ve olcutleri:
 * merminin cizilen govdesine uzaklik (`gap`), eksene uzaklik, merkeze uzaklik.
 */
const OVERLAP = { x: 0, y: 0, gap: 0, lateral: 0, along: 0 };

/** Uzaklik esitliginin payi (dunya birimi): kirpmanin ve karekokun yuvarlamasi. */
const OVERLAP_GAP_EPSILON = 1e-9;

function considerOverlapPoint(x: number, y: number, gap: number) {
  const lateral = y < 0 ? -y : y;
  const distance = x < 0 ? -x : x;
  if (gap > OVERLAP.gap + OVERLAP_GAP_EPSILON) return;
  // Esit uzaklikta (ya da ikisi de cizilen govdenin icinde) eksene, sonra merkeze en yakin.
  if (gap >= OVERLAP.gap - OVERLAP_GAP_EPSILON && !(lateral < OVERLAP.lateral - 1e-12 || (lateral <= OVERLAP.lateral + 1e-12 && distance < OVERLAP.along))) return;
  OVERLAP.gap = gap;
  OVERLAP.lateral = lateral;
  OVERLAP.along = distance;
  OVERLAP.x = x;
  OVERLAP.y = y;
}

/** Ortusme noktasinin parcasi (`a -> b`, merminin cercevesinde): dusmanin kenari, dilime kirpilmis. */
const PIECE = new Float64Array(4);

/** Parcanin `[t0, t1]` araligi merminin govdesinin icinde: aralikta eksene en yakin nokta aday (uzaklik 0). */
function considerPieceInterval(t0: number, t1: number) {
  if (!(t0 <= t1)) return;
  const ax = PIECE[0];
  const ay = PIECE[1];
  const dx = PIECE[2] - ax;
  const dy = PIECE[3] - ay;
  const y0 = ay + dy * t0;
  const y1 = ay + dy * t1;
  if ((y0 <= 0 && y1 >= 0) || (y0 >= 0 && y1 <= 0)) {
    const t = y1 !== y0 ? t0 + (t1 - t0) * (-y0 / (y1 - y0)) : t0;
    considerOverlapPoint(ax + dx * t, 0, 0);
  }
  considerOverlapPoint(ax + dx * t0, y0, 0);
  considerOverlapPoint(ax + dx * t1, y1, 0);
}

/** Noktanin parcaya (`PIECE`) en yakin parametresi (0..1). */
function pieceParameter(px: number, py: number) {
  const dx = PIECE[2] - PIECE[0];
  const dy = PIECE[3] - PIECE[1];
  const lengthSq = dx * dx + dy * dy;
  if (!(lengthSq > 0)) return 0;
  const t = ((px - PIECE[0]) * dx + (py - PIECE[1]) * dy) / lengthSq;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Parcanin `t` noktasi `gap` uzaklikla aday. */
function considerPiecePoint(t: number, gap: number) {
  considerOverlapPoint(PIECE[0] + (PIECE[2] - PIECE[0]) * t, PIECE[1] + (PIECE[3] - PIECE[1]) * t, gap);
}

/** Merminin bir parcasinin cokgeni (saat yonunun tersine: on zarf yukari, arka zarf asagi), x, y ciftleri. */
const PART_POLYGON = new Float64Array(4 * PROJECTILE_MAX_OFFSETS);
let partPolygonCount = 0;

function pushPartPolygon(x: number, y: number) {
  const count = partPolygonCount;
  if (count > 0 && Math.abs(PART_POLYGON[2 * count - 2] - x) <= 1e-12 && Math.abs(PART_POLYGON[2 * count - 1] - y) <= 1e-12) return;
  PART_POLYGON[2 * count] = x;
  PART_POLYGON[2 * count + 1] = y;
  partPolygonCount = count + 1;
}

/** Tablonun `part` parcasinin cokgenini `PART_POLYGON`a yazar; kose sayisi (ardisik esler tek). */
function loadPartPolygon(table: ProjectilePartTable, part: number) {
  const begin = part > 0 ? table.offsetEnd[part - 1] : 0;
  const end = table.offsetEnd[part];
  partPolygonCount = 0;
  for (let j = begin; j < end; j += 1) pushPartPolygon(table.of[j], table.oy[j]);
  for (let j = end - 1; j >= begin; j -= 1) pushPartPolygon(table.or[j], table.oy[j]);
  let count = partPolygonCount;
  if (count > 1 && Math.abs(PART_POLYGON[0] - PART_POLYGON[2 * count - 2]) <= 1e-12 && Math.abs(PART_POLYGON[1] - PART_POLYGON[2 * count - 1]) <= 1e-12) count -= 1;
  return count;
}

/**
 * Alani bundan kucuk parca (isaretli alanin iki kati, dunya biriminin
 * karesi) duz: kesimin cizgisine yatmis. Ornegin dogan Ucube'de (`reach`
 * 0) damlanin `x >= 0` kesigi x = 0 cizgisinde 3 koseli, alansiz bir
 * cokgen. Gercek parcalarin en incesi (Hiza'nin govde cizgisi) bunun
 * milyarlarca kati.
 */
const PART_FLAT_AREA = 1e-9;

/** `PART_POLYGON`in ilk `count` kosesinin isaretli alaninin iki kati (saat yonunun tersi arti). */
function getPartPolygonArea2(count: number) {
  let area = 0;
  for (let i = 0; i < count; i += 1) {
    const j = i + 1 === count ? 0 : i + 1;
    area += PART_POLYGON[2 * i] * PART_POLYGON[2 * j + 1] - PART_POLYGON[2 * j] * PART_POLYGON[2 * i + 1];
  }
  return area;
}

/**
 * Parcanin (`PIECE`) merminin bir dis bukey parcasina (`PART_POLYGON`)
 * gore adayi: kesisiyorsa kesisim araligi (uzaklik 0, eksene en yakini),
 * kesismiyorsa parcanin parcaya en yakin noktasi (uclar cokgenin
 * kenarlarina, cokgenin koseleri parcaya). Kesin.
 *
 * Kirpma (Cyrus-Beck) yalnizca alani olan parcada (`PART_FLAT_AREA`). Duz
 * parcada her kenarin payi sifir: parcanin cizginin ustundeki ucu, yanal
 * uzakligi ne olursa olsun, "kesisiyor" (uzaklik 0) cikiyordu. Dusmanin
 * kenarlari dilime kirpilinca kesimin cizgisinde basladigi icin temas
 * noktasi kayan noktanin yuvarlamasina gore govdenin obur yanina (15
 * birim uzaga) dusebiliyordu. Duz parca kesimin cizgisinde yatiyor: dilime
 * kirpilmis kenar ona ancak ucundan degebiliyor, en yakin cift kesin.
 */
function considerPieceAgainstPolygon(count: number) {
  const ax = PIECE[0];
  const ay = PIECE[1];
  const dx = PIECE[2] - ax;
  const dy = PIECE[3] - ay;
  if (count >= 3 && getPartPolygonArea2(count) > PART_FLAT_AREA) {
    // Cyrus-Beck: kenarlarin sol yani (saat yonunun tersi) ic.
    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < count && t0 <= t1; i += 1) {
      const j = i + 1 === count ? 0 : i + 1;
      const px = PART_POLYGON[2 * i];
      const py = PART_POLYGON[2 * i + 1];
      const ex = PART_POLYGON[2 * j] - px;
      const ey = PART_POLYGON[2 * j + 1] - py;
      const room = ex * (ay - py) - ey * (ax - px);
      const rate = ex * dy - ey * dx;
      if (rate === 0) {
        if (room < 0) t1 = -1;
        continue;
      }
      const t = -room / rate;
      if (rate > 0) {
        if (t > t0) t0 = t;
      } else if (t < t1) {
        t1 = t;
      }
    }
    if (t0 <= t1) {
      considerPieceInterval(t0, t1);
      return;
    }
  }
  // Kesismiyor: en yakin cift ya parcanin bir ucu ile cokgenin kenari ya da cokgenin bir kosesi ile parca.
  let best = Number.POSITIVE_INFINITY;
  let bestT = 0;
  for (let end = 0; end < 2; end += 1) {
    const qx = PIECE[2 * end];
    const qy = PIECE[2 * end + 1];
    for (let i = 0; i < count; i += 1) {
      const j = i + 1 === count ? 0 : i + 1;
      const distance = pointSegmentDistanceSq(qx, qy, PART_POLYGON[2 * i], PART_POLYGON[2 * i + 1], PART_POLYGON[2 * j], PART_POLYGON[2 * j + 1]);
      if (distance < best) {
        best = distance;
        bestT = end;
      }
    }
  }
  for (let i = 0; i < count; i += 1) {
    const px = PART_POLYGON[2 * i];
    const py = PART_POLYGON[2 * i + 1];
    const t = pieceParameter(px, py);
    const qx = ax + dx * t - px;
    const qy = ay + dy * t - py;
    const distance = qx * qx + qy * qy;
    if (distance < best) {
      best = distance;
      bestT = t;
    }
  }
  if (best !== Number.POSITIVE_INFINITY) considerPiecePoint(bestT, Math.sqrt(best));
}

/** Parcanin (`PIECE`) bir daireyle ya da kutuyla kesisim araligi (`t0 > t1`: kesismiyor). */
const SPAN = { t0: 1, t1: 0 };

/** Parcanin `(cx, 0)` merkezli `r` yaricapli daireyle kesisimi: `SPAN`a. */
function writeDiscSpan(cx: number, r: number) {
  const ax = PIECE[0] - cx;
  const ay = PIECE[1];
  const dx = PIECE[2] - PIECE[0];
  const dy = PIECE[3] - PIECE[1];
  const a = dx * dx + dy * dy;
  const b = ax * dx + ay * dy;
  const c = ax * ax + ay * ay - r * r;
  SPAN.t0 = 1;
  SPAN.t1 = 0;
  if (!(a > 0)) {
    if (c <= 0) {
      SPAN.t0 = 0;
      SPAN.t1 = 1;
    }
    return;
  }
  const discriminant = b * b - a * c;
  if (discriminant < 0) return;
  const root = Math.sqrt(discriminant);
  SPAN.t0 = Math.max(0, (-b - root) / a);
  SPAN.t1 = Math.min(1, (-b + root) / a);
}

/** Parcanin `[x0, x1] x [-half, half]` kutusuyla kesisimi: `SPAN`a. */
function writeBoxSpan(x0: number, x1: number, half: number) {
  const ax = PIECE[0];
  const ay = PIECE[1];
  const dx = PIECE[2] - ax;
  const dy = PIECE[3] - ay;
  let t0 = 0;
  let t1 = 1;
  if (dx === 0) {
    if (ax < x0 || ax > x1) t1 = -1;
  } else {
    const ta = (x0 - ax) / dx;
    const tb = (x1 - ax) / dx;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
  }
  if (dy === 0) {
    if (ay < -half || ay > half) t1 = -1;
  } else {
    const ta = (-half - ay) / dy;
    const tb = (half - ay) / dy;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
  }
  SPAN.t0 = t0;
  SPAN.t1 = t1;
}

/** Parcanin (`PIECE`) bir parcaya (`p -> q`) en yakin parametresi ve uzakligi: `NEAREST`a (kesisiyorsa 0). */
const NEAREST = { t: 0, distance: 0 };

function writeNearestToSegment(px: number, py: number, qx: number, qy: number) {
  const ax = PIECE[0];
  const ay = PIECE[1];
  const dx = PIECE[2] - ax;
  const dy = PIECE[3] - ay;
  const ex = qx - px;
  const ey = qy - py;
  const denominator = dx * ey - dy * ex;
  if (denominator !== 0) {
    const t = ((px - ax) * ey - (py - ay) * ex) / denominator;
    const u = ((px - ax) * dy - (py - ay) * dx) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      NEAREST.t = t;
      NEAREST.distance = 0;
      return;
    }
  }
  let best = Number.POSITIVE_INFINITY;
  let bestT = 0;
  for (let end = 0; end < 2; end += 1) {
    const distance = pointSegmentDistanceSq(PIECE[2 * end], PIECE[2 * end + 1], px, py, qx, qy);
    if (distance < best) {
      best = distance;
      bestT = end;
    }
  }
  for (let end = 0; end < 2; end += 1) {
    const sx = end === 0 ? px : qx;
    const sy = end === 0 ? py : qy;
    const t = pieceParameter(sx, sy);
    const rx = ax + dx * t - sx;
    const ry = ay + dy * t - sy;
    const distance = rx * rx + ry * ry;
    if (distance < best) {
      best = distance;
      bestT = t;
    }
  }
  NEAREST.t = bestT;
  NEAREST.distance = Math.sqrt(best);
}

/**
 * Parcanin (`PIECE`) merminin yuvarlak govdesine gore adayi: disk (`wide`da,
 * `radius`) ya da Melis'in kapsulu (eksen `[rear, wide]`, arka ucu kesimde),
 * `back`in gerisi kesik; Melis dokularinda igne de. Kesin: kapsula uzaklik
 * eksenine uzaklik eksi yaricap; kesik diskte kesisim disk ile yarim
 * duzlemin ortak araligi, kesismiyorsa en yakin nokta ya diskin kendisinde
 * (diskin en yakin noktasi kesimin onundeyse) ya da kesim kirisinde (dis
 * bukey iki kumenin en yakin cifti, ozgur en yakin cift kesimin gerisinde
 * kaliyorsa kesimin uzerinde).
 */
function considerPieceAgainstRound(shape: ProjectileShape, back: number) {
  const r = shape.radius;
  const w = shape.wide;
  const ax = PIECE[0];
  const ay = PIECE[1];
  const dx = PIECE[2] - ax;
  const dy = PIECE[3] - ay;
  if (w - r < back) {
    // Kesik disk (kapsulun ekseni de bu durumda yalnizca `wide`).
    if (back < w + r) {
      writeDiscSpan(w, r);
      let t0 = SPAN.t0;
      let t1 = SPAN.t1;
      const crosses = t0 <= t1;
      if (crosses) {
        if (dx > 0) t0 = Math.max(t0, (back - ax) / dx);
        else if (dx < 0) t1 = Math.min(t1, (back - ax) / dx);
        else if (ax < back) t1 = -1;
      }
      if (t0 <= t1) considerPieceInterval(t0, t1);
      else {
        writeNearestToSegment(w, 0, w, 0);
        const t = NEAREST.t;
        const length = NEAREST.distance;
        const px = ax + dx * t;
        if (!crosses && length > 0 && w + ((px - w) / length) * r >= back) considerPiecePoint(t, length - r);
        else {
          const half = Math.sqrt(Math.max(0, r * r - (back - w) * (back - w)));
          writeNearestToSegment(back, -half, back, half);
          considerPiecePoint(NEAREST.t, NEAREST.distance);
        }
      }
    }
  } else {
    const rear = shape.disc === 2 ? Math.min(w, r + back) : w;
    writeNearestToSegment(rear, 0, w, 0);
    if (NEAREST.distance <= r) {
      // Kesisim araligi: iki uc dairesi ile aradaki seridin birlesimi (dis bukey: tek aralik).
      let t0 = Number.POSITIVE_INFINITY;
      let t1 = Number.NEGATIVE_INFINITY;
      writeDiscSpan(rear, r);
      if (SPAN.t0 <= SPAN.t1) {
        t0 = SPAN.t0;
        t1 = SPAN.t1;
      }
      if (w > rear) {
        writeDiscSpan(w, r);
        if (SPAN.t0 <= SPAN.t1) {
          if (SPAN.t0 < t0) t0 = SPAN.t0;
          if (SPAN.t1 > t1) t1 = SPAN.t1;
        }
        writeBoxSpan(rear, w, r);
        if (SPAN.t0 <= SPAN.t1) {
          if (SPAN.t0 < t0) t0 = SPAN.t0;
          if (SPAN.t1 > t1) t1 = SPAN.t1;
        }
      }
      if (t0 <= t1) considerPieceInterval(t0, t1);
      else considerPiecePoint(NEAREST.t, 0);
    } else {
      considerPiecePoint(NEAREST.t, NEAREST.distance - r);
    }
  }
  if (shape.disc === 2 && shape.nose > w + r) {
    writeNearestToSegment(Math.max(w, back), 0, shape.nose, 0);
    if (NEAREST.distance === 0 && dy !== 0) considerPiecePoint(-ay / dy, 0);
    else considerPiecePoint(NEAREST.t, NEAREST.distance);
  }
}

/**
 * Tikin basinda ortusen mermide temas noktasi (`out`a, dunya): govdenin
 * kenarinda, merminin kendi boyunun dilimi icinde (`[-reach, front]`, ucus
 * yonunde; dogdugu noktanin ve cizilen kuyrugun gerisi degil), merminin
 * cizilen govdesine (kesik parcalar, disk ya da kapsul, igne) en yakin
 * nokta; esitlikte (kenar cizilen govdenin icinden geciyor, uzaklik 0)
 * eksene en yakini, sonra merkeze en yakini. Kenar cizilen govdeyi
 * kesiyorsa nokta cizilen govdenin uzerinde: arkadaki govdede kuyrugun,
 * ondekinde ucun ya da genis basin degdigi yer (yalnizca eksene en yakin
 * olcut, genis basin yanindan degen govdede noktayi ince govde cizgisinin
 * hizasina, cizimden bir iki birim uzaga koyuyordu). Cizilen govde tumuyle
 * dusmanin icindeyse dilimdeki kenar noktalarinin cizilen govdeye en
 * yakini (uzak yuz ya da namlunun arkasi degil). Alan hasarinin halkasi ve
 * carpmanin cizimi bu noktada. Isabet basina bir kez: kenar basina parcalar
 * ve yuvarlak govde, birkac yuz carpma.
 */
function writeOverlapPoint<T extends { x: number; y: number }>(body: EnemyBody, fromX: number, fromY: number, ux: number, uy: number, along: number, shape: ProjectileShape, reach: number, out: T) {
  const count = body.poly.count;
  const centreX = fromX + ux * along;
  const centreY = fromY + uy * along;
  loadProjectileFrame(body, centreX, centreY, ux, uy);
  const rear = -reach;
  const front = Math.max(shape.front, rear);
  const table = prepareProjectileParts(shape, reach);
  OVERLAP.gap = Number.POSITIVE_INFINITY;
  OVERLAP.lateral = Number.POSITIVE_INFINITY;
  OVERLAP.along = Number.POSITIVE_INFINITY;
  OVERLAP.x = 0;
  OVERLAP.y = 0;
  let previous = count - 1;
  for (let k = 0; k < count; k += 1) {
    const ax = ALONG[previous];
    const ay = LATERAL[previous];
    const bx = ALONG[k];
    const by = LATERAL[k];
    previous = k;
    // Kenari dilime kirp (`rear <= x <= front`).
    const dx = bx - ax;
    let t0 = 0;
    let t1 = 1;
    if (dx !== 0) {
      const ta = (rear - ax) / dx;
      const tb = (front - ax) / dx;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    } else if (ax < rear || ax > front) continue;
    if (!(t0 <= t1)) continue;
    const dy = by - ay;
    PIECE[0] = ax + dx * t0;
    PIECE[1] = ay + dy * t0;
    PIECE[2] = ax + dx * t1;
    PIECE[3] = ay + dy * t1;
    for (let part = 0; part < table.count; part += 1) considerPieceAgainstPolygon(loadPartPolygon(table, part));
    if (shape.disc !== 0) considerPieceAgainstRound(shape, rear);
  }
  if (OVERLAP.gap === Number.POSITIVE_INFINITY) {
    // Govde merminin diliminde degil (olmamali): eksen parcasina en yakin kenar noktasi.
    const poly = body.poly;
    const inverse = 1 / body.scale;
    const hx = body.headingX;
    const hy = body.headingY;
    const ox = centreX - body.x;
    const oy = centreY - body.y;
    const fx = (ox * hy - oy * hx) * inverse;
    const fy = (ox * hx + oy * hy) * inverse;
    const lx = ux * hy - uy * hx;
    const ly = ux * hx + uy * hy;
    writeClosestToSegment(poly, fx + lx * rear * inverse, fy + ly * rear * inverse, fx + lx * front * inverse, fy + ly * front * inverse);
    writeBoundaryPoint(poly, CLOSEST.x, CLOSEST.y);
    out.x = worldX(body, CLOSEST.x, CLOSEST.y);
    out.y = worldY(body, CLOSEST.x, CLOSEST.y);
    return out;
  }
  out.x = centreX + ux * OVERLAP.x - uy * OVERLAP.y;
  out.y = centreY + uy * OVERLAP.x + ux * OVERLAP.y;
  return out;
}

/**
 * Disk ya da kapsul parcasinin temas noktasi, mermi `along` kadar ilerlemis
 * ve degiyorken (`out`a): igne degiyorsa eksenin govdeye girdigi nokta
 * (sivri uc); degilse cokgenin kapsulun eksenine en yakin noktasi (diskte
 * diskin merkezine: degdigi yer), kesilmis diskte kesimin gerisine
 * dusuyorsa kirisin ucuna en yakin nokta; icerde kalan aday en yakin kenara.
 */
function writeCapsuleContactPoint<T extends { x: number; y: number }>(body: EnemyBody, fromX: number, fromY: number, ux: number, uy: number, along: number, shape: ProjectileShape, reach: number, out: T) {
  const poly = body.poly;
  const inverse = 1 / body.scale;
  const hx = body.headingX;
  const hy = body.headingY;
  const lx = ux * hy - uy * hx;
  const ly = ux * hx + uy * hy;
  const dx = fromX + ux * along - body.x;
  const dy = fromY + uy * along - body.y;
  const fx = (dx * hy - dy * hx) * inverse;
  const fy = (dx * hx + dy * hy) * inverse;
  const r = shape.radius * inverse;
  const w = shape.wide * inverse;
  const n = shape.nose * inverse;
  const back = reach * inverse;
  const clipped = w - r < -back;
  const axisRear = clipped || shape.disc === 1 ? w : Math.min(w, r - back);
  const epsilon = 1e-6;
  const entry = rayPolygonEntry(poly, fx, fy, lx, ly);
  let px: number;
  let py: number;
  if (shape.disc === 2 && n > w + r && entry !== Number.POSITIVE_INFINITY && entry >= Math.max(w, -back) - epsilon && entry <= n + epsilon) {
    // Igne: eksenin giris noktasi.
    px = fx + lx * entry;
    py = fy + ly * entry;
  } else {
    writeClosestToSegment(poly, fx + lx * axisRear, fy + ly * axisRear, fx + lx * w, fy + ly * w);
    px = CLOSEST.x;
    py = CLOSEST.y;
    if (clipped && (px - fx) * lx + (py - fy) * ly < -back - epsilon) {
      // Kesimin gerisi govde degil: kirisin uclarinin yakini.
      const chord = -back - w;
      const half = Math.sqrt(Math.max(0, r * r - chord * chord));
      const backX = fx - lx * back;
      const backY = fy - ly * back;
      writeClosestToPoint(poly, backX - ly * half, backY + lx * half);
      const leftX = CLOSEST.x;
      const leftY = CLOSEST.y;
      const left = CLOSEST.distance;
      writeClosestToPoint(poly, backX + ly * half, backY - lx * half);
      if (left < CLOSEST.distance) {
        CLOSEST.x = leftX;
        CLOSEST.y = leftY;
      }
      px = CLOSEST.x;
      py = CLOSEST.y;
    }
  }
  writeBoundaryPoint(poly, px, py);
  out.x = worldX(body, CLOSEST.x, CLOSEST.y);
  out.y = worldY(body, CLOSEST.x, CLOSEST.y);
  return out;
}

/**
 * Temas noktasi (`out`a), mermi tikin basindan `along` kadar ilerlemisken:
 * hep gorunen govdenin kenarinda (cokgenin sinirinda) ve merminin cizilen
 * govdesinin degdigi yerde. Ileri giderken degen parcada temasin kendisi:
 * cokgenin kosesi (parcanin on kenarina degdi) ya da parcanin kosesinin
 * yanalinda cokgenin kenari; disk ya da kapsulde degdigi yer. Tikin basinda
 * ortusen mermide (`along` 0) merminin diliminde, cizilen govdesine en
 * yakin kenar noktasi (`writeOverlapPoint`; esitlikte eksene en yakini):
 * uzak yuz, namlunun ya da kuyrugun gerisi degil. Isabet basina bir kez.
 */
export function writeMovingBodyContactPoint<T extends { x: number; y: number }>(
  body: EnemyBody,
  fromX: number,
  fromY: number,
  ux: number,
  uy: number,
  along: number,
  shape: ProjectileShape,
  reach: number,
  out: T
) {
  normaliseDirection(ux, uy);
  const dirX = DIRECTION.x;
  const dirY = DIRECTION.y;
  if (along > 0) {
    const table = prepareProjectileParts(shape, reach);
    const parts = table.count > 0 ? getPartsContact(body, fromX, fromY, dirX, dirY, table, along + 1) : Number.POSITIVE_INFINITY;
    const kind = contactKind;
    const index = contactIndex;
    let partX = 0;
    let partY = 0;
    if (parts > 0 && parts !== Number.POSITIVE_INFINITY && index >= 0) {
      if (kind === 1) {
        partX = worldX(body, body.poly.vx[index], body.poly.vy[index]);
        partY = worldY(body, body.poly.vx[index], body.poly.vy[index]);
      } else {
        const entry = ENTRY[index];
        const lateral = table.oy[index];
        partX = fromX + dirX * entry - dirY * lateral;
        partY = fromY + dirY * entry + dirX * lateral;
      }
    }
    const capsule = shape.disc !== 0 ? getCapsuleContact(body, fromX, fromY, dirX, dirY, shape, reach) : Number.POSITIVE_INFINITY;
    if (parts > 0 && parts !== Number.POSITIVE_INFINITY && index >= 0 && parts <= capsule) {
      out.x = partX;
      out.y = partY;
      return out;
    }
    if (capsule > 0 && capsule !== Number.POSITIVE_INFINITY) return writeCapsuleContactPoint(body, fromX, fromY, dirX, dirY, along, shape, reach, out);
  }
  return writeOverlapPoint(body, fromX, fromY, dirX, dirY, along, shape, reach, out);
}
