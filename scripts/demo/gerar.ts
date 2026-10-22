/**
 * Gera a demonstração para o cliente: um único HTML que abre direto no navegador (duplo clique),
 * sem servidor, sem Supabase e sem login. Leva junto o Postgres (PGlite/WASM) já com migrations + seed.
 *
 *   npm run demo              →   dist-demo/Oliveira-Locacoes-Demo.html
 *   npm run demo -- --vazio   →   dist-demo/Oliveira-Locacoes-Demo-Vazio.html (só clientes, fornecedores e placas)
 */
import { build } from "vite";
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { criarBanco } from "../db/pglite";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SAIDA = path.join(RAIZ, "dist-demo");
const TEMP = path.join(SAIDA, "build");
const VAZIO = process.argv.includes("--vazio");
const ARQUIVO = path.join(SAIDA, VAZIO ? "Oliveira-Locacoes-Demo-Vazio.html" : "Oliveira-Locacoes-Demo.html");
const PGLITE = path.join(RAIZ, "node_modules", "@electric-sql", "pglite", "dist");

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const dataUri = (arquivo: string, tipo: string) => `data:${tipo};base64,${readFileSync(arquivo).toString("base64")}`;

// 1. banco com migrations + seed, salvo como tarball do diretório de dados
console.log("→ montando o banco (migrations + seed)…");
const db = await criarBanco({ seed: true });
if (VAZIO) {
  // mesmo script usado no banco real: mantém cadastros (clientes, fornecedores, placas) e zera o resto
  await db.exec(readFileSync(path.join(RAIZ, "scripts", "demo", "zerar-sistema.sql"), "utf8"));
  console.log("  sistema zerado, cadastros mantidos (--vazio)");
}
const dump = Buffer.from(await (await db.dumpDataDir("gzip")).arrayBuffer());
await db.close();
console.log(`  banco: ${mb(dump.length)}`);

// 2. build do app em modo demo
console.log("→ build do sistema (modo demo)…");
rmSync(TEMP, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });
await build({ root: RAIZ, mode: "demo", logLevel: "warn", build: { outDir: TEMP, emptyOutDir: true } });

// 3. tudo num HTML só
console.log("→ juntando num único HTML…");
let html = readFileSync(path.join(TEMP, "index.html"), "utf8");
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/);
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/);
if (!js || !css) throw new Error("Não achei o JS/CSS do build no index.html");

// imagens referenciadas por caminho absoluto (não existem quando o arquivo é aberto do disco):
// cada uso vira uma leitura de variável global, definida uma vez só no HTML
const imagens: Record<string, string> = {
  "/logo-oliveira.svg": dataUri(path.join(RAIZ, "public", "logo-oliveira.svg"), "image/svg+xml"),
  "/marca/logo-documento.jpg": dataUri(path.join(RAIZ, "public", "marca", "logo-documento.jpg"), "image/jpeg"),
};
let codigo = readFileSync(path.join(TEMP, js[1]), "utf8");
for (const de of Object.keys(imagens)) {
  for (const aspas of ['"', "'", "`"]) codigo = codigo.split(`${aspas}${de}${aspas}`).join(`globalThis.__DEMO_IMG__[${JSON.stringify(de)}]`);
}
codigo = codigo.replace(/<\/script/gi, "<\\/script");
const estilo = readFileSync(path.join(TEMP, css[1]), "utf8");

const embutir = (id: string, dados: Buffer) => `<script type="application/octet-stream" id="${id}">${dados.toString("base64")}</script>`;
const recursos = [
  embutir("demo-pglite-wasm", gzipSync(readFileSync(path.join(PGLITE, "pglite.wasm")), { level: 9 })),
  embutir("demo-initdb-wasm", gzipSync(readFileSync(path.join(PGLITE, "initdb.wasm")), { level: 9 })),
  embutir("demo-pglite-data", gzipSync(readFileSync(path.join(PGLITE, "pglite.data")), { level: 9 })),
  `<script>globalThis.__DEMO_IMG__ = ${JSON.stringify(imagens)};</script>`,
  embutir("demo-banco", dump),
].join("\n");

html = html
  .replace(js[0], () => "")
  .replace(css[0], () => `<style>${estilo}</style>`)
  .replace(/<link rel="manifest"[^>]*>\s*/, "")
  .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, "")
  .replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" type="image/svg+xml" href="${dataUri(path.join(RAIZ, "public", "icons", "icon.svg"), "image/svg+xml")}" />`)
  .replace(/<title>[^<]*<\/title>/, "<title>Oliveira Locações — Demonstração</title>")
  .replace("</body>", () => `${recursos}\n<script type="module">${codigo}</script>\n</body>`);

writeFileSync(ARQUIVO, html);
rmSync(TEMP, { recursive: true, force: true });
console.log(`✓ ${path.relative(RAIZ, ARQUIVO)} (${mb(Buffer.byteLength(html))})`);
