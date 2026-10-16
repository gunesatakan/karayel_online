/**
 * Operator bedeni: ATLAS'in gorevlendirdigi yapay zekalarin (ZentaX ve
 * AttackLord) sahadaki govdesi.
 *
 * Oyuncu komutu bugunku gibi veriyor (kule kur, duvar cek, altinla onar,
 * beceri, ulti); beden oraya hizla ucuyor ve is **vardiginda** sunucuda
 * oluyor. Bedel (altin, beceri bekleme suresi, ulti sarji) komut aninda
 * ayriliyor: beden yoldayken ayni altin iki kez harcanamaz. Varista is
 * gecersizse (kare doldu, yapi yikildi, hedef oldu) ayrilan bedel iade
 * ediliyor ve oyuncu bugunku red geri bildirimini goruyor.
 *
 * Hiz: dunya biriminde saniyede `OPERATOR_BODY_SPEED` (harita olcegiyle
 * buyuyor, duvar saatiyle -- oyun hizi carpani bedeni yavaslatmiyor). Tipik
 * bir yolculuk (4-6 kare) ~0,15-0,25 sn, haritanin bir kosesinden obur
 * kosesine (~25 kare kosegen) ~0,85 sn: oyuncu bosa beklemiyor.
 *
 * Can: gelismis iscinin iki kati. Dusman bedene isciye vurdugu gibi
 * temasla vuruyor. Beden duserse mac kaybedilir (nexus gibi; co-op'ta
 * takimin herhangi bir bedeni). Toparlanma: dalga temizlenince tam can,
 * `OPERATOR_BODY_REGEN_DELAY_MS` boyunca hasar almazsa saniyede azami canin
 * `OPERATOR_BODY_REGEN_RATIO`i kadar onarim. Ogreticide beden 1 canin altina
 * inmiyor; yaratici modda hasar almiyor; baglantisi kopuk oyuncunun bedeni
 * de hasar almiyor (kopan takim arkadasi maci kaybettirmesin).
 *
 * Bu modul saf: sabitler, tel bicimi ve hareket/park yeri kurallari.
 * Sunucu baglantisi `MatchRoom`ta, cizim `apps/web/src/vfx/operator-bodies.ts`te.
 */
import type { CharacterId } from "../index.js";
import { ADVANCED_WORKER_HEALTH_MULTIPLIER, WORKER_MAX_HP } from "../logistics/index.js";

/** Bedeni olan operatorler: yalnizca oynanabilen ikisi (ZentaX, AttackLord). */
export const OPERATOR_BODY_CHARACTER_IDS: readonly CharacterId[] = ["zeynep", "warrior"];

export function hasOperatorBody(characterId: unknown): characterId is CharacterId {
  return typeof characterId === "string" && (OPERATOR_BODY_CHARACTER_IDS as readonly string[]).includes(characterId);
}

/** Bedenin azami cani: gelismis iscinin (60 x 3) iki kati = 360. */
export const OPERATOR_BODY_MAX_HP = WORKER_MAX_HP * ADVANCED_WORKER_HEALTH_MULTIPLIER * 2;

/**
 * Ucus hizi (dunya birimi / gercek saniye, harita olcegi 1). 34 birimlik
 * karede saniyede ~28 kare.
 */
export const OPERATOR_BODY_SPEED = 950;
/** Varisa yakin yavaslama: kalan mesafenin bu kati (birim/sn), tabanin altina inmeden. */
export const OPERATOR_BODY_ARRIVAL_EASE = 14;
/** Yavaslamanin tabani (birim/sn): son birkac birim surunmesin. */
export const OPERATOR_BODY_MIN_SPEED = 260;
/** Bu kadar yakin varmis sayilir (dunya birimi, olcek 1). */
export const OPERATOR_BODY_ARRIVE_DISTANCE = 1.5;
/** Bosta park yerine suzulme hizi: gorev hizinin bu kati. */
export const OPERATOR_BODY_IDLE_SPEED_RATIO = 0.45;

/** Varis aninda is yapilir; is pozu (isin/kivilcim) bu kadar surer, sonraki gorev bekler. */
export const OPERATOR_BODY_WORK_MS = 90;
/** Duvar cizgisinde parca arasi is pozu: beden hat boyunca akarak orsun. */
export const OPERATOR_BODY_WALL_PIECE_MS = 25;

/** Kuyrukta bekleyebilecek en fazla gorev; fazlasi reddedilir (komut seli). */
export const OPERATOR_BODY_QUEUE_MAX = 8;
/** Telde gosterilen bekleyen hedef sayisi (hayalet kuleler icin). */
export const OPERATOR_BODY_WIRE_QUEUE_MAX = 6;

/** Dusmanin bedene vurdugu temas yaricapi (dunya birimi, olcek 1; isci 16). */
export const OPERATOR_BODY_CONTACT_RADIUS = 20;
/** Hasarsiz gecen bu sureden sonra onarim baslar (oyun ms). */
export const OPERATOR_BODY_REGEN_DELAY_MS = 3_000;
/** Saniyelik onarim: azami canin bu orani (360 canda 18). */
export const OPERATOR_BODY_REGEN_RATIO = 0.05;
/** Bu oranin altinda istemci acik bir dusuk can uyarisi ciziyor. */
export const OPERATOR_BODY_LOW_HP_RATIO = 0.35;

/** Gorev yerine yanasma: hedefin bu kadar kare yaninda durup oraya isin tutar. */
export const OPERATOR_BODY_STANDOFF_CELLS = 0.55;
/**
 * Is mesafesi (kare): kurulum, duvar parcasi, onarim ve Execute hedefin
 * merkezinden bu kadar uzaktan, isinla yapiliyor. 0,9 kare (olcek 1'de ~31
 * birim) temas yaricapinin (20) disinda: hedefin yanindaki dusman bedene
 * degmiyor. Kurulum ve onarimda yapinin yari boyu ekleniyor.
 */
export const OPERATOR_BODY_WORK_REACH_CELLS = 0.9;
/** Duruş noktasinin dusmandan istedigi bosluk: temas yaricapi arti bu pay (birim, olcek 1). */
export const OPERATOR_BODY_SAFE_MARGIN = 8;
/** Bosta, yakininda dusman varsa park yerini yeniden secer (kare). */
export const OPERATOR_BODY_THREAT_CELLS = 2.2;
/** Park yeri aramasinin yaricapi (kare). */
export const OPERATOR_BODY_REST_SEARCH_CELLS = 4;
/** Bosta park yeri denetimi araligi (ms). */
export const OPERATOR_BODY_REST_CHECK_MS = 400;

/** Bedenin durumu telde tek harf: bosta, yolda, is basinda, dustu. */
export type OperatorBodyState = "i" | "m" | "w" | "d";

/** Gorev turu (telde degil; sunucu ve testler okuyor). */
export type OperatorBodyTaskKind = "place" | "wall" | "repair" | "skill" | "ultimate";

/**
 * `bodies`: her karede tam (en fazla dort kayit). Yeni katilan da ilk karede
 * goruyor.
 */
export type OperatorBodySnapshot = {
  /** Sahibinin oturum kimligi. */
  id: string;
  /** Operator (doku ve renk). */
  c: CharacterId;
  x: number;
  y: number;
  hp: number;
  mhp: number;
  s: OperatorBodyState;
  /** Is basindayken isinin ucu (yapi ya da dusman). */
  wx?: number;
  wy?: number;
  /** Bekleyen gorev hedefleri, duz dizi [x, y, x, y...] (en fazla altisi). */
  q?: number[];
  /** Hasar almiyor (yaratici mod) ya da olmuyor (ogretici tabani). */
  inv?: 1;
};

/**
 * Bir tick'lik ucus: hedefe dogru, varisa yaklastikca yavaslayarak. Yeni
 * konumu, hizi ve varis bilgisini dondurur.
 * Hiz, kalan mesafeyle orantili ama tavan ve taban arasinda.
 */
export function stepOperatorBody(
  from: { x: number; y: number },
  target: { x: number; y: number },
  seconds: number,
  scale = 1,
  speedRatio = 1
) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy);
  const arrive = OPERATOR_BODY_ARRIVE_DISTANCE * scale;
  if (!(distance > arrive)) return { x: target.x, y: target.y, arrived: true, vx: 0, vy: 0 };
  const top = OPERATOR_BODY_SPEED * scale * speedRatio;
  const eased = Math.max(OPERATOR_BODY_MIN_SPEED * scale * speedRatio, distance * OPERATOR_BODY_ARRIVAL_EASE);
  const speed = Math.min(top, eased);
  const step = speed * Math.max(0, seconds);
  if (step >= distance - arrive) return { x: target.x, y: target.y, arrived: true, vx: (dx / distance) * speed, vy: (dy / distance) * speed };
  return { x: from.x + (dx / distance) * step, y: from.y + (dy / distance) * step, arrived: false, vx: (dx / distance) * speed, vy: (dy / distance) * speed };
}

/**
 * Iki nokta arasi tahmini ucus suresi (sn). Belgeleme ve testler icin: varisa
 * yakin yavaslama dahil, tick bolunmesi haric.
 */
export function estimateOperatorBodyTravelSeconds(distance: number, scale = 1) {
  const arrive = OPERATOR_BODY_ARRIVE_DISTANCE * scale;
  let remaining = Math.max(0, distance);
  let seconds = 0;
  const dt = 1 / 240;
  while (remaining > arrive && seconds < 10) {
    const speed = Math.min(OPERATOR_BODY_SPEED * scale, Math.max(OPERATOR_BODY_MIN_SPEED * scale, remaining * OPERATOR_BODY_ARRIVAL_EASE));
    remaining -= speed * dt;
    seconds += dt;
  }
  return seconds;
}

/**
 * Hedefin yaninda durulacak nokta: bedenin geldigi yonden hedefin
 * `standoff` kadar onu. Beden yapinin tam ustunde degil yaninda suzuluyor
 * ve isini ona tutuyor. Hedefin ustundeyse (cok yakin) yukaridan yanasir.
 */
export function getOperatorBodyStandPoint(from: { x: number; y: number }, target: { x: number; y: number }, standoff: number) {
  const dx = from.x - target.x;
  const dy = from.y - target.y;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0.5)) return { x: target.x, y: target.y - standoff };
  const reach = Math.min(standoff, distance);
  return { x: target.x + (dx / distance) * reach, y: target.y + (dy / distance) * reach };
}

/**
 * Is icin durulacak nokta: hedefin cevresinde `distance` uzakliginda, canli
 * dusmanlarin temas yaricapindan (arti pay) en uzak aday. Adaylar bedenin
 * geldigi yon ve sekiz pusula yonu; esitlikte bedene yakin olan (ve varsa su
 * anki nokta, titremesin) seciliyor. Harita disindaki aday elenmiyor ama
 * cezali: hedef kenardaysa yine de bir nokta donuyor.
 */
export function pickOperatorBodyStandPoint(input: {
  from: { x: number; y: number };
  target: { x: number; y: number };
  distance: number;
  threats: readonly { x: number; y: number }[];
  /** Temas yaricapi + pay (birim). */
  safeRadius: number;
  bounds?: { left: number; top: number; right: number; bottom: number };
  current?: { x: number; y: number };
}) {
  const { from, target, distance, threats, safeRadius, bounds, current } = input;
  const candidates: Array<{ x: number; y: number }> = [];
  const toBody = Math.atan2(from.y - target.y, from.x - target.x);
  const angles = Math.hypot(from.x - target.x, from.y - target.y) > 0.5 ? [toBody] : [-Math.PI / 2];
  for (let index = 0; index < 8; index += 1) angles.push((index * Math.PI) / 4);
  for (const angle of angles) candidates.push({ x: target.x + Math.cos(angle) * distance, y: target.y + Math.sin(angle) * distance });
  const onRing = current && Math.abs(Math.hypot(current.x - target.x, current.y - target.y) - distance) <= distance * 0.25 ? current : undefined;
  if (onRing) candidates.push(onRing);
  let best: { x: number; y: number; threat: number; score: number } | undefined;
  for (const point of candidates) {
    let threat = 0;
    for (const enemy of threats) {
      const gap = Math.hypot(enemy.x - point.x, enemy.y - point.y);
      if (gap < safeRadius) threat += safeRadius - gap;
    }
    let score = threat * 10 + Math.hypot(point.x - from.x, point.y - from.y) * 0.01;
    if (bounds && (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom)) score += 5;
    if (onRing && point === onRing) score -= 0.3;
    if (!best || score < best.score) best = { x: point.x, y: point.y, threat, score };
  }
  return { x: best!.x, y: best!.y, threat: best!.threat };
}

export type OperatorBodyRestInput = {
  /** Son gorevin yeri: park yeri buna yakin. */
  near: { x: number; y: number };
  cols: number;
  rows: number;
  /** Kare -> dunya merkezi. */
  cellCenter: (col: number, row: number) => { x: number; y: number };
  /** Dunya -> kare. */
  toCell: (x: number, y: number) => { col: number; row: number };
  gridSize: number;
  /** Dusmanlarin yurudugu kareler (yol, dogum, nexus): "col:row". */
  laneCells: ReadonlySet<string>;
  /** Yapinin kapladigi kareler: yer dusmani oraya giremiyor, park icin iyi. */
  structureCells: ReadonlySet<string>;
  enemies: Iterable<{ x: number; y: number }>;
  /** Diger bedenlerin park yerleri: ust uste binmesinler. */
  avoid?: Iterable<{ x: number; y: number }>;
  searchCells?: number;
};

/**
 * Bosta park yeri: son gorevin yakininda, dusman seridinde olmayan, canli
 * dusmanlardan uzak bir kare. Yapi kareleri tercih ediliyor (yer dusmani
 * oraya giremiyor), harita kenari sevilmiyor. Beden karenin tam ortasinda
 * degil, ust-sol koseye kayik duruyor ki altindaki yapiyi ortmesin.
 */
export function findOperatorBodyRestSpot(input: OperatorBodyRestInput) {
  const search = Math.max(1, Math.round(input.searchCells ?? OPERATOR_BODY_REST_SEARCH_CELLS));
  const start = input.toCell(input.near.x, input.near.y);
  const enemies = Array.from(input.enemies);
  const avoid = Array.from(input.avoid ?? []);
  const threat = OPERATOR_BODY_THREAT_CELLS * input.gridSize;
  let best: { col: number; row: number; score: number } | undefined;
  for (let dr = -search; dr <= search; dr += 1) {
    for (let dc = -search; dc <= search; dc += 1) {
      const col = start.col + dc;
      const row = start.row + dr;
      if (col < 0 || row < 0 || col >= input.cols || row >= input.rows) continue;
      const key = `${col}:${row}`;
      const center = input.cellCenter(col, row);
      let score = Math.hypot(dc, dr);
      if (input.laneCells.has(key)) score += 50;
      // Serit komsusu: temas yaricapi yarim kareyi asiyor.
      else if (input.laneCells.has(`${col + 1}:${row}`) || input.laneCells.has(`${col - 1}:${row}`)
        || input.laneCells.has(`${col}:${row + 1}`) || input.laneCells.has(`${col}:${row - 1}`)) score += 4;
      if (!input.structureCells.has(key)) score += 1.5;
      // Harita kenari: beden yarisi disarida kalmasin, kenarda sikismasin.
      if (col === 0 || row === 0 || col === input.cols - 1 || row === input.rows - 1) score += 2.5;
      for (const other of avoid) {
        if (Math.hypot(other.x - center.x, other.y - center.y) < input.gridSize * 1.2) score += 6;
      }
      for (const enemy of enemies) {
        const gap = Math.hypot(enemy.x - center.x, enemy.y - center.y);
        if (gap < threat) score += 20 * (1 - gap / threat) + 4;
      }
      if (!best || score < best.score) best = { col, row, score };
    }
  }
  const cell = best ?? { col: Math.max(0, Math.min(input.cols - 1, start.col)), row: Math.max(0, Math.min(input.rows - 1, start.row)) };
  const center = input.cellCenter(cell.col, cell.row);
  // Kayma haritanin icine dogru: kenar karesinde disari tasmasin.
  const shiftX = cell.col <= 0 ? 0.34 : -0.34;
  const shiftY = cell.row <= 0 ? 0.36 : -0.36;
  return { x: center.x + input.gridSize * shiftX, y: center.y + input.gridSize * shiftY, col: cell.col, row: cell.row };
}

/** Bosta duran bedenin yakininda tehdit var mi (park yeri yeniden secilsin). */
export function isOperatorBodyThreatened(body: { x: number; y: number }, enemies: Iterable<{ x: number; y: number }>, gridSize: number) {
  const threat = OPERATOR_BODY_THREAT_CELLS * gridSize;
  for (const enemy of enemies) {
    if (Math.hypot(enemy.x - body.x, enemy.y - body.y) < threat) return true;
  }
  return false;
}
