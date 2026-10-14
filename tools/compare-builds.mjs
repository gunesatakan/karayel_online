/**
 * Kurulus karsilastirmasi: gercek oda, tam asama, ayni bot.
 *
 * Her kurulus (savas kulesi karisimi) her operator ve asama icin ayni
 * tohumlarla, `tools/sim/` bot surucusuyle oynaniyor. Tohum haritayi
 * (yasak bolgeler, kaynak dugumleri), dalga paternlerini ve kart/esya
 * cekilislerini belirliyor; kuruluslar ayni tohum kumesinde eslesik.
 * Irk zaaflari ve direncleri, Debug Lazer dahil butun kuleler ve butun
 * lojistik odanin kendisinden geliyor; hicbir sey sifirlanmiyor.
 *
 *   npm run compare:builds                                  (20 tohum, asama 1/3/5)
 *   node tools/compare-builds.mjs --seeds 20 --stages 1,3,5 --workers 15
 *   node tools/compare-builds.mjs --operators warrior --builds laser,takipci --seeds 5 --no-write
 *
 * Yazdiklari: docs/build-comparison.md (tablo) ve
 * docs/build-comparison-results.json (kosu basina ozet).
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { cpus } from "node:os";
import { runJobs } from "./sim/jobs.mjs";
import { summarize } from "./sim/match.mjs";
import { BUILDS } from "./sim/policies.mjs";

/** Karsilastirilan kuruluslar: operator basina sekiz, butun oynanabilir kuleler. */
export const COMPARISON_BUILDS = {
  warrior: ["laser", "takipci", "obsession", "laser-takipci", "laser-obsession", "ucube", "server-obsession", "isolation-laser"],
  zeynep: ["hiza", "gosteri", "hiza-gosteri", "hiza-taht", "kin-hiza", "archive-hiza", "abarti-hiza", "balanced"]
};

export function comparisonJobs({ operators = ["warrior", "zeynep"], stages = [1, 3, 5], seeds = 20, seedStart = 1, builds, policy = "standard", maxWaves } = {}) {
  const jobs = [];
  for (const operator of operators) {
    // --builds butun operatorlere veriliyor; operatorde olmayan kurulus atlaniyor.
    const own = builds ? builds.filter((build) => BUILDS[operator]?.[build]) : COMPARISON_BUILDS[operator];
    if (builds && own.length === 0) throw new Error(`no known build for ${operator} in ${builds.join(",")}`);
    for (const build of own) {
      for (const stage of stages) {
        for (let index = 0; index < seeds; index += 1) {
          jobs.push({ operators: [operator], stage, seed: seedStart + index, policy, overrides: { build }, maxWaves, label: `${operator}/${build}/s${stage}` });
        }
      }
    }
  }
  return jobs;
}

/** Kosu basina kucuk ozet (JSON dosyasi icin). */
export function compactReport(report) {
  return {
    operator: report.operators[0],
    build: report.builds[0],
    stage: report.stage,
    seed: report.seed,
    status: report.status,
    waveReached: report.waveReached,
    nexusHp: report.nexusHp,
    leaks: report.leaks,
    kills: report.kills,
    dpsFinal: report.dpsFinal,
    goldEarned: report.players[0].goldEarned,
    goldSpent: report.players[0].goldSpent,
    goldUnspent: report.players[0].goldUnspent,
    experienceUnspent: report.players[0].experience,
    workersHired: report.players[0].workersHired,
    towersLost: report.towersLost,
    wallsEnd: report.wallsEnd,
    damageByTower: report.damageByTower,
    towersEnd: report.towersEnd,
    cards: report.players[0].cards,
    items: report.players[0].items,
    ...(report.stall ? { stall: report.stall } : {})
  };
}

export function aggregate(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.operator}|${row.build}|${row.stage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, group]) => {
    const [operator, build, stage] = key.split("|");
    const waves = summarize(group.map((row) => row.waveReached));
    const damage = {};
    for (const row of group) for (const [id, value] of Object.entries(row.damageByTower)) damage[id] = (damage[id] ?? 0) + value;
    const total = Object.values(damage).reduce((sum, value) => sum + value, 0) || 1;
    const topTower = Object.entries(damage).sort((a, b) => b[1] - a[1])[0];
    return {
      operator,
      build,
      stage: Number(stage),
      runs: group.length,
      wins: group.filter((row) => row.status === "victory").length,
      stalled: group.filter((row) => row.status === "stalled").length,
      meanWave: waves.mean,
      medianWave: waves.median,
      p10Wave: waves.p10,
      p90Wave: waves.p90,
      meanDps: summarize(group.map((row) => row.dpsFinal)).mean,
      meanWorkers: summarize(group.map((row) => row.workersHired)).mean,
      topTower: topTower ? `${topTower[0]} %${Math.round(100 * topTower[1] / total)}` : "-"
    };
  });
}

const STAGE_RACE = { 1: "Golem (fiziksel +%40, hücresel -%40)", 2: "Meka", 3: "Uzay Böceği (hücresel +%40, ateş -%40)", 4: "Düşmüş", 5: "Dördüncü Boyut (psişik +%40, fiziksel -%40)" };

export function formatMarkdown(summary, meta) {
  const stages = [...new Set(summary.map((row) => row.stage))].sort((a, b) => a - b);
  const operators = [...new Set(summary.map((row) => row.operator))];
  const cell = (row) => row ? `${row.meanWave.toFixed(1)} (${row.medianWave.toFixed(0)}) · %${Math.round(100 * row.wins / row.runs)}${row.stalled ? ` · ${row.stalled}⏸` : ""}` : "-";
  const lines = [
    "# Kuruluş karşılaştırması",
    "",
    `Gerçek \`MatchRoom\`, tam aşama (20 dalga), aynı bot (\`tools/sim/\`, politika \`${meta.policy}\`). Her hücre ${meta.seeds} tohumun ortalamasıdır; kuruluşlar aynı tohumlarla (aynı harita, yasak bölgeler, kaynak düğümleri, dalga paternleri) eşleşiktir. Irk zaafı/direnci (±%40), Debug Lazer dahil bütün kuleler, işçi/mermi/enerji lojistiği, özel düşmanlar, karşı ataklar ve ırk mekanikleri oyunun kendisinden gelir; hiçbir şey sıfırlanmaz ya da yapay olarak doldurulmaz.`,
    "",
    `Oluşturma: \`node tools/compare-builds.mjs --seeds ${meta.seeds} --stages ${stages.join(",")}\` (${meta.date}, ${meta.matches} maç, ${meta.minutes} dk, ${meta.workers} iş parçacığı). Koşu başına özet: \`build-comparison-results.json\`. Yöntem ve doğrulama: \`docs/simulator.md\`.`,
    "",
    "Hücre: **ulaşılan ortalama dalga (medyan) · zafer oranı**; ⏸ = donmuş düşman yüzünden kesilen koşu sayısı (aşağıya bakın). Ulaşılan dalga, temizlenen son dalgadır (0–20).",
    "",
    `| Operatör | Kuruluş | Kuleler | ${stages.map((stage) => `Aşama ${stage}`).join(" | ")} | En çok hasar (aşama ${stages[0]}) |`,
    `|---|---|---|${stages.map(() => "---:").join("|")}|---|`
  ];
  for (const operator of operators) {
    const builds = [...new Set(summary.filter((row) => row.operator === operator).map((row) => row.build))];
    const rank = (build) => -stages.reduce((sum, stage) => sum + (summary.find((row) => row.operator === operator && row.build === build && row.stage === stage)?.meanWave ?? 0), 0);
    for (const build of builds.sort((a, b) => rank(a) - rank(b))) {
      const rows = stages.map((stage) => summary.find((row) => row.operator === operator && row.build === build && row.stage === stage));
      const mix = Object.entries(BUILDS[operator][build].mix).map(([id, weight]) => `${id}×${weight}`).join(" + ");
      lines.push(`| ${operator === "warrior" ? "Atakan" : "Zeynep"} | ${build} | ${mix} | ${rows.map(cell).join(" | ")} | ${rows[0]?.topTower ?? "-"} |`);
    }
  }
  lines.push(
    "",
    "Aşama ırkları: " + stages.map((stage) => `${stage}: ${STAGE_RACE[stage]}`).join("; ") + ". Atakan'ın hasar türleri: Takipçi fiziksel, Obsesyon psişik, Debug Lazer ateş, Ucube/Sunucu elektrik; Zeynep: Hiza fiziksel, Gösteri ışık.",
    "",
    "## Bot sınırları (sonuçları okurken)",
    "",
    "- Bu bir **sezgisel bot**dur, usta oyuncu değildir. Mutlak dalga sayıları iyi bir oyuncunun ulaşacağının altında kalır; tablo kuruluşları **aynı bot** altında karşılaştırır. Sıralama bot kararlarına (yerleşim, işçi sayısı, harcama sırası) duyarlıdır.",
    "- Yerleşim tek kalıp: harita ortasına yakın tam genişlikte duvar hattı, uçanların indiği köşeye yakın tek kareli geçit ve geçitten nexus'a inen koridor; kuleler koridorun iki yanına. Labirent/kıvrım kurmaz, duvarı kalınlaştırmaz.",
    "- Karışımda havayı vurabilen kule yoksa (Atakan'da Debug Lazer, İzolasyon ve Sunucu havayı vuramaz: `laser`, `isolation-laser`) bot 3. dalgadan sonra iki Takipçi ekler (hava koruması); \"Kuleler\" sütunu bu korumayı göstermez. 5. ve 10. dalga tamamen, 15. ve 20. dalga yarı yarıya uçandır.",
    "- İşçi sayısı kulelerin tahmini enerji/mermi ihtiyacından ve geçen dalganın kıtlığından; işçi gelişim ağacı (XP) ve işçi uzmanlık seçimleri kullanılmaz. Yerleştirmeli eşyalar (Bariyer, Ziftli Zemin) ve Riskli Yatırım alınmaz.",
    "- Kartlar ve eşyalar kaba bir puanla (açgözlü) seçilir; tutarlı ama en iyi değil. Ultiler şarj dolunca kullanılır; ulti gücü yükseltilmez.",
    "- ⏸ (stalled): kör gezinmenin döngü tespiti, takip ettiği yapı yıkılınca açık alanda \"kır\" kararı verip kıracak komşu yapı bulamıyor ve düşman o karede donuyor. Bot 20 sn kımıldamayan düşmanın yanına kule kurarak bunu çoğunlukla çözer; çözemediği koşu dalga 6 dakikayı aşınca kesilir ve kesildiği dalganın bir eksiği \"ulaşılan dalga\" sayılır.",
    ""
  );
  return lines.join("\n");
}

function parseArgs(argv) {
  const args = { seeds: 20, stages: [1, 3, 5], operators: ["warrior", "zeynep"], workers: Math.max(1, cpus().length - 1), write: true, policy: "standard" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    switch (argv[index]) {
      case "--seeds": args.seeds = Number(value); index += 1; break;
      case "--seed-start": args.seedStart = Number(value); index += 1; break;
      case "--stages": args.stages = value.split(",").map(Number); index += 1; break;
      case "--operators": args.operators = value.split(","); index += 1; break;
      case "--builds": args.builds = value.split(","); index += 1; break;
      case "--workers": args.workers = Number(value); index += 1; break;
      case "--policy": args.policy = value; index += 1; break;
      case "--waves": args.maxWaves = Number(value); index += 1; break;
      case "--no-write": args.write = false; break;
      default: throw new Error(`unknown argument ${argv[index]}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobs = comparisonJobs(args);
  const started = Date.now();
  let done = 0;
  const reports = await runJobs(jobs, {
    workers: args.workers,
    onResult() {
      done += 1;
      if (done % 20 === 0 || done === jobs.length) process.stderr.write(`\r${done}/${jobs.length} mac, ${((Date.now() - started) / 1000).toFixed(0)} sn`);
    }
  });
  process.stderr.write("\n");
  const rows = reports.map(compactReport);
  const summary = aggregate(rows);
  const meta = { seeds: args.seeds, policy: args.policy, matches: jobs.length, workers: args.workers, minutes: ((Date.now() - started) / 60000).toFixed(1), date: new Date().toISOString().slice(0, 10) };
  const markdown = formatMarkdown(summary, meta);
  console.log(markdown);
  if (args.write) {
    await writeFile(new URL("../docs/build-comparison-results.json", import.meta.url), `${JSON.stringify({ meta, summary, runs: rows }, null, 1)}\n`);
    await writeFile(new URL("../docs/build-comparison.md", import.meta.url), markdown);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
