import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

/**
 * IP basina hiz siniri: telemetri ve oda kurulumu ayni kurali kullaniyor.
 *
 * IP yalnizca bellekte, sayac anahtari olarak tutuluyor; diske yazilmiyor.
 */

/**
 * Istemcinin IP'si: Fly vekili gercek adresi `Fly-Client-IP` basliginda
 * veriyor; yoksa soketin uzak adresi. `X-Forwarded-For` okunmuyor: vekilsiz
 * calisirken istemci onu istedigi gibi yazabilir.
 */
export function readClientIp(headers: IncomingHttpHeaders | undefined, remoteAddress: string | undefined) {
  const fly = headers?.["fly-client-ip"];
  if (typeof fly === "string" && fly.length > 0 && fly.length <= 64) return fly.trim();
  return remoteAddress ?? "unknown";
}

/**
 * Sayac anahtari. IPv4 oldugu gibi; IPv6 /64 onekiyle.
 *
 * Tek bir IPv6 baglantisi genellikle koca bir /64 aliyor: adres basina sayac
 * tutmak, son 64 biti degistiren istemciye sinirsiz hak demekti. IPv4'e
 * eslenmis IPv6 (`::ffff:1.2.3.4`) IPv4 sayiliyor.
 */
export function ipRateKey(address: string) {
  const trimmed = address.trim();
  const zoneless = trimmed.split("%")[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(zoneless);
  if (mapped) return mapped[1];
  if (isIP(zoneless) !== 6) return trimmed;
  const groups = expandIpv6(zoneless);
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : trimmed;
}

/** IPv6 adresinin sekiz grubu (kucuk harf, bastaki sifirlar atilmis); bozuksa `undefined`. */
function expandIpv6(address: string): string[] | undefined {
  let text = address.toLowerCase();
  // Sonu gomulu IPv4 olan adres (`64:ff9b::1.2.3.4`): son iki grup ona.
  const embedded = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (embedded) {
    const [a, b, c, d] = embedded.slice(1).map(Number);
    text = `${text.slice(0, embedded.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return undefined;
  const groups = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  return groups.map((group) => (Number.parseInt(group, 16) || 0).toString(16));
}

/** Sabit pencereli sayac. Anahtar (IP) yalnizca bellekte. */
export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();
  private pruneTimer?: NodeJS.Timeout;

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now
  ) {}

  /** Istek gecebiliyorsa `true` ve sayilir. Anahtar basina sabit is. */
  hit(key: string) {
    const now = this.now();
    let entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      entry = { count: 0, windowStart: now };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  /** Penceresi gecmis anahtarlari siler. */
  prune(now = this.now()) {
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= this.windowMs) this.hits.delete(key);
    }
  }

  get size() {
    return this.hits.size;
  }

  /**
   * Periyodik temizlik; zamanlayici sureci acik tutmuyor. Eskiden yeni her
   * anahtarda (10k ustunde) butun harita taraniyordu: cok IP'li bir saldiri
   * her istekte O(n) is demekti.
   */
  startPruning(intervalMs = this.windowMs) {
    if (this.pruneTimer) return this;
    this.pruneTimer = setInterval(() => this.prune(), intervalMs);
    this.pruneTimer.unref();
    return this;
  }

  stopPruning() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = undefined;
  }
}
