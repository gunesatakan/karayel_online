/**
 * Mac sonu sahnesinin cizimi (match-end-sequence'in gorseli).
 *
 * Yenilgi: agir, endustriyel patlama -- sert beyaz-sicak flas, sok halkasi,
 * celik kirintisi, kivilcim ve koyu duman sutunu; geride yanik izi ve kararmis
 * govde (kabuk). Duvar daha hafif, nexus daha agir (iki halka, uzun duman).
 *
 * Zafer: nexus'tan gokyuzune soguk camgobegi-beyaz bir sevkiyat isini (sert
 * cekirdek, ince kilif, yukari akan veri paketleri); kulelerden nexus'a
 * giden soguk enerji darbesi; kalan dusmanlar tarama cizgisi gibi cozuluyor.
 *
 * Dil kitten: yere indirilmis tonlar, beyaz-sicak cekirdek, koyu dusum; yaldiz,
 * konfeti ve pastel yok (tests/match-end-sequence.test.mjs renkleri denetliyor).
 * Havuzlu: olaylar sabit kapasiteli bir dizide, karede nesne uretilmiyor.
 * Hareket azaltmada halkalar buyumuyor, duman yukselmiyor, paketler akmiyor.
 * LOD: 1 kivilcim yariya, 2 duman yariya ve ADD kilif soluk, 3 yanik izi yok.
 */
import {
  SCORCH,
  STEEL,
  clamp01,
  coolingColor,
  darken,
  drawBallisticSparks,
  drawDebris,
  drawScorch,
  drawSmoke,
  fillDisc,
  fillFan,
  hashNoise,
  liftToWhite,
  strokeRing,
  whiteHot,
  type VfxGraphics
} from "./kit";
import type { FlashSink } from "./flash-pool";
import type { VfxLod } from "./lod";

/** Patlamanin sicak tonu: yere indirilmis pas-turuncu (doygunluk ~0.59). */
export const MATCH_END_EMBER = 0xb0582e;
/** Sok halkasi: neredeyse gri, acik. */
export const MATCH_END_SHOCK = 0xd6d3d1;
/** Duman sutunu: koyu ve acik iki katman. */
export const MATCH_END_SMOKE_DARK = 0x1c1917;
export const MATCH_END_SMOKE_LIGHT = 0x5c5753;
/** Zaferin soguk tonu ve beyaz-sicak hali. */
export const MATCH_END_COLD = 0x4f9fb3;
export const MATCH_END_COLD_HOT = liftToWhite(MATCH_END_COLD, 0.9);
export const MATCH_END_COLD_CORE = 0xf4fbfd;
/** Kabuk: patlayan kulenin sprite tonu (sahne uyguluyor) ve govdesinin ustundeki is. */
export const MATCH_END_HUSK_TINT = 0x3a3633;
/** Gucunu devreden kulenin sprite tonu: soguk, sonuk gri. */
export const MATCH_END_POWERED_DOWN_TINT = 0x4b5258;
const HUSK_CRACK = 0x5a2c17;

export type MatchEndBlastRole = "tower" | "wall" | "nexus";

type EventKind = "blast" | "power" | "dissolve" | "arrive" | "climax";

type VfxEvent = {
  live: boolean;
  kind: EventKind;
  role: MatchEndBlastRole;
  x: number;
  y: number;
  size: number;
  tx: number;
  ty: number;
  bornAt: number;
  seed: number;
};

type Husk = { x: number; y: number; size: number; wall: boolean; seed: number };

/** Ayni anda canli olay siniri; dolunca en eskisi geri donusuyor. */
export const MATCH_END_EVENT_CAP = 96;
/** Kabuk siniri (yapi sayisi ustu; sahne bundan fazlasini istemiyor). */
export const MATCH_END_HUSK_CAP = 320;

/** Olay omurleri (ms). */
export const MATCH_END_LIFE_MS: Readonly<Record<"tower" | "wall" | "nexus" | "power" | "dissolve" | "arrive" | "climax", number>> = Object.freeze({
  tower: 1900,
  wall: 1000,
  nexus: 2900,
  power: 900,
  dissolve: 650,
  arrive: 360,
  climax: 900
});
/** Guc darbesinin tower -> nexus yolculugu. */
const POWER_TRAVEL_MS = 520;
const POWER_DELAY_MS = 60;

export type MatchEndVfxOptions = {
  flash?: FlashSink;
  lod?: VfxLod;
  reducedMotion?: () => boolean;
  /**
   * Zafer isininin yuzeyleri (govde ve ADD kilif). Egik 3D gorunumde nexus'tan
   * yukari dik (render3d/overlay-3d `upright`, taban `setAnchor`); yoksa govde ve parlama.
   */
  beam?: { body: BeamSurface; glow: BeamSurface };
};

type BeamSurface = VfxGraphics & { clear(): unknown; setAnchor?(x: number, y: number): void };

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export class MatchEndVfx {
  private readonly events: VfxEvent[] = [];
  private cursor = 0;
  private readonly husks: Husk[] = [];
  private beam?: { x: number; y: number; size: number; startAt: number; peakAt: number; top: number };

  constructor(
    private readonly ground: VfxGraphics & { clear(): unknown },
    private readonly body: VfxGraphics & { clear(): unknown },
    private readonly glow: VfxGraphics & { clear(): unknown },
    private readonly options: MatchEndVfxOptions = {}
  ) {}

  private get still() {
    return this.options.reducedMotion?.() ?? false;
  }

  private get lod() {
    return this.options.lod?.level ?? 0;
  }

  private spawn(kind: EventKind, role: MatchEndBlastRole, x: number, y: number, size: number, now: number, seed: number, tx = x, ty = y) {
    let slot: VfxEvent | undefined;
    for (const event of this.events) {
      if (!event.live) {
        slot = event;
        break;
      }
    }
    if (!slot) {
      if (this.events.length < MATCH_END_EVENT_CAP) {
        slot = { live: false, kind, role, x, y, size, tx, ty, bornAt: now, seed };
        this.events.push(slot);
      } else {
        slot = this.events[this.cursor % this.events.length];
        this.cursor += 1;
      }
    }
    slot.live = true;
    slot.kind = kind;
    slot.role = role;
    slot.x = x;
    slot.y = y;
    slot.size = size;
    slot.tx = tx;
    slot.ty = ty;
    slot.bornAt = now;
    slot.seed = seed;
    return slot;
  }

  /** Canli olay sayisi (tani ve test). */
  get liveCount() {
    let count = 0;
    for (const event of this.events) if (event.live) count += 1;
    return count;
  }

  get huskCount() {
    return this.husks.length;
  }

  /** Yapi patlamasi; geride kabuk kaliyor. */
  detonate(x: number, y: number, size: number, role: MatchEndBlastRole, now: number, seed: number) {
    this.spawn("blast", role, x, y, size, now, seed);
    if (role !== "nexus" && this.husks.length < MATCH_END_HUSK_CAP) this.husks.push({ x, y, size, wall: role === "wall", seed });
    const flash = this.options.flash;
    if (!flash) return;
    const still = this.still;
    const heavy = role === "nexus" ? 1.8 : role === "wall" ? 0.6 : 1;
    // Sert beyaz-sicak flas: kisa, buyuk; ardindan sicak tonun daha uzun isisi.
    flash.flash({ x, y, texture: "glow", tint: 0xffffff, alpha: role === "wall" ? 0.7 : 0.95, sizeFrom: still ? size * 2.4 * heavy : size * 0.7 * heavy, sizeTo: size * 2.6 * heavy, durationMs: role === "nexus" ? 260 : 150, bornAt: now });
    if (this.lod < 2) {
      flash.flash({ x, y, texture: "glow", tint: MATCH_END_EMBER, alpha: 0.55, sizeFrom: size * 1.1 * heavy, sizeTo: size * 3.2 * heavy, durationMs: role === "nexus" ? 900 : 420, bornAt: now });
    }
  }

  /** Zafer: kule gucunu devrediyor (halka iceri, darbe nexus'a). */
  powerDown(x: number, y: number, size: number, nexus: { x: number; y: number }, now: number, seed: number) {
    this.spawn("power", "tower", x, y, size, now, seed, nexus.x, nexus.y);
  }

  /** Zafer: kalan dusman tarama cizgisi gibi cozuluyor. */
  dissolve(x: number, y: number, size: number, now: number, seed: number) {
    this.spawn("dissolve", "tower", x, y, size, now, seed);
  }

  /** Zafer: sevkiyat isini nexus'tan yukseliyor, `peakAt`ta tepe. */
  startBeam(x: number, y: number, size: number, startAt: number, peakAt: number, top: number) {
    this.beam = { x, y, size, startAt, peakAt: Math.max(startAt + 1, peakAt), top };
  }

  /** Zafer: isinin tepesi -- kalkis. Soguk sert flas ve halka. */
  launch(now: number) {
    const beam = this.beam;
    if (!beam) return;
    this.spawn("climax", "nexus", beam.x, beam.y, beam.size, now, 7);
    this.options.flash?.flash({ x: beam.x, y: beam.y, texture: "glow", tint: MATCH_END_COLD_CORE, alpha: 0.9, sizeFrom: beam.size * (this.still ? 4 : 1.4), sizeTo: beam.size * 4, durationMs: 320, bornAt: now });
  }

  clear() {
    for (const event of this.events) event.live = false;
    this.husks.length = 0;
    this.beam = undefined;
    this.ground.clear();
    this.body.clear();
    this.glow.clear();
  }

  render(now: number) {
    const ground = this.ground;
    const body = this.body;
    const glow = this.glow;
    ground.clear();
    body.clear();
    glow.clear();
    this.options.beam?.body.clear();
    this.options.beam?.glow.clear();
    const still = this.still;
    const lod = this.lod;
    for (const husk of this.husks) this.drawHusk(husk, lod);
    if (this.beam) this.drawBeam(now, still, lod);
    for (const event of this.events) {
      if (!event.live) continue;
      const age = now - event.bornAt;
      if (age < 0) continue;
      const life = event.kind === "blast" ? MATCH_END_LIFE_MS[event.role] : MATCH_END_LIFE_MS[event.kind];
      if (age >= life) {
        event.live = false;
        continue;
      }
      if (event.kind === "blast") this.drawBlast(event, age, still, lod);
      else if (event.kind === "power") this.drawPower(event, age, still, now);
      else if (event.kind === "arrive" || event.kind === "climax") this.drawArrive(event, age, still);
      else this.drawDissolve(event, age, still);
    }
  }

  /* ------------------------------------------------------------------ */

  private drawHusk(husk: Husk, lod: number) {
    const { x, y, size, seed } = husk;
    if (lod < 3) drawScorch(this.ground, x, y, 0, size * (husk.wall ? 0.6 : 0.85), size * (husk.wall ? 0.32 : 0.5), SCORCH, 0.75, seed);
    if (husk.wall) {
      // Duvar enkazi: birkac koyu parca.
      for (let index = 0; index < 3; index += 1) {
        const ox = (hashNoise(seed + index * 5) - 0.5) * size * 0.9;
        const oy = (hashNoise(seed + index * 5 + 1) - 0.5) * size * 0.35;
        this.body.fillStyle(index === 0 ? HUSK_CRACK : 0x292524, 0.85);
        fillDisc(this.body, x + ox, y + oy, size * 0.09);
      }
      return;
    }
    // Kabuk: govdenin ustunde is ve iki kor catlagi (sprite sahnede karartiliyor).
    this.body.fillStyle(SCORCH, 0.42);
    fillDisc(this.body, x, y, size * 0.36);
    this.body.lineStyle(Math.max(0.8, size * 0.022), HUSK_CRACK, 0.65);
    for (let index = 0; index < 2; index += 1) {
      const angle = hashNoise(seed + 11 + index) * Math.PI * 2;
      const reach = size * (0.22 + hashNoise(seed + 13 + index) * 0.16);
      const bend = angle + (hashNoise(seed + 17 + index) - 0.5) * 1.2;
      const mx = x + Math.cos(angle) * reach * 0.5;
      const my = y + Math.sin(angle) * reach * 0.5;
      this.body.lineBetween(x, y, mx, my);
      this.body.lineBetween(mx, my, mx + Math.cos(bend) * reach * 0.5, my + Math.sin(bend) * reach * 0.5);
    }
  }

  private drawBlast(event: VfxEvent, age: number, still: boolean, lod: number) {
    const { x, y, seed } = event;
    const nexus = event.role === "nexus";
    const wall = event.role === "wall";
    const size = event.size;
    const body = this.body;

    // Beyaz-sicak cekirdek (ADD, kisa) ve duzensiz ates topu: beyazdan pasa,
    // pastan karanliga soguyarak buyuyor; duman ondan devraliyor.
    const coreMs = nexus ? 200 : 110;
    const scale = nexus ? 1.6 : wall ? 0.55 : 1;
    if (age < coreMs) {
      const t = age / coreMs;
      this.glow.fillStyle(whiteHot(MATCH_END_EMBER, 1), clamp01((1 - t) * (1 - t)));
      fillDisc(this.glow, x, y, size * 0.38 * scale * (0.75 + 0.25 * t));
    }
    const fireMs = nexus ? 620 : wall ? 260 : 400;
    if (age < fireMs) {
      const t = age / fireMs;
      const lobes = nexus ? 7 : wall ? 3 : 5;
      // Uc kat: koyu dis kabuk, pas rengi govde, beyaz-sicak ic (ADD). Kat
      // basina ayni loblar kuculerek: kenar karanlik, ic sicak -- hacim.
      for (let pass = 0; pass < 3; pass += 1) {
        if (pass === 2 && t > 0.5) break;
        const surface = pass === 2 ? this.glow : body;
        const shrink = pass === 0 ? 1 : pass === 1 ? 0.7 : 0.4;
        const color = pass === 0
          ? darken(MATCH_END_EMBER, 0.55 + 0.35 * t)
          : pass === 1
            ? coolingColor(MATCH_END_EMBER, 0.3 + 0.7 * t)
            : whiteHot(MATCH_END_EMBER, 1 - t * 2);
        const alpha = pass === 0 ? 0.85 * (1 - t * t) : pass === 1 ? 0.9 * (1 - t) * (1 - t) : 0.9 * (1 - t * 2);
        surface.fillStyle(color, clamp01(alpha));
        for (let index = 0; index < lobes; index += 1) {
          const base = seed + index * 19;
          const angle = (index / lobes) * Math.PI * 2 + hashNoise(base) * 0.9;
          const spread = size * scale * (0.1 + 0.3 * easeOut(t)) * (0.6 + hashNoise(base + 1) * 0.5) * (pass === 0 ? 1 : 0.75);
          const radius = size * scale * (0.2 + 0.26 * easeOut(t)) * (0.7 + hashNoise(base + 2) * 0.5) * shrink;
          fillFan(surface, x + Math.cos(angle) * spread, y + Math.sin(angle) * spread - (still ? 0 : size * 0.25 * t), radius, radius * 0.86, 6, hashNoise(base + 4) * Math.PI);
        }
      }
    }

    // Sok halkasi (nexus'ta iki tane, ikincisi gecikmeli).
    const rings = nexus ? 2 : 1;
    for (let ring = 0; ring < rings; ring += 1) {
      const ringAge = age - ring * 160;
      const ringMs = nexus ? 620 : wall ? 300 : 420;
      if (ringAge < 0 || ringAge >= ringMs) continue;
      const t = ringAge / ringMs;
      const reach = size * (nexus ? 3.4 : wall ? 1.4 : 2.5);
      const radius = still ? reach * 0.7 : size * 0.45 + (reach - size * 0.45) * easeOut(t);
      body.lineStyle(Math.max(0.8, (nexus ? 4.4 : 3) * (1 - t)), MATCH_END_SHOCK, clamp01(0.85 * (1 - t)));
      strokeRing(body, x, y, radius);
      if (!wall) {
        body.lineStyle(Math.max(0.6, 2 * (1 - t)), 0x57534e, clamp01(0.6 * (1 - t)));
        strokeRing(body, x, y, radius * 0.8);
      }
    }

    // Kivilcim: LOD 1'de yariya, 3'te yok.
    const sparkBase = nexus ? 24 : wall ? 4 : 12;
    const sparks = lod >= 3 ? 0 : lod >= 1 ? Math.ceil(sparkBase / 2) : sparkBase;
    if (sparks > 0 && !still) {
      drawBallisticSparks(body, x, y, age, {
        seed, count: sparks, speed: size * (nexus ? 8 : 6.5), heading: undefined, fan: 0, gravity: size * 9,
        lifeMs: nexus ? 760 : 520, hue: MATCH_END_EMBER, width: nexus ? 1.8 : 1.3, alpha: 1, streak: 0.035
      });
    }

    // Celik kirintisi: yere iniyor.
    const debris = lod >= 4 ? 0 : nexus ? 18 : wall ? 5 : 9;
    if (debris > 0) {
      // Parcalar cekirdekte kume halinde dogmuyor: ~70 ms ileriden (zaten firlamis).
      drawDebris(body, x, y, still ? 0 : age + 70, {
        // Nexus haritanin alt kenarinda: parcalar yukari yelpazede, bosluga dusmesin.
        seed: seed + 3, count: debris, speed: size * (nexus ? 5.2 : 4.4), heading: nexus ? -Math.PI / 2 : undefined, fan: nexus ? 2.6 : 0, gravity: size * 10,
        lifeMs: nexus ? 1800 : 1100, color: darken(STEEL, 0.25), edge: MATCH_END_EMBER, size: size * (nexus ? 0.14 : 0.12),
        alpha: 0.95, floor: size * (nexus ? 0.15 : 0.45)
      }, this.ground);
    }

    // Koyu duman sutunu: yukseliyor ve buyuyor; ustte daha acik bir katman.
    const smokeAge = age - 60;
    if (smokeAge >= 0) {
      const dark = nexus ? 10 : wall ? 3 : 6;
      const darkCount = lod >= 2 ? Math.ceil(dark / 2) : dark;
      const life = nexus ? 2700 : wall ? 900 : 1800;
      // Koyu zeminde okunsun: acik katman once (arkada, daha yuksege), koyu govde onde.
      if (!wall && lod < 2) {
        drawSmoke(body, x, y - size * 0.35, smokeAge, {
          seed: seed + 9, count: nexus ? 5 : 3, radius: size * (nexus ? 0.5 : 0.36), grow: 1.5, rise: size * (nexus ? 3.8 : 2.8),
          lifeMs: life, color: MATCH_END_SMOKE_LIGHT, alpha: 0.42, still
        });
      }
      drawSmoke(body, x, y, smokeAge, {
        seed: seed + 7, count: darkCount, radius: size * (nexus ? 0.55 : 0.4), grow: 1.6, rise: size * (nexus ? 3.2 : 2.2),
        lifeMs: life, color: MATCH_END_SMOKE_DARK, alpha: 0.72, still
      });
    }

    // Nexus: genis yanik izi ve govdenin yerinde soguyan kor catlaklari.
    if (nexus) {
      const t = age / MATCH_END_LIFE_MS.nexus;
      if (lod < 3) drawScorch(this.ground, x, y, 0, size * 1.4, size * 0.85, SCORCH, 0.85, seed + 21);
      body.lineStyle(Math.max(0.8, size * 0.016), coolingColor(MATCH_END_EMBER, 0.3 + 0.7 * t), clamp01(0.75 * (1 - t)));
      for (let index = 0; index < 5; index += 1) {
        const angle = (index / 5) * Math.PI * 2 + hashNoise(seed + index) * 0.9;
        const reach = size * (0.22 + hashNoise(seed + index + 9) * 0.3);
        const bend = angle + (hashNoise(seed + index + 17) - 0.5) * 0.9;
        const mx = x + Math.cos(angle) * reach * 0.55;
        const my = y + Math.sin(angle) * reach * 0.55;
        body.lineBetween(x, y, mx, my);
        body.lineBetween(mx, my, mx + Math.cos(bend) * reach * 0.45, my + Math.sin(bend) * reach * 0.45);
      }
    }
  }

  private drawPower(event: VfxEvent, age: number, still: boolean, now: number) {
    const { x, y, size, tx, ty } = event;
    const body = this.body;
    // Kulede iceri cokulen soguk halka.
    if (age < 360) {
      const t = age / 360;
      body.lineStyle(1.6, MATCH_END_COLD, clamp01(0.85 * (1 - t)));
      strokeRing(body, x, y, size * (still ? 0.6 : 1.1 - 0.7 * t));
      body.fillStyle(MATCH_END_COLD_HOT, clamp01(0.7 * (1 - t)));
      fillDisc(body, x, y, size * 0.12 * (1 - t));
    }
    // Darbe nexus'a: hizlanarak (giris yumusak), ince iletim cizgisi.
    const travel = (age - POWER_DELAY_MS) / POWER_TRAVEL_MS;
    if (travel >= 0 && travel < 1) {
      const head = still ? 1 : travel * travel;
      const tail = still ? 0 : Math.max(0, head - 0.16);
      const hx = x + (tx - x) * head;
      const hy = y + (ty - y) * head;
      const sx = x + (tx - x) * tail;
      const sy = y + (ty - y) * tail;
      body.lineStyle(1, MATCH_END_COLD, clamp01(0.16 * (1 - travel)));
      body.lineBetween(x, y, tx, ty);
      if (!still) {
        this.glow.lineStyle(4, MATCH_END_COLD, 0.42);
        this.glow.lineBetween(sx, sy, hx, hy);
        body.lineStyle(1.6, MATCH_END_COLD_CORE, 0.95);
        body.lineBetween(sx, sy, hx, hy);
      }
    } else if (travel >= 1 && event.live) {
      // Varis: nexus'ta kucuk sert halka (ayri olay; bu olay omrunu suruyor).
      event.live = false;
      this.spawn("arrive", "tower", tx, ty, size, now, event.seed);
    }
  }

  private drawArrive(event: VfxEvent, age: number, still: boolean) {
    const climax = event.kind === "climax";
    const t = age / MATCH_END_LIFE_MS[climax ? "climax" : "arrive"];
    const reach = event.size * (climax ? 3.6 : 0.9);
    const radius = still ? reach * 0.8 : event.size * 0.3 + (reach - event.size * 0.3) * easeOut(t);
    this.body.lineStyle(climax ? 3 : 1.4, climax ? MATCH_END_COLD_HOT : MATCH_END_COLD, clamp01((climax ? 0.9 : 0.7) * (1 - t)));
    strokeRing(this.body, event.x, event.y, radius);
  }

  private drawDissolve(event: VfxEvent, age: number, still: boolean) {
    const t = age / MATCH_END_LIFE_MS.dissolve;
    const { x, y, size, seed } = event;
    const slices = 5;
    const height = Math.max(1, size * 0.09);
    for (let index = 0; index < slices; index += 1) {
      const oy = (index / (slices - 1) - 0.5) * size * 0.8;
      const shift = still ? 0 : (hashNoise(seed + index * 3) - 0.5) * size * 1.1 * t;
      const width = size * (0.8 - 0.5 * t) * (0.6 + hashNoise(seed + index * 3 + 1) * 0.4);
      this.body.fillStyle(index % 2 === 0 ? MATCH_END_COLD : MATCH_END_COLD_HOT, clamp01(0.75 * (1 - t)));
      this.body.fillRect(x - width / 2 + shift, y + oy - height / 2, width, height);
    }
  }

  private drawBeam(now: number, still: boolean, lod: number) {
    const beam = this.beam!;
    const raw = clamp01((now - beam.startAt) / (beam.peakAt - beam.startAt));
    if (now < beam.startAt) return;
    // Yavas basliyor, sona dogru dolup tepe yapiyor.
    const p = raw * raw * (3 - 2 * raw);
    const { x, y, size, top } = beam;
    // Isinin kendisi kendi yuzeyinde (3D'de dik); taban halkalari govdede, yerde.
    const glow = this.options.beam?.glow ?? this.glow;
    const body = this.options.beam?.body ?? this.body;
    this.options.beam?.glow.setAnchor?.(x, y);
    this.options.beam?.body.setAnchor?.(x, y);
    // Isin yerden yukari uzaniyor: ilk %15'te tavana ulasiyor.
    const reach = still ? 1 : clamp01(raw / 0.15);
    const topY = y + (top - y) * reach;
    // Kilif (ADD, LOD 2'de soluk), orta katman ve sert cekirdek.
    glow.lineStyle(size * (0.25 + 0.75 * p), MATCH_END_COLD, (lod >= 2 ? 0.08 : 0.14) + 0.12 * p);
    glow.lineBetween(x, y, x, topY);
    body.lineStyle(Math.max(1.5, size * (0.08 + 0.26 * p)), MATCH_END_COLD_HOT, 0.4 + 0.4 * p);
    body.lineBetween(x, y, x, topY);
    body.lineStyle(Math.max(1, size * (0.03 + 0.08 * p)), MATCH_END_COLD_CORE, 0.95);
    body.lineBetween(x, y, x, topY);
    // Yukari akan sevkiyat paketleri: kisa sert cizgiler.
    const packets = Math.round((lod >= 2 ? 4 : 8) * (0.4 + 0.6 * p));
    const length = Math.abs(y - top);
    for (let index = 0; index < packets; index += 1) {
      const offset = hashNoise(index * 13 + 5) * length;
      const travel = still ? offset : (offset + (now - beam.startAt) * (0.5 + 0.9 * p)) % length;
      const py = y - travel;
      if (py < topY) continue;
      const half = size * 0.3;
      body.lineStyle(Math.max(1, size * 0.07), MATCH_END_COLD_CORE, 0.9);
      body.lineBetween(x, py, x, py - half);
    }
    // Taban: sert halkalar (yavas nefes, hareket azaltmada sabit) ve beyaz-sicak cekirdek.
    const breathe = still ? 0 : Math.sin(now / 260) * 0.06;
    const base = this.body;
    base.lineStyle(2, MATCH_END_COLD, 0.55 + 0.35 * p);
    strokeRing(base, x, y, size * (0.75 + breathe));
    base.lineStyle(1.2, MATCH_END_COLD_HOT, 0.35 + 0.5 * p);
    strokeRing(base, x, y, size * (1.15 + 0.35 * p));
    base.fillStyle(MATCH_END_COLD_CORE, 0.85);
    fillDisc(base, x, y, size * (0.12 + 0.16 * p));
  }
}
