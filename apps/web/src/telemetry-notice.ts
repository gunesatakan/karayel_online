import { onLocaleChange, t } from "./i18n";
import { acknowledgeTelemetryNotice, hasSeenTelemetryNotice, onTelemetrySettingChange } from "./telemetry";

/**
 * Ilk acilis bildirimi: anonim kullanim verisi.
 *
 * Ekranin tepesinde kucuk bir serit; oyunu ortmuyor, secim zorunlu degil.
 * Tamam veriyi acik birakiyor, Kapat kapatiyor, Ayrintilar PRIVACY.md'nin
 * ozetini aciyor. Gecilene kadar telemetri hicbir olay tutmuyor ve
 * yollamiyor (`isTelemetryActive`); karar verilmeden maca girilirse o
 * oturumda veri gitmiyor, bildirim sonraki acilista yeniden geliyor.
 *
 * Serit yalnizca menu ekrandayken gorunuyor; mac basinda gizleniyor.
 * Menuye (menu-ui) dokunmuyor: kendi kokunu govdeye ekliyor.
 */
export function setupTelemetryNotice() {
  if (hasSeenTelemetryNotice()) return;

  const root = document.createElement("aside");
  root.className = "telemetry-notice";
  root.setAttribute("role", "region");
  document.body.append(root);

  let expanded = false;

  const render = () => {
    root.setAttribute("aria-label", t("consent.aria"));
    root.innerHTML = `
      <p class="telemetry-notice__text"></p>
      <ul class="telemetry-notice__details" ${expanded ? "" : "hidden"}></ul>
      <div class="telemetry-notice__actions">
        <button type="button" class="telemetry-notice__more" aria-expanded="${expanded}"></button>
        <button type="button" class="telemetry-notice__off"></button>
        <button type="button" class="telemetry-notice__ok"></button>
      </div>`;
    root.querySelector(".telemetry-notice__text")!.textContent = t("consent.text");
    const details = root.querySelector(".telemetry-notice__details")!;
    for (const key of ["consent.detail.collected", "consent.detail.notCollected", "consent.detail.retention", "consent.detail.optOut", "consent.detail.contact"] as const) {
      const item = document.createElement("li");
      item.textContent = t(key);
      details.append(item);
    }
    const more = root.querySelector<HTMLButtonElement>(".telemetry-notice__more")!;
    more.textContent = expanded ? t("consent.less") : t("consent.more");
    more.addEventListener("click", () => {
      expanded = !expanded;
      render();
    });
    const off = root.querySelector<HTMLButtonElement>(".telemetry-notice__off")!;
    off.textContent = t("consent.off");
    off.addEventListener("click", () => acknowledgeTelemetryNotice(false));
    const ok = root.querySelector<HTMLButtonElement>(".telemetry-notice__ok")!;
    ok.textContent = t("consent.ok");
    ok.addEventListener("click", () => acknowledgeTelemetryNotice(true));
  };

  // Menu gizlenince (mac) serit de gizli; menuye donunce yine gorunur.
  const menu = document.querySelector("#menu-root");
  const syncVisibility = () => {
    root.hidden = Boolean(menu?.classList.contains("menu-root--hidden"));
  };
  const observer = menu ? new MutationObserver(syncVisibility) : undefined;
  observer?.observe(menu!, { attributes: true, attributeFilter: ["class"] });

  const stopLocale = onLocaleChange(render);
  // Karar (bildirimden ya da menudeki/oyun icindeki kutudan): serit kalkar.
  const stopSetting = onTelemetrySettingChange((enabled) => {
    // Menudeki kutu kendi cizimindeki degeri tasiyor; Kapat'tan sonra
    // isaretli kalmasin.
    document.querySelectorAll<HTMLInputElement>("[data-telemetry-toggle]").forEach((input) => {
      input.checked = enabled;
    });
    observer?.disconnect();
    stopLocale();
    stopSetting();
    root.remove();
  });

  render();
  syncVisibility();
}
