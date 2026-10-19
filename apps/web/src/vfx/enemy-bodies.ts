/**
 * Istemcide dusmanin gorunen govdesi: sunucunun vurdugu yonlu dis bukey
 * cokgen (`enemy-body`), istemcinin gordugu yonle.
 *
 * Yon: dusman dokusu oynatilan snapshot adiminin yonuyle donuyor (yon izi
 * kayda yaziyor, GameScene `getEnemySpriteRotation`; dururken son yon).
 * Gelen iki snapshot arasindaki konum farki, o snapshot'lar ~500 ms sonra
 * oynatilirken dokunun baktigi yon: Gosteri / Kin seciminin spot isigi ve
 * carpmanin hangi dusmana oldugu bu yonle bulunuyor. Karelerde ek tel yok:
 * sunucu yonu gondermiyor (dusman basina her snapshot'ta bir alan daha
 * olurdu); iki yan ayni guncellemeyi (`updateBodyHeading`) ayni girdilerle
 * yapiyor: 0,1'e yuvarli tel konumlari ve ardisik iki snapshot'in saat
 * farkindan esik (`getSnapshotHeadingMinStep`). Sunucu govdenin yonunu
 * yayinda olcup iki yayin arasinda tutuyor: snapshot'lari eksiksiz alan
 * istemcinin izi sunucunun govdesiyle bire bir ayni, doku snapshot
 * sinirlarinda (bkz. `getBodyHeadingMinStep`). Sonradan gelen istemci yonu
 * tam statik kayittan (`hx`, `hy`) baslatiyor.
 */
import {
  BODY_DEFAULT_HEADING_X,
  BODY_DEFAULT_HEADING_Y,
  SERVER_TICK_MS,
  TOWER_GRID_SIZE,
  createEnemyBody,
  getBodyEdgeDistance,
  getSnapshotHeadingMinStep,
  updateBodyHeading,
  writeEnemyBodyShape,
  type BodyHeadingState,
  type EnemyBody,
  type EnemyRace,
  type MovementKind
} from "@karayel/shared";

/** Govdeyi kuran snapshot alanlari (telde zaten var: irk, tur, ozel, sampiyon, hareket, ruh cekici yigini `ds`). */
export type SnapshotBodyView = {
  id: string;
  x: number;
  y: number;
  race?: EnemyRace;
  type?: string;
  special?: string;
  champion?: unknown;
  movementKind?: MovementKind;
  ds?: number;
};

export type HeadingSource = { get(id: string): Readonly<Pick<BodyHeadingState, "headingX" | "headingY">> | undefined };

/**
 * Secimin kazima nesnesi: sekil sorgularina hedef (kimlik, konum, hareket)
 * ve govdesi (sunucununkiyle ayni bicimde tek govde nesnesi). Cagri basina
 * yeni nesne yok; bir sonraki cagriya kadar gecerli.
 */
export type BodyScratch = { id: string; x: number; y: number; movementKind?: MovementKind; body: EnemyBody };

export function createBodyScratch(): BodyScratch {
  return { id: "", x: 0, y: 0, movementKind: undefined, body: createEnemyBody({ race: "meka", type: "grunt" }, TOWER_GRID_SIZE, 0, 0) };
}

type HeadingEntry = BodyHeadingState & { seen: number };

/**
 * Dusmanlarin yonu, gelen snapshot'lardan; sunucunun govdesinin yonuyle ayni
 * kural ve girdiler (`MatchRoom.noteSnapshotHeadings`). Snapshot araligi
 * birkac tik; esik (`getSnapshotHeadingMinStep`): yurume esigi aradaki
 * tiklerde ve telin olu bandinin tamami (adim snapshot'tan snapshot'a, iki
 * yuvarli konum). Bandin icindeki adim yonu degistirmiyor: cok yavas
 * yuruyende ve 0,1'e yuvarli konumlarin kipirtisinda yon donmuyor, duran
 * dusmanin son yonu bir iki adimlik farktan alinmiyor. Ilk gorulen dusman
 * dondurulmemis dokuyla (+y) ya da tam statik kaydin yonuyle (`hx`, `hy`)
 * basliyor; o snapshot'ta yalnizca konumu yaziliyor (sunucu da yayinda
 * ilk kez gorduguyle oyle).
 *
 * Bu snapshot'taki yon kayda da yaziliyor (`hx`, `hy`; kayit snapshot'in
 * kendi hidratlanmis nesnesi): doku oynatmada onu okuyor
 * (GameScene `getEnemySpriteRotation`), yani her snapshot sinirinda
 * sunucunun govdesinin yonunde.
 */
export class EnemyHeadingTracker implements HeadingSource {
  private readonly states = new Map<string, HeadingEntry>();
  private frame = 0;
  private lastServerTime?: number;

  note(enemies: readonly { id: string; x: number; y: number; hx?: number; hy?: number }[], serverTime: number) {
    this.frame += 1;
    const minStep = getSnapshotHeadingMinStep(serverTime, this.lastServerTime);
    this.lastServerTime = serverTime;
    for (const enemy of enemies) {
      let state = this.states.get(enemy.id);
      if (!state) {
        const seeded = Number.isFinite(enemy.hx) && Number.isFinite(enemy.hy);
        state = {
          headingX: seeded ? enemy.hx! : BODY_DEFAULT_HEADING_X,
          headingY: seeded ? enemy.hy! : BODY_DEFAULT_HEADING_Y,
          fromX: enemy.x,
          fromY: enemy.y,
          seen: 0
        };
        this.states.set(enemy.id, state);
      } else {
        updateBodyHeading(state, enemy.x, enemy.y, minStep);
      }
      state.seen = this.frame;
      enemy.hx = state.headingX;
      enemy.hy = state.headingY;
    }
    for (const [id, state] of this.states) {
      if (state.seen !== this.frame) this.states.delete(id);
    }
  }

  get(id: string) {
    return this.states.get(id);
  }

  clear() {
    this.states.clear();
    this.lastServerTime = undefined;
  }
}

/**
 * Snapshot kaydindan yonlu govde (`out`a): sunucunun dogumda yazdigi govdeyle
 * ayni fonksiyon (`writeEnemyBodyShape`), istemcinin gordugu yonle. Eksik
 * irk / tur eski kaydin varsayilani (meka, piyade).
 */
export function writeSnapshotEnemyBody(out: BodyScratch, enemy: SnapshotBodyView, heading: Readonly<Pick<BodyHeadingState, "headingX" | "headingY">> | undefined, cellSize = TOWER_GRID_SIZE) {
  const body = out.body;
  writeEnemyBodyShape(body, {
    race: enemy.race ?? "meka",
    type: enemy.type ?? "grunt",
    special: enemy.special,
    champion: enemy.champion,
    movementKind: enemy.movementKind,
    ds: enemy.ds
  }, cellSize);
  body.x = enemy.x;
  body.y = enemy.y;
  body.headingX = heading?.headingX ?? BODY_DEFAULT_HEADING_X;
  body.headingY = heading?.headingY ?? BODY_DEFAULT_HEADING_Y;
  out.id = enemy.id;
  out.x = enemy.x;
  out.y = enemy.y;
  out.movementKind = enemy.movementKind;
  return out;
}

/**
 * Temas noktasinin kenarina ne kadar uzakta olunca dusman "carpmanin dusmani"
 * sayilmiyor (dunya birimi, harita olcegi 1'de). Gelen son snapshot carpmadan
 * en fazla bir snapshot araligi (60 ms) once: kosucu o arada ~4 birim yuruyor.
 */
export const CONTACT_EDGE_TOLERANCE = 10;

const CONTACT_BODY = createBodyScratch();

/**
 * Carpmanin dusmani: sunucunun temas noktasi (`projectile:contact`) vurulan
 * govdenin kenarinda; gelen son snapshot'ta kenari o noktaya en yakin
 * dusman. Ek tel yok (mesaja dusman kimligi eklenmiyor): temas zaten
 * govdenin kenarinda ve bir govdenin icinde baskasinin kenari nadiren
 * oluyor. Eski arama merkeze 26 birimdi: temas artik kenarda, en buyuk
 * govdede (havadaki tam yigin ruh cekici) merkezden ~30 birim uzakta.
 */
export function findContactEnemy<T extends SnapshotBodyView>(enemies: readonly T[], x: number, y: number, headings: HeadingSource | undefined, cellSize = TOWER_GRID_SIZE): T | undefined {
  let best: T | undefined;
  let bestGap = CONTACT_EDGE_TOLERANCE * (cellSize / TOWER_GRID_SIZE);
  for (const enemy of enemies) {
    const body = writeSnapshotEnemyBody(CONTACT_BODY, enemy, headings?.get(enemy.id), cellSize).body;
    if (Math.abs(x - enemy.x) > body.reach + bestGap || Math.abs(y - enemy.y) > body.reach + bestGap) continue;
    const gap = getBodyEdgeDistance(body, x, y);
    if (gap < bestGap) {
      bestGap = gap;
      best = enemy;
    }
  }
  return best;
}

/**
 * Carpmanin vurulan dusmana gore yeri: dusman, carpmanin sunucu saati, temas
 * (ya da duran merminin) noktasi ve cozulunce dusmanin o anki konumuna gore
 * farki. `free`: dusman ardindaki snapshot'ta yok (oldu), nokta yerinde.
 */
export type HitAnchor = { enemyId: string; x: number; y: number; at: number; offsetX: number; offsetY: number; state: "pending" | "anchored" | "free" };

type AnchorSnapshot = { serverTime: number; enemies: readonly { id: string; x: number; y: number }[] };

/**
 * Temasin sunucu saati, temas mesajinin geldigi anin sunucu saatinden: temas
 * mesaji tik N'de, snapshot ise o tikin dusman hareketinden sonra yaziliyor
 * (saat snapshot'larla kuruluyor); temas tik N'nin hareketinden onceki
 * konumlarla, yani tik N - 1'in sonundaki konumlarla hesaplandi. Bir sunucu
 * tiki geri (`SERVER_TICK_MS`, odanin simulasyon araligi): carpma dusmanin o
 * anki yerine bagli (yoksa hizli dusmanda bir tiklik yurume kadar govdenin
 * icine ya da onune cizilirdi).
 */
export function getContactServerTime(messageServerTime: number) {
  return messageServerTime - SERVER_TICK_MS;
}

/**
 * Carpmanin dusmana gore yerini cozer: dusmanin carpma anindaki konumu,
 * carpma anini cevreleyen iki snapshot arasinda dogrusal (temas mesaji ile
 * ardindaki snapshot ayni soketten, ayni tikten ya da sonrasindan). Ancak o
 * anin otesinde bir snapshot geldiginde cozuluyor; dusman o snapshot'ta yoksa
 * (oldu) carpma yerinde kaliyor. `buffer` sunucu saatine gore sirali gelen
 * snapshot'lar, `extra` henuz tampona girmemis (hidratlanan) snapshot.
 * Cozulduyse true.
 */
export function resolveHitAnchor(anchor: HitAnchor, buffer: ReadonlyArray<{ snapshot: AnchorSnapshot }>, extra?: AnchorSnapshot) {
  if (anchor.state !== "pending") return anchor.state === "anchored";
  let before: AnchorSnapshot | undefined;
  let after: AnchorSnapshot | undefined;
  for (const entry of buffer) {
    const snapshot = entry.snapshot;
    if (snapshot.serverTime <= anchor.at) before = snapshot;
    else if (!after) after = snapshot;
  }
  if (extra && extra.serverTime > anchor.at && (!after || extra.serverTime < after.serverTime)) after = extra;
  if (!after) return false;
  const next = after.enemies.find((enemy) => enemy.id === anchor.enemyId);
  if (!next) {
    anchor.state = "free";
    return false;
  }
  const previous = before?.enemies.find((enemy) => enemy.id === anchor.enemyId) ?? next;
  const span = before ? after.serverTime - before.serverTime : 0;
  const alpha = before && span > 0 ? Math.max(0, Math.min(1, (anchor.at - before.serverTime) / span)) : 1;
  anchor.offsetX = anchor.x - (previous.x + (next.x - previous.x) * alpha);
  anchor.offsetY = anchor.y - (previous.y + (next.y - previous.y) * alpha);
  anchor.state = "anchored";
  return true;
}
