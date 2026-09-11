import { activityLabels, type DefenseSummary, type TowerActivity } from "@karayel/shared";

/** Native modal traps keyboard focus and prevents accidental clicks on the map. */
export function openDefenseDialog(title: string, lines: string[], confirm?: () => void) {
  document.querySelector("#defense-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "defense-dialog";
  dialog.style.cssText = "color:#e2e8f0;background:#101c2b;border:1px solid #4b708e;border-radius:16px;padding:24px;width:min(640px,85vw);max-height:80vh;overflow:auto;box-shadow:0 20px 80px #000b;font:15px/1.6 system-ui";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const content = document.createElement("div");
  content.style.whiteSpace = "pre-wrap";
  content.textContent = lines.join("\n");
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:12px;margin-top:20px;justify-content:flex-end";
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

export function defenseSummaryLines(summary: DefenseSummary) {
  return [
    "Gerçek hasar = indirilen can + kalkan. Destek süreleri hasara eklenmez. Döngü süreleri nişan alma ve atış aralığını da içerir; kesintisiz isabet süresi değildir.",
    ...summary.rows.map((row) => `\n${row.name} · ${row.damage} hasar · ${row.repaired} alınan onarım${row.auraEnemySeconds ? ` · aura teması ${row.auraEnemySeconds} düşman·sn (örtüşebilir)` : ""}${row.markAssistDamage ? ` · takip katkısı ${row.markAssistDamage} (vuranın hasarına dahil; son yenileyen)` : ""}\n`
      + Object.entries(row.seconds).filter(([, value]) => value >= 0.1)
        .map(([key, value]) => `${activityLabels[key as TowerActivity]}: ${value.toFixed(1)} sn`).join(" · "))
  ];
}
