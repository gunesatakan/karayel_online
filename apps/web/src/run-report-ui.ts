import { FINAL_WAVE, type CardRarity, type MasteryReportView, type RunReportAction, type RunReportActions, type RunReportView, type StampStyleId } from "@karayel/shared";
import { getCharacterColorCss } from "./character-colors";
import { cardRarityLabels } from "./codex";

/**
 * Kosu raporu: macin son ekrani, tek ekranlik bir DOM karti.
 *
 * Eskiden Phaser katmaninda tek bir sayi ve sayfayi yenileyen bir dugmeydi.
 * Satirlarin hepsi paylasilan modulde kuruluyor (`buildRunReportView`); burasi
 * yalnizca HTML'e ceviriyor ve dugmeleri bagliyor.
 *
 * 375 px once: ust kisim kaydirilabilir, dugmeler panelin altinda sabit --
 * uzun bir co-op raporunda da "Tekrar" hep gorunuyor. Kart secim perdesinin
 * gorsel dilini kullaniyor ki rapor oyunun parcasi gibi dursun, hata
 * penceresi gibi degil.
 *
 * Acilis bir kez canlaniyor (serit hucreleri sirayla, yildizlar, rozet).
 * Rapor ekrandan sonra gelirse ayni kart hareketsiz yeniden ciziliyor.
 * Hareket azaltmada hic canlanma yok: sinif hic eklenmiyor, CSS de ayrica
 * animasyonu kapatiyor.
 */

export type RunReportNote = { tone: "unlock" | "dim"; text: string };

export type RunReportChoice = RunReportAction | "menu";

/**
 * Raporun nisan ve ustalik bolumu: bu kosuda acilan nisanlar (dalga
 * molasinda gosterilenler de), operatorun ustalik cubugu ve acilan kozmetik.
 * Yaratici kosuda ya da kayit yazilmadiysa hic yok.
 */
export type RunReportProgress = {
  badges: ReadonlyArray<{ name: string; condition: string }>;
  mastery?: MasteryReportView;
  cosmetics: readonly string[];
};

export type RunReportRenderOptions = {
  view: RunReportView;
  actions: RunReportActions;
  notes: readonly RunReportNote[];
  /** Ilk acilis ve hareket azaltma kapali: canlanma siniflari ekleniyor. */
  animate: boolean;
  /**
   * Ilk acilis: odak panele tasiniyor (ekran okuyucu diyalogu duyurur, Tab
   * perdenin altindaki HUD'da gezinmez). Hareket ayarindan bagimsiz.
   */
  focus: boolean;
  /**
   * `performance.now()` zamaninda dugmelerin dokunusu kabul etmeye basladigi
   * an. Rapor kendiliginden aciliyor; ondan onceki dokunus HUD'a yapilmisti.
   */
  actionableAt: number;
  onChoice: (choice: RunReportChoice) => void;
  /** Son dalganin savunma ozeti varsa tani baglantisi. */
  onDefenseSummary?: () => void;
  progress?: RunReportProgress;
  /** Bu tarayicinin muhru (kozmetik); klasikte sinif yok. */
  stamp?: StampStyleId;
};

const ROOT_ID = "run-report-root";

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRoot() {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.append(root);
  }
  return root;
}

function renderHero(view: RunReportView) {
  const hero = view.hero;
  const badge = view.badge;
  const badgeHtml = badge
    ? `<b class="run-report__badge${badge.celebrated ? " is-celebrated" : ""}">${escapeHtml(badge.text)}</b>`
    : "";
  if (hero.kind === "stars") {
    return `
        <p class="run-report__hero run-report__hero--stars">
          <span class="run-report__stars" role="img" aria-label="${hero.stars} yıldız, 3 üzerinden">${escapeHtml(hero.text)}</span>
          <small>${escapeHtml(hero.caption)}</small>
        </p>
        ${badgeHtml ? `<p class="run-report__badge-line">${badgeHtml}</p>` : ""}`;
  }
  // Yenilgide bas ve rozet tek satir: "Dalga 13/20 — YENİ REKOR (önceki 11)".
  return `
        <p class="run-report__hero run-report__hero--wave">
          <span class="run-report__wave">${escapeHtml(hero.text)}</span>${badge
            ? `<span class="run-report__sep">${escapeHtml(badge.separator ?? " · ")}</span>${badgeHtml}`
            : ""}
        </p>`;
}

/**
 * Dalga seridi: 20 hucre, altinda 1/5/10/15/20 numaralari ve bir aciklama.
 * Renk tek isaret degil: dusulen dalgada "✕", hava dalgasinda ust isaret,
 * her hucrenin tam metni `aria-label` ve `title`da.
 */
function renderStrip(view: RunReportView) {
  const cells = view.strip.map((cell, index) => {
    const classes = ["run-report__cell", `is-${cell.state}`, cell.air ? `is-air-${cell.air}` : ""].filter(Boolean).join(" ");
    const mark = cell.state === "death" ? "✕" : "";
    return `<li class="${classes}" style="--i:${index}" title="${escapeHtml(cell.label)}" aria-label="${escapeHtml(cell.label)}">${mark}</li>`;
  }).join("");
  const count = Math.max(1, view.strip.length);
  const ticks = [1, 5, 10, 15, 20]
    .filter((wave) => wave <= count)
    .map((wave) => `<span style="grid-column:${wave}">${wave}</span>`)
    .join("");
  return `
      <section class="run-report__strip-wrap" aria-label="Dalga şeridi, ${FINAL_WAVE} dalga">
        <ol class="run-report__strip" style="--cells:${count}">${cells}</ol>
        <div class="run-report__ticks" style="--cells:${count}" aria-hidden="true">${ticks}</div>
        <p class="run-report__legend" aria-hidden="true">
          <span><i class="is-clean"></i>temiz</span>
          <span><i class="is-leak"></i>sızıntı</span>
          <span><i class="is-death"></i>düştü</span>
          <span><i class="is-air"></i>hava</span>
        </p>
      </section>`;
}

function renderPlayers(view: RunReportView) {
  if (!view.players?.length) return "";
  const rows = view.players.map((player) => {
    const name = player.name === player.operator ? escapeHtml(player.name) : `${escapeHtml(player.name)} <span>· ${escapeHtml(player.operator)}</span>`;
    return `
        <li class="run-report__player${player.local ? " is-local" : ""}" style="--player-color:${getCharacterColorCss(player.characterId)}">
          <span class="run-report__player-head">
            <strong>${name}${player.local ? ` <em class="run-report__you">sen</em>` : ""}</strong>
            <b class="run-report__role run-report__role--${player.titleKind}">${escapeHtml(player.title)}</b>
          </span>
          <span class="run-report__player-detail">${escapeHtml(player.detail)}</span>
        </li>`;
  }).join("");
  return `
      <section class="run-report__section" aria-label="Oyuncular">
        <h3 class="run-report__label">Ekip</h3>
        <ul class="run-report__players">${rows}</ul>
      </section>`;
}

function describeDeck(view: RunReportView) {
  const deck = view.deck;
  if (deck.total === 0) return "Kart seçilmedi";
  const order: CardRarity[] = ["epic", "rare", "uncommon"];
  const parts = [`${deck.total} kart`];
  for (const rarity of order) {
    if (deck.rarities[rarity] > 0) parts.push(`${deck.rarities[rarity]} ${cardRarityLabels[rarity]}`);
  }
  return parts.join(" · ");
}

/** Deste: secim sirasiyla, nadirlik cercevesi kart secim ekranindaki gibi (yaygin duz, seyrek gumus, nadir altin). */
function renderDeck(view: RunReportView) {
  const cards = view.deck.cards.map((card) => {
    const rarity = cardRarityLabels[card.rarity];
    const label = `${card.name} · ${rarity}${card.count > 1 ? ` · ${card.count} kez` : ""}`;
    return `<li class="run-report__card run-report__card--${card.rarity}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeHtml(card.name)}${card.count > 1 ? `<b>×${card.count}</b>` : ""}</li>`;
  }).join("");
  return `
      <section class="run-report__section run-report__deck" aria-label="Deste">
        <h3 class="run-report__label">Deste <small>${escapeHtml(describeDeck(view))}</small></h3>
        ${cards ? `<ul class="run-report__cards">${cards}</ul>` : ""}
      </section>`;
}

function renderFacts(view: RunReportView) {
  const facts: string[] = [];
  if (view.mvp) facts.push(`<div class="run-report__fact"><dt>Koşunun kulesi</dt><dd>${escapeHtml(view.mvp)}</dd></div>`);
  if (view.moment) facts.push(`<div class="run-report__fact run-report__fact--moment"><dt>En iyi an</dt><dd>${escapeHtml(view.moment.text)}</dd></div>`);
  return facts.length ? `<dl class="run-report__facts">${facts.join("")}</dl>` : "";
}

/**
 * Ustalik cubugu ve nisanlar. Seviye atlandiysa cubuk bastan doluyor ve
 * baslik "Ustalık 3 → 4"; atlanmadiysa "Ustalık 3 · +24". Doluluk yalnizca
 * renkle soylenmiyor: altinda "140/200 · sonraki seviyeye 60" yazili.
 */
function renderProgress(progress: RunReportProgress | undefined) {
  if (!progress) return "";
  const parts: string[] = [];
  const mastery = progress.mastery;
  if (mastery) {
    const fill = Math.round(mastery.after.ratio * 100);
    const from = mastery.levelUp ? 0 : Math.round(mastery.before.ratio * 100);
    parts.push(`
        <div class="run-report__mastery${mastery.levelUp ? " is-level-up" : ""}">
          <p class="run-report__mastery-head"><strong>${escapeHtml(mastery.operator)} · ${escapeHtml(mastery.headline)}</strong></p>
          <span class="run-report__mastery-bar" role="img" aria-label="${escapeHtml(`Ustalık ${mastery.after.level}: ${mastery.detail}`)}" style="--from:${from}%;--fill:${fill}%"><i></i></span>
          <small>${escapeHtml(mastery.detail)}${mastery.sources ? ` · ${escapeHtml(mastery.sources)}` : ""}</small>
        </div>`);
  }
  if (progress.badges.length > 0) {
    const items = progress.badges.map((badge, index) => `
          <li class="run-report__badge-item" style="--i:${index}"><b>◈ ${escapeHtml(badge.name)}</b><small>${escapeHtml(badge.condition)}</small></li>`).join("");
    parts.push(`<ul class="run-report__badges" aria-label="Bu koşunun nişanları">${items}</ul>`);
  }
  if (progress.cosmetics.length > 0) {
    parts.push(`<p class="run-report__note run-report__note--unlock">Açıldı: ${escapeHtml(progress.cosmetics.join(" · "))}</p>`);
  }
  if (parts.length === 0) return "";
  return `
      <section class="run-report__section run-report__progress" aria-label="Nişan ve ustalık">
        <h3 class="run-report__label">Nişan ve ustalık</h3>
        ${parts.join("")}
      </section>`;
}

function renderButton(action: RunReportAction, primary: boolean) {
  return `<button type="button" class="run-report__button${primary ? " run-report__button--primary" : ""}" data-report-action="${action.kind}">
          <strong>${escapeHtml(action.label)}</strong><small>${escapeHtml(action.detail)}</small>
        </button>`;
}

function renderActions(actions: RunReportActions) {
  const primary = actions.primary === "next" ? actions.next : actions.retry;
  const secondary = actions.primary === "next" ? actions.retry : actions.next;
  const menu = `<button type="button" class="run-report__button" data-report-action="menu"><strong>Ana menü</strong></button>`;
  return `
    <footer class="run-report__actions">
      ${primary ? renderButton(primary, true) : ""}
      <div class="run-report__secondary">
        ${secondary ? renderButton(secondary, false) : ""}
        ${menu}
      </div>
    </footer>`;
}

/**
 * Raporu ciz (ya da acik raporu yeniden ciz). Kaydirma konumu korunuyor:
 * rapor ekrandan sonra gelince oyuncunun okudugu yer atlamasin.
 */
export function renderRunReport(options: RunReportRenderOptions) {
  const root = getRoot();
  const { view } = options;
  const previousScroll = root.querySelector<HTMLElement>(".run-report__body")?.scrollTop ?? 0;
  // Yeniden cizim odakli dugmeyi siliyor; odak raporun icindeyse panele geri donsun.
  const hadFocus = root.contains(document.activeElement);
  const notes = options.notes
    .map((note) => `<p class="run-report__note run-report__note--${note.tone}">${escapeHtml(note.text)}</p>`)
    .join("");
  const finale = view.heading.finale
    ? `<p class="run-report__finale">${escapeHtml(view.heading.finale.text)}<small>${escapeHtml(view.heading.finale.races)}</small></p>`
    : "";
  const stamp = options.stamp && options.stamp !== "klasik" ? ` run-report--stamp-${options.stamp}` : "";
  root.className = `run-report run-report--${view.heading.tone}${stamp}${options.animate ? " run-report--reveal" : ""}`;
  root.innerHTML = `
    <div class="run-report__veil"></div>
    <section class="run-report__panel" role="dialog" aria-modal="true" aria-labelledby="run-report-title" tabindex="-1">
      <div class="run-report__body">
        <header class="run-report__head">
          <span class="run-report__eyebrow">${escapeHtml(view.heading.eyebrow)}</span>
          <h2 class="run-report__title" id="run-report-title">${escapeHtml(view.heading.title)}</h2>
          ${finale}
          ${renderHero(view)}
        </header>
        ${renderStrip(view)}
        <p class="run-report__totals">${escapeHtml(view.totals)}</p>
        ${renderFacts(view)}
        ${renderPlayers(view)}
        ${renderDeck(view)}
        ${view.goal ? `<p class="run-report__goal">${escapeHtml(view.goal)}</p>` : ""}
        ${renderProgress(options.progress)}
        ${notes}
        ${options.onDefenseSummary ? `<button type="button" class="run-report__link" data-report-defense>Son dalganın savunma özeti</button>` : ""}
      </div>
      ${renderActions(options.actions)}
    </section>`;

  const body = root.querySelector<HTMLElement>(".run-report__body");
  if (body && previousScroll > 0) body.scrollTop = previousScroll;

  // Dugme bir kez: yeniden yukleme baslamadan ikinci dokunus niyeti ezmesin.
  let chosen = false;
  const choose = (choice: RunReportChoice) => {
    if (chosen) return;
    chosen = true;
    root.querySelectorAll<HTMLButtonElement>("[data-report-action]").forEach((button) => { button.disabled = true; });
    options.onChoice(choice);
  };
  root.querySelectorAll<HTMLButtonElement>("[data-report-action]").forEach((button) => {
    button.addEventListener("click", () => {
      // Kart secimindeki gibi sessizce yok sayiliyor ve `chosen` kurulmuyor:
      // HUD'a yapilan son dokunus buraya inmesin, bilincli ikinci dokunus calissin.
      if (performance.now() < options.actionableAt) return;
      const kind = button.dataset.reportAction;
      if (kind === "menu") choose("menu");
      else if (kind === "retry" && options.actions.retry) choose(options.actions.retry);
      else if (kind === "next" && options.actions.next) choose(options.actions.next);
    });
  });
  const defense = root.querySelector<HTMLButtonElement>("[data-report-defense]");
  if (defense && options.onDefenseSummary) {
    const open = options.onDefenseSummary;
    defense.addEventListener("click", () => {
      if (performance.now() < options.actionableAt) return;
      open();
    });
  }
  if (options.focus || hadFocus) {
    // Odak paneldeki ilk okunacak yerde; dokunmatikte kaydirma olmadan. Hareket
    // azaltmada da: odak bir canlanma degil. Tazelemede odak zaten raporun
    // icindeyse orada kaliyor, disaridaysa (ornegin savunma ozeti) cekilmiyor.
    root.querySelector<HTMLElement>(".run-report__panel")?.focus({ preventScroll: true });
  }
  return root;
}

export function removeRunReport() {
  document.getElementById(ROOT_ID)?.remove();
}
