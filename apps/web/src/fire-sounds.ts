/**
 * Atis sesinin butcesi.
 *
 * Kuleler atarken namlunun kisa vurusu calar (vfx/weapon-feel.ts, aileler
 * sfx-samples.ts). Atislar vuruslardan sik: kalabalik bir dalgada onlarca
 * kule saniyede birkac kez atiyor. Bu yuzden butce vurus butcesinden ayri ve
 * dar; asilan atis sessiz kaliyor (gorseli yine cikiyor).
 *
 * Kurallar:
 * - Ayni anda en fazla `voices` (4) atis sesi; takim arkadasi en fazla 1.
 * - Aile basina aralik: kendi kulende 55 ms, takim arkadasinda 140 ms.
 *   Ayni aileden iki atis bundan sik gelirse ikincisi dusuyor.
 * - Takim arkadasinin atisi kisik (x0.3); kendi kulen tam.
 * - Kademe muzikal degil, agirlik: sv 5-9 biraz yavas, sv 10 daha yavas ve
 *   biraz yuksek (vurusla ayni kural).
 */
import { FIRE_VOICE_IDS, type FireVoiceId } from "./vfx/weapon-feel";
import { toTier } from "./vfx/kit";

export const FIRE_SOUND_LIMITS = Object.freeze({
  voices: 4,
  teammateVoices: 1,
  gapMs: 55,
  teammateGapMs: 140,
  teammateGain: 0.3,
  /** Sesin butcede kapladigi sureye eklenen pay (ms). */
  tailMs: 20
});

/** Kademe 1-3: hiz ve seviye (vurus kademesiyle ayni yon, daha ince). */
export const FIRE_TIERS = Object.freeze([
  Object.freeze({ rate: 1, gain: 1 }),
  Object.freeze({ rate: 0.97, gain: 1.06 }),
  Object.freeze({ rate: 0.94, gain: 1.12 })
]);

export function getFireTier(tier: number | undefined) {
  return FIRE_TIERS[toTier(tier) - 1];
}

const FIRE_INDEX = new Map<FireVoiceId, number>(FIRE_VOICE_IDS.map((id, index) => [id, index]));

type FireSlot = { until: number; own: boolean };

/** Yuvalar sabit; atis basina nesne yok. `admit` true ise ses calsin. */
export class FireSoundGovernor {
  private readonly slots: FireSlot[] = [];
  private readonly lastOwnAt = new Float64Array(FIRE_VOICE_IDS.length).fill(Number.NEGATIVE_INFINITY);
  private readonly lastTeamAt = new Float64Array(FIRE_VOICE_IDS.length).fill(Number.NEGATIVE_INFINITY);

  constructor() {
    for (let index = 0; index < FIRE_SOUND_LIMITS.voices; index += 1) {
      this.slots.push({ until: Number.NEGATIVE_INFINITY, own: true });
    }
  }

  admit(voice: FireVoiceId, own: boolean, durationMs: number, now: number) {
    const index = FIRE_INDEX.get(voice);
    if (index === undefined) return false;
    const last = own ? this.lastOwnAt : this.lastTeamAt;
    if (now - last[index] < (own ? FIRE_SOUND_LIMITS.gapMs : FIRE_SOUND_LIMITS.teammateGapMs)) return false;
    let free = -1;
    let liveTeam = 0;
    for (let slot = 0; slot < this.slots.length; slot += 1) {
      const entry = this.slots[slot];
      if (entry.until <= now) {
        if (free < 0) free = slot;
      } else if (!entry.own) {
        liveTeam += 1;
      }
    }
    if (free < 0) return false;
    if (!own && liveTeam >= FIRE_SOUND_LIMITS.teammateVoices) return false;
    this.slots[free].until = now + durationMs + FIRE_SOUND_LIMITS.tailMs;
    this.slots[free].own = own;
    last[index] = now;
    return true;
  }

  activeVoices(now: number) {
    let count = 0;
    for (const entry of this.slots) if (entry.until > now) count += 1;
    return count;
  }

  reset() {
    for (const entry of this.slots) entry.until = Number.NEGATIVE_INFINITY;
    this.lastOwnAt.fill(Number.NEGATIVE_INFINITY);
    this.lastTeamAt.fill(Number.NEGATIVE_INFINITY);
  }
}
