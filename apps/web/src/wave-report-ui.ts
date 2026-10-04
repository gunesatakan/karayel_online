import type { WaveReportCard } from "@karayel/shared";

/**
 * Dalga karnesinin serit hali: kart secim perdesinin basliginda.
 *
 * Satirlar paylasilan modulde kuruluyor (`buildWaveReportCard`); burasi
 * yalnizca DOM'a ceviriyor. Metinler `textContent` ile yaziliyor: kule adi
 * bugun katalogdan geliyor ama HTML'e kacislanmadan yazilan bir ad bir gun
 * oyuncu girdisi olursa arayuzu kirardi.
 *
 * Seride dokunmak Savunma Ozeti'ni aciyor -- karnenin ayrintisi orada. Ozet
 * yoksa serit dugme degil, yalnizca metin: basilip hicbir sey yapmayan bir
 * dugme bozuk gorunurdu.
 *
 * Temiz seri 5/10/15/20'de cip bir kez parliyor. Parilti yalnizca ilk
 * dagitimda ve hareket azaltma kapaliyken (sinif hic eklenmiyor); aksi halde
 * cip altin kenarla sabit duruyor, bilgi kaybolmuyor.
 */

export type WaveReportRenderOptions = {
  /** Ilk dagitim ve hareket azaltma kapali: kilometre tasi parlamasi. */
  animate: boolean;
  /** Savunma ozeti varsa seride dokununca acilir. */
  onOpen?: () => void;
};

export function createWaveReportElement(card: WaveReportCard, options: WaveReportRenderOptions): HTMLElement {
  const open = options.onOpen;
  const root = document.createElement(open ? "button" : "div");
  root.className = `wave-report${options.animate ? " wave-report--animate" : ""}${card.milestone ? " wave-report--milestone" : ""}`;
  root.dataset.waveReportKey = getWaveReportKey(card, Boolean(open));
  if (open) {
    const button = root as HTMLButtonElement;
    button.type = "button";
    button.setAttribute("aria-label", `${card.label}. Savunma özetini aç`);
    button.addEventListener("click", open);
  } else {
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", card.label);
  }

  const line = document.createElement("span");
  line.className = "wave-report__line";
  line.setAttribute("aria-hidden", "true");
  card.chips.forEach((chip, index) => {
    if (index > 0) {
      // Bosluklu ayirac: dar ekranda satir cip ortasinda degil ayiracta kirilsin.
      line.append(" ");
      const separator = document.createElement("span");
      separator.className = "wave-report__sep";
      separator.textContent = "·";
      line.append(separator, " ");
    }
    const element = document.createElement("span");
    element.className = `wave-report__chip wave-report__chip--${chip.kind}${chip.milestone ? " is-milestone" : ""}${chip.title ? ` is-${chip.title}` : ""}`;
    element.textContent = chip.text;
    line.append(element);
  });
  if (open) {
    const more = document.createElement("span");
    more.className = "wave-report__more";
    more.textContent = "›";
    line.append(" ", more);
  }
  root.append(line);

  if (card.highlight) {
    const highlight = document.createElement("span");
    highlight.className = `wave-report__highlight wave-report__highlight--${card.highlight.kind}${card.highlight.tier ? ` is-${card.highlight.tier}` : ""}${card.highlight.share ? ` is-${card.highlight.share}` : ""}`;
    highlight.setAttribute("aria-hidden", "true");
    highlight.textContent = card.highlight.text;
    // Dar ekranda satir tek satirda kesiliyor; tam metin basili tutunca.
    highlight.title = card.highlight.text;
    root.append(highlight);
  }
  return root;
}

/** Seridin icerik anahtari: gec gelen veri seridi degistirmediyse yeniden cizilmiyor. */
export function getWaveReportKey(card: WaveReportCard | undefined, tappable: boolean) {
  return card ? `${card.label}|${tappable ? 1 : 0}` : "";
}
