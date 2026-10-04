import Phaser from "phaser";

/**
 * Kisa omurlu ADD parlamalari icin havuz.
 *
 * Carpma parlamasi, namlu cicegi ve tek karelik igne ucu: her biri tek bir
 * dortgen (onceden pisirilmis yumusak doku), 3-6 CPU ucgenlemeli daire
 * yerine. Siyah zeminde ADD kendiliginden beyaza yaniyor.
 *
 * Havuz sinirli (64 canli). Dolunca en eski parlama geri donusuyor; yeni
 * olay hic dusmuyor, eskisi biraz erken bitiyor. Tween yok: her parlama
 * yasina gore `update`te yeniden olculuyor, nesne uretilmiyor.
 */
export type FlashTexture = "glow" | "spark" | "ring";

export type FlashSpec = {
  x: number;
  y: number;
  texture: FlashTexture;
  tint: number;
  /** Baslangic alfasi; sonme `fade` uslu. */
  alpha: number;
  /** Dunya biriminde cap: baslangic ve bitis. */
  sizeFrom: number;
  sizeTo: number;
  durationMs: number;
  rotation?: number;
  /** Uzun kenar / kisa kenar (kivilcim cizgisi icin). */
  stretch?: number;
  bornAt: number;
};

/** AttackVfx'in parlama istedigi yuzey; testte sahte, oyunda havuz. */
export interface FlashSink {
  flash(spec: FlashSpec): void;
}

export const FLASH_TEXTURE_KEYS: Record<FlashTexture, string> = {
  glow: "vfx-glow",
  spark: "vfx-spark",
  ring: "vfx-ring"
};

/** Pisirilen dokularin piksel boyu (2x); dunya biriminde yarisi. */
export const FLASH_TEXTURE_PX: Record<FlashTexture, { width: number; height: number }> = {
  glow: { width: 128, height: 128 },
  spark: { width: 64, height: 16 },
  ring: { width: 128, height: 128 }
};

export const FLASH_POOL_CAP = 64;

type LiveFlash = { image: Phaser.GameObjects.Image; spec: FlashSpec; live: boolean };

export class FlashPool implements FlashSink {
  private readonly slots: LiveFlash[] = [];
  private cursor = 0;
  private liveCount = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly depth = 12.5, private readonly cap = FLASH_POOL_CAP) {}

  flash(spec: FlashSpec) {
    if (spec.durationMs <= 0 || spec.alpha <= 0) return;
    const key = FLASH_TEXTURE_KEYS[spec.texture];
    if (!this.scene.textures.exists(key)) return;
    let slot: LiveFlash | undefined;
    for (const candidate of this.slots) {
      if (!candidate.live) {
        slot = candidate;
        break;
      }
    }
    if (!slot) {
      if (this.slots.length < this.cap) {
        const image = this.scene.add.image(spec.x, spec.y, key).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depth);
        slot = { image, spec, live: false };
        this.slots.push(slot);
      } else {
        // Dolu: en eski canli parlama yerini veriyor.
        slot = this.slots[this.cursor % this.slots.length];
        this.cursor += 1;
        if (slot.live) this.liveCount -= 1;
      }
    }
    slot.spec = spec;
    slot.live = true;
    this.liveCount += 1;
    const image = slot.image;
    if (image.texture.key !== key) image.setTexture(key);
    // Alfa `update`te: ayni karede (sahne olaylari isledikten sonra) cagriliyor.
    // Gecikmeli parlama (ikinci vurusun halkasi) vakti gelene kadar gorunmez.
    image.setVisible(true).setActive(true).setPosition(spec.x, spec.y).setRotation(spec.rotation ?? 0).setTint(spec.tint).setAlpha(0);
  }

  update(now: number) {
    if (this.liveCount === 0) return;
    for (const slot of this.slots) {
      if (!slot.live) continue;
      if (now - slot.spec.bornAt >= slot.spec.durationMs) {
        slot.live = false;
        this.liveCount -= 1;
        slot.image.setVisible(false).setActive(false);
        continue;
      }
      this.apply(slot, now);
    }
  }

  get live() {
    return this.liveCount;
  }

  destroy() {
    for (const slot of this.slots) slot.image.destroy();
    this.slots.length = 0;
    this.liveCount = 0;
  }

  private apply(slot: LiveFlash, now: number) {
    const { spec, image } = slot;
    if (now < spec.bornAt) {
      image.setAlpha(0);
      return;
    }
    const t = Math.max(0, Math.min(1, (now - spec.bornAt) / spec.durationMs));
    const eased = 1 - (1 - t) * (1 - t);
    const size = spec.sizeFrom + (spec.sizeTo - spec.sizeFrom) * eased;
    const px = FLASH_TEXTURE_PX[spec.texture];
    // Kivilcimda `size` cizginin boyu, kalinligi boy / stretch.
    const scaleX = size / px.width;
    const scaleY = spec.texture === "spark" ? size / Math.max(1, spec.stretch ?? 4) / px.height : size / px.height;
    image.setScale(scaleX, scaleY);
    image.setAlpha(spec.alpha * (1 - t) * (1 - t * 0.35));
  }
}

/**
 * Parlama dokularini 2 katinda pisirir: 64 birimlik yumusak radyal hale,
 * kivilcim cizgisi ve ince halka. Tuvalin radyal gradyani Graphics'te yok.
 */
export function bakeFlashTextures(scene: Phaser.Scene) {
  const make = (key: string, width: number, height: number, paint: (context: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const canvas = scene.textures.createCanvas(key, width, height);
    const context = canvas?.getContext();
    if (!canvas || !context) return;
    paint(context);
    canvas.refresh();
  };

  make(FLASH_TEXTURE_KEYS.glow, 128, 128, (context) => {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.78)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.26)");
    gradient.addColorStop(0.75, "rgba(255,255,255,0.07)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  });

  make(FLASH_TEXTURE_KEYS.spark, 64, 16, (context) => {
    const gradient = context.createLinearGradient(0, 0, 64, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(32, 8, 32, 4, 0, 0, Math.PI * 2);
    context.fill();
  });

  make(FLASH_TEXTURE_KEYS.ring, 128, 128, (context) => {
    context.strokeStyle = "rgba(255,255,255,0.35)";
    context.lineWidth = 7;
    context.beginPath();
    context.arc(64, 64, 58, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "rgba(255,255,255,1)";
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(64, 64, 58, 0, Math.PI * 2);
    context.stroke();
  });
}

/**
 * Karelik parlama damgalari: mermi omuzlari ve haleleri icin.
 *
 * Her mermi her karede bir iki yumusak dairesel parlama istiyor; Graphics'te
 * bunlar 4-8 ic ice daire (her biri CPU'da yeniden ucgenleniyor). Burada her
 * biri tek bir ADD dortgen: havuzdaki resim karenin basinda serbest, istenince
 * konumlaniyor, karenin sonunda kullanilmayanlar gizleniyor. Tavan asilirsa
 * fazlasi dusuyor (en once LOD'un kestigi ayrinti ile ayni sinif: hale).
 */
export interface GlowStampSink {
  beginFrame(): void;
  stamp(x: number, y: number, tint: number, size: number, alpha: number): void;
  endFrame(): void;
}

export const GLOW_STAMP_CAP = 192;

export class GlowStampPool implements GlowStampSink {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private shown = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly depth = 10.85, private readonly cap = GLOW_STAMP_CAP) {}

  beginFrame() {
    this.used = 0;
  }

  stamp(x: number, y: number, tint: number, size: number, alpha: number) {
    if (this.used >= this.cap || alpha <= 0.002 || size <= 0) return;
    let image = this.images[this.used];
    if (!image) {
      if (!this.scene.textures.exists(FLASH_TEXTURE_KEYS.glow)) return;
      image = this.scene.add.image(x, y, FLASH_TEXTURE_KEYS.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depth);
      this.images.push(image);
    }
    this.used += 1;
    const scale = size / FLASH_TEXTURE_PX.glow.width;
    image.setPosition(x, y).setScale(scale).setAlpha(Math.min(1, alpha));
    if (image.tintTopLeft !== tint) image.setTint(tint);
    if (!image.visible) image.setVisible(true);
  }

  endFrame() {
    for (let index = this.used; index < this.shown; index += 1) this.images[index].setVisible(false);
    this.shown = this.used;
  }

  get count() {
    return this.used;
  }

  destroy() {
    for (const image of this.images) image.destroy();
    this.images.length = 0;
    this.used = 0;
    this.shown = 0;
  }
}
