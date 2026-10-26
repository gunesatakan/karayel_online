/**
 * Egik 3D gorunumun vuruslari: mermiler, namlu atesi, carpma ve isinlar.
 *
 * 2D'nin efekt sistemi (vfx/attack-vfx.ts) egik gorunumde cizmiyor; olaylari
 * ve mermileri buraya aynaliyor (`AttackVfxOptions.mirror`). Vurusun hissi
 * (sarsinti, itme, duraklama) 2D'de kaliyor. Tarifler `shot-recipes.ts`te.
 *
 * Cizim iki parcacik alaninda (kameraya donuk dortgenler, tek cizim cagrisi):
 * ADD karisimli isik (parlama, kivilcim, halka, isin, kor, iz seridi) ve normal
 * karisimli madde (yanik izi, cokusun boslugu). Mermi govdeleri iri 3D modeller (koni,
 * elmas, altigen, kure), ortalari beyaz-sicak, arkalarinda incelen isik seridi.
 * Yukseklik: mermi namludan cikiyor, ayakta duran dusmanin govdesine iniyor;
 * Sunucu'nun paketi kavisle.
 *
 * Isik HDR: tonlar dogrusal, cekirdekler 1'in ustunde (tarifin `heat`i); egik
 * gorunumun parlama gecisi (esik ~1) yalnizca onlari yayiyor. Golgelendirici
 * ton eslemesini ve renk uzayini kendisi yapiyor: parlama gecisi olmadan
 * dogrudan ekrana cizimde de ayni tonlar.
 */
import * as THREE from "three";
import { getShotRecipe, whiten, type ShotRecipe } from "./shot-recipes";
import { getProjectileHitFit, type ProjectileHitFit } from "./projectile-hitbox";

/** Dusmanin menzilli vurusunun isini (sunucu `ENEMY_SHOT_BEAM_ID`, 2D beam-renderer ile ayni). */
const ENEMY_SHOT_BEAM = "enemy-shot";

export type ShotEventKind = "muzzle" | "anticipation" | "impact" | "beamHit";

export type ShotEventInput = {
  x: number;
  y: number;
  angle: number;
  definitionId: string;
  tier?: number;
  own?: boolean;
  /** Alan hasarinin gercek yaricapi (dunya birimi). */
  radius?: number;
  key?: string;
  fallbackColor?: number;
};

export type ShotProjectileInput = {
  id: string;
  source: "tower" | "enemy";
  definitionId?: string;
  tier?: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
};

export type ShotBeamInput = {
  id: string;
  definitionId: string;
  tier?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  color: number;
  /** Sekme koseleri (kuyruktan basa, duz [x, y, ...]). */
  b?: number[];
};

export type ShotFxDeps = {
  cellSize(): number;
  /** Arazinin yuksekligi (tepe arti, cukur eksi). */
  groundHeight(x: number, z: number): number;
  /** Ayakta duran piyadenin govde ortasinin yerden yuksekligi. */
  bodyHeight(): number;
  /** (x, z) yakinindaki kulenin namlu ucu (dunya); modeli yoksa `undefined`. */
  muzzle(x: number, z: number): THREE.Vector3 | undefined;
  /**
   * Ucus yonunde (x, z)'den ilerideki ilk dusman: govdesinin ortasinin
   * yuksekligi ve yatay uzakligi. Mermi araziyi degil hedefi izliyor.
   */
  aim(x: number, z: number, dirX: number, dirZ: number): { y: number; distance: number } | undefined;
  /** (x, z)'deki dusmanin govde ortasi (yoksa `undefined`): carpma ve isinin ucu orada. */
  bodyAt(x: number, z: number): number | undefined;
  /** Kulenin namlusunu geri tep (0-1). */
  kick?(x: number, z: number, strength: number): void;
  /**
   * (x, z)'deki kulenin tareti ve namlusu vurusun hedef noktasina (dunya)
   * kilitleniyor; namlu ucu ondan sonra okunuyor: vurus namlunun hattinda cikiyor.
   */
  aimAt?(x: number, z: number, target: THREE.Vector3): void;
  reducedMotion?(): boolean;
};

/**
 * Dusmanin olumu (egik gorunum; 2D patlamanin yerine): govdenin ortasinda
 * parlama, irkin malzemesinden kirintilar (yere duserek sekiyor), kivilcim ya
 * da kor, duman; yerdeyse zeminde halka ve yanik izi. Renkler 2D patlamanin
 * malzeme tablosundan (combat-vfx `getDeathColors`).
 */
export type DeathFxInput = {
  x: number;
  z: number;
  /** Govdenin ortasinin yuksekligi (dunya). */
  y: number;
  /** Govdenin eni (dunya). */
  size: number;
  /** Irkin vurgu rengi (parlama, kenar). */
  color: number;
  debris: number;
  edge: number;
  sparks: "sparks" | "embers" | "crackle" | "none";
  /** Duman rengi; 0 duman yok. */
  smoke: number;
  decal: number;
  /** Son vurusun yonu (radyan): kirintilar o yone. */
  heading?: number;
  heavy: boolean;
  air: boolean;
  /** Takim arkadasinin oldurmesi soluk (2D ile ayni). */
  intensity: number;
};

/**
 * Performans alevi (2D'de kulenin ayak izinin cevresindeki alev dilleri):
 * kaidenin ustunde (`y`), govde yaricapinda (`radius`) yukselen alev. Yogunluk
 * 2D'deki gibi (`getTowerPerformanceFlameIntensity`, 0,15 alti cizilmiyor).
 */
export type ShotFlameInput = { id: string; x: number; z: number; y: number; radius: number; intensity: number };

/** Komutun ton uclusu (2D'deki `getZeynepCommandPalette`). */
export type CommandColors = { primary: number; secondary: number; accent: number };
/**
 * Zeynep'in komut halesi (kule basina, her karede): Hizlanin govdenin belinde
 * hizla donen kivilcimlar ve kuyruklari, zeminde nabiz atan halka; Alani
 * Tutun zeminde soluk disk, cift halka ve ters yonde yavas donen isiklar.
 * `y` kaidenin ustu, `height` kulenin boyu, `tier` 1-3.
 */
export type ShotAuraInput = { x: number; z: number; y: number; radius: number; height: number; kind: "haste" | "range"; tier: number; colors: CommandColors };
/** Yavaslatin (dusman basina, her karede): ayakta yavas donen buz altigeni, govdede donen zerreler. */
export type ShotSlowInput = { x: number; z: number; y: number; ground: number; radius: number; tier: number; color: number };
/** Komutun verildigi an: Zeynep'in govdesinden zeminde yayilan dalga ve parlama. */
export type ShotPulseInput = { x: number; z: number; color: number; accent: number; reach: number };

export type ShotFx = {
  event(kind: ShotEventKind, input: ShotEventInput): void;
  death(input: DeathFxInput): void;
  projectiles(list: readonly ShotProjectileInput[]): void;
  beams(list: readonly ShotBeamInput[]): void;
  /** Performans alevi: her karede alevli kulelerin listesi (yoksa bos). */
  flames(list: readonly ShotFlameInput[]): void;
  /** Zeynep'in komut haleleri (kuleler) ve yavaslatmasi (dusmanlar): her karede. */
  auras(list: readonly ShotAuraInput[]): void;
  slows(list: readonly ShotSlowInput[]): void;
  /** Komutun verildigi an. */
  commandPulse(input: ShotPulseInput): void;
  /** Dusmanin kalkani kirildi: kabuk dagiliyor. */
  shieldBreak(x: number, y: number, z: number, radius: number, color: number): void;
  /** Her karede cizimden once: parcaciklar ilerliyor ve yukleniyor. */
  update(now: number): void;
  setVisible(visible: boolean): void;
  clear(): void;
  dispose(): void;
  /** Olcum: canli parcacik sayisi. */
  stats(): { light: number; matter: number; projectiles: number };
};

/* ------------------------------------------------------------------ */
/* Parcacik alani                                                        */
/* ------------------------------------------------------------------ */

/** Seklin kodu (golgelendiricide `iParams.z`). */
const SHAPE = {
  glow: 0,
  spark: 1,
  ring: 2,
  groundRing: 3,
  groundGlow: 4,
  flare: 5,
  chip: 6,
  beam: 7,
  smoke: 8,
  scorch: 9,
  hex: 10,
  /** Mermi izi: isin gibi iki nokta arasinda, kuyruga dogru incelip sonuyor. */
  trail: 11
} as const;

const VERTEX = `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iColor;
attribute vec4 iParams;
attribute float iHeat;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vFlow;
varying float vAlong;
varying float vHeat;
void main() {
  float size = iParams.x;
  float stretch = iParams.y;
  float shape = iParams.z;
  float spin = iParams.w;
  vUv = position.xy * 2.0;
  vColor = iColor;
  vHeat = iHeat;
  vShape = shape;
  vFlow = stretch;
  vAlong = 0.0;
  bool ground = (shape > 2.5 && shape < 4.5) || (shape > 8.5 && shape < 10.5);
  if (ground) {
    float c = cos(spin);
    float s = sin(spin);
    vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * size;
    gl_Position = projectionMatrix * viewMatrix * vec4(iPos + vec3(p.x, 0.0, p.y), 1.0);
    return;
  }
  bool trail = shape > 10.5;
  if ((shape > 6.5 && shape < 7.5) || trail) {
    vec4 a = viewMatrix * vec4(iPos, 1.0);
    vec4 b = viewMatrix * vec4(iVel, 1.0);
    vec2 d = b.xy - a.xy;
    float len = max(length(d), 0.0001);
    vec2 axis = d / len;
    vec2 nrm = vec2(-axis.y, axis.x);
    float t = position.x + 0.5;
    // Iz kuyrukta (a) dortte bire inceliyor.
    float taper = trail ? mix(0.25, 1.0, t) : 1.0;
    vec4 mv = mix(a, b, t);
    mv.xy += (axis * sign(position.x) * size * 0.5 + nrm * position.y * size) * taper;
    // Kameraya dogru eni kadar: yere ya da yamaca gomulup duz kenarla kesilmesin.
    mv.z += size;
    vAlong = trail ? t : t * len / max(size, 0.001);
    gl_Position = projectionMatrix * mv;
    return;
  }
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 d = (viewMatrix * vec4(iVel, 0.0)).xy;
  float speed = length(d);
  vec2 axis = speed > 0.0001 ? d / speed : vec2(cos(spin), sin(spin));
  vec2 nrm = vec2(-axis.y, axis.x);
  float along = size * (1.0 + stretch * speed);
  mv.xy += axis * position.x * along + nrm * position.y * size;
  // Kameraya donuk dortgen kameraya dogru boyu kadar: alt yarisi zemine gomulmesin; onundeki kule yine ortuyor.
  mv.z += max(size, along);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = `
uniform float uTime;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vFlow;
varying float vAlong;
varying float vHeat;
void main() {
  float r = length(vUv);
  // HDR: ton (dogrusal) carpi parcacigin isisi. Yalnizca sicak parcacik (cekirdek,
  // parlama) ortasinda beyazlaniyor; renkli hale ve govde doygun kaliyor.
  vec3 col = vColor.rgb * vHeat;
  vec3 hot = vec3(vHeat * max(vColor.r, max(vColor.g, vColor.b)));
  float hotMix = smoothstep(1.3, 2.6, vHeat);
  float a = 0.0;
  if (vShape < 0.5) {
    float edge = max(0.0, 1.0 - r);
    a = edge * edge * (0.55 + 0.45 * edge);
    col = mix(col, hot, hotMix * pow(max(0.0, 1.0 - r * 2.4), 2.0) * 0.85);
  } else if (vShape < 1.5) {
    float across = max(0.0, 1.0 - abs(vUv.y));
    float along = max(0.0, 1.0 - abs(vUv.x));
    a = across * across * pow(along, 1.1);
    col = mix(col, hot, hotMix * pow(across, 6.0) * along * 0.8);
  } else if (vShape < 3.5) {
    float band = (r - 0.8) * 8.0;
    a = exp(-band * band) * step(r, 1.0);
    col = mix(col, hot, hotMix * exp(-band * band * 4.0) * 0.5);
  } else if (vShape < 4.5) {
    float edge = max(0.0, 1.0 - r);
    a = pow(edge, 2.4);
  } else if (vShape < 5.5) {
    // Isinli yildiz: kalin kollar, toplu beyaz-sicak gobek.
    vec2 q = abs(vUv);
    float ray = pow(max(0.0, 1.0 - q.y * 7.0), 2.0) * pow(max(0.0, 1.0 - q.x), 2.2)
      + pow(max(0.0, 1.0 - q.x * 7.0), 2.0) * pow(max(0.0, 1.0 - q.y), 2.2);
    float core = pow(max(0.0, 1.0 - r * 1.6), 3.0);
    a = ray + core;
    col = mix(col, hot, hotMix * 0.75);
  } else if (vShape < 6.5) {
    vec2 q = abs(vUv);
    a = step(max(q.x, q.y), 0.9);
    col *= 0.8 + 0.4 * (1.0 - vUv.y) * 0.5;
  } else if (vShape < 7.5) {
    float across = abs(vUv.y);
    a = pow(max(0.0, 1.0 - across), 1.7);
    float cap = 1.0 - smoothstep(0.82, 1.0, abs(vUv.x));
    a *= cap;
    if (vFlow > 0.0) a *= 0.72 + 0.28 * sin(vAlong * 1.6 - uTime * 22.0 * vFlow);
    col = mix(col, hot, hotMix * pow(max(0.0, 1.0 - across * 3.2), 2.0) * 0.9);
  } else if (vShape < 8.5) {
    float edge = max(0.0, 1.0 - r);
    a = pow(edge, 1.4) * (0.82 + 0.18 * sin(vUv.x * 5.0 + vUv.y * 3.0));
  } else if (vShape < 9.5) {
    float wobble = 0.12 * sin(atan(vUv.y, vUv.x) * 7.0) + 0.06 * sin(atan(vUv.y, vUv.x) * 13.0);
    a = 1.0 - smoothstep(0.35, 1.0, r + wobble);
  } else if (vShape < 10.5) {
    vec2 q = abs(vUv);
    float h = max(q.x * 0.866 + q.y * 0.5, q.y);
    float band = (h - 0.8) * 8.0;
    a = exp(-band * band) * step(h, 1.0);
    col = mix(col, hot, hotMix * exp(-band * band * 4.0) * 0.45);
  } else {
    // Iz seridi: basta (vAlong 1) dolgun ve beyaz-sicak, kuyruga dogru sonuyor.
    float across = abs(vUv.y);
    float head = 1.0 - smoothstep(0.8, 1.0, vUv.x);
    a = pow(max(0.0, 1.0 - across), 1.5) * pow(vAlong, 1.1) * head;
    col = mix(col, hot, hotMix * pow(max(0.0, 1.0 - across * 2.6), 2.0) * vAlong * 0.8);
  }
  a *= vColor.a;
  // Gecersiz deger (NaN/sonsuz) parlama gecisinde bulaniklasip ekranin buyuk bir
  // kismini karartiyor: boyle piksel atiliyor (karsilastirma NaN'da yanlis), cok
  // parlaklar sinirlaniyor.
  if (!(a >= 0.003) || !(col.r + col.g + col.b < 1.0e4)) discard;
  gl_FragColor = vec4(min(col, vec3(64.0)), min(a, 1.0));
  // Parlama gecisinin hedefine dogrusal HDR (ton esleme orada); ekrana dogrudan cizimde burada.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

type Spawn = {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  color: number;
  /** HDR isik carpani (yalnizca isik alani; verilmezse 1). */
  heat?: number;
  alpha?: number;
  size: number;
  /** Omrun sonundaki boy (verilmezse ayni). */
  sizeTo?: number;
  lifeMs: number;
  /** Dogmadan once bekleme (ms). */
  delayMs?: number;
  shape: number;
  stretch?: number;
  spin?: number;
  /** Donus hizi (radyan / sn; yer sekilleri). */
  spinRate?: number;
  drag?: number;
  /** Yercekimi (birim / sn^2, asagi arti). */
  gravity?: number;
  /** Sonme egrisi: alfa (1 - t)^fade. */
  fade?: number;
  /** Belirme payi (omrun kesri). */
  fadeIn?: number;
  /** Yere degince sekiyor (kirinti). */
  bounce?: boolean;
  /** Isin parcasi: bitis noktasi. */
  ex?: number; ey?: number; ez?: number;
};

/**
 * Isik tonunun en az parlakligi (dogrusal): koyu mor ve kirmizi tonlar yesilin
 * yaninda sonuk kalmasin. Yumusak: en cok 1,8 kat (fazlasi tonu beyaza kaciriyor).
 */
const LIFT_LUMINANCE = 0.3;
const MAX_LIFT = 1.8;
const TMP_COLOR = new THREE.Color();
/** Ton -> [dogrusal r, g, b, aydinlatilmis r, g, b]; tonlar sinirli, onbellek kucuk. */
const rgbCache = new Map<number, Float32Array>();

function rgbOf(hex: number) {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    // setHex sRGB'den dogrusala ceviriyor (renk yonetimi acik).
    TMP_COLOR.setHex(hex);
    const lum = 0.2126 * TMP_COLOR.r + 0.7152 * TMP_COLOR.g + 0.0722 * TMP_COLOR.b;
    const lift = Math.min(MAX_LIFT, Math.max(1, LIFT_LUMINANCE / Math.max(lum, 1e-3)));
    rgb = new Float32Array([TMP_COLOR.r, TMP_COLOR.g, TMP_COLOR.b, TMP_COLOR.r * lift, TMP_COLOR.g * lift, TMP_COLOR.b * lift]);
    if (rgbCache.size > 512) rgbCache.clear();
    rgbCache.set(hex, rgb);
  }
  return rgb;
}

/**
 * Butun vuruslarin (mermi, namlu, carpma, isin, olum) parlakligi: isik
 * parcaciklarinin ve mermi govdesinin HDR isisi bununla carpiliyor (sahibin
 * istegi, 2026-10-27: "parlaklik %30 dusuk").
 */
const SHOT_BRIGHTNESS = 0.7;

/** Govde malzemesi icin ayni HDR ton (aydinlatilmis ve carpilmis; setRGB calisma uzayinda, dogrusal). */
function setHeatColor(target: { setRGB(r: number, g: number, b: number): unknown }, hex: number, heat: number) {
  const rgb = rgbOf(hex);
  const lit = heat * SHOT_BRIGHTNESS;
  target.setRGB(rgb[3] * lit, rgb[4] * lit, rgb[5] * lit);
}

class ParticleField {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly pos: THREE.InstancedBufferAttribute;
  private readonly vel: THREE.InstancedBufferAttribute;
  private readonly colorAttr: THREE.InstancedBufferAttribute;
  private readonly params: THREE.InstancedBufferAttribute;
  private readonly heatAttr: THREE.InstancedBufferAttribute;
  readonly material: THREE.ShaderMaterial;
  count = 0;
  // Yapilar dizisi yerine dizi yapisi: kare basina cop yok.
  private readonly f: Float32Array;
  private readonly stride = 29;
  /** `hdr`: isik alani (koyu ton aydinlatiliyor, `heat` HDR carpani); madde alani duz ton. */
  constructor(readonly capacity: number, blending: THREE.Blending, renderOrder: number, private readonly hdr: boolean) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    const make = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage);
    this.pos = make(3);
    this.vel = make(3);
    this.colorAttr = make(4);
    this.params = make(4);
    this.heatAttr = make(1);
    geometry.setAttribute("iPos", this.pos);
    geometry.setAttribute("iVel", this.vel);
    geometry.setAttribute("iColor", this.colorAttr);
    geometry.setAttribute("iParams", this.params);
    geometry.setAttribute("iHeat", this.heatAttr);
    geometry.instanceCount = 0;
    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Yere yatik sekiller asagi bakiyor: iki yuz.
      side: THREE.DoubleSide,
      blending
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.f = new Float32Array(capacity * this.stride);
  }

  get load() {
    return this.count / this.capacity;
  }

  spawn(p: Spawn) {
    if (this.count >= this.capacity) return;
    const o = this.count * this.stride;
    const f = this.f;
    this.count += 1;
    f[o] = p.x; f[o + 1] = p.y; f[o + 2] = p.z;
    f[o + 3] = p.vx ?? 0; f[o + 4] = p.vy ?? 0; f[o + 5] = p.vz ?? 0;
    f[o + 6] = -(p.delayMs ?? 0);
    f[o + 7] = Math.max(1, p.lifeMs);
    f[o + 8] = p.size;
    f[o + 9] = p.sizeTo ?? p.size;
    f[o + 10] = p.alpha ?? 1;
    const rgb = rgbOf(p.color);
    const lit = this.hdr ? 3 : 0;
    f[o + 11] = rgb[lit];
    f[o + 12] = rgb[lit + 1];
    f[o + 13] = rgb[lit + 2];
    f[o + 14] = p.shape;
    f[o + 15] = p.stretch ?? 0;
    f[o + 16] = p.spin ?? 0;
    f[o + 17] = p.spinRate ?? 0;
    f[o + 18] = p.drag ?? 0;
    f[o + 19] = p.gravity ?? 0;
    f[o + 20] = p.fade ?? 1;
    f[o + 21] = p.fadeIn ?? 0;
    f[o + 22] = p.bounce ? 1 : 0;
    // Tek karelik (omur 0): bu kare cizilip bir sonrakinde kalkiyor.
    f[o + 23] = p.lifeMs <= 0 ? 1 : 0;
    f[o + 24] = 0;
    f[o + 25] = p.ex ?? 0; f[o + 26] = p.ey ?? 0; f[o + 27] = p.ez ?? 0;
    f[o + 28] = this.hdr ? (p.heat ?? 1) * SHOT_BRIGHTNESS : 1;
  }

  /** Ilerlet ve GPU'ya yaz; `ground` arazi yuksekligi (kirintinin sekmesi). */
  step(dtMs: number, ground: (x: number, z: number) => number) {
    const f = this.f;
    const dt = dtMs / 1000;
    let index = 0;
    const pos = this.pos.array as Float32Array;
    const vel = this.vel.array as Float32Array;
    const color = this.colorAttr.array as Float32Array;
    const params = this.params.array as Float32Array;
    const heats = this.heatAttr.array as Float32Array;
    while (index < this.count) {
      const o = index * this.stride;
      const single = f[o + 23] > 0;
      // Tek karelik ve cizilmis, ya da omru dolmus: sonuncuyla yer degistir.
      if ((single && f[o + 24] > 0) || (!single && f[o + 6] >= f[o + 7])) {
        this.count -= 1;
        if (index !== this.count) f.copyWithin(o, this.count * this.stride, this.count * this.stride + this.stride);
        continue;
      }
      if (!single) {
        f[o + 6] += dtMs;
        if (f[o + 6] > 0) {
          const drag = Math.exp(-f[o + 18] * dt);
          f[o + 3] *= drag; f[o + 4] *= drag; f[o + 5] *= drag;
          f[o + 4] -= f[o + 19] * dt;
          f[o] += f[o + 3] * dt; f[o + 1] += f[o + 4] * dt; f[o + 2] += f[o + 5] * dt;
          f[o + 16] += f[o + 17] * dt;
          if (f[o + 22] > 0) {
            const floor = ground(f[o], f[o + 2]) + 0.6;
            if (f[o + 1] < floor) {
              f[o + 1] = floor;
              f[o + 4] = Math.abs(f[o + 4]) * 0.32;
              f[o + 3] *= 0.55; f[o + 5] *= 0.55;
            }
          }
        }
      }
      const t = single ? 0 : Math.max(0, f[o + 6]) / f[o + 7];
      const born = single || f[o + 6] >= 0;
      const fadeIn = f[o + 21];
      const appear = fadeIn > 0 ? Math.min(1, t / fadeIn) : 1;
      const alpha = born ? f[o + 10] * appear * Math.pow(Math.max(0, 1 - t), f[o + 20]) : 0;
      const ease = 1 - (1 - t) * (1 - t);
      const size = f[o + 8] + (f[o + 9] - f[o + 8]) * ease;
      const shape = f[o + 14];
      const p3 = index * 3;
      const p4 = index * 4;
      pos[p3] = f[o]; pos[p3 + 1] = f[o + 1]; pos[p3 + 2] = f[o + 2];
      if (shape === SHAPE.beam || shape === SHAPE.trail) {
        vel[p3] = f[o + 25]; vel[p3 + 1] = f[o + 26]; vel[p3 + 2] = f[o + 27];
      } else {
        vel[p3] = f[o + 3]; vel[p3 + 1] = f[o + 4]; vel[p3 + 2] = f[o + 5];
      }
      color[p4] = f[o + 11]; color[p4 + 1] = f[o + 12]; color[p4 + 2] = f[o + 13]; color[p4 + 3] = alpha;
      params[p4] = size; params[p4 + 1] = f[o + 15]; params[p4 + 2] = shape; params[p4 + 3] = f[o + 16];
      heats[index] = f[o + 28];
      if (single) f[o + 24] = 1;
      index += 1;
    }
    this.geometry.instanceCount = this.count;
    for (const attribute of [this.pos, this.vel, this.colorAttr, this.params, this.heatAttr]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Mermi govdeleri                                                       */
/* ------------------------------------------------------------------ */

type Flight = {
  id: string;
  recipe: ShotRecipe;
  /** Isabet seklinin 3D olculeri (govde, hale ve kuyruk ona oturuyor); yoksa tarifin boylari. */
  fit?: ProjectileHitFit;
  root: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  /** Sunucunun yolundaki son yer (yatay). */
  pathX: number;
  pathZ: number;
  /** Namlu ucu ile sunucunun dogum noktasi arasindaki fark: ilk hucrede sifira iniyor. */
  offsetX: number;
  offsetZ: number;
  /** Kavissiz yukseklik: namludan hedefin govdesine duz hat. */
  baseY: number;
  /** Cizilen yer. */
  x: number;
  y: number;
  z: number;
  traveled: number;
  /** Bu karede goruldu mu (gorulmeyen mermi kalkiyor). */
  seen: boolean;
  seed: number;
  /** Izin birikmis yolu: parcacik yol basina. */
  trailCarry: number;
  /** Iz seridinin gecmisi: son noktalar (x, y, z), halka; `pathHead` en yenisi. */
  path: Float32Array;
  pathCount: number;
  pathHead: number;
};

/** Iz gecmisinin nokta sayisi; noktalar arasi en az `PATH_STEP` hucre. */
const PATH_POINTS = 10;
const PATH_STEP = 0.2;

const UP = new THREE.Vector3(0, 1, 0);
const TMP_DIR = new THREE.Vector3();
const TMP_TARGET = new THREE.Vector3();
const TMP_Q = new THREE.Quaternion();
const SPIN_Q = new THREE.Quaternion();

function hash01(text: string) {
  let h = 2166136261;
  for (let index = 0; index < text.length; index += 1) h = Math.imul(h ^ text.charCodeAt(index), 16777619);
  return ((h >>> 0) % 100003) / 100003;
}

/** Dolgun renk katmani (isinin govdesi, carpmanin ates topu): parlak ama doygun. */
function fillHeat(recipe: ShotRecipe) {
  return recipe.heat.halo * 1.35;
}

export function createShotFx(scene: THREE.Scene, deps: ShotFxDeps): ShotFx {
  const light = new ParticleField(3200, THREE.AdditiveBlending, 9, true);
  const matter = new ParticleField(900, THREE.NormalBlending, 8, false);
  const group = new THREE.Group();
  group.add(matter.mesh, light.mesh);
  scene.add(group);

  // Govde modelleri: Y ekseni boyunca (ucus yonune cevriliyor), boy 1.
  const geometries = {
    tracer: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    lance: new THREE.ConeGeometry(0.5, 1, 6),
    packet: new THREE.OctahedronGeometry(0.5, 0),
    cell: new THREE.CylinderGeometry(0.5, 0.5, 0.55, 6),
    gaze: new THREE.SphereGeometry(0.5, 14, 10),
    arc: new THREE.IcosahedronGeometry(0.5, 0),
    orb: new THREE.SphereGeometry(0.5, 12, 8),
    pupil: new THREE.SphereGeometry(0.5, 10, 8)
  };
  const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x07020c, toneMapped: false });
  const flights = new Map<string, Flight>();
  const pools = new Map<string, Flight["root"][]>();
  let lastNow = performance.now();
  let lastBeamSparkAt = new Map<string, number>();
  let visible = true;
  const rand = Math.random;

  const cell = () => deps.cellSize();
  /** Kalabalikta parcacik sayisi azaliyor: alan dolmasin, kare suresi sismesin. */
  const budget = () => {
    const load = Math.max(light.load, matter.load);
    const motion = deps.reducedMotion?.() ? 0.5 : 1;
    return (load > 0.75 ? 0.35 : load > 0.5 ? 0.6 : 1) * motion;
  };
  const count = (value: number) => Math.max(0, Math.round(value * budget()));

  function makeBody(recipe: ShotRecipe) {
    const pool = pools.get(recipe.shape);
    const reused = pool?.pop();
    if (reused) return reused;
    // Isik alan, kendi tonunda parlayan govde (isi ~1,3: doygun; beyaz-sicak oz
    // ustundeki parcacik); gunes sekli okutuyor, metal yok: oyuncak gibi temiz.
    const material = new THREE.MeshStandardMaterial({ color: recipe.color, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.45, metalness: 0 });
    setHeatColor(material.emissive, recipe.color, recipe.heat.halo * 1.3);
    const mesh = new THREE.Mesh(geometries[recipe.shape], material);
    const root = new THREE.Group();
    root.add(mesh);
    if (recipe.shape === "gaze") {
      const pupil = new THREE.Mesh(geometries.pupil, pupilMaterial);
      pupil.scale.setScalar(0.55);
      pupil.position.set(0, 0.32, 0);
      root.add(pupil);
    }
    root.userData.shape = recipe.shape;
    return root;
  }

  function releaseBody(flight: Flight) {
    group.remove(flight.root);
    const shape = flight.root.userData.shape as string;
    const pool = pools.get(shape) ?? [];
    if (pool.length < 48) pool.push(flight.root);
    else flight.root.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== pupilMaterial) (mesh.material as THREE.Material).dispose();
    });
    pools.set(shape, pool);
  }

  function bodyMaterial(root: THREE.Object3D) {
    return (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
  }

  /** Dusmanin govde ortasi: oradaki dusmandan, yoksa piyade boyundan. */
  function targetHeight(x: number, z: number) {
    return deps.bodyAt(x, z) ?? deps.groundHeight(x, z) + deps.bodyHeight();
  }

  function muzzlePoint(x: number, z: number) {
    const socket = deps.muzzle(x, z);
    if (socket) return socket;
    return new THREE.Vector3(x, deps.groundHeight(x, z) + cell() * 0.85, z);
  }

  /* ------------------------------- olaylar ------------------------------- */

  /** Iri, kalin kivilcimlar: az ama okunur (oyuncak gibi). */
  function sparkBurst(x: number, y: number, z: number, n: number, speed: number, colors: readonly number[], options: { dirX?: number; dirZ?: number; bias?: number; up?: number; life?: number; size?: number; stretch?: number; gravity?: number; heat?: number } = {}) {
    const c = cell();
    for (let index = 0; index < n; index += 1) {
      const theta = rand() * Math.PI * 2;
      const lift = (options.up ?? 0.45) + rand() * 0.6;
      let dx = Math.cos(theta);
      let dz = Math.sin(theta);
      if (options.dirX !== undefined && options.dirZ !== undefined) {
        const bias = options.bias ?? 0.6;
        dx = dx * (1 - bias) + options.dirX * bias;
        dz = dz * (1 - bias) + options.dirZ * bias;
      }
      const v = speed * c * (0.45 + rand() * 0.75);
      light.spawn({
        x, y, z,
        vx: dx * v, vy: lift * v, vz: dz * v,
        color: colors[index % colors.length],
        heat: options.heat ?? 1.4,
        size: (options.size ?? 0.085) * c * (0.75 + rand() * 0.5),
        lifeMs: (options.life ?? 380) * (0.6 + rand() * 0.7),
        shape: SHAPE.spark,
        stretch: options.stretch ?? 0.035,
        drag: 2.4,
        gravity: (options.gravity ?? 9) * c,
        fade: 1.3
      });
    }
  }

  /** Acik renkli toz (normal karisim): koyu duman parlak sahnede kir gibi duruyor. */
  function smokePuffs(x: number, y: number, z: number, n: number, size: number, color = 0xc8d2dc, alpha = 0.3) {
    const c = cell();
    for (let index = 0; index < n; index += 1) {
      matter.spawn({
        x: x + (rand() - 0.5) * c * 0.3, y: y + rand() * c * 0.15, z: z + (rand() - 0.5) * c * 0.3,
        vx: (rand() - 0.5) * c * 0.5, vy: c * (0.35 + rand() * 0.4), vz: (rand() - 0.5) * c * 0.5,
        color,
        alpha: alpha * (0.6 + rand() * 0.4),
        size: size * c * 0.4,
        sizeTo: size * c * (0.9 + rand() * 0.5),
        lifeMs: 650 + rand() * 450,
        shape: SHAPE.smoke,
        drag: 1.6,
        fade: 1.6,
        fadeIn: 0.12,
        spin: rand() * 6
      });
    }
  }

  function groundRing(x: number, z: number, from: number, to: number, color: number, lifeMs: number, delayMs = 0, alpha = 0.95, shape: number = SHAPE.groundRing, heat = 1.3) {
    light.spawn({ x, y: deps.groundHeight(x, z) + 0.8, z, color, heat, alpha, size: from, sizeTo: to, lifeMs, delayMs, shape, fade: 1.4, spin: rand() * Math.PI });
  }

  function groundGlow(x: number, z: number, size: number, color: number, lifeMs: number, alpha = 0.55, heat = 1) {
    light.spawn({ x, y: deps.groundHeight(x, z) + 0.7, z, color, heat, alpha, size, sizeTo: size * 1.2, lifeMs, shape: SHAPE.groundGlow, fade: 1.6 });
  }

  /** Sert parlama: beyaz-sicak isinli yildiz (`heat`) ve uzun sonen renkli hale. */
  function flare(x: number, y: number, z: number, size: number, color: number, lifeMs: number, delayMs = 0, heat = 2.6, haloColor = color) {
    light.spawn({ x, y, z, color, heat, size, sizeTo: size * 0.6, lifeMs, delayMs, shape: SHAPE.flare, fade: 1.2, spin: rand() * Math.PI });
    light.spawn({ x, y, z, color: haloColor, heat: Math.max(1, heat * 0.42), size: size * 0.9, sizeTo: size * 1.5, lifeMs: lifeMs * 2.4, delayMs, shape: SHAPE.glow, fade: 1.8, alpha: 0.55 });
  }

  function streak(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, width: number, color: number, lifeMs: number, delayMs = 0, alpha = 1, flow = 0, heat = 1.4) {
    light.spawn({ x: x1, y: y1, z: z1, ex: x2, ey: y2, ez: z2, color, heat, alpha, size: width, sizeTo: width * 0.4, lifeMs, delayMs, shape: SHAPE.beam, stretch: flow, fade: 1.3 });
  }

  function muzzleEvent(input: ShotEventInput, recipe: ShotRecipe) {
    const c = cell();
    const p = muzzlePoint(input.x, input.y);
    const dx = Math.cos(input.angle);
    const dz = Math.sin(input.angle);
    const tier = recipe.tier;
    const heat = recipe.heat;
    // Beyaz-sicak yildiz, renkli hale; onune dogru kisa, kalin ates dili.
    flare(p.x + dx * c * 0.1, p.y, p.z + dz * c * 0.1, recipe.muzzle.flash * c, recipe.core, 70 + tier * 15, 0, heat.core * 0.75, recipe.color);
    streak(p.x, p.y, p.z, p.x + dx * c * (0.32 + tier * 0.08), p.y, p.z + dz * c * (0.32 + tier * 0.08), c * (0.16 + tier * 0.03), recipe.color, 70, 0, 0.9, 0, heat.halo * 1.2);
    light.spawn({ x: p.x, y: p.y, z: p.z, vx: dx * c * 9, vz: dz * c * 9, color: recipe.core, heat: fillHeat(recipe), size: c * (0.05 + tier * 0.025), lifeMs: 90, shape: SHAPE.spark, stretch: 0.02, drag: 14, fade: 1 });
    sparkBurst(p.x, p.y, p.z, count(recipe.muzzle.sparks), 5.5, [recipe.core, recipe.color], { dirX: dx, dirZ: dz, bias: 0.82, up: 0.1, life: 200, gravity: 4, size: 0.07, heat: fillHeat(recipe) });
    if (recipe.muzzle.smoke > 0) smokePuffs(p.x + dx * c * 0.2, p.y, p.z + dz * c * 0.2, count(recipe.muzzle.smoke), 0.3, whiten(recipe.color, 0.75), 0.22);
    if (recipe.muzzle.ring) {
      light.spawn({ x: p.x + dx * c * 0.1, y: p.y, z: p.z + dz * c * 0.1, color: recipe.color, heat: heat.halo * 1.3, size: c * 0.1, sizeTo: c * 0.3 * tier, lifeMs: 160, shape: SHAPE.ring, fade: 1.5, alpha: 0.9 });
    }
    deps.kick?.(input.x, input.y, 0.45 + tier * 0.2);
  }

  function anticipationEvent(input: ShotEventInput, recipe: ShotRecipe) {
    const c = cell();
    const p = muzzlePoint(input.x, input.y);
    light.spawn({ x: p.x, y: p.y, z: p.z, color: recipe.color, heat: fillHeat(recipe), size: c * 0.08, sizeTo: c * 0.24 * recipe.tier, lifeMs: 120, shape: SHAPE.glow, fade: 0.4, fadeIn: 0.6 });
    // Namluya cekilen kivilcimlar: sarj (az ama iri).
    for (let index = 0; index < count(2 + recipe.tier * 2); index += 1) {
      const theta = rand() * Math.PI * 2;
      const reach = c * (0.4 + rand() * 0.3);
      const ox = Math.cos(theta) * reach;
      const oz = Math.sin(theta) * reach;
      const oy = (rand() - 0.3) * reach;
      light.spawn({ x: p.x + ox, y: p.y + oy, z: p.z + oz, vx: -ox * 8, vy: -oy * 8, vz: -oz * 8, color: recipe.core, heat: recipe.heat.core * 0.7, size: c * 0.055, lifeMs: 120, shape: SHAPE.spark, stretch: 0.03, fade: 0.7 });
    }
  }

  function impactEvent(input: ShotEventInput, recipe: ShotRecipe) {
    const c = cell();
    const x = input.x;
    const z = input.y;
    const ground = deps.groundHeight(x, z);
    const y = targetHeight(x, z);
    const dx = Math.cos(input.angle);
    const dz = Math.sin(input.angle);
    const hit = recipe.hit;
    const tier = recipe.tier;
    const colors = tier >= 3 ? [recipe.core, recipe.color, recipe.accent] : [recipe.core, recipe.color];
    const area = input.radius && input.radius > 0 ? input.radius : 0;
    const heat = recipe.heat;
    const fill = fillHeat(recipe);
    // Ortak: beyaz-sicak sert parlama, renkli ates topu, hizli sok halkasi, yerde renkli isik.
    // Firtinada parlama kucuk: elektrik kollari okunmali.
    flare(x, y, z, hit.flash * c * (recipe.impact === "storm" ? 0.55 : 1), recipe.core, 55 + tier * 15, 0, heat.core, recipe.color);
    light.spawn({ x, y, z, color: recipe.color, heat: fill, size: hit.flash * c * 0.6, sizeTo: hit.flash * c * 1.1, lifeMs: 150 + tier * 35, shape: SHAPE.glow, fade: 1.6, alpha: 0.6 });
    light.spawn({ x, y, z, color: recipe.color, heat: heat.halo * 1.4, size: hit.flash * c * 0.25, sizeTo: hit.flash * c, lifeMs: 120 + tier * 20, shape: SHAPE.ring, fade: 1.3, alpha: 0.85 });
    groundGlow(x, z, Math.max(hit.groundGlow * c, area * 1.1), recipe.color, 260 + tier * 80, 0.55, heat.halo);
    sparkBurst(x, y, z, count(hit.sparks), hit.speed, colors, { dirX: dx, dirZ: dz, bias: 0.45, heat: fill });
    // Kirinti: iri, parlayan kare parcalar (gri tas degil); yere degip sekiyor.
    for (let index = 0; index < count(hit.debris); index += 1) {
      const theta = rand() * Math.PI * 2;
      const v = c * (1.4 + rand() * 2.2);
      light.spawn({
        x, y, z,
        vx: (Math.cos(theta) * 0.6 + dx * 0.4) * v, vy: c * (1.6 + rand() * 2.2), vz: (Math.sin(theta) * 0.6 + dz * 0.4) * v,
        color: index % 2 === 0 ? recipe.color : recipe.core,
        heat: heat.halo,
        size: c * (0.05 + rand() * 0.035),
        lifeMs: 600 + rand() * 400,
        shape: SHAPE.chip,
        gravity: c * 14,
        drag: 0.6,
        fade: 2.2,
        bounce: true,
        stretch: 0.004,
        spin: rand() * 6
      });
    }
    for (let index = 0; index < count(hit.embers); index += 1) {
      light.spawn({
        x: x + (rand() - 0.5) * c * 0.5, y: y + (rand() - 0.5) * c * 0.3, z: z + (rand() - 0.5) * c * 0.5,
        vx: (rand() - 0.5) * c * 0.8, vy: c * (0.4 + rand() * 0.9), vz: (rand() - 0.5) * c * 0.8,
        color: index % 2 === 0 ? recipe.color : recipe.core,
        heat: heat.halo * 1.3,
        size: c * 0.06, sizeTo: c * 0.02,
        lifeMs: 800 + rand() * 600,
        shape: SHAPE.glow,
        drag: 1.2,
        gravity: -c * 0.2,
        fade: 1.2
      });
    }
    if (hit.smoke > 0) smokePuffs(x, y - c * 0.1, z, count(hit.smoke), 0.5 + tier * 0.1, whiten(recipe.color, 0.7));
    for (let ring = 0; ring < hit.rings; ring += 1) {
      const to = area > 0 ? area * (1 - ring * 0.18) : c * (0.75 + ring * 0.35) * (tier >= 3 ? 1.25 : 1);
      groundRing(x, z, c * 0.15, to, ring === 1 ? recipe.accent : recipe.color, 300 + ring * 60, ring * 70, 0.95, SHAPE.groundRing, heat.halo * 1.3);
    }
    if (hit.scorch) {
      matter.spawn({ x, y: ground + 0.5, z, color: 0x050506, alpha: 0.5, size: c * (0.35 + tier * 0.1), sizeTo: c * (0.42 + tier * 0.12), lifeMs: 2400, shape: SHAPE.scorch, fade: 1.8, spin: rand() * 6 });
      light.spawn({ x, y: ground + 0.6, z, color: whiten(recipe.color, 0.1), heat: heat.halo, alpha: 0.55, size: c * (0.3 + tier * 0.08), sizeTo: c * 0.18, lifeMs: 900, shape: SHAPE.groundGlow, fade: 2 });
    }

    switch (recipe.impact) {
      case "lock": {
        // Kilit: capraz dort kose, ucuna dogru sivrilen kalin cizgiler; yer halkasi iceri daraliyor.
        for (let k = 0; k < 4; k += 1) {
          const a = input.angle + Math.PI / 4 + (k * Math.PI) / 2;
          const reach = c * (0.55 + tier * 0.15);
          streak(x, y, z, x + Math.cos(a) * reach, y, z + Math.sin(a) * reach, c * 0.11, recipe.core, 110 + tier * 20, 0, 1, 0, heat.core);
        }
        groundRing(x, z, c * (1.1 + tier * 0.2), c * 0.3, recipe.color, 260, 0, 0.9, SHAPE.groundRing, heat.halo * 1.3);
        if (tier >= 2) groundRing(x, z, c * 0.9, c * 0.2, recipe.accent, 220, 70, 0.8, SHAPE.hex, heat.halo * 1.3);
        if (hit.pillar) streak(x, ground + 0.5, z, x, y + c * 2.4, z, c * 0.2, recipe.color, 260, 0, 0.9, 1, fill);
        break;
      }
      case "uplink": {
        // Gokten inen kalin sutun (beyaz-sicak ozlu) ve gercek yaricapta sok halkasi; kademe 3'te ikinci sutun.
        const top = y + c * (3.5 + tier);
        streak(x, top, z, x, ground + 0.5, z, c * (0.26 + tier * 0.08), recipe.color, 200 + tier * 40, 0, 0.9, 1.2, fill);
        streak(x, top, z, x, ground + 0.5, z, c * (0.09 + tier * 0.03), recipe.core, 140 + tier * 30, 0, 1, 0, heat.core);
        for (let index = 0; index < count(3 + tier * 2); index += 1) {
          light.spawn({ x: x + (rand() - 0.5) * c * 0.3, y: top - rand() * c, z: z + (rand() - 0.5) * c * 0.3, vy: -c * (14 + rand() * 6), color: recipe.core, heat: heat.core * 0.8, size: c * 0.08, lifeMs: 160, shape: SHAPE.spark, stretch: 0.02, fade: 1 });
        }
        groundRing(x, z, c * 0.2, Math.max(area, c * 1.4), recipe.color, 360, 0, 1, SHAPE.groundRing, heat.halo * 1.4);
        if (hit.pillar) {
          streak(x, top + c, z, x, ground + 0.5, z, c * 0.46, recipe.color, 320, 90, 0.5, 1.6, heat.halo);
          groundRing(x, z, c * 0.3, Math.max(area, c * 1.4) * 1.25, recipe.accent, 420, 120, 0.8, SHAPE.groundRing, heat.halo * 1.3);
          flare(x, ground + c * 0.3, z, hit.flash * c, recipe.core, 80, 90, heat.core, recipe.color);
        }
        break;
      }
      case "contain": {
        // Altigen kafes: yerde parlak altigen, koselerinden yukselen kalin cubuklar.
        const size = c * (0.75 + tier * 0.15);
        groundRing(x, z, size * 1.4, size, recipe.color, 520, 0, 1, SHAPE.hex, heat.halo * 1.4);
        for (let k = 0; k < 6; k += 1) {
          const a = (k * Math.PI) / 3 + Math.PI / 6;
          const px = x + Math.cos(a) * size * 0.72;
          const pz = z + Math.sin(a) * size * 0.72;
          streak(px, ground + 0.5, pz, px, ground + c * (0.5 + tier * 0.18), pz, c * 0.1, recipe.core, 300 + tier * 60, k * 18, 0.95, 0, heat.core * 0.8);
        }
        if (tier >= 2) groundRing(x, z, size * 0.6, size * 1.2, recipe.accent, 380, 180, 0.8, SHAPE.hex, heat.halo * 1.3);
        if (hit.pillar) streak(x, ground + 0.5, z, x, y + c * 1.8, z, c * 0.34, recipe.color, 340, 120, 0.6, 1, heat.halo);
        break;
      }
      case "collapse": {
        // Ice cokus: kurede dogan iri parcaciklar merkeze cekiliyor, sonra gecikmeli patlama.
        const n = count(6 + tier * 3);
        for (let index = 0; index < n; index += 1) {
          const theta = rand() * Math.PI * 2;
          const phi = Math.acos(rand() * 2 - 1);
          const reach = c * (0.8 + tier * 0.15);
          const ox = Math.sin(phi) * Math.cos(theta) * reach;
          const oy = Math.cos(phi) * reach * 0.7;
          const oz = Math.sin(phi) * Math.sin(theta) * reach;
          light.spawn({ x: x + ox, y: y + oy, z: z + oz, vx: -ox * 6, vy: -oy * 6, vz: -oz * 6, color: index % 2 ? recipe.color : recipe.accent, heat: fill, size: c * 0.085, lifeMs: 170, shape: SHAPE.spark, stretch: 0.03, fade: 0.6, fadeIn: 0.3 });
        }
        // Kisa, kucuk bosluk (gozbebegi gibi); patlama onu siliyor.
        matter.spawn({ x, y, z, color: 0x05010a, alpha: 0.6, size: c * 0.45, sizeTo: c * 0.1, lifeMs: 180, shape: SHAPE.smoke, fade: 0.8 });
        flare(x, y, z, hit.flash * c * 1.3, recipe.accent, 90, 170, heat.core, recipe.color);
        groundRing(x, z, c * 1.3, c * 0.15, recipe.color, 200, 0, 0.9, SHAPE.groundRing, heat.halo * 1.3);
        groundRing(x, z, c * 0.2, c * (1.1 + tier * 0.25), recipe.accent, 300, 170, 0.9, SHAPE.groundRing, heat.halo * 1.3);
        if (hit.pillar) sparkBurst(x, y, z, count(10), 5, [recipe.accent, recipe.core], { up: 0.2, life: 420, heat: fill });
        break;
      }
      case "storm": {
        // Kirik elektrik kollari: az ama kalin, beyaz-sicak ozlu isin parcalari; iki dalga.
        const arms = count(2 + tier);
        for (let wave = 0; wave < (tier >= 2 ? 2 : 1); wave += 1) {
          for (let arm = 0; arm < arms; arm += 1) {
            let px = x;
            let py = y;
            let pz = z;
            const heading = rand() * Math.PI * 2;
            for (let step = 0; step < 4; step += 1) {
              const a = heading + (rand() - 0.5) * 1.4;
              const len = c * (0.28 + rand() * 0.22) * (1 + tier * 0.2);
              const nx = px + Math.cos(a) * len;
              const nz = pz + Math.sin(a) * len;
              const ny = Math.max(ground + 1, py + (rand() - 0.55) * len);
              streak(px, py, pz, nx, ny, nz, c * (0.13 - step * 0.02), arm % 2 ? recipe.color : recipe.accent, 130 + rand() * 70, wave * 80 + step * 12, 1, 0, heat.core * 0.9);
              px = nx; py = ny; pz = nz;
            }
          }
        }
        flare(x, y, z, hit.flash * c * 0.6, recipe.accent, 50, 80, heat.core, recipe.color);
        if (hit.pillar) {
          // Yere inen yildirim.
          streak(x, y + c * 2.5, z, x + (rand() - 0.5) * c * 0.4, ground + 0.5, z + (rand() - 0.5) * c * 0.4, c * 0.18, 0xffffff, 120, 40, 1, 0, heat.core);
          groundRing(x, z, c * 0.2, c * 1.6, recipe.accent, 320, 40, 0.9, SHAPE.groundRing, heat.halo * 1.3);
        }
        break;
      }
      case "pierce": {
        // Ucus yonune dik kalin kesik; kademe 3'te capraz ikinci kesik ve ileri kristal yelpazesi.
        const nx = -dz;
        const nz = dx;
        const half = c * (0.55 + tier * 0.12);
        streak(x - nx * half, y + half * 0.35, z - nz * half, x + nx * half, y - half * 0.35, z + nz * half, c * 0.15, recipe.core, 170 + tier * 30, 0, 1, 0, heat.core);
        if (tier >= 3) streak(x - nx * half, y - half * 0.35, z - nz * half, x + nx * half, y + half * 0.35, z + nz * half, c * 0.12, recipe.accent, 190, 40, 1, 0, fill);
        sparkBurst(x, y, z, count(4 + tier * 2), 6, [recipe.color, recipe.core], { dirX: dx, dirZ: dz, bias: 0.85, up: 0.05, life: 260, stretch: 0.045, gravity: 2, heat: fill });
        break;
      }
      default:
        if (hit.pillar) {
          flare(x, y, z, hit.flash * c * 1.6, recipe.accent, 90, 80, heat.core, recipe.color);
          sparkBurst(x, y, z, count(10), hit.speed * 1.3, [recipe.accent, recipe.core], { up: 0.3, life: 460, heat: fill });
        }
    }
  }

  function beamHitEvent(input: ShotEventInput, recipe: ShotRecipe) {
    const c = cell();
    const x = input.x;
    const z = input.y;
    const y = targetHeight(x, z);
    const now = performance.now();
    const key = input.key ?? `${Math.round(x)}:${Math.round(z)}`;
    // Surekli lazer saniyede onlarca temas: kivilcim ve yanik izi kisitli.
    flare(x, y, z, recipe.hit.flash * c * 0.5, recipe.core, 50, 0, recipe.heat.core, recipe.color);
    const last = lastBeamSparkAt.get(key) ?? 0;
    if (now - last < 70) return;
    lastBeamSparkAt.set(key, now);
    if (lastBeamSparkAt.size > 400) lastBeamSparkAt = new Map();
    sparkBurst(x, y, z, count(3 + recipe.tier), 4.5, recipe.beam === "laser" ? [0xffd8a8, recipe.color, recipe.core] : [recipe.core, recipe.color], { dirX: -Math.cos(input.angle), dirZ: -Math.sin(input.angle), bias: 0.5, life: 300, heat: fillHeat(recipe) });
    groundGlow(x, z, c * (0.8 + recipe.tier * 0.3), recipe.color, 160, 0.55, recipe.heat.halo);
    if (recipe.beam === "laser" && rand() < 0.35) {
      matter.spawn({ x, y: deps.groundHeight(x, z) + 0.5, z, color: 0x050506, alpha: 0.45, size: c * 0.22, sizeTo: c * 0.28, lifeMs: 1600, shape: SHAPE.scorch, fade: 2, spin: rand() * 6 });
    }
  }

  function death(input: DeathFxInput) {
    const c = cell();
    const k = Math.max(0.3, input.intensity);
    const { x, y, z, size } = input;
    const ground = deps.groundHeight(x, z);
    const dirX = input.heading !== undefined ? Math.cos(input.heading) : undefined;
    const dirZ = input.heading !== undefined ? Math.sin(input.heading) : undefined;
    flare(x, y, z, size * (input.heavy ? 1.1 : 0.85), input.edge, 110, 0, 2.1 * k, input.color);
    // Kirintilar: govdenin malzemesi (koyu govde, acik kenar), yonu son vurustan; yere dusup sekiyor.
    const chips = count((input.heavy ? 14 : 9) * k);
    for (let index = 0; index < chips; index += 1) {
      const theta = rand() * Math.PI * 2;
      let dx = Math.cos(theta);
      let dz = Math.sin(theta);
      if (dirX !== undefined && dirZ !== undefined) {
        dx = dx * 0.45 + dirX * 0.55;
        dz = dz * 0.45 + dirZ * 0.55;
      }
      const v = c * (1.6 + rand() * 2.6) * (input.heavy ? 1.15 : 1);
      matter.spawn({
        x: x + dx * size * 0.15, y, z: z + dz * size * 0.15,
        vx: dx * v, vy: c * (1.8 + rand() * 2.4), vz: dz * v,
        color: index % 3 === 0 ? input.edge : input.debris,
        size: size * (0.09 + rand() * 0.08) * (input.heavy ? 1.2 : 1),
        lifeMs: 900 + rand() * 500,
        shape: SHAPE.chip,
        spin: rand() * 6,
        spinRate: (rand() - 0.5) * 18,
        gravity: c * 11,
        drag: 0.5,
        bounce: !input.air,
        fade: 2.4
      });
    }
    if (input.sparks === "sparks" || input.sparks === "crackle") {
      sparkBurst(x, y, z, count(8 * k), 4.2, [whiten(input.edge, 0.55), input.color], { dirX, dirZ, bias: dirX !== undefined ? 0.45 : 0, life: 380, size: 0.07, heat: 1.6 });
    } else if (input.sparks === "embers") {
      // Kul: yavas yukselen korlar.
      for (let index = 0; index < count(9 * k); index += 1) {
        light.spawn({
          x: x + (rand() - 0.5) * size * 0.6, y: y + (rand() - 0.3) * size * 0.4, z: z + (rand() - 0.5) * size * 0.6,
          vx: (rand() - 0.5) * c * 0.6, vy: c * (0.8 + rand() * 0.9), vz: (rand() - 0.5) * c * 0.6,
          color: 0xff6a2b, heat: 1.7, size: c * 0.05, lifeMs: 600 + rand() * 400, shape: SHAPE.glow, drag: 1.2, fade: 1.4
        });
      }
    }
    if (input.smoke) smokePuffs(x, y, z, count(input.heavy ? 5 : 3), input.heavy ? 0.6 : 0.42, whiten(input.smoke, 0.35), 0.34);
    if (!input.air) {
      groundRing(x, z, size * 0.3, size * (input.heavy ? 1.5 : 1.2), input.color, 360, 0, 0.75 * k);
      matter.spawn({ x, y: ground + 0.65, z, color: input.decal, alpha: 0.55, size: size * 0.5, sizeTo: size * 0.62, lifeMs: 2400, shape: SHAPE.scorch, fade: 1.3, spin: rand() * Math.PI * 2 });
    }
  }

  function event(kind: ShotEventKind, input: ShotEventInput) {
    if (!visible) return;
    const recipe = getShotRecipe(input.definitionId, input.tier, input.fallbackColor);
    if (kind === "muzzle") muzzleEvent(input, recipe);
    else if (kind === "anticipation") anticipationEvent(input, recipe);
    else if (kind === "impact") impactEvent(input, recipe);
    else beamHitEvent(input, recipe);
  }

  /* ------------------------------- mermiler ------------------------------ */

  function projectiles(list: readonly ShotProjectileInput[]) {
    if (!visible) return;
    const c = cell();
    const now = performance.now();
    for (const flight of flights.values()) flight.seen = false;
    for (const projectile of list) {
      if (projectile.source !== "tower") continue;
      const recipe = getShotRecipe(projectile.definitionId, projectile.tier);
      let flight = flights.get(projectile.id);
      if (!flight) {
        const root = makeBody(recipe);
        // Namlu once hedefe donup egiliyor, mermi onun ucunda doguyor (sunucunun dogum noktasi 2D'nin).
        if (deps.aimAt) {
          const heading = Math.atan2(projectile.vy ?? 0, projectile.vx ?? 1);
          const aim = deps.aim(projectile.x, projectile.y, Math.cos(heading), Math.sin(heading));
          if (aim) deps.aimAt(projectile.x, projectile.y, TMP_TARGET.set(projectile.x + Math.cos(heading) * aim.distance, aim.y, projectile.y + Math.sin(heading) * aim.distance));
        }
        const tip = muzzlePoint(projectile.x, projectile.y);
        flight = {
          id: projectile.id, recipe, root, material: bodyMaterial(root), fit: getProjectileHitFit(projectile.definitionId, projectile.tier, c),
          pathX: projectile.x, pathZ: projectile.y,
          offsetX: tip.x - projectile.x, offsetZ: tip.z - projectile.y,
          baseY: tip.y,
          x: tip.x, y: tip.y, z: tip.z,
          traveled: 0, seen: true, seed: hash01(projectile.id), trailCarry: 0,
          path: new Float32Array(PATH_POINTS * 3), pathCount: 0, pathHead: 0
        };
        pushPath(flight);
        flight.material.color.setHex(recipe.color);
        setHeatColor(flight.material.emissive, recipe.color, recipe.heat.halo * 1.3);
        group.add(root);
        flights.set(projectile.id, flight);
      }
      flight.seen = true;
      const stepX = projectile.x - flight.pathX;
      const stepZ = projectile.y - flight.pathZ;
      const step = Math.hypot(stepX, stepZ);
      flight.pathX = projectile.x;
      flight.pathZ = projectile.y;
      flight.traveled += step;
      // Yukseklik araziyi izlemiyor: ileride vuracagi dusmanin govdesine duz hat
      // (kalan yol kadar her adimda ona yaklasiyor). Hedef yoksa ayni yukseklikte.
      const moving = step > 0.001;
      const dirX = moving ? stepX / step : Math.cos(Math.atan2(projectile.vy ?? 0, projectile.vx ?? 1));
      const dirZ = moving ? stepZ / step : Math.sin(Math.atan2(projectile.vy ?? 0, projectile.vx ?? 1));
      const aim = deps.aim(projectile.x, projectile.y, dirX, dirZ);
      if (aim && moving) flight.baseY += (aim.y - flight.baseY) * Math.min(1, step / (step + aim.distance));
      // Sunucu'nun paketi kavisle: yolun kesrine gore yay.
      const remaining = aim?.distance ?? c * 2;
      const fraction = flight.traveled / Math.max(1e-3, flight.traveled + remaining);
      const lob = recipe.arc * c * Math.sin(Math.PI * Math.min(1, fraction));
      // Namlu ile yol arasindaki fark ilk hucrede kapaniyor.
      const blend = Math.max(0, 1 - flight.traveled / (c * 1.1));
      const ease = blend * blend * (3 - 2 * blend);
      const px = flight.x;
      const py = flight.y;
      const pz = flight.z;
      flight.x = projectile.x + flight.offsetX * ease;
      flight.y = flight.baseY + lob;
      flight.z = projectile.y + flight.offsetZ * ease;
      const moved = Math.hypot(flight.x - px, flight.y - py, flight.z - pz);
      if (moved > 0.001) TMP_DIR.set(flight.x - px, flight.y - py, flight.z - pz);
      else TMP_DIR.set(dirX, 0, dirZ);
      if (TMP_DIR.lengthSq() < 1e-6) TMP_DIR.set(1, 0, 0);
      TMP_DIR.normalize();
      TMP_Q.setFromUnitVectors(UP, TMP_DIR);
      const body = recipe.body;
      if (body.spin !== 0) {
        SPIN_Q.setFromAxisAngle(UP, (now / 1000) * body.spin * Math.PI * 2 + flight.seed * 6);
        TMP_Q.multiply(SPIN_Q);
      }
      flight.root.quaternion.copy(TMP_Q);
      const pulse = recipe.shape === "arc" ? 0.85 + 0.3 * Math.sin(now / 28 + flight.seed * 40) : 1;
      const fit = flight.fit;
      // Govde isabet seklinin basina oturuyor: boyu front - rear, eni 2 half,
      // merkezi merminin yerinden (front + rear) / 2 ileride (yatayda tam o kadar).
      let cx = flight.x;
      let cy = flight.y;
      let cz = flight.z;
      let length = body.length * c;
      let width = body.width * c * pulse;
      if (fit) {
        const level = Math.max(0.2, Math.hypot(TMP_DIR.x, TMP_DIR.z));
        const ahead = (fit.front + fit.rear) / 2 / level;
        cx += TMP_DIR.x * ahead;
        cy += TMP_DIR.y * ahead;
        cz += TMP_DIR.z * ahead;
        length = (fit.front - fit.rear) / level;
        width = fit.half * 2;
      }
      // Hucre govdesi (altigen pul) silindirin boyunun 0,55'i: tam boyu kaplasin.
      flight.root.scale.set(width, recipe.shape === "cell" && fit ? length / 0.55 : length, width);
      flight.root.position.set(cx, cy, cz);
      // Govdenin halesi ve beyaz-sicak ozu (tek kare). Ince uzun mermide hale
      // ucus yonunde uzuyor: yuvarlak leke degil, parlak cubuk. Goz kuresinde oz
      // yok, hale bir halka: koyu gozbebegi okunsun. Isabet sekli biliniyorsa
      // hale basi az asiyor, oz icinde: parlayan alan vurdugu alan.
      const heat = recipe.heat;
      const slim = recipe.shape === "tracer" || recipe.shape === "lance";
      const eye = recipe.shape === "gaze";
      const extent = Math.max(length, width);
      const halo = fit ? extent * 1.15 * pulse : c * (slim ? 0.15 : eye ? 0.24 : 0.24 + recipe.tier * 0.03) * pulse;
      const core = fit ? Math.min(length, width) * 0.9 : c * (slim ? 0.08 : 0.1 + recipe.tier * 0.015) * pulse;
      light.spawn({ x: cx, y: cy, z: cz, vx: TMP_DIR.x, vy: TMP_DIR.y, vz: TMP_DIR.z, color: recipe.color, heat: eye ? heat.halo * 1.3 : heat.halo, size: halo, lifeMs: 0, shape: eye ? SHAPE.ring : SHAPE.glow, stretch: slim && !fit ? 1.3 : 0, alpha: 0.8 });
      if (!eye) light.spawn({ x: cx, y: cy, z: cz, vx: TMP_DIR.x, vy: TMP_DIR.y, vz: TMP_DIR.z, color: recipe.core, heat: heat.core * 0.8, size: core, lifeMs: 0, shape: SHAPE.glow, stretch: slim && !fit ? 1.2 : 0, alpha: 0.95 });
      if (recipe.tier >= 3) light.spawn({ x: cx, y: cy, z: cz, color: recipe.accent, heat: heat.halo, size: fit ? extent * 1.3 : c * (eye ? 0.32 : 0.36), lifeMs: 0, shape: eye ? SHAPE.ring : SHAPE.glow, alpha: eye ? 0.6 : 0.25 });
      // Ucube: govdeden firlayan kisa, kirik elektrik dilleri (her kare degil).
      if (recipe.shape === "arc" && rand() < 0.25 + recipe.tier * 0.1) {
        const a = rand() * Math.PI * 2;
        const reach = fit ? fit.half * (1.1 + rand() * 0.7) : c * (0.18 + rand() * 0.14) * (1 + recipe.tier * 0.15);
        streak(cx, cy, cz, cx + Math.cos(a) * reach, cy + (rand() - 0.3) * reach, cz + Math.sin(a) * reach, fit ? Math.max(0.3, fit.half * 0.2) : c * 0.05, rand() < 0.5 ? recipe.core : recipe.accent, 60, 0, 1, 0, heat.core * 0.8);
      }
      pushPath(flight);
      emitRibbon(flight, recipe);
      emitTrail(flight, px, py, pz, moved, recipe, now);
    }
    for (const [id, flight] of flights) {
      if (flight.seen) continue;
      releaseBody(flight);
      flights.delete(id);
    }
  }

  /** Iz gecmisine yeni nokta: en yenisinden `PATH_STEP` hucre uzaklasinca (yoksa en yenisini guncelliyor). */
  function pushPath(flight: Flight) {
    const path = flight.path;
    if (flight.pathCount > 1) {
      // En yeni nokta bir oncekine yakinsa yerinde ilerliyor: gecmis hucre basina seyrek.
      const head = flight.pathHead * 3;
      const prev = ((flight.pathHead + PATH_POINTS - 1) % PATH_POINTS) * 3;
      if (Math.hypot(path[head] - path[prev], path[head + 1] - path[prev + 1], path[head + 2] - path[prev + 2]) < cell() * PATH_STEP) {
        path[head] = flight.x; path[head + 1] = flight.y; path[head + 2] = flight.z;
        return;
      }
    }
    flight.pathHead = flight.pathCount === 0 ? 0 : (flight.pathHead + 1) % PATH_POINTS;
    flight.pathCount = Math.min(PATH_POINTS, flight.pathCount + 1);
    const o = flight.pathHead * 3;
    path[o] = flight.x; path[o + 1] = flight.y; path[o + 2] = flight.z;
  }

  /**
   * Govdenin arkasindaki isik seridi (tek kare): renkli dolgu ve beyaz-sicak oz,
   * gecmiste `trail.length` hucre geriden govdeye; kuyruga dogru incelip sonuyor.
   * Eski sik parcacik izinin yerine iki parca: temiz ve ucuz.
   */
  function emitRibbon(flight: Flight, recipe: ShotRecipe) {
    const c = cell();
    const path = flight.path;
    // Isabet seklinin kuyrugu kadar (yoksa serit yok): gorunen alan vurdugu alan.
    const fit = flight.fit;
    const want = fit ? fit.tail : recipe.trail.length * c;
    if (want <= 0) return;
    let ax = flight.x;
    let ay = flight.y;
    let az = flight.z;
    let left = want;
    for (let k = 0; k < flight.pathCount && left > 0; k += 1) {
      const o = ((flight.pathHead - k + PATH_POINTS) % PATH_POINTS) * 3;
      const bx = path[o];
      const by = path[o + 1];
      const bz = path[o + 2];
      const d = Math.hypot(bx - ax, by - ay, bz - az);
      if (d >= left) {
        const t = left / Math.max(d, 1e-6);
        ax += (bx - ax) * t; ay += (by - ay) * t; az += (bz - az) * t;
        left = 0;
        break;
      }
      ax = bx; ay = by; az = bz;
      left -= d;
    }
    // Namludan yeni cikti: serit henuz cok kisa.
    if (want - left < c * 0.08) return;
    const width = fit ? fit.tailHalf * 2 : recipe.trail.width * c;
    light.spawn({ x: ax, y: ay, z: az, ex: flight.x, ey: flight.y, ez: flight.z, color: recipe.color, heat: recipe.heat.halo * 1.5, alpha: 0.9, size: width, lifeMs: 0, shape: SHAPE.trail });
    light.spawn({ x: ax, y: ay, z: az, ex: flight.x, ey: flight.y, ez: flight.z, color: recipe.core, heat: recipe.heat.core * 0.6, alpha: 1, size: width * 0.4, lifeMs: 0, shape: SHAPE.trail });
  }

  function emitTrail(flight: Flight, px: number, py: number, pz: number, step: number, recipe: ShotRecipe, now: number) {
    if (step <= 0) return;
    const c = cell();
    // Seritin ustune seyrek ama iri parcaciklar: yol boyunca kisa sonen isik.
    flight.trailCarry += (step / c) * recipe.trail.density * 26 * budget();
    const n = Math.min(12, Math.floor(flight.trailCarry));
    flight.trailCarry -= n;
    const trail = recipe.trail;
    for (let index = 0; index < n; index += 1) {
      const t = (index + rand()) / Math.max(1, n);
      let x = px + (flight.x - px) * t;
      let y = py + (flight.y - py) * t;
      let z = pz + (flight.z - pz) * t;
      if (recipe.shape === "cell") {
        // Sarmal iz: govdenin cevresinde donen ikiz serit.
        const phase = now / 70 + flight.seed * 10 + (rand() < 0.5 ? Math.PI : 0);
        const dirx = flight.x - px;
        const dirz = flight.z - pz;
        const len = Math.hypot(dirx, dirz) || 1;
        x += (-dirz / len) * Math.cos(phase) * c * 0.1;
        z += (dirx / len) * Math.cos(phase) * c * 0.1;
        y += Math.sin(phase) * c * 0.1;
      }
      // Sunucu: geride kalan kare veri parcalari; digerleri yuvarlak isik.
      const bits = recipe.shape === "packet";
      light.spawn({
        x, y, z,
        vx: (rand() - 0.5) * c * 0.1, vy: (rand() - 0.2) * c * 0.1, vz: (rand() - 0.5) * c * 0.1,
        color: index % 3 === 0 ? recipe.core : recipe.color,
        heat: recipe.heat.halo * 1.2,
        alpha: 0.85,
        size: trail.size * c * (bits ? 0.6 : 1), sizeTo: trail.size * c * (bits ? 0.3 : 0.15),
        lifeMs: trail.lifeMs * (0.75 + rand() * 0.5),
        shape: bits ? SHAPE.chip : SHAPE.glow,
        spin: rand() * 6,
        drag: 2,
        fade: 1.2
      });
      if (rand() < trail.sparkle) {
        light.spawn({
          x, y, z,
          vx: (rand() - 0.5) * c * 1.6, vy: (rand() - 0.1) * c * 1.4, vz: (rand() - 0.5) * c * 1.6,
          color: recipe.tier >= 3 ? recipe.accent : recipe.core,
          heat: fillHeat(recipe),
          size: c * 0.04, lifeMs: 260, shape: SHAPE.spark, stretch: 0.035, drag: 2.5, gravity: c * 3, fade: 1
        });
      }
    }
  }

  /* -------------------------------- isinlar ------------------------------- */

  /**
   * Taret ve namlu kulenin isinlarinin ilk hedefine kilitleniyor: isin namlunun
   * ucundan, onun hattinda. Ayni kulenin birden cok isini varsa (Debug Lazer
   * 10. seviyede sola ve saga supuren iki kiris) taret bir kez, uclarinin
   * ortasina donuyor ve hepsi ayni namlu ucundan cikiyor: her isin kendine
   * kilitlenince taret sonuncuya donuk kaliyor, digerleri havadan cikiyordu.
   * Dusmanin atisi (`enemy-shot`, dusmandan kuleye) dusmanin govdesinden cikiyor:
   * yakindaki kulenin namlusuna yapisip kuleyi kendi merkezine dondurmuyor.
   */
  function beamStarts(list: readonly ShotBeamInput[]) {
    const groups = new Map<string, ShotBeamInput[]>();
    const starts = new Map<ShotBeamInput, THREE.Vector3>();
    for (const beam of list) {
      if (beam.definitionId === ENEMY_SHOT_BEAM) {
        starts.set(beam, new THREE.Vector3(beam.x1, targetHeight(beam.x1, beam.y1), beam.y1));
        continue;
      }
      const key = `${Math.round(beam.x1)}|${Math.round(beam.y1)}`;
      const group = groups.get(key);
      if (group) group.push(beam);
      else groups.set(key, [beam]);
    }
    for (const group of groups.values()) {
      const first = group[0];
      if (deps.aimAt) {
        let x = 0;
        let z = 0;
        for (const beam of group) {
          const bounces = beam.b ?? [];
          x += bounces.length >= 2 ? bounces[0] : beam.x2;
          z += bounces.length >= 2 ? bounces[1] : beam.y2;
        }
        x /= group.length;
        z /= group.length;
        deps.aimAt(first.x1, first.y1, TMP_TARGET.set(x, targetHeight(x, z), z));
      }
      const start = muzzlePoint(first.x1, first.y1);
      for (const beam of group) starts.set(beam, start);
    }
    return starts;
  }

  function beams(list: readonly ShotBeamInput[]) {
    if (!visible) return;
    const c = cell();
    const now = performance.now();
    const time = now / 1000;
    const starts = beamStarts(list);
    for (const beam of list) {
      const recipe = getShotRecipe(beam.definitionId, beam.tier, beam.color);
      const look = recipe.beamLook;
      const bounces = beam.b ?? [];
      const start = starts.get(beam)!.clone();
      const points: THREE.Vector3[] = [start];
      for (let index = 0; index + 1 < bounces.length; index += 2) points.push(new THREE.Vector3(bounces[index], targetHeight(bounces[index], bounces[index + 1]), bounces[index + 1]));
      points.push(new THREE.Vector3(beam.x2, targetHeight(beam.x2, beam.y2), beam.y2));
      const flicker = 1 + Math.sin(time * 61 + hash01(beam.id) * 9) * look.flicker;
      // Uc katman: genis renkli hale, dolgun renkli govde, ince beyaz-sicak
      // cekirdek (parlama esigini yalnizca o geciyor; kalin olursa rengi siliyor).
      // Ince lazer de en az `coreMin`/`glowMin` hucre. Kin dalgasi genis yumusak
      // bant: sicak cekirdek yok, katmanlar soluk (yoksa koni beyaz bir lekeye donuyor).
      const soft = recipe.beam === "wave";
      const heat = recipe.heat;
      const coreWidth = Math.min(Math.max(beam.width * look.core, c * look.coreMin), c * 0.2);
      const glowWidth = Math.min(Math.max(beam.width * look.glow, c * look.glowMin), c * (soft ? 2.4 : 0.9)) * flicker;
      const bodyWidth = coreWidth + (glowWidth - coreWidth) * 0.45;
      const flow = soft ? 0.7 : recipe.beam === "laser" ? 1 + recipe.tier * 0.3 : 0.5;
      for (let index = 0; index + 1 < points.length; index += 1) {
        const a = points[index];
        const b = points[index + 1];
        light.spawn({ x: a.x, y: a.y, z: a.z, ex: b.x, ey: b.y, ez: b.z, color: recipe.color, heat: soft ? heat.halo * 0.7 : heat.halo, alpha: soft ? 0.35 : 0.5, size: glowWidth, lifeMs: 0, shape: SHAPE.beam, stretch: flow });
        light.spawn({ x: a.x, y: a.y, z: a.z, ex: b.x, ey: b.y, ez: b.z, color: recipe.color, heat: soft ? heat.halo * 0.8 : fillHeat(recipe), alpha: soft ? 0.4 : 0.85, size: bodyWidth, lifeMs: 0, shape: SHAPE.beam });
        light.spawn({ x: a.x, y: a.y, z: a.z, ex: b.x, ey: b.y, ez: b.z, color: recipe.core, heat: soft ? heat.halo * 1.2 : heat.core * 0.85, alpha: soft ? 0.6 : 1, size: coreWidth, lifeMs: 0, shape: SHAPE.beam });
        // Akan nabizlar: kademeyle artiyor (Kin'de dalga, lazerde isi).
        const pulses = soft ? 3 + look.pulses : look.pulses;
        for (let k = 0; k < pulses; k += 1) {
          const t = (time * (soft ? 1.4 : 2.6) + k / Math.max(1, pulses)) % 1;
          light.spawn({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, color: k % 2 ? recipe.accent : recipe.core, heat: soft ? heat.halo : fillHeat(recipe), size: Math.min(glowWidth * (soft ? 0.6 : 0.8), c * 1.2), lifeMs: 0, shape: SHAPE.glow, alpha: soft ? 0.45 : 0.7 });
        }
      }
      const end = points[points.length - 1];
      // Uclar: namluda ve temasta beyaz-sicak parlama (boyu sinirli); Spot'ta
      // temas havuzu genis; kademe 3'te temas cevresinde donen halka.
      const pool = recipe.beam === "spot" ? 1.4 : 1;
      light.spawn({ x: start.x, y: start.y, z: start.z, color: recipe.core, heat: heat.core, size: Math.min(Math.max(coreWidth * 4, c * 0.3), c * 0.6) * flicker, lifeMs: 0, shape: SHAPE.glow, alpha: 0.95 });
      light.spawn({ x: end.x, y: end.y, z: end.z, color: recipe.color, heat: heat.halo * 1.2, size: Math.min(glowWidth * 1.6, c * 1.1) * pool, lifeMs: 0, shape: SHAPE.glow, alpha: 0.85 });
      light.spawn({ x: end.x, y: end.y, z: end.z, color: 0xffffff, heat: heat.core, size: Math.min(Math.max(coreWidth * 3.5, c * 0.28), c * 0.6) * flicker, lifeMs: 0, shape: SHAPE.flare, alpha: 0.9, spin: time * 3 });
      light.spawn({ x: end.x, y: deps.groundHeight(end.x, end.z) + 0.7, z: end.z, color: recipe.color, heat: heat.halo, size: c * (0.7 + recipe.tier * 0.25) * pool, lifeMs: 0, shape: SHAPE.groundGlow, alpha: 0.55 });
      if (recipe.tier >= 3) light.spawn({ x: end.x, y: deps.groundHeight(end.x, end.z) + 0.8, z: end.z, color: recipe.accent, heat: heat.halo * 1.3, size: c * 0.75, lifeMs: 0, shape: SHAPE.groundRing, alpha: 0.75, spin: time * 2 });
    }
  }

  /* ----------------------------- performans alevi ------------------------- */

  const flameCarry = new Map<string, number>();
  let lastFlameAt = performance.now();

  /**
   * Kaidenin cevresinde yukselen alev dilleri: ortasi sari, govdesi turuncu,
   * kenari kirmizi; yogunlukla sayisi, boyu ve parlakligi artiyor. Yogun alevde
   * ustten kivilcim savruluyor; zeminde kirmizi isik ve turuncu halka (2D'deki
   * ayak izi parlamasi ve cemberi).
   */
  function flames(list: readonly ShotFlameInput[]) {
    const now = performance.now();
    const dt = Math.min(80, Math.max(0, now - lastFlameAt));
    lastFlameAt = now;
    if (!visible) return;
    const c = cell();
    const seen = new Set<string>();
    for (const flame of list) {
      seen.add(flame.id);
      const i = flame.intensity;
      const height = c * (0.16 + i * 0.6);
      const life = 380 + i * 260;
      const rise = height / (life / 1000);
      // 2D'deki dil sayisi (5 + 9 i), her dil saniyede ~11 parcacik.
      let carry = (flameCarry.get(flame.id) ?? 0) + (5 + 9 * i) * 11 * budget() * (dt / 1000);
      const n = Math.min(24, Math.floor(carry));
      carry -= n;
      flameCarry.set(flame.id, carry);
      for (let k = 0; k < n; k += 1) {
        const a = rand() * Math.PI * 2;
        const r = flame.radius * (0.82 + i * 0.08 + (rand() - 0.5) * 0.14);
        const hot = rand();
        light.spawn({
          x: flame.x + Math.cos(a) * r, y: flame.y + c * 0.02, z: flame.z + Math.sin(a) * r,
          vx: Math.cos(a) * rise * 0.1, vy: rise, vz: Math.sin(a) * rise * 0.1,
          color: hot < 0.3 ? 0xfacc15 : hot < 0.78 ? 0xf97316 : 0xef4444,
          heat: hot < 0.3 ? 1.9 : 1.45,
          alpha: 0.5 + i * 0.5,
          size: c * (0.08 + i * 0.13), sizeTo: c * 0.02,
          lifeMs: life * (0.75 + rand() * 0.5),
          // Dikine uzun dil: boyu eninin ~2,2 kati.
          shape: SHAPE.glow, stretch: 1.2 / Math.max(1, rise), drag: 1.1, fade: 1.1, fadeIn: 0.12
        });
      }
      if (i > 0.55 && rand() < (dt / 1000) * (3 + 7 * i) * budget()) {
        const a = rand() * Math.PI * 2;
        const r = flame.radius * 0.9;
        light.spawn({
          x: flame.x + Math.cos(a) * r, y: flame.y + height * 0.6, z: flame.z + Math.sin(a) * r,
          vx: (rand() - 0.5) * c * 0.6, vy: rise * 1.3, vz: (rand() - 0.5) * c * 0.6,
          color: rand() < 0.5 ? 0xfef08a : 0xfb923c, heat: 1.6,
          size: c * 0.03, lifeMs: 520, shape: SHAPE.spark, stretch: 0.02, drag: 1.4, fade: 1
        });
      }
      light.spawn({ x: flame.x, y: flame.y + 0.4, z: flame.z, color: 0xef4444, heat: 1, alpha: 0.03 + i * 0.16, size: flame.radius * 2 * (1.08 + i * 0.32), lifeMs: 0, shape: SHAPE.groundGlow });
      // Halka bandi yaricapin 0,8'inde: cember govdenin 0,95'inde.
      light.spawn({ x: flame.x, y: flame.y + 0.45, z: flame.z, color: 0xf97316, heat: 1.1, alpha: 0.12 + i * 0.58, size: (flame.radius * 2 * 0.95) / 0.8, lifeMs: 0, shape: SHAPE.groundRing });
    }
    for (const id of flameCarry.keys()) if (!seen.has(id)) flameCarry.delete(id);
  }

  /* ------------------------------ Zeynep'in komutlari --------------------- */

  function auras(list: readonly ShotAuraInput[]) {
    if (!visible) return;
    const t = performance.now() / 1000;
    for (const aura of list) {
      const r = aura.radius;
      const { primary, secondary, accent } = aura.colors;
      if (aura.kind === "haste") {
        const pulse = 0.7 + Math.sin((t + 0.21) * Math.PI * 2) * 0.22;
        const marks = aura.tier + 2;
        const orbit = r * 1.18;
        for (let index = 0; index < marks; index += 1) {
          const angle = t * Math.PI * 2 * 1.7 + (index * Math.PI * 2) / marks;
          const h = aura.y + aura.height * (0.3 + 0.16 * (index % 2));
          const x = aura.x + Math.cos(angle) * orbit;
          const z = aura.z + Math.sin(angle) * orbit;
          light.spawn({ x, y: h, z, vx: -Math.sin(angle), vy: 0, vz: Math.cos(angle), color: index % 2 ? primary : accent, heat: 1.8, alpha: 0.95, size: r * 0.34, lifeMs: 0, shape: SHAPE.glow, stretch: 1.8 });
          // Kuyruk: yorungede geride kalan kisa omurlu isik.
          light.spawn({ x, y: h, z, color: primary, heat: 1.3, alpha: 0.6, size: r * 0.22, sizeTo: r * 0.05, lifeMs: 220, shape: SHAPE.glow, fade: 1.3 });
        }
        light.spawn({ x: aura.x, y: aura.y + 0.6, z: aura.z, color: primary, heat: 1.1, alpha: 0.32 + pulse * 0.28, size: (orbit * 2) / 0.8, lifeMs: 0, shape: SHAPE.groundRing });
        continue;
      }
      const pulse = 0.7 + Math.sin(t * Math.PI * 2) * 0.22;
      const ring = r * (1.2 + aura.tier * 0.04);
      light.spawn({ x: aura.x, y: aura.y + 0.5, z: aura.z, color: primary, heat: 1, alpha: 0.1 + aura.tier * 0.03, size: ring * 2.2, lifeMs: 0, shape: SHAPE.groundGlow });
      light.spawn({ x: aura.x, y: aura.y + 0.55, z: aura.z, color: primary, heat: 1.15, alpha: 0.35 + pulse * 0.3, size: (ring * 2) / 0.8, lifeMs: 0, shape: SHAPE.groundRing });
      light.spawn({ x: aura.x, y: aura.y + 0.55, z: aura.z, color: secondary, heat: 1, alpha: 0.3 + pulse * 0.2, size: (ring * 2.25) / 0.8, lifeMs: 0, shape: SHAPE.groundRing });
      const marks = aura.tier + 2;
      for (let index = 0; index < marks; index += 1) {
        const angle = -t * Math.PI * 2 * 0.65 + (index * Math.PI * 2) / marks;
        light.spawn({ x: aura.x + Math.cos(angle) * ring * 1.12, y: aura.y + 1.2, z: aura.z + Math.sin(angle) * ring * 1.12, color: index % 2 ? primary : accent, heat: 1.5, alpha: 0.9, size: r * 0.28, lifeMs: 0, shape: SHAPE.glow });
      }
    }
  }

  function slows(list: readonly ShotSlowInput[]) {
    if (!visible) return;
    const t = performance.now() / 1000;
    for (const slow of list) {
      const r = slow.radius;
      // Buz altigeni: hex sekli bandini yaricapin 0,8'inde ciziyor.
      light.spawn({ x: slow.x, y: slow.ground + 0.5, z: slow.z, color: slow.color, heat: 1.05, alpha: 0.3 + slow.tier * 0.1, size: (r * 2) / 0.8, lifeMs: 0, shape: SHAPE.hex, spin: t * 0.5 });
      for (let index = 0; index < slow.tier; index += 1) {
        const angle = t * Math.PI * 2 * 0.25 + (index * Math.PI * 2) / slow.tier;
        light.spawn({ x: slow.x + Math.cos(angle) * r * 0.9, y: slow.y + Math.sin(t * 2 + index) * r * 0.15, z: slow.z + Math.sin(angle) * r * 0.9, color: slow.color, heat: 1.4, alpha: 0.75, size: r * 0.14, lifeMs: 0, shape: SHAPE.glow });
      }
    }
  }

  function commandPulse(input: ShotPulseInput) {
    if (!visible) return;
    const c = cell();
    const y = deps.groundHeight(input.x, input.z) + 0.8;
    for (let k = 0; k < 2; k += 1) {
      light.spawn({ x: input.x, y, z: input.z, color: k ? input.accent : input.color, heat: 1.6, alpha: 0.9, size: c * 0.6, sizeTo: (input.reach * 2) / 0.8, lifeMs: 950 + k * 200, delayMs: k * 160, shape: SHAPE.groundRing, fade: 1.4 });
    }
    light.spawn({ x: input.x, y: y + c * 0.6, z: input.z, color: input.accent, heat: 2.2, alpha: 1, size: c * 1.2, sizeTo: c * 0.2, lifeMs: 420, shape: SHAPE.flare, spinRate: 2 });
    sparkBurst(input.x, y + c * 0.5, input.z, 16, c * 4, [input.color, input.accent], { up: 1.2, life: 600, size: c * 0.05 });
  }

  function shieldBreak(x: number, y: number, z: number, radius: number, color: number) {
    if (!visible) return;
    light.spawn({ x, y, z, color, heat: 1.8, alpha: 0.9, size: radius * 2, sizeTo: radius * 3.2, lifeMs: 320, shape: SHAPE.ring, fade: 1.2 });
    sparkBurst(x, y, z, 14, radius * 6, [color, 0xe0f2fe], { up: 0.4, life: 420, size: radius * 0.12, heat: 1.6 });
  }

  /* -------------------------------- kare --------------------------------- */

  function update(now: number) {
    const dt = Math.min(80, Math.max(0, now - lastNow));
    lastNow = now;
    // Saat 1000 sn'de basa donuyor: uzun oturumda dusuk hassasiyetli GPU'da
    // `uTime * 22` tasip sin() gecersiz deger vermesin.
    const time = (now / 1000) % 1000;
    light.material.uniforms.uTime.value = time;
    matter.material.uniforms.uTime.value = time;
    light.step(dt, deps.groundHeight);
    matter.step(dt, deps.groundHeight);
  }

  function clear() {
    light.clear();
    matter.clear();
    for (const flight of flights.values()) releaseBody(flight);
    flights.clear();
  }

  function setVisible(next: boolean) {
    if (visible === next) return;
    visible = next;
    group.visible = next;
    if (!next) clear();
  }

  function dispose() {
    clear();
    scene.remove(group);
    light.dispose();
    matter.dispose();
    for (const pool of pools.values()) for (const root of pool) root.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== pupilMaterial) (mesh.material as THREE.Material).dispose();
    });
    pools.clear();
    pupilMaterial.dispose();
    for (const geometry of Object.values(geometries)) geometry.dispose();
  }

  return {
    event,
    death, projectiles, beams,
    flames,
    auras,
    slows,
    commandPulse,
    shieldBreak, update, setVisible, clear, dispose,
    stats: () => ({ light: light.count, matter: matter.count, projectiles: flights.size })
  };
}
