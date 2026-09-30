import type Phaser from "phaser";
import {
  TIER_COLUMN_HEIGHT_RATIO,
  getUltimateShockwavePose,
  getDeathBurstPose,
  getTierCeremonyPose,
  getTierShardOrbit,
  pickAccentColor,
  type BeamSnapshot,
  type ProjectileSnapshot
} from "@karayel/shared";

type Graphics = Phaser.GameObjects.Graphics;
export type ShotStyle = "tracker" | "pierce" | "psychic" | "server" | "electric" | "synthesis";
export type ShotEffect = {
  x: number; y: number; angle: number; tier: number;
  definitionId: string; bornAt: number; seed: number; muzzle?: boolean;
};
/**
 * Olum patlamasi ("death" turu): basilan govde, kiymiklar, agir dusmanda toz
 * halkasi. Sprite yok; tek Graphics yuzeyinde, yasina gore her karede yeniden.
 */
export type DeathBurst = {
  x: number; y: number;
  /** Dusmanin ekrandaki boyu (dunya px). */
  size: number;
  /** Dusmanin kendi rengi: dokunun vurgusu, sprite'in tonuyla. */
  color: number;
  shards: number;
  dustRing: boolean;
  durationMs: number;
  /** Kendi oldurmen 1, takim arkadasininki soluk. */
  intensity: number;
  /** Hareket azaltma: basma, kiymik ve halka yok; govde yerinde soner. */
  still: boolean;
  bornAt: number;
  seed: number;
};
/**
 * Kule ani ("tower" turu): kademe toreni, yerlestirmenin inisi ya da sunucu
 * onayinin halkasi.
 *
 * "tier": kademe renginde isik sutunu ve kuleye donerek akan kiymiklar.
 * "landing": inen kulenin kaldirdigi toz halkasi. "confirm": takma ya da
 * onarim onaylaninca kuleden yayilan halka. Hicbiri sprite ve tween acmiyor;
 * olum patlamasi gibi tek Graphics yuzeyinde, yasina gore ciziliyor.
 */
export type TowerMoment = {
  kind: "tier" | "landing" | "confirm";
  /** "confirm": buyuk an (takma) -- daha genis halka ve ikinci beyaz halka. */
  strong?: boolean;
  x: number; y: number;
  /** Kulenin disk boyu (dunya px); 2x2 kulede dort kare. */
  size: number;
  /** Kademe rengi; toz halkasinda kullanilmiyor. */
  color: number;
  /** Kiymik sayisi ("tier"). */
  shards: number;
  durationMs: number;
  /** Kendi kulen 1, takim arkadasininki soluk. */
  intensity: number;
  /** Hareket azaltma: yukselme, kiymik ve yayilma yok; yerinde soner. */
  still: boolean;
  bornAt: number;
  seed: number;
};
/**
 * Ulti atisinin sok dalgasi ("cast" turu), karakterin renginde.
 *
 * "ring": merkezden disa acilan halka -- butun sahaya vuran ultide arenanin
 * ortasindan, Atakan'da drone'larin kalktigi kulelerden. "column": Zeynep'in
 * secilen sutunu; dalga dokunulan noktadan sutun boyunca yukari ve asagi
 * kosuyor, sutunun disina tasmiyor -- ulti de tasmiyor.
 */
export type CastWave = {
  shape: "ring" | "column";
  x: number; y: number;
  /** Halkanin azami yaricapi (dunya px); sutunda kullanilmiyor. */
  radius: number;
  /** Sutunun genisligi ve dikey siniri. */
  width?: number; top?: number; bottom?: number;
  color: number;
  durationMs: number;
  /** Hareket azaltma: yayilma yok, son boyunda belirip yerinde soner. */
  still: boolean;
  bornAt: number;
};
const colors: Record<ShotStyle, number> = {
  tracker: 0x4dffbd, pierce: 0xffbd62, psychic: 0xcb79ff,
  server: 0x58d9ff, electric: 0xadf765, synthesis: 0xf39dff
};
const noise = (n: number) => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function shotStyle(id = ""): ShotStyle | undefined {
  if (id === "warrior-1") return "tracker";
  if (id === "warrior-2") return "server";
  if (id === "warrior-4") return "psychic";
  if (id === "warrior-6") return "electric";
  if (id === "zeynep-1") return "pierce";
  if (id.startsWith("zeynep-3")) return "synthesis";
  return undefined;
}

function line(g: Graphics, x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha: number) {
  if (alpha <= 0 || width <= 0) return;
  g.lineStyle(width, color, clamp(alpha));
  g.lineBetween(x1, y1, x2, y2);
}
function glow(g: Graphics, x: number, y: number, radius: number, color: number, alpha: number) {
  for (let i = 3; i >= 1; i--) {
    g.fillStyle(color, clamp(alpha * (i === 1 ? 0.65 : 0.06)));
    g.fillCircle(x, y, radius * i / 2);
  }
}
function bolt(g: Graphics, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number, seed: number, width: number, jitter: number) {
  const dx = x2 - x1, dy = y2 - y1, length = Math.max(1, Math.hypot(dx, dy));
  for (const [weight, opacity, tone] of [[3.5, 0.11, color], [1.4, 0.75, color], [0.55, 0.96, 0xf3ffff]]) {
    g.lineStyle(width * weight, tone, alpha * opacity);
    g.beginPath(); g.moveTo(x1, y1);
    for (let i = 1; i <= 7; i++) {
      const t = i / 7;
      const offset = i === 7 ? 0 : (noise(seed + i) - 0.5) * jitter;
      g.lineTo(x1 + dx * t - dy / length * offset, y1 + dy * t + dx / length * offset);
    }
    g.strokePath();
  }
}

/** Procedural projectile body and wake: identity comes from motion, not a tier badge. */
export function drawCombatProjectile(g: Graphics, p: ProjectileSnapshot, now: number, scale: number) {
  const style = shotStyle(p.definitionId);
  if (!style) return false;
  const tier = p.tier ?? 1, color = colors[style];
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 1), ux = Math.cos(angle), uy = Math.sin(angle);
  const nx = -uy, ny = ux;
  const seed = [...p.id].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const length = (style === "pierce" || style === "synthesis" ? 16 + tier * 5 : 10 + tier * 4) * scale;
  if (style === "electric" || style === "server") {
    const radius = (style === "server" ? 4.2 : 2.7) * scale;
    const phase = Math.floor(now / 45) + seed;
    bolt(g, p.x - ux * length, p.y - uy * length, p.x, p.y, color, 0.8, phase, scale, (4 + tier * 2) * scale);
    glow(g, p.x, p.y, radius, color, 0.8);
    for (let i = 0; i < tier + 1; i++) {
      const a = now / 170 + i * 2.4 + seed;
      bolt(g, p.x, p.y, p.x + Math.cos(a) * radius * 2.3, p.y + Math.sin(a) * radius * 2.3,
        color, 0.8, phase + i * 19, 0.7 * scale, 4 * scale);
    }
    return true;
  }
  if (style === "psychic") {
    // Collapsing fragments orbit an opaque dark nucleus, unlike an electric ball.
    glow(g, p.x, p.y, 4 * scale, color, 0.5);
    g.fillStyle(0x160d28, 0.95); g.fillCircle(p.x, p.y, 2.5 * scale);
    for (let i = 0; i < 3 + tier; i++) {
      const a = angle + i * 2.4 + now / 200;
      const r = (3.5 + noise(i + seed) * 2) * scale;
      line(g, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
        p.x + Math.cos(a + 0.5) * r * 0.65, p.y + Math.sin(a + 0.5) * r * 0.65, scale, color, 0.85);
    }
  }
  for (let i = 5; i >= 1; i--) {
    const t = i / 5;
    line(g, p.x - ux * length * t, p.y - uy * length * t, p.x, p.y,
      (1 + (1 - t) * 2) * scale, color, (1 - t * 0.82) * 0.3);
  }
  if (style !== "psychic") {
    const tip = 4 * scale, half = (style === "tracker" ? 1.5 : 2) * scale;
    g.fillStyle(color, 0.95);
    g.fillTriangle(p.x + ux * tip, p.y + uy * tip, p.x - ux * 6 * scale + nx * half,
      p.y - uy * 6 * scale + ny * half, p.x - ux * 6 * scale - nx * half, p.y - uy * 6 * scale - ny * half);
    line(g, p.x - ux * 7 * scale, p.y - uy * 7 * scale, p.x + ux * tip, p.y + uy * tip, 0.8 * scale, 0xfffbea, 1);
    if (tier >= 2) {
      for (const side of [-1, 1]) line(g, p.x - ux * length + nx * side * 2 * scale,
        p.y - uy * length + ny * side * 2 * scale, p.x - ux * 5 * scale,
        p.y - uy * 5 * scale, 0.65 * scale, tier === 3 ? 0xffffff : color, 0.5);
    }
  }
  return true;
}

export function effectDuration(effect: ShotEffect) {
  return effect.muzzle ? 130 : shotStyle(effect.definitionId) === "psychic" ? 420 : 300 + effect.tier * 45;
}

/** Contact is an impulse, followed by material-specific decay. No expanding badge rings. */
export function drawCombatContact(g: Graphics, effect: ShotEffect, now: number, scale: number) {
  const style = shotStyle(effect.definitionId);
  if (!style) return;
  const age = clamp((now - effect.bornAt) / effectDuration(effect));
  const { x, y, angle, tier, seed } = effect;
  const color = colors[style], ux = Math.cos(angle), uy = Math.sin(angle), nx = -uy, ny = ux;
  const flash = Math.pow(1 - clamp(age * 4), 2);
  if (effect.muzzle) {
    const reach = (9 + tier * 3) * scale * (1 - age);
    glow(g, x, y, 3 * scale, color, flash);
    line(g, x, y, x + ux * reach, y + uy * reach, (2.5 - age * 2) * scale, color, 1 - age);
    return;
  }
  if (style === "psychic") {
    // Jagged fractures converge, then snap. The target reads as being compressed.
    const collapse = Math.pow(1 - clamp(age / 0.55), 2);
    g.fillStyle(0x10081e, 0.55 * (1 - age)); g.fillEllipse(x, y, (12 + 8 * collapse) * scale, (7 + 5 * collapse) * scale);
    const arms = 4 + tier * 2;
    for (let i = 0; i < arms; i++) {
      const a = noise(seed + i) * Math.PI * 2;
      const r = (5 + collapse * (8 + tier * 3)) * scale;
      const outer = r + (5 + noise(seed + i + 30) * 7) * scale;
      line(g, x + Math.cos(a) * outer, y + Math.sin(a) * outer,
        x + Math.cos(a + 0.25) * r, y + Math.sin(a + 0.25) * r, (0.8 + tier * 0.2) * scale, color, 1 - age);
      line(g, x + Math.cos(a + 0.25) * r, y + Math.sin(a + 0.25) * r,
        x + Math.cos(a) * 2 * scale, y + Math.sin(a) * 2 * scale, 0.7 * scale, 0xf5d4ff, 0.7 * (1 - age));
    }
    glow(g, x, y, (2 + tier) * scale, 0xf9ddff, Math.max(flash, Math.max(0, 1 - Math.abs(age - 0.48) * 12)));
    return;
  }
  if (style === "electric" || style === "server") {
    const arms = (style === "server" ? 4 : 3) + tier;
    const flicker = Math.floor(age * 12);
    for (let i = 0; i < arms; i++) {
      const a = noise(seed + i) * Math.PI * 2;
      const reach = (7 + noise(seed + i + 50) * (9 + tier * 3)) * scale;
      const endX = x + Math.cos(a) * reach, endY = y + Math.sin(a) * reach;
      bolt(g, x, y, endX, endY, color, Math.pow(1 - age, 1.8), seed + i * 17 + flicker,
        (0.7 + tier * 0.15) * scale, 7 * scale);
      if (tier >= 2) line(g, endX, endY, endX + Math.cos(a + 1) * 4 * scale,
        endY + Math.sin(a + 1) * 4 * scale, scale, color, (1 - age) * 0.6);
    }
    glow(g, x, y, (4 + tier) * scale, 0xeaffff, flash);
    return;
  }
  // Ballistic hits eject fragments along the projectile's path, not in a circle.
  const count = (style === "tracker" ? 4 : 6) + tier * 2;
  for (let i = 0; i < count; i++) {
    const spread = (noise(seed + i) - 0.5) * (style === "tracker" ? 1.8 : 1.1);
    const a = angle + spread, speed = (12 + noise(seed + i + 20) * 22) * scale;
    const travel = Math.pow(age, 0.6) * speed;
    const px = x + Math.cos(a) * travel, py = y + Math.sin(a) * travel + age * age * 5 * scale;
    const length = (2 + noise(seed + i + 40) * (3 + tier)) * scale * (1 - age);
    line(g, px, py, px - Math.cos(a) * length, py - Math.sin(a) * length,
      (i % 3 === 0 ? 1.4 : 0.7) * scale, i % 3 === 0 ? 0xfff6df : color, Math.pow(1 - age, 1.6));
  }
  line(g, x - nx * (3 + tier) * scale, y - ny * (3 + tier) * scale,
    x + nx * (3 + tier) * scale, y + ny * (3 + tier) * scale, 1.5 * scale, 0xfff9e7, flash);
  glow(g, x, y, (3 + tier) * scale, color, flash);
  if (tier >= 2 && style !== "tracker") {
    line(g, x - ux * 4 * scale, y - uy * 4 * scale, x + ux * (12 + tier * 3) * scale,
      y + uy * (12 + tier * 3) * scale, (tier === 3 ? 1.6 : 0.8) * scale, 0xffffff, flash);
  }
  if (style === "tracker") {
    // Tracking is the signature: four short brackets lock in, then dissolve.
    const r = (5 + Math.max(0, 1 - age * 5) * 7) * scale;
    const alpha = Math.min(1, age * 10) * (1 - age);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      line(g, x + sx * r, y + sy * r, x + sx * r, y + sy * (r - 3 * scale), scale, color, alpha);
      line(g, x + sx * r, y + sy * r, x + sx * (r - 3 * scale), y + sy * r, scale, color, alpha);
    }
  }
}

export function drawPressureWave(g: Graphics, beam: BeamSnapshot, now: number, scale: number) {
  const dx = beam.x2 - beam.x1, dy = beam.y2 - beam.y1, radius = Math.hypot(dx, dy);
  if (radius < 1) return;
  const tier = beam.tier ?? 1, heading = Math.atan2(dy, dx);
  const halfAngle = Math.atan2(beam.width / 2, radius);
  const color = tier === 3 ? 0xff89a4 : 0xdc466d;
  // Dense leading edge, trailing fractures: the front actually advances with server geometry.
  for (let band = 4; band >= 0; band--) {
    const r = Math.max(1, radius - band * 2.5 * scale);
    g.lineStyle((band === 0 ? 1.6 : 2.5) * scale, band === 0 ? 0xffd6e2 : color, band === 0 ? 0.9 : 0.14 * (1 - band / 6));
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = heading - halfAngle + halfAngle * 2 * i / 24;
      const ripple = Math.sin(i * 1.4 + now / 110) * scale * (band === 0 ? 0.4 : 1.5);
      const x = beam.x1 + Math.cos(a) * (r + ripple), y = beam.y1 + Math.sin(a) * (r + ripple);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
  }
  for (let i = 0; i < 5 + tier * 3; i++) {
    const fraction = (i + 0.5) / (5 + tier * 3);
    const a = heading - halfAngle + halfAngle * 2 * fraction;
    const lag = ((now / 400 + noise(i * 3)) % 1) * (10 + tier * 5) * scale;
    const r = Math.max(0, radius - lag);
    line(g, beam.x1 + Math.cos(a) * r, beam.y1 + Math.sin(a) * r,
      beam.x1 + Math.cos(a) * Math.max(0, r - 4 * scale), beam.y1 + Math.sin(a) * Math.max(0, r - 4 * scale),
      0.8 * scale, color, 0.6 * (1 - lag / ((10 + tier * 5) * scale)));
  }
}

export function drawIsolationField(g: Graphics, x: number, y: number, radius: number, tier: number, now: number, scale: number) {
  g.fillStyle(0x196175, 0.035); g.fillCircle(x, y, radius);
  g.lineStyle(0.8 * scale, 0x7fe5e8, 0.2); g.strokeCircle(x, y, radius);
  // Slow inward drift makes the field feel viscous; the radius stays truthful.
  for (let i = 0; i < 12 + tier * 7; i++) {
    const a = noise(i + 5) * Math.PI * 2;
    const phase = (now / (2600 + noise(i) * 1500) + noise(i + 10)) % 1;
    const r = radius * (1 - phase * 0.65), length = (2 + tier) * scale;
    const alpha = Math.sin(phase * Math.PI) * 0.38;
    line(g, x + Math.cos(a) * r, y + Math.sin(a) * r,
      x + Math.cos(a) * (r - length), y + Math.sin(a) * (r - length), 0.8 * scale, 0xb6f9ef, alpha);
  }
}

export function drawSynthesisRay(g: Graphics, beam: BeamSnapshot, now: number, scale: number) {
  const dx = beam.x2 - beam.x1, dy = beam.y2 - beam.y1, length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length, ny = dx / length, tier = beam.tier ?? 1;
  for (const side of [-1, 1]) {
    const offset = (1.2 + tier * 0.35) * scale * side;
    line(g, beam.x1 + nx * offset, beam.y1 + ny * offset, beam.x2 + nx * offset, beam.y2 + ny * offset,
      2.5 * scale, side < 0 ? 0x7cefff : 0xff9bce, 0.45);
  }
  line(g, beam.x1, beam.y1, beam.x2, beam.y2, scale, 0xfff9f5, 0.96);
  for (let i = 0; i < tier + 1; i++) {
    const t = (now / 750 + i / (tier + 1)) % 1;
    const x = beam.x1 + dx * t, y = beam.y1 + dy * t, r = (2 + tier * 0.5) * scale;
    g.fillStyle(i % 2 ? 0xffc0e4 : 0xb5f9ff, 0.65);
    g.fillTriangle(x - dx / length * r * 2, y - dy / length * r * 2, x + nx * r, y + ny * r, x - nx * r, y - ny * r);
  }
  glow(g, beam.x2, beam.y2, 3 * scale, 0xd6faff, 0.65);
}

/** Toz halkasinin rengi: dusmanin degil zeminin; agir govde yere iniyor. */
const DUST_COLOR = 0xd6c7a8;
/** Beyaza dogru acilmis ton; kiymiklarin bir kismi parlasin, hepsi degil. */
function lighten(color: number, amount: number) {
  const mix = (shift: number) => {
    const channel = (color >> shift) & 255;
    return Math.round(channel + (255 - channel) * amount) << shift;
  };
  return mix(16) | mix(8) | mix(0);
}

/**
 * Olum patlamasi: govde basilip soner, kiymiklar dusmanin renginde sacilir.
 *
 * Govde bir elips: Graphics doku cizemiyor ve dusman sprite'i zaten havuza
 * dondu. Elips dusmanin boyunda ve renginde, beyaz bir cekirdekle basliyor;
 * ilk an "vurus", gerisi sonme. Kiymiklar merminin degil olumun: yone bagli
 * degil, cevreye esit dagiliyor.
 */
export function drawDeathBurst(g: Graphics, burst: DeathBurst, now: number, scale: number) {
  const t = clamp((now - burst.bornAt) / burst.durationMs);
  const pose = getDeathBurstPose(t, burst.still);
  const { x, y, color, intensity, seed } = burst;
  const radius = burst.size * 0.34;
  if (pose.alpha > 0) {
    g.fillStyle(color, clamp(pose.alpha * 0.8 * intensity));
    g.fillEllipse(x, y, radius * 2 * pose.scaleX, radius * 2 * pose.scaleY, 18);
  }
  if (pose.flash > 0) {
    g.fillStyle(0xffffff, clamp(pose.flash * 0.9 * intensity));
    g.fillEllipse(x, y, radius * 1.3 * pose.scaleX, radius * 1.3 * pose.scaleY, 14);
  }
  if (burst.still) return;

  if (burst.dustRing) {
    // Yere yatik ve govdenin altindan: agir govdenin iniste kaldirdigi toz.
    const spread = Math.pow(t, 0.55);
    const rx = radius * (1.1 + spread * 1.5);
    g.lineStyle(Math.max(0.6, (2.4 - spread * 1.6) * scale), DUST_COLOR, clamp(0.55 * (1 - t) * intensity));
    g.strokeEllipse(x, y + radius * 0.35, rx * 2, rx * 1.1, 20);
  }

  const fade = clamp(Math.pow(1 - t, 1.3) * intensity);
  if (fade <= 0) return;
  const reach = (burst.dustRing ? 24 : 18) * scale;
  for (let i = 0; i < burst.shards; i++) {
    const a = (i / burst.shards) * Math.PI * 2 + (noise(seed + i) - 0.5) * 0.9;
    const ux = Math.cos(a), uy = Math.sin(a);
    const travel = radius * 0.45 + Math.sqrt(t) * reach * (0.65 + noise(seed + i + 20) * 0.6);
    // Hafif dusus: kiymik havada asili kalmasin.
    const px = x + ux * travel, py = y + uy * travel + t * t * 6 * scale;
    const length = (2.6 + noise(seed + i + 40) * 2.4) * scale * (1 - t * 0.6);
    const half = (i % 3 === 0 ? 1.2 : 0.8) * scale;
    g.fillStyle(i % 4 === 0 ? lighten(color, 0.55) : color, fade);
    g.fillTriangle(px + ux * length, py + uy * length,
      px - uy * half, py + ux * half, px + uy * half, py - ux * half);
  }
}

/**
 * Sutunun katmanlari: genislik (disk boyunun kati), opaklik, beyaza acilma.
 * Uc katman ust uste binince ortasi parlak, kenari yumusak bir isik oluyor;
 * postFX ya da bloom yok.
 */
const TIER_COLUMN_LAYERS = [[0.9, 0.12, 0], [0.5, 0.2, 0.2], [0.16, 0.5, 0.65]] as const;
/** Sutun yukari dogru bu kadar dilimde soner; tek dikdortgen sert bir kutu gibi dururdu. */
const TIER_COLUMN_SEGMENTS = 5;

/**
 * Kademe toreni: kulenin arkasindan yukselen isik sutunu, ice donen kiymiklar.
 *
 * Yuzey kule sprite'larinin (12) altinda: sutun kulenin arkasindan yukseliyor
 * ve kule onunde siluet gibi okunuyor, kiymiklar kulenin govdesine girip
 * kayboluyor. Kule gorunur kaliyor; savasin ortasinda yukseltilen kulenin
 * ne yaptigi ortulmemeli.
 */
export function drawTierCeremony(g: Graphics, moment: TowerMoment, now: number) {
  const t = clamp((now - moment.bornAt) / moment.durationMs);
  const pose = getTierCeremonyPose(t, moment.still);
  const { x, y, size, color, intensity, seed } = moment;
  const baseY = y + size * 0.2;

  if (pose.columnAlpha > 0) {
    const height = size * TIER_COLUMN_HEIGHT_RATIO * pose.columnHeight;
    for (const [widthRatio, alpha, lift] of TIER_COLUMN_LAYERS) {
      const width = size * widthRatio * pose.columnWidth;
      const tone = lift > 0 ? lighten(color, lift) : color;
      for (let i = 0; i < TIER_COLUMN_SEGMENTS; i++) {
        const segment = height / TIER_COLUMN_SEGMENTS;
        g.fillStyle(tone, clamp(alpha * pose.columnAlpha * intensity * (1 - i / TIER_COLUMN_SEGMENTS)));
        g.fillRect(x - width / 2, baseY - segment * (i + 1), width, segment);
      }
    }
    // Sutunun dibinde zemine vuran isik.
    g.fillStyle(color, clamp(0.28 * pose.columnAlpha * intensity));
    g.fillEllipse(x, baseY, size * 1.5 * pose.columnWidth, size * 0.5, 18);
  }

  if (pose.shardAlpha <= 0) return;
  const alpha = clamp(pose.shardAlpha * intensity);
  const length = size * 0.17, half = size * 0.045;
  for (let i = 0; i < moment.shards; i++) {
    const orbit = getTierShardOrbit(i, moment.shards, pose.shardTravel);
    // Kucuk bir sapma: on iki kiymik cetvelle dizilmis gibi durmasin.
    const a = orbit.angle + (noise(seed + i) - 0.5) * 0.35;
    const r = orbit.radius * size;
    const ux = Math.cos(a), uy = Math.sin(a);
    const px = x + ux * r, py = y + uy * r;
    // Uc kuleye bakiyor: kiymik disari degil iceri akiyor.
    g.fillStyle(i % 3 === 0 ? lighten(color, 0.6) : color, alpha);
    g.fillTriangle(px - ux * length, py - uy * length,
      px - uy * half, py + ux * half, px + uy * half, py - ux * half);
  }
}

/**
 * Yerlestirme inisi: kulenin altindan yere yayilan toz halkasi.
 *
 * Halka kulenin gobeginden basliyor; sprite'in altinda kaldigi icin once
 * gorunmuyor, kule yere oturunca kenarindan disari tasiyor. Renk zeminin,
 * kulenin degil.
 */
export function drawTowerLanding(g: Graphics, moment: TowerMoment, now: number, scale: number) {
  const t = clamp((now - moment.bornAt) / moment.durationMs);
  const { x, y, size, intensity, seed } = moment;
  const groundY = y + size * 0.22;
  if (moment.still) {
    const rx = size * 0.72;
    g.lineStyle(Math.max(0.6, 1.4 * scale), DUST_COLOR, clamp(0.45 * (1 - t) * intensity));
    g.strokeEllipse(x, groundY, rx * 2, rx * 0.9, 22);
    return;
  }

  const spread = 1 - (1 - t) ** 2;
  const rx = size * (0.5 + 0.55 * spread);
  g.lineStyle(Math.max(0.6, (2.2 - 1.5 * t) * scale), DUST_COLOR, clamp(0.6 * (1 - t) * intensity));
  g.strokeEllipse(x, groundY, rx * 2, rx * 0.9, 22);
  // Halkadan kopan birkac toz topagi; yere yatik elipsin uzerinde disari kayiyor.
  const puff = size * 0.07 * (1 - t * 0.5);
  g.fillStyle(DUST_COLOR, clamp(0.35 * (1 - t) * intensity));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (noise(seed + i) - 0.5) * 0.8;
    const reach = rx * (1.02 + noise(seed + i + 10) * 0.12);
    g.fillCircle(x + Math.cos(a) * reach, groundY + Math.sin(a) * reach * 0.45, puff);
  }
}

/**
 * Sunucu onayinin halkasi: kuleden disa yayilan, onay renginde.
 *
 * Eskiden 28 slotluk halka havuzundan (`spawnFlashRing`) aciliyordu; kalabalik
 * dalgada havuz atis parlamalariyla dolu oldugu icin ya onay halkasi dusuyor
 * ya da atislari itiyordu. Burada kule anlarinin kendi tavaninda. Takmada
 * (strong) ikinci, beyaz ve kisa bir halka: tek halka "bir sey oldu", iki
 * halka "onemli bir sey oldu". Hareket azaltmada halka buyumeden yerinde soner.
 */
const CONFIRM_ECHO_MS = 420;
export function drawTowerConfirm(g: Graphics, moment: TowerMoment, now: number, scale: number) {
  const age = now - moment.bornAt;
  const t = clamp(age / moment.durationMs);
  const { x, y, size, color, intensity } = moment;
  const strong = Boolean(moment.strong);
  const fade = 1 - t;
  const fill = (strong ? 0.2 : 0.1) * fade * intensity;

  if (moment.still) {
    const radius = size * (strong ? 0.75 : 0.6);
    g.fillStyle(color, clamp(fill));
    g.fillCircle(x, y, radius);
    g.lineStyle(Math.max(0.6, (strong ? 3 : 2) * scale), color, clamp(0.95 * fade * intensity));
    g.strokeCircle(x, y, radius);
    return;
  }

  const eased = 1 - (1 - t) ** 3;
  const radius = size * (0.3 + (strong ? 1.2 : 0.65) * eased);
  g.fillStyle(color, clamp(fill));
  g.fillCircle(x, y, radius);
  g.lineStyle(Math.max(0.6, (strong ? 3 : 2) * scale), color, clamp(0.95 * fade * intensity));
  g.strokeCircle(x, y, radius);

  if (strong && age < CONFIRM_ECHO_MS) {
    const echo = clamp(age / CONFIRM_ECHO_MS);
    const echoEased = 1 - (1 - echo) ** 3;
    g.lineStyle(Math.max(0.6, 1.5 * scale), 0xffffff, clamp(0.9 * (1 - echo) * intensity));
    g.strokeCircle(x, y, size * (0.15 + 0.9 * echoEased));
  }
}

/**
 * Ulti sok dalgasi: karakterin renginde, dokunulan yerden disa.
 *
 * Uc katman: genis soluk bir hale, rengin kendisi ve beyaza acilmis ince bir
 * on kenar. postFX ya da parcacik yok; tek Graphics yuzeyinde, yasina gore.
 * Sutun seklinde dalga sutunun kenarlarini da ciziyor: ulti o sinirin
 * disina tasmiyor, efekt de tasmamali.
 */
export function drawCastWave(g: Graphics, wave: CastWave, now: number, scale: number) {
  const t = clamp((now - wave.bornAt) / wave.durationMs);
  const pose = getUltimateShockwavePose(t, wave.still);
  if (pose.alpha <= 0) return;
  const { color } = wave;
  const edge = lighten(color, 0.6);
  const width = Math.max(0.8, 2.4 * pose.width * scale);
  const edgeWidth = Math.max(0.6, width * 0.45);

  if (wave.shape === "column") {
    const top = wave.top ?? wave.y;
    const bottom = wave.bottom ?? wave.y;
    const columnWidth = wave.width ?? 0;
    const left = wave.x - columnWidth / 2;
    const right = left + columnWidth;
    const upY = wave.y - (wave.y - top) * pose.reach;
    const downY = wave.y + (bottom - wave.y) * pose.reach;
    // Dalganin gectigi kisim hafifce boyaniyor; on kenarlar sutun boyunca kosuyor.
    g.fillStyle(color, clamp(0.16 * pose.alpha));
    g.fillRect(left, upY, columnWidth, downY - upY);
    for (const y of [upY, downY]) {
      line(g, left, y, right, y, width * 3, color, 0.18 * pose.alpha);
      line(g, left, y, right, y, width, color, 0.9 * pose.alpha);
      line(g, left, y, right, y, edgeWidth, edge, pose.alpha);
    }
    line(g, left, upY, left, downY, Math.max(0.6, 1.2 * scale), color, 0.55 * pose.alpha);
    line(g, right, upY, right, downY, Math.max(0.6, 1.2 * scale), color, 0.55 * pose.alpha);
    return;
  }

  const radius = Math.max(1, wave.radius * pose.reach);
  g.lineStyle(width * 3.2, color, clamp(0.16 * pose.alpha));
  g.strokeCircle(wave.x, wave.y, radius);
  g.lineStyle(width, color, clamp(0.85 * pose.alpha));
  g.strokeCircle(wave.x, wave.y, radius);
  g.lineStyle(edgeWidth, edge, clamp(pose.alpha));
  g.strokeCircle(wave.x, wave.y, radius * 0.985);
}

/**
 * Dokunun vurgu rengi; oldurme basina degil, doku basina bir kez okunur.
 *
 * Kucuk bir tuvale kucultulup piksel okunuyor (32x32, 1 ms'nin altinda).
 * Okunamazsa (tarayici tuvali kirletilmis sayarsa) `fallback`.
 */
const ACCENT_SAMPLE_PX = 32;
let accentCanvas: HTMLCanvasElement | undefined;
export function readTextureAccent(source: unknown, fallback: number) {
  if (typeof document === "undefined" || !(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    return fallback;
  }
  try {
    accentCanvas ??= document.createElement("canvas");
    accentCanvas.width = ACCENT_SAMPLE_PX;
    accentCanvas.height = ACCENT_SAMPLE_PX;
    const context = accentCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    context.clearRect(0, 0, ACCENT_SAMPLE_PX, ACCENT_SAMPLE_PX);
    context.drawImage(source, 0, 0, ACCENT_SAMPLE_PX, ACCENT_SAMPLE_PX);
    return pickAccentColor(context.getImageData(0, 0, ACCENT_SAMPLE_PX, ACCENT_SAMPLE_PX).data, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Canli olum patlamasi siniri.
 *
 * Tepede saniyede 3-6 oldurme, patlama 190-220 ms: normalde 1-2 canli.
 * Ulti tek karede onlarca dusman oldurebiliyor; sinir o anki cizim yukunu
 * bagliyor. Mermi temaslarindan ayri tutuluyor ki kalabalik bir atis olumu,
 * olum de atisi silmesin.
 */
const MAX_DEATH_BURSTS = 40;
/**
 * Canli kule ani siniri.
 *
 * Kademe toreni macta birkac kez, inis kurulumda dakikada birkac kez geliyor,
 * onay halkasi (takma, onarim) yalnizca oyuncunun kendi ekraninda ve altin
 * harcadigi icin seyrek; 4 oyuncu ayni anda yerlestirse bile 4-8 canli. Sinir yaratici modun toplu
 * seviye atlatmasina karsi. Olumlerden ve atislardan ayri: kalabalik bir
 * dalga oyuncunun satin aldigi ani silmesin.
 */
const MAX_TOWER_MOMENTS = 12;
/**
 * Canli ulti dalgasi siniri. Ulti macta birkac kez; tek atis en fazla birkac
 * halka aciyor (Atakan'da kule basina bir). Ayri liste: kalabalik bir
 * dalganin olumleri oyuncunun kendi anini silmesin.
 */
const MAX_CAST_WAVES = 8;

/** Bounded event buffer; no per-particle sprites or tweens. */
export class CombatVfx {
  private events: ShotEffect[] = [];
  private deaths: DeathBurst[] = [];
  private moments: TowerMoment[] = [];
  private casts: CastWave[] = [];
  private seed = 0;
  constructor(private graphics: Graphics) {}
  emit(effect: Omit<ShotEffect, "seed">) {
    if (!shotStyle(effect.definitionId)) return;
    if (this.events.length >= 160) this.events.shift();
    this.events.push({ ...effect, seed: ++this.seed });
  }
  /** "death" turu: yalnizca oldurme olayindan; sizinti buraya hic gelmez. */
  emitDeath(burst: Omit<DeathBurst, "seed">) {
    if (this.deaths.length >= MAX_DEATH_BURSTS) this.deaths.shift();
    this.deaths.push({ ...burst, seed: ++this.seed });
  }
  /** "tower" turu: kademe toreni, yerlestirme inisi ya da onay halkasi. */
  emitTowerMoment(moment: Omit<TowerMoment, "seed">) {
    if (this.moments.length >= MAX_TOWER_MOMENTS) this.moments.shift();
    this.moments.push({ ...moment, seed: ++this.seed });
  }
  /** "cast" turu: ulti atisinin sok dalgasi; yalnizca atanin ekraninda. */
  emitCastWave(wave: CastWave) {
    if (this.casts.length >= MAX_CAST_WAVES) this.casts.shift();
    this.casts.push({ ...wave });
  }
  render(now: number, scale: number) {
    this.graphics.clear();
    // Kule anlari en altta: sutun ve toz zemine ait, olum ve temas ustlerinden gecer.
    let write = 0;
    for (const moment of this.moments) {
      if (now - moment.bornAt >= moment.durationMs) continue;
      this.moments[write++] = moment;
      if (moment.kind === "tier") drawTierCeremony(this.graphics, moment, now);
      else if (moment.kind === "confirm") drawTowerConfirm(this.graphics, moment, now, scale);
      else drawTowerLanding(this.graphics, moment, now, scale);
    }
    this.moments.length = write;
    // Ulti dalgasi da zeminde: dusmanin olumu ve mermi temasi onun ustunde okunmali.
    write = 0;
    for (const wave of this.casts) {
      if (now - wave.bornAt >= wave.durationMs) continue;
      this.casts[write++] = wave;
      drawCastWave(this.graphics, wave, now, scale);
    }
    this.casts.length = write;
    // Olumler once: ayni yerdeki mermi temasi ustte kalsin.
    write = 0;
    for (const burst of this.deaths) {
      if (now - burst.bornAt >= burst.durationMs) continue;
      this.deaths[write++] = burst;
      drawDeathBurst(this.graphics, burst, now, scale);
    }
    this.deaths.length = write;
    write = 0;
    for (const effect of this.events) {
      if (now - effect.bornAt >= effectDuration(effect)) continue;
      this.events[write++] = effect;
      drawCombatContact(this.graphics, effect, now, scale);
    }
    this.events.length = write;
  }
}
