import { activityLabels, type DefenseSummary, type TowerActivity } from "@karayel/shared";

/**
 * Native modal traps keyboard focus and prevents accidental clicks on the map.
 *
 * `changed` verilirse ilk `changed.length` satir tek tek yazilir: degisen
 * satir one cikar, degismeyen geri cekilir. Onizlemede sekiz satirin cogu
 * ayni kaliyordu ve tek kazanc aralarinda kayboluyordu.
 */
export function openDefenseDialog(title: string, lines: string[], confirm?: () => void, changed?: readonly boolean[]) {
  document.querySelector("#defense-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "defense-dialog";
  dialog.style.cssText = "color:#e2e8f0;background:#101c2b;border:1px solid #4b708e;border-radius:16px;padding:24px;width:min(640px,85vw);max-height:80vh;overflow:auto;box-shadow:0 20px 80px #000b;font:15px/1.6 system-ui";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const content = document.createElement("div");
  content.style.whiteSpace = "pre-wrap";
  if (changed?.length) {
    for (const [index, line] of lines.entries()) {
      const row = document.createElement("div");
      // Bos satir ayirac; bos bir div yuksekliksiz kalip ayiraci yutardi.
      row.textContent = line || "\u00a0";
      if (index < changed.length) row.className = `defense-dialog__line defense-dialog__line--${changed[index] ? "changed" : "same"}`;
      content.append(row);
    }
  } else {
    content.textContent = lines.join("\n");
  }
  const actions = document.createElement("div");
  // Satir kaydirilmali: tasan sag yasli satir sola, kaydirilamayan alana
  // itiliyordu ve telefonda Kapat ile ilk secenekler hic gorunmuyordu.
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;margin-top:20px;justify-content:flex-end";
  const button = (label: string, action: () => void) => {
    const element = document.createElement("button");
    element.textContent = label;
    element.style.cssText = "padding:10px 18px;color:#fff;background:#244664;border:1px solid #5c8dad;border-radius:8px;cursor:pointer";
    element.onclick = action;
    actions.append(element);
  };
  button("Kapat", () => dialog.close());
  if (confirm) button("Uygula", () => { dialog.close(); confirm(); });
  dialog.append(heading, content, actions);
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

/**
 * Kalici bir secim icin secenekleri alt alta, aciklamalariyla listeler.
 *
 * Secenekler eylem satirina dugme olarak eklendiginde telefonda satir
 * tasiyordu ve aciklama yalnizca `title` icindeydi -- dokunmatikte hic
 * okunamiyordu. Burada her secenek tam genislikte ve aciklamasi gorunur.
 * `onDismiss` secim yapilmadan kapanista cagrilir.
 */
export function openChoiceDialog<T extends string>(
  title: string,
  lines: string[],
  options: readonly { id: T; name: string; description: string }[],
  onChoose: (id: T) => void,
  onDismiss?: () => void
) {
  const dialog = openDefenseDialog(title, lines);
  let chosen = false;
  const list = document.createElement("div");
  list.style.cssText = "display:grid;gap:8px;margin-top:16px";
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = "display:grid;gap:2px;width:100%;padding:12px 14px;text-align:left;color:#fff;background:#244664;border:1px solid #5c8dad;border-radius:8px;cursor:pointer";
    const name = document.createElement("strong");
    name.textContent = option.name;
    const description = document.createElement("small");
    description.style.cssText = "color:#bcd0e2;font-size:13px;line-height:1.4";
    description.textContent = option.description;
    button.append(name, description);
    button.onclick = () => {
      chosen = true;
      dialog.close();
      onChoose(option.id);
    };
    list.append(button);
  }
  dialog.lastElementChild?.before(list);
  // showModal odagi o an tek dugme olan Kapat'a verdi; secenekler ondan once
  // eklendigi icin okuyucu ve klavye sirasi sondan basliyordu.
  list.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  if (onDismiss) dialog.addEventListener("close", () => { if (!chosen) onDismiss(); });
  return dialog;
}

export function defenseSummaryLines(summary: DefenseSummary) {
  return [
    "Gerçek hasar = indirilen can + kalkan. Destek süreleri hasara eklenmez. Döngü süreleri nişan alma ve atış aralığını da içerir; kesintisiz isabet süresi değildir.",
    ...summary.rows.map((row) => `\n${row.name} · ${row.damage} hasar · ${row.repaired} alınan onarım${row.auraEnemySeconds ? ` · aura teması ${row.auraEnemySeconds} düşman·sn (örtüşebilir)` : ""}${row.markAssistDamage ? ` · takip katkısı ${row.markAssistDamage} (vuranın hasarına dahil; son yenileyen)` : ""}\n`
      + Object.entries(row.seconds).filter(([, value]) => value >= 0.1)
        .map(([key, value]) => `${activityLabels[key as TowerActivity]}: ${value.toFixed(1)} sn`).join(" · "))
  ];
}
