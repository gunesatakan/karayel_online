/**
 * `public/` altindaki bir dosyanin adresi.
 *
 * Paket goreli tabanla (`base: "./"`) uretiliyor; itch.io oyunu
 * `html.itch.zone/html/<id>/index.html` gibi bir alt yoldan sunuyor, kok
 * mutlak yol ("/images/...") orada alan adinin kokune gidip 404 veriyor.
 * Gelistirmede `BASE_URL` "/", uretimde "./"; ikisinde de dogru yere cozulur.
 * Node testleri modulu esbuild ile paketliyor; orada `import.meta.env` yok.
 */
export function assetUrl(path: string) {
  return `${import.meta.env?.BASE_URL ?? "/"}${path.replace(/^\/+/, "")}`;
}
