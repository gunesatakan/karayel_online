import type Phaser from "phaser";
import { OPERATOR_BODY_LOW_HP_RATIO, type CharacterId, type GameSnapshot, type OperatorBodySnapshot } from "@karayel/shared";
import type { FlashSink } from "./flash-pool";
import type { VfxLod } from "./lod";
import { WORKER_VISUAL_SCALE } from "../visual-scale";

/**
 * Operator bedenleri (ZentaX, AttackLord): sahadaki govdenin cizimi.
 *
 * Sunucu bedenin yerini, durumunu ve canini her karede tam yolluyor
 * (`snapshot.bodies`). Burada yalnizca gorunus: tepeden bakis doku, ucusta
 * yone donus ve kisa hareket izi, bosta hafif suzulme, is basinda kisa bir
 * isin ve kivilcim, can cubugu ve acik bir dusuk can uyarisi. ZentaX'in
 * bedeni acik emir kademesine gore pembe bir halka aliyor (beden yurumuyor,
 * yalnizca isiniyor).
 *
 * Dil agir ve sert: ince cizgi, az renk, beyaz-sicak cekirdek; parilti,
 * yildiz, yaldiz yok. Hareket azaltmada iz ve suzulme yok, isin titremiyor.
 * LOD: kivilcim once, iz uzunlugu en son (`VfxLod`).
 */

/**
 * Gelismis iscinin ekrandaki capi (dunya birimi, harita olcegi 1):
 * GameScene'deki drone dokusu 30 birim, isci olcegi 0.69 x 0.75 x
 * `WORKER_VISUAL_SCALE`, gelismis govdenin yaricap orani 0.42
 * (`ADVANCED_WORKER_BODY_RADIUS_RATIO`).
 */
export const ADVANCED_WORKER_DISPLAY_DIAMETER = 30 * 0.69 * 0.75 * WORKER_VISUAL_SCALE * 0.42 * 2;
/**
 * Bedenin gorunen en uzun kenari (dunya birimi, olcek 1): ~19,6, mutlak.
 * Ilk istek "gelismis isciden %50 buyuk"tu (iscinin kuculmeden onceki capi
 * x 1.5); isciler %10 kuculunce beden ayni boyda kaldi, artik isciye bagli degil.
 */
export const OPERATOR_BODY_DISPLAY_SIZE = 30 * 0.69 * 0.75 * 0.42 * 2 * 1.5;
/** Bedenin gelismis isciye orani (bilgi icin): ~1,67. */
export const OPERATOR_BODY_SIZE_RATIO = OPERATOR_BODY_DISPLAY_SIZE / ADVANCED_WORKER_DISPLAY_DIAMETER;
/** Dokuda icerigin kare tuvale orani (tools/build-operator-bodies.mjs %6 pay). */
export const OPERATOR_BODY_TEXTURE_CONTENT = 1 / 1.06;

/** Isciler (42) ustunde; can cubugu ve uyari en ustte. */
export const OPERATOR_BODY_DEPTHS = Object.freeze({ shadow: 42.3, trail: 42.6, body: 43, overlay: 43.4 });

export const OPERATOR_BODY_TEXTURE_PATHS: Readonly<Partial<Record<CharacterId, string>>> = Object.freeze({
  zeynep: "images/operators/body-zeynep.webp",
  warrior: "images/operators/body-warrior.webp"
});

export function getOperatorBodyTextureKey(characterId: CharacterId) {
  return `operator-body-${characterId}`;
}

/**
 * Bedenin isik renkleri (dokudaki isiklarla ayni aile, yere indirilmis):
 * `tone` iz ve isin, `core` beyaz-sicak cekirdek, `deep` koyu dusum.
 */
export const OPERATOR_BODY_PALETTE = Object.freeze({
  zeynep: Object.freeze({ tone: 0xc04a82, core: 0xfbe7f1, deep: 0x5a1f3d }),
  warrior: Object.freeze({ tone: 0x7d4fc0, core: 0xefe6fb, deep: 0x2e1b4d })
});

export function getOperatorBodyPalette(characterId: CharacterId) {
  return characterId === "zeynep" ? OPERATOR_BODY_PALETTE.zeynep : OPERATOR_BODY_PALETTE.warrior;
}

/** Dusuk can uyarisi (beden olmez kipte uyari yok: ogretici, yaratici). */
export function isOperatorBodyLowHp(body: Pick<OperatorBodySnapshot, "hp" | "mhp" | "s" | "inv">) {
  return body.s !== "d" && !body.inv && body.mhp > 0 && body.hp / body.mhp < OPERATOR_BODY_LOW_HP_RATIO;
}

export type ZeynepAuraRing = {
  command: "haste" | "range" | "slow";
  /** 1 kucuk, 2 orta, 3 buyuk. */
  tier: 1 | 2 | 3;
  /** Halkadaki yay sayisi: kademe kadar (emir sirtindaki uc cizgiyle ayni dil). */
  arcs: number;
  /** Bedenin boyuna oran. */
  radius: number;
  /** Donus (tur/sn); menzil sabit. */
  spin: number;
  color: number;
  alpha: number;
};

const TIER_LEVEL = { small: 1, medium: 2, big: 3 } as const;

/**
 * ZentaX'in bedeni acik emirlere gore: her emir bir halka, kademe kadar yay.
 * Hizlanin ice yakin hizli doner, Alani Tutun disarida sabit, Yavaslatin
 * ortada ters ve yavas. Pembe ailesi; kademe yukseldikce kalinlik ve alfa.
 */
export function getZeynepBodyAura(commands: GameSnapshot["zeynepCommands"] | undefined): ZeynepAuraRing[] {
  if (!commands) return [];
  const rings: ZeynepAuraRing[] = [];
  const add = (command: ZeynepAuraRing["command"], effect: { tier: "small" | "medium" | "big"; remainingMs: number } | undefined, radius: number, spin: number, color: number) => {
    if (!effect || !(effect.remainingMs > 0)) return;
    const tier = TIER_LEVEL[effect.tier] ?? 1;
    rings.push({ command, tier, arcs: tier, radius, spin, color, alpha: 0.42 + tier * 0.14 });
  };
  add("haste", commands.haste, 0.62, 0.9, 0xc04a82);
  add("slow", commands.slow, 0.74, -0.35, 0x9c3d6b);
  add("range", commands.range, 0.88, 0, 0xd07aa2);
  return rings;
}

/** Iki snapshot arasi: ayni kimlikte konum ve can dogrusal; yeni gelen oldugu gibi. */
export function interpolateOperatorBodies(
  previous: readonly OperatorBodySnapshot[] | undefined,
  next: OperatorBodySnapshot[] | undefined,
  alpha: number
): OperatorBodySnapshot[] | undefined {
  if (!Array.isArray(next) || next.length === 0 || !Array.isArray(previous) || previous.length === 0) return next;
  const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  return next.map((body) => {
    const old = previous.find((candidate) => candidate.id === body.id);
    if (!old) return body;
    return { ...body, x: old.x + (body.x - old.x) * t, y: old.y + (body.y - old.y) * t, hp: old.hp + (body.hp - old.hp) * t };
  });
}

type BodyView = {
  image: Phaser.GameObjects.Image;
  characterId: CharacterId;
  x: number;
  y: number;
  rotation: number;
  /** Son konumlar (iz), duvar saatiyle. */
  trail: Array<{ x: number; y: number; at: number }>;
  lastAt: number;
  lowHp: boolean;
  down: boolean;
  /** Is pozu basladiginda kisa bir darbe (ms). */
  workStartedAt: number;
  wasWorking: boolean;
  seed: number;
  /** Nefessiz resim genisligi (3D beden bundan olculuyor, buyuyup kuculmuyor). */
  width: number;
};

export type OperatorBodyViewDeps = {
  lod: VfxLod;
  reducedMotion: () => boolean;
  flash?: FlashSink;
  /** Yerel oyuncunun oturumu: kendi kuyrugunun rotasi yalnizca ona. */
  localSessionId: () => string | undefined;
  /** Beden dusuk cana indi (esigi gecis aninda bir kez). */
  onLowHp?: (body: OperatorBodySnapshot) => void;
  /** Beden dustu (bir kez). */
  onDown?: (body: OperatorBodySnapshot) => void;
};

export type OperatorBodyFrame = {
  now: number;
  /** Harita olcegi (kare boyu / 34). */
  scale: number;
  zeynepCommands?: GameSnapshot["zeynepCommands"];
};

const TRAIL_MS = 140;
const TRAIL_MIN_SPEED = 120;

export class OperatorBodyView {
  private readonly views = new Map<string, BodyView>();
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private drawn = false;

  constructor(private readonly scene: Phaser.Scene, private readonly deps: OperatorBodyViewDeps) {
    this.shadow = scene.add.graphics().setDepth(OPERATOR_BODY_DEPTHS.shadow);
    this.trail = scene.add.graphics().setDepth(OPERATOR_BODY_DEPTHS.trail);
    this.overlay = scene.add.graphics().setDepth(OPERATOR_BODY_DEPTHS.overlay);
  }

  /** Cizilen bedenler (egik 3D gorunum onlari 3D modelle ciziyor, resimlerini gizliyor). */
  bodies() {
    return [...this.views.entries()].map(([id, view]) => ({ id, characterId: view.characterId, image: view.image, x: view.x, y: view.y, rotation: view.rotation, down: view.down, width: view.width }));
  }

  /** Son cizilen yer (yenilgi sahnesi bedenin patlamasini oraya koyuyor). */
  position(id: string) {
    const view = this.views.get(id);
    return view ? { x: view.x, y: view.y, size: view.image.displayWidth } : undefined;
  }

  render(bodies: readonly OperatorBodySnapshot[] | undefined, frame: OperatorBodyFrame) {
    const list = Array.isArray(bodies) ? bodies : [];
    for (const [id, view] of this.views) {
      if (!list.some((body) => body.id === id)) {
        view.image.destroy();
        this.views.delete(id);
      }
    }
    if (list.length === 0) {
      if (this.drawn) {
        this.shadow.clear();
        this.trail.clear();
        this.overlay.clear();
        this.drawn = false;
      }
      return;
    }
    this.drawn = true;
    this.shadow.clear();
    this.trail.clear();
    this.overlay.clear();
    const still = this.deps.reducedMotion();
    const local = this.deps.localSessionId();
    for (const body of list) {
      if (![body.x, body.y, body.hp, body.mhp].every(Number.isFinite)) continue;
      const view = this.ensureView(body, frame.now);
      if (!view) continue;
      this.drawBody(view, body, frame, still, body.id === local);
    }
  }

  private ensureView(body: OperatorBodySnapshot, now: number) {
    let view = this.views.get(body.id);
    if (view && view.characterId !== body.c) {
      view.image.destroy();
      this.views.delete(body.id);
      view = undefined;
    }
    if (view) return view;
    const key = getOperatorBodyTextureKey(body.c);
    if (!this.scene.textures.exists(key)) return undefined;
    const image = this.scene.add.image(body.x, body.y, key).setDepth(OPERATOR_BODY_DEPTHS.body);
    view = {
      image,
      characterId: body.c,
      x: body.x,
      y: body.y,
      rotation: 0,
      trail: [],
      lastAt: now,
      lowHp: false,
      down: false,
      workStartedAt: 0,
      wasWorking: false,
      seed: [...body.id].reduce((sum, char) => sum + char.charCodeAt(0), 0),
      width: 0
    };
    this.views.set(body.id, view);
    return view;
  }

  private drawBody(view: BodyView, body: OperatorBodySnapshot, frame: OperatorBodyFrame, still: boolean, own: boolean) {
    const { now, scale } = frame;
    const size = OPERATOR_BODY_DISPLAY_SIZE * scale;
    const palette = getOperatorBodyPalette(body.c);
    const dt = Math.max(0.001, Math.min(0.1, (now - view.lastAt) / 1000));
    const dx = body.x - view.x;
    const dy = body.y - view.y;
    const speed = Math.hypot(dx, dy) / dt;
    view.x = body.x;
    view.y = body.y;
    view.lastAt = now;

    if (body.s === "d") {
      if (!view.down) {
        view.down = true;
        this.deps.onDown?.(body);
      }
      // Dusmus beden: sonmus kabuk, hareketsiz.
      view.width = size / OPERATOR_BODY_TEXTURE_CONTENT;
      view.image.setPosition(body.x, body.y).setRotation(view.rotation).setDisplaySize(size / OPERATOR_BODY_TEXTURE_CONTENT, size / OPERATOR_BODY_TEXTURE_CONTENT)
        .setTint(0x3a3633).setAlpha(0.85);
      return;
    }
    if (view.down) {
      view.down = false;
      view.image.clearTint();
    }

    // Yon: ucarken gidis yonune (doku yukari bakiyor), bosta yavasca dik.
    const moving = speed > 40 && body.s === "m";
    const target = moving ? Math.atan2(dy, dx) + Math.PI / 2 : body.s === "w" && body.wx !== undefined && body.wy !== undefined
      ? Math.atan2(body.wy - body.y, body.wx - body.x) + Math.PI / 2 : 0;
    const turn = Math.atan2(Math.sin(target - view.rotation), Math.cos(target - view.rotation));
    view.rotation += turn * Math.min(1, dt * (moving ? 14 : 5));

    // Bosta suzulme: hafif ve yavas; hareket azaltmada yok.
    const bob = still || body.s !== "i" ? 0 : Math.sin(now / 520 + view.seed) * 0.7 * scale;
    const breathe = still ? 1 : 1 + Math.sin(now / 760 + view.seed) * 0.012;
    view.width = size / OPERATOR_BODY_TEXTURE_CONTENT;
    const display = view.width * breathe;
    view.image.setPosition(body.x, body.y + bob).setRotation(view.rotation).setDisplaySize(display, display).setAlpha(1);

    // Golge: ucan govde yere degmiyor.
    this.shadow.fillStyle(0x020617, 0.3);
    this.shadow.fillEllipse(body.x + 1.2 * scale, body.y + size * 0.36, size * 0.82, size * 0.32);

    // Hareket izi: kisa, sivrilen; hareket azaltmada ve son LOD basamaginda yok.
    if (!still && this.deps.lod.level < 4) {
      if (moving && speed > TRAIL_MIN_SPEED * scale) view.trail.push({ x: body.x, y: body.y, at: now });
      while (view.trail.length > 0 && now - view.trail[0].at > TRAIL_MS) view.trail.shift();
      if (view.trail.length > 12) view.trail.splice(0, view.trail.length - 12);
      for (let index = 1; index < view.trail.length; index += 1) {
        const from = view.trail[index - 1];
        const to = view.trail[index];
        const life = 1 - (now - to.at) / TRAIL_MS;
        if (life <= 0) continue;
        this.trail.lineStyle(size * 0.34 * life, palette.tone, 0.28 * life);
        this.trail.lineBetween(from.x, from.y, to.x, to.y);
        this.trail.lineStyle(Math.max(0.6, size * 0.08 * life), palette.core, 0.4 * life);
        this.trail.lineBetween(from.x, from.y, to.x, to.y);
      }
    } else if (view.trail.length > 0) {
      view.trail.length = 0;
    }

    // Kendi kuyrugu: bekleyen kurulumlara ince, soluk bir rota.
    if (own && Array.isArray(body.q) && body.q.length >= 2) {
      this.overlay.lineStyle(Math.max(0.8, scale), palette.tone, 0.26);
      this.overlay.beginPath();
      this.overlay.moveTo(body.x, body.y);
      for (let index = 0; index + 1 < body.q.length; index += 2) this.overlay.lineTo(body.q[index], body.q[index + 1]);
      this.overlay.strokePath();
    }

    if (body.c === "zeynep") this.drawZeynepAura(body, frame, size, still);

    const working = body.s === "w" && body.wx !== undefined && body.wy !== undefined;
    if (working && !view.wasWorking) view.workStartedAt = now;
    view.wasWorking = working;
    if (working) this.drawWorkBeam(view, body, palette, size, now, still);

    this.drawHealth(view, body, size, now, still);
  }

  /** Is isini: govdeden yapiya/dusmana ince sert isin, ucta kisa kivilcim. */
  private drawWorkBeam(view: BodyView, body: OperatorBodySnapshot, palette: { tone: number; core: number; deep: number }, size: number, now: number, still: boolean) {
    const tx = body.wx!;
    const ty = body.wy!;
    const age = Math.max(0, now - view.workStartedAt);
    const flicker = still ? 1 : 0.75 + 0.25 * Math.sin(now / 21 + view.seed);
    const fromX = body.x + Math.sin(view.rotation) * size * 0.3;
    const fromY = body.y - Math.cos(view.rotation) * size * 0.3;
    const distance = Math.hypot(tx - fromX, ty - fromY);
    if (distance > size * 0.2) {
      this.overlay.lineStyle(size * 0.16, palette.tone, 0.45 * flicker);
      this.overlay.lineBetween(fromX, fromY, tx, ty);
      this.overlay.lineStyle(Math.max(0.7, size * 0.05), palette.core, 0.9 * flicker);
      this.overlay.lineBetween(fromX, fromY, tx, ty);
    }
    // Ucta sert beyaz nokta; ilk anda kisa bir halka (kurulum/onarim/infaz ani).
    this.overlay.fillStyle(palette.core, 0.95 * flicker);
    this.overlay.fillCircle(tx, ty, size * 0.09);
    if (age < 160) {
      const t = age / 160;
      this.overlay.lineStyle(Math.max(0.7, size * 0.05), palette.core, 0.7 * (1 - t));
      this.overlay.strokeCircle(tx, ty, size * (still ? 0.45 : 0.18 + 0.4 * t));
    }
    if (this.deps.lod.sparks && !still) {
      for (let index = 0; index < 4; index += 1) {
        const life = ((now + view.seed * 17 + index * 41) % 180) / 180;
        const angle = view.seed + index * 1.7 + Math.floor((now + index * 41) / 180) * 2.3;
        const reach = size * (0.12 + 0.3 * life);
        const sx = tx + Math.cos(angle) * reach;
        const sy = ty + Math.sin(angle) * reach;
        this.overlay.lineStyle(Math.max(0.6, size * 0.04), index % 2 ? palette.core : 0xd9c08a, 0.8 * (1 - life));
        this.overlay.lineBetween(sx, sy, sx - Math.cos(angle) * size * 0.1, sy - Math.sin(angle) * size * 0.1);
      }
    }
  }

  /** ZentaX: acik emirlerin halkalari (kademe kadar yay), pembe ailesi. */
  private drawZeynepAura(body: OperatorBodySnapshot, frame: OperatorBodyFrame, size: number, still: boolean) {
    const rings = getZeynepBodyAura(frame.zeynepCommands);
    if (rings.length === 0) return;
    const phase = frame.now / 1000;
    for (const ring of rings) {
      const radius = size * ring.radius;
      const width = Math.max(0.7, size * (0.035 + ring.tier * 0.015));
      // Ince taban halkasi: emrin acik oldugunu soyluyor.
      this.overlay.lineStyle(Math.max(0.5, size * 0.02), ring.color, ring.alpha * 0.35);
      this.overlay.strokeCircle(body.x, body.y, radius);
      // Kademe kadar yay; yaylar arasi esit bosluk.
      const offset = still ? 0 : phase * Math.PI * 2 * ring.spin;
      const span = (Math.PI * 2) / Math.max(1, ring.arcs);
      const arcLength = span * (ring.command === "range" ? 0.22 : 0.42);
      this.overlay.lineStyle(width, ring.color, ring.alpha);
      for (let index = 0; index < ring.arcs; index += 1) {
        const start = offset + index * span - Math.PI / 2;
        this.overlay.beginPath();
        this.overlay.arc(body.x, body.y, radius, start, start + arcLength, false);
        this.overlay.strokePath();
      }
      if (ring.tier >= 3) {
        // Buyuk kademe: yaylarin basinda beyaz-sicak cekirdek.
        this.overlay.fillStyle(0xfbe7f1, 0.85);
        for (let index = 0; index < ring.arcs; index += 1) {
          const angle = offset + index * span - Math.PI / 2;
          this.overlay.fillCircle(body.x + Math.cos(angle) * radius, body.y + Math.sin(angle) * radius, width * 0.7);
        }
      }
    }
  }

  /** Can cubugu yaralida; dusuk canda kirmizi, nabiz atan bir halka. */
  private drawHealth(view: BodyView, body: OperatorBodySnapshot, size: number, now: number, still: boolean) {
    const ratio = Math.max(0, Math.min(1, body.hp / Math.max(1, body.mhp)));
    const low = isOperatorBodyLowHp(body);
    if (low && !view.lowHp) this.deps.onLowHp?.(body);
    view.lowHp = low;
    if (low) {
      const pulse = still ? 0.6 : 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(now / 160));
      this.overlay.lineStyle(Math.max(1, size * 0.07), 0xc8473a, pulse);
      this.overlay.strokeCircle(body.x, body.y, size * 0.7);
    }
    if (ratio >= 0.999) return;
    const width = Math.max(14, size * 1.05);
    const height = Math.max(2, size * 0.11);
    const x = body.x - width / 2;
    // Cubuk govdenin altinda: park yeri cogu zaman bir yapinin kosesi ve
    // yapinin kendi can cubugu ustte.
    const y = body.y + size * 0.62;
    this.overlay.fillStyle(0x020617, 0.9).fillRect(x - 1, y - 1, width + 2, height + 2);
    this.overlay.fillStyle(ratio > 0.6 ? 0x22c55e : ratio > OPERATOR_BODY_LOW_HP_RATIO ? 0xf59e0b : 0xef4444, 1).fillRect(x, y, width * ratio, height);
  }

  destroy() {
    for (const view of this.views.values()) view.image.destroy();
    this.views.clear();
    this.shadow.destroy();
    this.trail.destroy();
    this.overlay.destroy();
  }
}
