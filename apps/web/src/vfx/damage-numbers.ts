import type Phaser from "phaser";
import type { DamageSizeBucket } from "@karayel/shared";

/**
 * Yuzen hasar ve altin sayilari: sabit bir Text havuzu.
 *
 * Eskiden her sayi icin yeni bir Phaser Text ve tween aciliyordu. Text'in
 * kurulusu pahali -- yazi tipini olcmek icin bir tuvale cizip pikselleri
 * tariyor -- ve 12. dalgada saniyede 7-15 sayi geliyor. Havuzdaki nesneler
 * bir kez kuruluyor, animasyon da tween degil, sahnenin `update`inde tek
 * donguyle yuruyor.
 *
 * Ne gosterilecegine burasi karar vermiyor: kac sayinin canli kalacagini,
 * hangisinin birlesecegini ve takim arkadasininkinin ne zaman dusecegini
 * geri bildirim yonetmeni soyluyor. Havuz yalnizca o karari ciziyor.
 */

export type DamageNumberSpec = {
  /** Yonetmendeki birlestirme anahtari; ayni anahtardaki sonraki olay buraya eklenir. */
  key: string;
  x: number;
  y: number;
  amount: number;
  own: boolean;
  crit: boolean;
  killingBlow: boolean;
  bucket: DamageSizeBucket;
  lifetimeMs: number;
  /** Hareket azaltma: pop ve yukselme yok, sayi yerinde soner. */
  still: boolean;
  /**
   * Hasar degil kazanilan altin ("+18◆"). Ayni havuz: yonetmenin 12 sayilik
   * butcesi ikisini birlikte sayiyor, ekrandaki yazilar da birlikte sinirli.
   */
  coin?: boolean;
};

type PaletteKey = "ownHit" | "ownCrit" | "ownKill" | "teamHit" | "teamCrit" | "teamKill" | "ownCoin";

type Slot = {
  text: Phaser.GameObjects.Text;
  active: boolean;
  key: string;
  bornAt: number;
  endsAt: number;
  x: number;
  y: number;
  drift: number;
  scale: number;
  alpha: number;
  pop: boolean;
  still: boolean;
  amount: number;
  crit: boolean;
  killingBlow: boolean;
  coin: boolean;
  palette?: PaletteKey;
  depth: number;
};

/**
 * 12 canli sayinin iki kati: sonen bir sayi yerini bosaltmadan yenisi
 * gelebiliyor ve birlesme, butceden bagimsiz omur uzatmiyor.
 */
const POOL_SIZE = 24;
/**
 * Doku bu boyutta ciziliyor, dunyadaki boyut olcekle veriliyor.
 *
 * Kamera 2-3 kat yakinlastiriyor; 13 px'lik doku ekranda bulaniklasiyordu.
 * Tek boyut ayrica Text'in yazi olcumunu bir kez yapmasi demek: boyut
 * degistirmek her seferinde yeniden olcum istiyor.
 */
const BASE_FONT_PX = 30;
const STROKE_PX = 6;
/** Kendi vurusun: boyut kovasina gore 13-15 px. */
const OWN_FONT_PX = [13, 14, 15] as const;
/** Takim arkadasi: kucuk, gri ve soluk; senin sayilarinla yarismamali. */
const TEAMMATE_FONT_PX = 11;
/**
 * Altin sayisi kucuk: oldurmenin odulu, vurusun onune gecmemeli. Yalnizca
 * kendi oldurmende cikiyor; takim arkadasininki senin ekraninda pop yapmiyor.
 */
const COIN_FONT_PX = 12;
/**
 * Altin sayisi dusmanin govdesinin ustunden basliyor; son vurusun "✕"
 * sayisi govdenin ortasinda, ikisi ust uste binmesin.
 */
export const COIN_LIFT_RATIO = 0.45;
const TEAMMATE_ALPHA = 0.55;
const CRIT_SCALE = 1.5;
/** Kritigin kisa, sert vurusu: 1.2 kattan dogrusal iner (esneyen egri yok). */
const CRIT_POP_FROM = 1.2;
const CRIT_POP_MS = 90;
const RISE_PX = 28;
const DRIFT_PX = 8;
/** Uste binme sirasi: kendi kritigin ve son vurusun, kendi vurusun, takim arkadasi. */
const DEPTH_OFFSET = { team: 0, ownHit: 0.1, ownMarked: 0.2 } as const;

/**
 * Renk bilgi tasiyor, sus degil (agir, sert dil): beyaz kendi vurusun, beyaz-
 * sicak kehribar kritik (koyu kizil kontur, kalin), kirik beyaz son vurus,
 * gri takim arkadasi. Turuncu ya da altin sekerleme yok. Renk tek basina da
 * kalmiyor -- kritikte "!", son vurusta "✕" var; renk ayirt edemeyen oyuncu
 * da okuyabilsin.
 */
export const DAMAGE_NUMBER_PALETTE: Record<PaletteKey, { fill: string; stroke: string }> = {
  ownHit: { fill: "#f8fafc", stroke: "#0b0f14" },
  ownCrit: { fill: "#fff1dc", stroke: "#5c1010" },
  ownKill: { fill: "#e7e5e4", stroke: "#0b0f14" },
  teamHit: { fill: "#cbd5e1", stroke: "#1e293b" },
  teamCrit: { fill: "#e7ded3", stroke: "#3b1a1a" },
  teamKill: { fill: "#d6d3d1", stroke: "#1e293b" },
  // HUD'daki altin cipinin rengine akan odul: soluk kehribar, okunur ama sekerleme degil.
  ownCoin: { fill: "#c9a66b", stroke: "#1c1308" }
};
const PALETTE = DAMAGE_NUMBER_PALETTE;
/** Kritik daha kalin konturla: renk degil, agirlik. */
const CRIT_STROKE_PX = 8;

/** Kaymanin yonu: anahtarin ve konumun FNV ozetinden (rastgele cagri yok; ayni olay ayni yere). */
function driftUnit(key: string, x: number, y: number) {
  let hash = 0x811c9dc5;
  const text = `${key}:${Math.round(x)}:${Math.round(y)}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0) / 4294967296;
}

/**
 * Sayinin metni.
 *
 * Son vurus sayiyi buyutmuyor, basina "✕" koyuyor: sayi dusmanin kalan cani,
 * yani gercekte inen hasar. Fazlasini yazmak hicbir seye inmemis hasari
 * gostermek olurdu.
 */
export function formatDamageNumber(amount: number, crit: boolean, killingBlow: boolean) {
  return `${killingBlow ? "✕ " : ""}${Math.max(0, Math.round(amount))}${crit ? "!" : ""}`;
}

/**
 * Altin sayisinin metni: "+" ve "◆" hasar sayisiyla karismasin diye. Hasar
 * sayisi hic "+" tasimiyor, "◆" de HUD'daki altin simgesi.
 */
export function formatCoinNumber(amount: number) {
  return `+${Math.max(0, Math.round(amount))}◆`;
}

export class DamageNumberPool {
  private readonly slots: Slot[] = [];
  private readonly lastByKey = new Map<string, Slot>();

  constructor(private readonly scene: Phaser.Scene, private readonly depth = 30) {}

  /**
   * Yeni sayi.
   *
   * `recycle` yonetmenden geliyor: butce dolu ama olay dusurulemez (kendi
   * kritigin ya da son vurusun). O zaman en once bitecek canli sayi birakilip
   * yeni sayi onun yerine aciliyor; ekrandaki sayi adedi butceyi asmiyor.
   */
  spawn(spec: DamageNumberSpec, now: number, recycle = false) {
    const slot = this.takeSlot(recycle);
    const coin = Boolean(spec.coin);
    const palette: PaletteKey = coin
      ? "ownCoin"
      : spec.own
        ? (spec.crit ? "ownCrit" : spec.killingBlow ? "ownKill" : "ownHit")
        : (spec.crit ? "teamCrit" : spec.killingBlow ? "teamKill" : "teamHit");
    const fontPx = coin
      ? COIN_FONT_PX
      : spec.own
        ? OWN_FONT_PX[spec.bucket] * (spec.crit ? CRIT_SCALE : 1)
        : TEAMMATE_FONT_PX;

    slot.active = true;
    slot.key = spec.key;
    slot.bornAt = now;
    slot.endsAt = now + Math.max(1, spec.lifetimeMs);
    slot.x = spec.x;
    slot.y = spec.y;
    slot.drift = spec.still ? 0 : (driftUnit(spec.key, spec.x, spec.y) * 2 - 1) * DRIFT_PX;
    slot.scale = fontPx / BASE_FONT_PX;
    slot.alpha = spec.own ? 1 : TEAMMATE_ALPHA;
    // Pop yalnizca kendi kritiginde: takim arkadasinin kritigi senin gozunu
    // cekmemeli, hareket azaltmada da hic yok.
    slot.pop = spec.own && spec.crit && !coin && !spec.still;
    slot.still = spec.still;
    slot.amount = spec.amount;
    slot.crit = spec.crit && !coin;
    slot.killingBlow = spec.killingBlow && !coin;
    slot.coin = coin;
    this.render(slot, palette);

    const depth = this.depth + (!spec.own ? DEPTH_OFFSET.team : spec.crit || spec.killingBlow ? DEPTH_OFFSET.ownMarked : DEPTH_OFFSET.ownHit);
    if (slot.depth !== depth) {
      slot.depth = depth;
      slot.text.setDepth(depth);
    }
    slot.text
      .setPosition(spec.x, spec.y)
      .setScale(slot.pop ? slot.scale * CRIT_POP_FROM : slot.scale)
      .setAlpha(slot.alpha)
      .setVisible(true)
      .setActive(true);
    this.lastByKey.set(spec.key, slot);
    return true;
  }

  /**
   * Ayni yerde hemen ardindan gelen vurus: yeni sayi acilmiyor, degeri son
   * sayiya ekleniyor. Toplam yine gercekte inen hasar. Son sayi coktan
   * sonduyse (ya da yuvasi baska anahtara gectiyse) `false` donuyor; karar
   * cagiranda.
   *
   * Bayraklar birlesiyor: birlesen vuruslardan biri son vurussa sayi "✕"
   * tasiyor. Oldurucu kritik ayni "crit" anahtarinda onceki kritige
   * ekleniyordu ve oldurmenin tek isareti kayboluyordu. Renk yuvanin
   * kendisinde kaliyor; kritik zaten son vurusa baskin.
   */
  merge(key: string, amount: number, flags?: { crit?: boolean; killingBlow?: boolean }) {
    const slot = this.lastByKey.get(key);
    if (!slot || !slot.active || slot.key !== key) {
      return false;
    }
    slot.amount += amount;
    if (!slot.coin) {
      slot.crit ||= Boolean(flags?.crit);
      slot.killingBlow ||= Boolean(flags?.killingBlow);
    }
    this.render(slot, slot.palette ?? "ownHit");
    return true;
  }

  /** Her kare: yukselme, kayma, sonme ve kritik popu. */
  update(now: number) {
    for (const slot of this.slots) {
      if (!slot.active) {
        continue;
      }
      if (now >= slot.endsAt) {
        this.release(slot);
        continue;
      }

      const progress = Math.max(0, (now - slot.bornAt) / (slot.endsAt - slot.bornAt));
      const text = slot.text;
      if (!slot.still) {
        const eased = 1 - (1 - progress) ** 3;
        text.setPosition(slot.x + slot.drift * eased, slot.y - RISE_PX * eased);
      }
      // Once okunsun, sonra sonsun: eski egri sayiyi ilk ceyrekte yariya
      // indiriyordu ve kalabalikta okunmadan kayboluyordu.
      text.setAlpha(slot.alpha * (1 - progress ** 3));
      if (slot.pop) {
        const age = now - slot.bornAt;
        if (age < CRIT_POP_MS) {
          const settle = age / CRIT_POP_MS;
          text.setScale(slot.scale * (CRIT_POP_FROM - (CRIT_POP_FROM - 1) * settle));
        } else {
          text.setScale(slot.scale);
          slot.pop = false;
        }
      }
    }
  }

  /** Canli sayi adedi; tani satiri icin. */
  activeCount() {
    let count = 0;
    for (const slot of this.slots) {
      if (slot.active) count += 1;
    }
    return count;
  }

  destroy() {
    for (const slot of this.slots) {
      slot.text.destroy();
    }
    this.slots.length = 0;
    this.lastByKey.clear();
  }

  private takeSlot(recycle: boolean) {
    if (!recycle) {
      const free = this.slots.find((slot) => !slot.active);
      if (free) {
        return free;
      }
      if (this.slots.length < POOL_SIZE) {
        return this.createSlot();
      }
    }
    // Butce dolu ya da havuz tukendi: en once bitecek canli sayi yer aciyor.
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
      color: PALETTE.ownHit.fill,
      stroke: PALETTE.ownHit.stroke,
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
      drift: 0,
      scale: 1,
      alpha: 1,
      pop: false,
      still: false,
      amount: 0,
      crit: false,
      killingBlow: false,
      coin: false,
      palette: "ownHit",
      depth: this.depth
    };
    this.slots.push(slot);
    return slot;
  }

  /**
   * Metni ve rengi tek cizimle yeniler.
   *
   * `setColor` ve `setStroke` her biri dokuyu yeniden ciziyor, `setStroke`
   * ustune yazi tipini yeniden olcuyor. Renk alanlari dogrudan yaziliyor ve
   * doku bir kez ciziliyor.
   */
  private render(slot: Slot, palette: PaletteKey) {
    const text = slot.text;
    let styleChanged = false;
    if (slot.palette !== palette) {
      text.style.color = PALETTE[palette].fill;
      text.style.stroke = PALETTE[palette].stroke;
      // Kritik renkle degil agirlikla ayrisiyor: daha kalin kontur.
      text.style.strokeThickness = palette === "ownCrit" || palette === "teamCrit" ? CRIT_STROKE_PX : STROKE_PX;
      slot.palette = palette;
      styleChanged = true;
    }
    const label = slot.coin ? formatCoinNumber(slot.amount) : formatDamageNumber(slot.amount, slot.crit, slot.killingBlow);
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
