/**
 * Mac kaydedicisinin istemci ornegi (`debug:client`).
 *
 * Yalnizca anonim veri ayari acik oyuncudan (`isTelemetryActive`) ve
 * bes saniyede bir gidiyor; sunucu bu tabloyla govdeyi duz sayi/metin
 * alanlarina indiriyor (`MESSAGE_RULES`). Alan adlari kisa: kayitta saniyede
 * degil bes saniyede bir satir, ama mac boyunca yuzlerce satir.
 *
 * Ne var: kare hizi ve kare suresi dagilimi, istemci bolum sureleri
 * (`recordClientPerfSection`), efekt ayrinti seviyesi (LOD), snapshot alim
 * durumu (tampon, dusen kare, oynatma acligi), ping, JS yigini, kaba cihaz
 * sinifi (DPR, tuval boyu, cekirdek, bellek, tarayici ve isletim sistemi
 * ailesi), sekme gizlenmesi ve WebGL baglam kaybi. Ne yok: ad, kimlik,
 * tam tarayici dizesi, ekran karti adi, IP.
 */
export const DEBUG_CLIENT_SAMPLE_INTERVAL_MS = 5000;

/** Istemci bolumleri (`recordClientPerfSection`); alan adi `s` + ilk harfi buyuk. */
export const DEBUG_CLIENT_SECTIONS = [
  "frame",
  "enemies",
  "drones",
  "projectiles",
  "beams",
  "signatures",
  "map",
  "towers",
  "events",
  "hud",
  "shop",
  "snapshotRecv",
  "vfx"
] as const;
export type DebugClientSection = (typeof DEBUG_CLIENT_SECTIONS)[number];

export function debugClientSectionField(section: DebugClientSection) {
  return `s${section[0].toUpperCase()}${section.slice(1)}`;
}

type FieldKind = "number" | "string" | "boolean";

const SECTION_FIELDS = Object.fromEntries(
  DEBUG_CLIENT_SECTIONS.flatMap((section) => [[debugClientSectionField(section), "number"], [`${debugClientSectionField(section)}Max`, "number"]])
) as Record<string, FieldKind>;

export const DEBUG_CLIENT_SAMPLE_FIELDS: Readonly<Record<string, FieldKind>> = {
  /** Ornek sirasi ve kapsadigi sure (ms). */
  seq: "number",
  win: "number",
  /** Kare sayisi, ortalama/en dusuk saniyelik FPS, kare suresi p50/p95/en buyuk (ms), 50 ms ustu kare. */
  frames: "number",
  fps: "number",
  fpsMin: "number",
  ftP50: "number",
  ftP95: "number",
  ftMax: "number",
  long: "number",
  ...SECTION_FIELDS,
  /** Efekt ayrinti seviyesi: son, en yuksek, degisim sayisi. */
  lod: "number",
  lodMax: "number",
  lodChanges: "number",
  /** Snapshot: alinan, tampon boyu (son/en buyuk), dusen, oynatilamayan kare, en uzun aralik (ms). Bayt sunucuda sayiliyor. */
  snapN: "number",
  bufLen: "number",
  bufMax: "number",
  drops: "number",
  starve: "number",
  gapMax: "number",
  /** Ping (ortalama/en buyuk, ms) ve sunucu kuyrugu (KB). */
  ping: "number",
  pingMax: "number",
  queueKb: "number",
  /** JS yigini (MB), varsa (`performance.memory`). */
  heapMb: "number",
  heapLimitMb: "number",
  /** Cihaz sinifi: yalnizca kaba degerler. */
  dpr: "number",
  cw: "number",
  ch: "number",
  cores: "number",
  memGb: "number",
  device: "string",
  browser: "string",
  os: "string",
  renderer: "string",
  /** Sekme gizlenmesi (sayi, toplam ms) ve WebGL baglam kaybi. */
  hidden: "number",
  hiddenMs: "number",
  ctxLost: "number"
};
