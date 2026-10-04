import type Phaser from "phaser";
import { FEEDBACK_LIMITS } from "@karayel/shared";

/**
 * Dunyadaki kisa etiketler ("SV 3", "SV 5 · KADEME 2"): sabit bir Text havuzu.
 *
 * Yonetmenin etiket butcesi ayni anda en fazla 3 kendi + 1 takim arkadasi
 * etiketi birakiyor; havuz tam o kadar nesne tutuyor ve ilk ihtiyacta
 * kuruyor. Her seviye atlamada yeni bir Phaser Text acmak yazi tipini her
 * seferinde olcmek demekti. Animasyon tween degil, sahnenin `update`inde tek
 * dongu -- hasar sayilariyla (damage-numbers.ts) ayni yontem.
 *
 * Hangi etiketin acilacagina, birlesecegine ya da dusecegine burasi karar
 * vermiyor; yonetmenin kararini ciziyor.
 */

export type WorldLabelSpec = {
  /** Ayni anahtardaki sonraki olay bu etiketi gunceller (ayni kule). */
  key: string;
  text: string;
  x: number;
  y: number;
  /** Yazi ve kontur rengi (css). */
  fill: string;
  stroke: string;
  /** Dunyadaki yazi boyu (px). */
  fontPx: number;
  /** Kendi olayin 1, takim arkadasininki soluk. */
  alpha: number;
  /** Kisa buyuyup oturma; yalnizca kendi kademe atlaman. */
  pop: boolean;
  lifetimeMs: number;
  /** Hareket azaltma: pop ve yukselme yok, yerinde soner. */
  still: boolean;
  /**
   * Etiketin tasmamasi gereken dunya siniri (arena). `bottom` verilirse
   * etiket onun ustunde kaliyor: alt cubugun arkasina dusen damga okunmuyor.
   */
  bounds?: { left: number; right: number; top: number; bottom?: number };
};

type Slot = {
  text: Phaser.GameObjects.Text;
  active: boolean;
  key: string;
  bornAt: number;
  endsAt: number;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  pop: boolean;
  still: boolean;
  fill: string;
  stroke: string;
};

/** Etiket butcesinin tamami: kendi etiketlerin + takim arkadasininki. */
const POOL_SIZE = FEEDBACK_LIMITS.labels + FEEDBACK_LIMITS.teammateLabels;
/** Doku bu boyutta ciziliyor, dunyadaki boyut olcekle (bkz. damage-numbers.ts). */
const BASE_FONT_PX = 30;
const STROKE_PX = 6;
/** Etiket omru boyunca bu kadar yukselir; hasar sayisindan (28) yavas, okunacak. */
const RISE_PX = 14;
const POP_FROM = 1.35;
const POP_MS = 160;
/** Kenardan pay: arenanin disina tasan etiket yarim okunuyordu. */
const EDGE_PAD_PX = 3;

export class WorldLabelPool {
  private readonly slots: Slot[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly depth = 30.5) {}

  /**
   * Yeni etiket. `recycle` yonetmenden: butce dolu ama olay dusurulemez
   * (kendi kademe atlaman); en once bitecek etiket yer aciyor. Yonetmenin
   * butcesi HUD damgalarini da saydigi icin `recycle` havuzun kendi
   * etiketleri butceyi doldurmadiysa yok sayiliyor: bos yuva kullaniliyor.
   */
  spawn(spec: WorldLabelSpec, now: number, recycle = false) {
    // Ayni kulenin canli etiketi varsa yenisi onun yerine: 3->4'un hemen
    // ardindan 4->5 gelirse "SV 4" ile "SV 5 · KADEME 2" ust uste binmesin.
    // Yonetmen ikisini birlestiremiyor, turleri farkli (level / tier).
    const sameKey = this.slots.find((entry) => entry.active && entry.key === spec.key);
    if (sameKey) {
      this.release(sameKey);
    }
    const slot = sameKey ?? this.takeSlot(recycle);
    slot.active = true;
    slot.key = spec.key;
    slot.bornAt = now;
    slot.endsAt = now + Math.max(1, spec.lifetimeMs);
    slot.scale = spec.fontPx / BASE_FONT_PX;
    slot.alpha = spec.alpha;
    slot.pop = spec.pop && !spec.still;
    slot.still = spec.still;
    this.render(slot, spec.text, spec.fill, spec.stroke);

    // Genislik ancak yazi cizilince belli; kenara tasmasin diye sonra kaydiriliyor.
    let x = spec.x;
    let y = spec.y;
    if (spec.bounds) {
      const halfWidth = (slot.text.width * slot.scale) / 2 + EDGE_PAD_PX;
      const halfHeight = (slot.text.height * slot.scale) / 2 + EDGE_PAD_PX;
      x = Math.max(spec.bounds.left + halfWidth, Math.min(spec.bounds.right - halfWidth, x));
      if (spec.bounds.bottom !== undefined) y = Math.min(spec.bounds.bottom - halfHeight, y);
      y = Math.max(spec.bounds.top + halfHeight, y);
    }
    slot.x = x;
    slot.y = y;
    slot.text
      .setPosition(x, y)
      .setScale(slot.pop ? slot.scale * POP_FROM : slot.scale)
      .setAlpha(slot.alpha)
      .setVisible(true)
      .setActive(true);
    return true;
  }

  /**
   * Ayni kule ayni anda bir daha seviye atladi: yeni etiket acilmiyor, canli
   * etiketin yazisi varilan seviyeye guncelleniyor. Etiket sonduyse olay
   * dusuyor; seviye halkasi ve panel yine dogru.
   */
  merge(key: string, text: string, fill: string, stroke: string) {
    const slot = this.slots.find((entry) => entry.active && entry.key === key);
    if (!slot) {
      return false;
    }
    this.render(slot, text, fill, stroke);
    return true;
  }

  update(now: number) {
    for (const slot of this.slots) {
      if (!slot.active) {
        continue;
      }
      if (now >= slot.endsAt) {
        this.release(slot);
        continue;
      }
      const progress = (now - slot.bornAt) / (slot.endsAt - slot.bornAt);
      const text = slot.text;
      if (!slot.still) {
        text.setY(slot.y - RISE_PX * (1 - (1 - progress) ** 3));
      }
      // Once okunsun: son ceyrege kadar tam, sonra soner.
      text.setAlpha(slot.alpha * (1 - progress ** 4));
      if (slot.pop) {
        const age = now - slot.bornAt;
        if (age < POP_MS) {
          const settle = 1 - (1 - age / POP_MS) ** 2;
          text.setScale(slot.scale * (POP_FROM - (POP_FROM - 1) * settle));
        } else {
          text.setScale(slot.scale);
          slot.pop = false;
        }
      }
    }
  }

  destroy() {
    for (const slot of this.slots) {
      slot.text.destroy();
    }
    this.slots.length = 0;
  }

  private takeSlot(recycle: boolean) {
    // Yonetmenin etiket butcesi HUD damgalarini da (dalga temizleme, ulti
    // karnesi) sayiyor; havuzda bos yer varken geri donusum canli bir dunya
    // etiketini erken siliyordu. Geri donusum yalnizca havuzun kendi
    // etiketleri butceyi doldurunca.
    let active = 0;
    for (const slot of this.slots) {
      if (slot.active) active += 1;
    }
    if (!recycle || active < FEEDBACK_LIMITS.labels) {
      const free = this.slots.find((slot) => !slot.active);
      if (free) {
        return free;
      }
      if (this.slots.length < POOL_SIZE) {
        return this.createSlot();
      }
    }
    let oldest: Slot | undefined;
    for (const slot of this.slots) {
      if (slot.active && (!oldest || slot.endsAt < oldest.endsAt)) {
        oldest = slot;
      }
    }
    if (oldest) {
      this.release(oldest);
      return oldest;
    }
    return this.slots.find((slot) => !slot.active) ?? this.createSlot();
  }

  private createSlot() {
    const text = this.scene.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: `${BASE_FONT_PX}px`,
      fontStyle: "bold",
      color: "#f8fafc",
      stroke: "#0f172a",
      strokeThickness: STROKE_PX
    }).setOrigin(0.5).setDepth(this.depth).setVisible(false).setActive(false);
    const slot: Slot = {
      text,
      active: false,
      key: "",
      bornAt: 0,
      endsAt: 0,
      x: 0,
      y: 0,
      scale: 1,
      alpha: 1,
      pop: false,
      still: false,
      fill: "#f8fafc",
      stroke: "#0f172a"
    };
    this.slots.push(slot);
    return slot;
  }

  /**
   * Yazi ve renk tek cizimle: `setColor`/`setStroke` her biri dokuyu yeniden
   * ciziyor, `setStroke` yazi tipini de yeniden olcuyor.
   */
  private render(slot: Slot, label: string, fill: string, stroke: string) {
    const text = slot.text;
    let styleChanged = false;
    if (slot.fill !== fill || slot.stroke !== stroke) {
      text.style.color = fill;
      text.style.stroke = stroke;
      slot.fill = fill;
      slot.stroke = stroke;
      styleChanged = true;
    }
    if (text.text !== label) {
      text.setText(label);
    } else if (styleChanged) {
      text.updateText();
    }
  }

  private release(slot: Slot) {
    slot.active = false;
    slot.pop = false;
    slot.text.setVisible(false).setActive(false);
  }
}
