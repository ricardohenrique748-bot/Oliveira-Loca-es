/** npm run icones — gera os PNGs do PWA a partir de public/icons/icon.svg (troque o SVG pelo logo oficial). */
import sharp from "sharp";
import { readFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(__dirname, "..", "public", "icons");
const svg = readFileSync(path.join(dir, "icon.svg"));

async function main() {
  await sharp(svg).resize(192, 192).png().toFile(path.join(dir, "icon-192.png"));
  await sharp(svg).resize(512, 512).png().toFile(path.join(dir, "icon-512.png"));
  await sharp(svg).resize(180, 180).png().toFile(path.join(dir, "apple-touch-icon.png"));
  // maskable: arte nos 80% centrais sobre fundo preto da marca
  const miolo = await sharp(svg).resize(410, 410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0B0B0B" } })
    .composite([{ input: miolo, gravity: "center" }]).png().toFile(path.join(dir, "icon-maskable-512.png"));
  console.log("✓ ícones gerados em public/icons");
}

main();
