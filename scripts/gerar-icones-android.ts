/**
 * npm run icones:android — ícone e tela de abertura do app Android a partir de public/icons/icon.svg
 * e public/logo-oliveira.svg (rode de novo se trocar o logo).
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RES = path.join(RAIZ, "android", "app", "src", "main", "res");
const PRETO = "#0B0B0B";
const icone = readFileSync(path.join(RAIZ, "public", "icons", "icon.svg"));
const logo = readFileSync(path.join(RAIZ, "public", "logo-oliveira.svg"));

const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;

/** arte centralizada sobre fundo preto (ou transparente) */
async function compor(svg: Buffer, w: number, h: number, escala: number, fundo: string | null, saida: string) {
  const lado = Math.round(Math.min(w, h) * escala);
  const arte = await sharp(svg).resize(lado, lado, { fit: "inside" }).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: fundo ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: arte, gravity: "center" }]).png().toFile(saida);
}

async function main() {
  for (const [d, f] of Object.entries(DENSIDADES)) {
    const dir = path.join(RES, `mipmap-${d}`);
    // ícone antigo (Android < 8): quadrado e redondo
    await compor(icone, 48 * f, 48 * f, 0.8, PRETO, path.join(dir, "ic_launcher.png"));
    await compor(icone, 48 * f, 48 * f, 0.7, PRETO, path.join(dir, "ic_launcher_round.png"));
    // ícone adaptativo: a arte tem de caber nos 66% centrais (o resto o Android recorta)
    await compor(icone, 108 * f, 108 * f, 0.6, null, path.join(dir, "ic_launcher_foreground.png"));
  }
  writeFileSync(path.join(RES, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${PRETO}</color>\n</resources>\n`);

  // tela de abertura: logo da marca no fundo preto, retrato e paisagem
  await compor(logo, 480, 800, 0.8, PRETO, path.join(RES, "drawable", "splash.png"));
  for (const [d, f] of Object.entries(DENSIDADES)) {
    await compor(logo, 320 * f, 480 * f, 0.75, PRETO, path.join(RES, `drawable-port-${d}`, "splash.png"));
    await compor(logo, 480 * f, 320 * f, 0.55, PRETO, path.join(RES, `drawable-land-${d}`, "splash.png"));
  }
  console.log("✓ ícones e splash gerados em android/app/src/main/res");
}

main();
