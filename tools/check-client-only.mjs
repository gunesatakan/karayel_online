/**
 * Istemci-ici calismanin (3D cizim katmani vb.) sunucuyu yeniden yayinlatmadigini denetler.
 *
 *   node tools/check-client-only.mjs            # origin/main'e gore dal + calisma agaci
 *   node tools/check-client-only.mjs --staged   # yalnizca commit'e girecekler (pre-commit)
 *
 * Yasak yollar elle yazilmiyor: sunucu yayin is akisinin `on.push.paths` listesi
 * (`.github/workflows/fly-server-deploy.yml`) okunuyor. `main`e o yollardan birine
 * dokunan her push canli sunucuyu yeniden baslatiyor ve suren maclar kopuyor.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflow = readFileSync(new URL("../.github/workflows/fly-server-deploy.yml", import.meta.url), "utf8");

/** `paths:` altindaki `- "..."` satirlari. */
export function readDeployPaths(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*paths:\s*$/.test(line));
  if (start < 0) throw new Error("fly-server-deploy.yml icinde paths listesi bulunamadi");
  const paths = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^\s*-\s*["']?([^"'#]+?)["']?\s*$/.exec(line);
    if (!match) break;
    paths.push(match[1]);
  }
  return paths;
}

/** GitHub Actions yol desenini (`**`, `*`) duzenli ifadeye cevirir. */
export function globToRegExp(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") { source += ".*"; index += 1; }
    else if (char === "*") source += "[^/]*";
    else source += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

export function findForbidden(files, patterns) {
  const expressions = patterns.map(globToRegExp);
  return files.filter((file) => expressions.some((expression) => expression.test(file)));
}

function git(command) {
  return execSync(`git ${command}`, { cwd: root, encoding: "utf8" }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function main() {
  const staged = process.argv.includes("--staged");
  const files = new Set(staged
    ? git("diff --cached --name-only")
    : [...git("diff --name-only origin/main...HEAD"), ...git("diff --name-only HEAD"), ...git("ls-files --others --exclude-standard")]);
  const forbidden = findForbidden([...files], readDeployPaths(workflow));
  if (forbidden.length > 0) {
    console.error("Bu degisiklikler main'e gecerse canli sunucu yeniden yayinlanir (fly-server-deploy.yml):");
    for (const file of forbidden) console.error(`  - ${file}`);
    process.exit(1);
  }
  console.log(`Sunucuyu tetikleyen dosya yok (${files.size} degisen dosya denetlendi).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
