/**
 * Modo demonstração: Postgres (PGlite/WASM) rodando no navegador, já com migrations e seed aplicados.
 * Os binários vêm embutidos no próprio HTML (gerado por `npm run demo`), em base64 + gzip.
 * Tudo fica em memória: ao recarregar a página, os dados voltam ao estado inicial.
 */
import { PGlite } from "@electric-sql/pglite";
import { PostgrestDemo } from "./postgrest";

/** admin@oliveira.local do seed */
export const USUARIO_DEMO = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  email: "admin@oliveira.local",
};

async function lerEmbutido(id: string): Promise<Blob> {
  const el = document.getElementById(id);
  if (!el?.textContent) throw new Error(`Recurso da demonstração não encontrado: ${id}`);
  const r = await fetch(`data:application/octet-stream;base64,${el.textContent.trim()}`);
  return r.blob();
}

async function descompactar(blob: Blob): Promise<Blob> {
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).blob();
}

async function iniciar() {
  const [wasm, initdb, fsBundle, dados] = await Promise.all([
    lerEmbutido("demo-pglite-wasm").then(descompactar),
    lerEmbutido("demo-initdb-wasm").then(descompactar),
    lerEmbutido("demo-pglite-data").then(descompactar),
    lerEmbutido("demo-banco"),
  ]);
  const [pgliteWasmModule, initdbWasmModule] = await Promise.all([
    WebAssembly.compile(await wasm.arrayBuffer()),
    WebAssembly.compile(await initdb.arrayBuffer()),
  ]);
  const db = await PGlite.create({ pgliteWasmModule, initdbWasmModule, fsBundle, loadDataDir: dados });
  const rest = new PostgrestDemo(db, () => USUARIO_DEMO.id);
  await rest.carregarCatalogo();
  return { db, rest };
}

let instancia: ReturnType<typeof iniciar> | null = null;

export function banco() {
  instancia ??= iniciar();
  return instancia;
}
