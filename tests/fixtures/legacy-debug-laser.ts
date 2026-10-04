/**
 * Debug Lazer'in ortak kite tasinmadan onceki cizimi: DONDURULMUS KOPYA.
 *
 * Asagidaki yontemler `apps/web/src/scenes/GameScene.ts` (e5bada5) icinden
 * bir betikle harfi harfine kesildi; tek bir karakteri bile elle yazilmadi.
 * Sinif yalnizca yontemlerin okudugu alanlari (`beamGraphics`, `time.now`)
 * sagliyor. `tests/vfx-kit-laser-identity.test.mjs` yeni cizimi bununla
 * ayni kayitci Graphics'e cizdirip cagrilari tek tek karsilastiriyor.
 *
 * DEGISTIRME. Lazerin gorunusu sahibin olcutu; bu dosya o olcutun kendisi.
 */
/* eslint-disable */
type BeamSnapshot = {
  id: string;
  definitionId: string;
  tier?: 1 | 2 | 3;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  color: number;
  overdrive?: boolean;
  ttlMs?: number;
};

const OVERDRIVE_FLARE_COUNT = 7;
const OVERDRIVE_SPARK_COUNT = 10;
const OVERDRIVE_HALO_LAYERS = 6;
const OVERDRIVE_SPARK_LIFE_MS = 520;

export class LegacyDebugLaser {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private beamGraphics: any, private time: { now: number }) {}

  /** `renderBeams` dalinin lazere dusen iki kolu. */
  draw(beam: BeamSnapshot, color: number) {
    if (beam.overdrive) {
      this.drawOverdriveBeam(beam, color);
    } else {
      this.drawLaserConnection(beam, color);
    }
  }
  private drawLaserConnection(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    this.strokeBeamProfile(beam, color, { spread: 8, body: Math.max(2, beam.width) });
    // Carpma noktasi kirisin en sicak yeri, ama yalnizca nokta: cevresine
    // renkli bir bulut konmuyor. Bulut kirisin ucunu kalinlastirip vurusun
    // nereye dustugunu bulaniklastiriyordu.
    //
    // Kirmizi kademede nokta da duz: govdenin gradyani yokken ucunda beyaz bir
    // parlama olsa, kaldirilan gecis oradan geri girerdi.
    this.beamGraphics.fillStyle(this.getBeamImpactColor(beam, color), 0.95);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, 3.4);
    this.beamGraphics.fillStyle(color, 0.22);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 13);
    // Dis hale govdeden 8 birim genis; vurgu onun disina oturmali.
    this.drawBeamTierAccent(beam, color, { outerWidth: beam.width + 8 });
  }

  private drawOverdriveBeam(beam: BeamSnapshot, color: number) {
    if (!this.beamGraphics) {
      return;
    }

    const core = this.getBeamCoreColor(color, 0.86);
    this.strokeBeamProfile(beam, color, { spread: 14, body: Math.max(3, beam.width) });
    this.beamGraphics.lineStyle(1, color, 0.65);
    this.beamGraphics.strokeCircle(beam.x1, beam.y1, 19);
    this.beamGraphics.fillStyle(color, 0.35);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 11);
    this.beamGraphics.fillStyle(core, 1);
    this.beamGraphics.fillCircle(beam.x1, beam.y1, 5.5);
    // Ucta hare yok, yalnizca sicak nokta; kural asiri yuklemede de ayni.
    this.beamGraphics.fillStyle(this.getBeamImpactColor(beam, color), 0.9);
    this.beamGraphics.fillCircle(beam.x2, beam.y2, 4);
    const tier = beam.tier ?? 1;
    this.drawBeamTierAccent(beam, color, { outerWidth: beam.width + 14 });
    if (tier >= 3) {
      this.drawOverdriveFlare(beam);
    }
  }

  private strokeBeamProfile(beam: BeamSnapshot, color: number, options: { spread: number; body: number }) {
    const graphics = this.beamGraphics;
    if (!graphics) {
      return;
    }
    const { body } = options;
    const cizgi = (width: number, tone: number, alpha: number) => {
      graphics.lineStyle(Math.max(0.6, width), tone, alpha);
      graphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    };

    const tier = beam.tier ?? 1;
    if (tier < 2) {
      cizgi(body, color, 0.95);
      return;
    }

    const spread = tier >= 3 ? options.spread * 1.8 : options.spread;
    const omuzlar: Array<[number, number]> = tier >= 3
      ? [[1, 0.07], [0.74, 0.13], [0.5, 0.22], [0.28, 0.4]]
      : [[1, 0.1], [0.62, 0.24], [0.28, 0.46]];
    for (const [olcek, alfa] of omuzlar) {
      cizgi(body + spread * olcek, color, alfa);
    }
    cizgi(body, color, 0.82);
    cizgi(body * 0.52, this.getBeamCoreColor(color, 0.45), 0.9);
    cizgi(body * 0.2, this.getBeamCoreColor(color, 0.86), 0.96);
  }

  private getBeamCoreColor(color: number, whiteness = 0.5) {
    const lift = (channel: number) => Math.round(channel + (255 - channel) * whiteness);
    return (lift((color >> 16) & 0xff) << 16) | (lift((color >> 8) & 0xff) << 8) | lift(color & 0xff);
  }

  private getBeamImpactColor(beam: BeamSnapshot, color: number) {
    return (beam.tier ?? 1) < 2 ? color : this.getBeamCoreColor(color, 0.86);
  }

  private drawBeamTierAccent(beam: BeamSnapshot, color: number, options: { outerWidth?: number } = {}) {
    const graphics = this.beamGraphics;
    if (!graphics || (beam.tier ?? 1) < 3) {
      return;
    }

    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;

    // Dugum, isinin **cizilen** genisligine gore olculur.
    //
    // Once beam.width kullaniliyordu, ama cizim fonksiyonlari govdenin ustune
    // hale katmanlari koyuyor: Debug Lazer 4 birimlik bir isin bildirirken
    // ekranda 12 birim yer kapliyor. Taban deger de sart: ince isinlarda oranla
    // olculen her sey birkac pikselin altina inip kayboluyor.
    const outerHalf = Math.max(3, (options.outerWidth ?? beam.width) * 0.5);
    const travel = ((this.time.now % 620) / 620) * length;
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(beam.x1 + ux * travel, beam.y1 + uy * travel, Math.max(2, outerHalf * 0.5));
  }

  private drawOverdriveFlare(beam: BeamSnapshot) {
    const graphics = this.beamGraphics;
    if (!graphics) {
      return;
    }

    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const now = this.time.now;

    // Hale: disa dogru sonen katmanlar.
    //
    // Tek bir genis cizgi denendi ve ise yaramadi: `lineStyle` duz kenarli bir
    // kapsul ciziyor, yani ortaya yumusak bir parlama degil kirisi cerceveleyen
    // gri bir dikdortgen cikiyor. Ust uste binen birkac katman gecisi taklit
    // ediyor -- kirisin govdesinin zaten yaptigi sey.
    const breath = 0.5 + Math.sin(now / 180) * 0.5;
    // Katman sayisi yuksek ve araliklar dar: uc kalin katman denendi ve kenari
    // hala duz bir bant gibi gorunuyordu. Gecisi yapan sey katmanin kalinligi
    // degil, sayisi.
    for (let layer = OVERDRIVE_HALO_LAYERS; layer >= 1; layer -= 1) {
      const spread = beam.width + 6 + layer * (3.4 + breath * 0.8);
      graphics.lineStyle(spread, 0xbae6fd, 0.016 + breath * 0.006);
      graphics.lineBetween(beam.x1, beam.y1, beam.x2, beam.y2);
    }

    // Kiris boyunca kosan parlamalar: her biri kucuk bir yildiz cakmasi.
    for (let index = 0; index < OVERDRIVE_FLARE_COUNT; index += 1) {
      // Baslangic noktalari esit araliklarla dagitiliyor, uzerine kucuk bir
      // sapma biniyor. Tumuyle rastgele birakildiginda parlamalar kumeleniyor
      // ve kirisin ortasinda taramaya benzeyen bir yigin olusturuyorlardi.
      const speed = 0.35 + this.spaceNoise(index * 3 + 1) * 0.5;
      const offset = index / OVERDRIVE_FLARE_COUNT + this.spaceNoise(index * 3 + 2) * 0.08;
      const along = (((now / 1000) * speed + offset) % 1) * length;
      const px = beam.x1 + ux * along;
      const py = beam.y1 + uy * along;
      // Kenarlara yaklasirken sonuyor: parlamalar hictten belirip hicte kayboluyor.
      const edge = Math.min(along, length - along) / Math.max(1, length * 0.18);
      const fade = Math.min(1, Math.max(0, edge));
      if (fade <= 0) continue;

      // Kol boyu kiris boyunca degil **disa** dogru uzun: yildiz cakmasi
      // hissini veren sey dik eksen, cunku kirisin kendi ekseni zaten parlak.
      const arm = 10 + this.spaceNoise(index * 3 + 3) * 8;
      graphics.lineStyle(1.4, 0xffffff, 0.85 * fade);
      graphics.lineBetween(px - nx * arm, py - ny * arm, px + nx * arm, py + ny * arm);
      graphics.lineStyle(1, 0xffffff, 0.5 * fade);
      graphics.lineBetween(px - ux * arm * 0.7, py - uy * arm * 0.7, px + ux * arm * 0.7, py + uy * arm * 0.7);
      graphics.fillStyle(0xbae6fd, 0.4 * fade);
      graphics.fillCircle(px, py, 4.5);
      graphics.fillStyle(0xffffff, 1 * fade);
      graphics.fillCircle(px, py, 2.2);
    }

    // Kenardan dokulen kivilcimlar.
    //
    // Her kivilcimin yeri **omru boyunca sabit**: yalnizca disari aciliyor ve
    // soluyor. Ilk halinde yer her karede yeniden cekiliyordu ve on dort
    // kivilcim ayri ayri sicramak yerine kirisin iki yaninda titreyen tekduze
    // bir tuye donusuyordu -- kum gibi, kivilcim gibi degil.
    for (let index = 0; index < OVERDRIVE_SPARK_COUNT; index += 1) {
      const durationMs = OVERDRIVE_SPARK_LIFE_MS * (0.7 + this.spaceNoise(index * 7 + 1) * 0.6);
      const phase = now / durationMs + this.spaceNoise(index * 7 + 2) * 10;
      const generation = Math.floor(phase);
      const life = phase - generation;
      // Kusak numarasi tohuma giriyor: her dogusta baska bir yerden cikiyor,
      // ama o dogusun icinde yerini birakmiyor.
      const seed = index * 7 + generation * 131;
      const along = this.spaceNoise(seed) * length;
      const side = this.spaceNoise(seed + 1) > 0.5 ? 1 : -1;
      const drift = this.spaceNoise(seed + 2) * 0.5 - 0.25;

      const spread = beam.width * 0.5 + 4 + life * 22;
      const px = beam.x1 + ux * (along + life * length * 0.02 * drift) + nx * side * spread;
      const py = beam.y1 + uy * (along + life * length * 0.02 * drift) + ny * side * spread;
      const tail = 4 + this.spaceNoise(seed + 3) * 6;
      // Once parlayip sonra sonuyor: duz sonme, cakma hissini vermiyor.
      const glow = life < 0.15 ? life / 0.15 : 1 - (life - 0.15) / 0.85;
      graphics.lineStyle(1.1, 0xfffbeb, 0.8 * glow);
      graphics.lineBetween(px, py, px - nx * side * tail, py - ny * side * tail);
    }

    // Namludaki cakma: kirisin dogdugu yer en parlak nokta olmali.
    const muzzlePulse = 0.6 + Math.sin(now / 90) * 0.4;
    graphics.lineStyle(1.2, 0xffffff, 0.5 + muzzlePulse * 0.35);
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI + now / 700;
      const reach = 16 + muzzlePulse * 7;
      graphics.lineBetween(
        beam.x1 - Math.cos(angle) * reach,
        beam.y1 - Math.sin(angle) * reach,
        beam.x1 + Math.cos(angle) * reach,
        beam.y1 + Math.sin(angle) * reach
      );
    }
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(beam.x1, beam.y1, 3 + muzzlePulse * 1.6);
  }

  private spaceNoise(seed: number) {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  }
}
