/**
 * Gera src/lib/supabase/database.types.ts no formato do `supabase gen types typescript`
 * a partir das migrations aplicadas em PGlite (útil sem Docker).
 * Com o Supabase local rodando, prefira:  npm run db:types
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
import { criarBanco } from "./pglite";

const SAIDA = path.resolve(AQUI, "..", "..", "src", "lib", "supabase", "database.types.ts");

type Col = {
  tabela: string; coluna: string; tipo: string; udt: string; nulo: boolean; tem_default: boolean;
  identidade: boolean; gerada: boolean; is_view: boolean; ordem: number;
};

const NUM = new Set(["int2", "int4", "int8", "numeric", "float4", "float8", "serial", "bigserial"]);
const STR = new Set(["text", "varchar", "bpchar", "uuid", "date", "timestamptz", "timestamp", "time", "interval", "citext", "name"]);

function tsTipo(udt: string, enums: Set<string>): string {
  const arr = udt.startsWith("_");
  const base = arr ? udt.slice(1) : udt;
  let t: string;
  if (NUM.has(base)) t = "number";
  else if (STR.has(base)) t = "string";
  else if (base === "bool") t = "boolean";
  else if (base === "json" || base === "jsonb") t = "Json";
  else if (enums.has(base)) t = `Database["public"]["Enums"]["${base}"]`;
  else t = "unknown";
  return arr ? `${t}[]` : t;
}

const ind = (n: number) => "  ".repeat(n);

async function main() {
  const db = await criarBanco();

  const enumRows = (await db.query<{ nome: string; valores: string[] }>(`
    select t.typname as nome, array_agg(e.enumlabel order by e.enumsortorder) as valores
      from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' group by t.typname order by t.typname`)).rows;
  const enums = new Set(enumRows.map((e) => e.nome));

  const cols = (await db.query<Col>(`
    select c.relname as tabela, a.attname as coluna, format_type(a.atttypid, a.atttypmod) as tipo,
           t.typname as udt, not a.attnotnull as nulo, a.atthasdef as tem_default,
           a.attidentity <> '' as identidade, a.attgenerated <> '' as gerada,
           c.relkind = 'v' as is_view, a.attnum as ordem
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      join pg_type t on t.oid = a.atttypid
     where n.nspname = 'public' and c.relkind in ('r','v') and a.attnum > 0 and not a.attisdropped
     order by c.relname, a.attname`)).rows;

  const fks = (await db.query<{ tabela: string; nome: string; colunas: string[]; ref: string; ref_colunas: string[]; one: boolean }>(`
    select c.relname as tabela, con.conname as nome,
           array(select attname from pg_attribute where attrelid = con.conrelid and attnum = any(con.conkey)) as colunas,
           rc.relname as ref,
           array(select attname from pg_attribute where attrelid = con.confrelid and attnum = any(con.confkey)) as ref_colunas,
           exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique and i.indpred is null
                     and i.indkey::int2[] @> con.conkey and array_length(i.indkey::int2[], 1) = array_length(con.conkey, 1)) as one
      from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_class rc on rc.oid = con.confrelid
      join pg_namespace n on n.oid = c.relnamespace join pg_namespace rn on rn.oid = rc.relnamespace
     where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
     order by c.relname, con.conname`)).rows;

  const funcs = (await db.query<{ nome: string; args: string | null; retorno: string; retset: boolean; ret_udt: string; ret_rel: string | null; ret_kind: string | null }>(`
    select p.proname as nome, pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as retorno,
           p.proretset as retset, t.typname as ret_udt, rc.relname as ret_rel, rc.relkind::text as ret_kind
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
      left join pg_class rc on rc.oid = t.typrelid
     where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'fn\\_%'
     order by p.proname`)).rows;

  const porRel = new Map<string, Col[]>();
  for (const c of cols) {
    if (!porRel.has(c.tabela)) porRel.set(c.tabela, []);
    porRel.get(c.tabela)!.push(c);
  }

  const relacoes = (tabela: string) => {
    const lista = fks.filter((f) => f.tabela === tabela);
    if (!lista.length) return "[]";
    return "[\n" + lista.map((f) => [
      `${ind(5)}{`,
      `${ind(6)}foreignKeyName: "${f.nome}"`,
      `${ind(6)}columns: [${f.colunas.map((c) => `"${c}"`).join(", ")}]`,
      `${ind(6)}isOneToOne: ${f.one}`,
      `${ind(6)}referencedRelation: "${f.ref}"`,
      `${ind(6)}referencedColumns: [${f.ref_colunas.map((c) => `"${c}"`).join(", ")}]`,
      `${ind(5)}},`,
    ].join("\n")).join("\n") + `\n${ind(4)}]`;
  };

  const linhas: string[] = [];
  linhas.push("// Gerado por scripts/db/gen-types.ts — não editar à mão.");
  linhas.push("// Com o Supabase local rodando, regenere com: npm run db:types");
  linhas.push("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]\n");
  linhas.push("export type Database = {");
  linhas.push(`${ind(1)}public: {`);

  // Tables
  linhas.push(`${ind(2)}Tables: {`);
  for (const [rel, cs] of [...porRel].filter(([, cs]) => !cs[0].is_view)) {
    linhas.push(`${ind(3)}${rel}: {`);
    linhas.push(`${ind(4)}Row: {`);
    for (const c of cs) linhas.push(`${ind(5)}${c.coluna}: ${tsTipo(c.udt, enums)}${c.nulo ? " | null" : ""}`);
    linhas.push(`${ind(4)}}`);
    linhas.push(`${ind(4)}Insert: {`);
    for (const c of cs) {
      if (c.gerada) { linhas.push(`${ind(5)}${c.coluna}?: never`); continue; }
      const opc = c.nulo || c.tem_default || c.identidade;
      linhas.push(`${ind(5)}${c.coluna}${opc ? "?" : ""}: ${tsTipo(c.udt, enums)}${c.nulo ? " | null" : ""}`);
    }
    linhas.push(`${ind(4)}}`);
    linhas.push(`${ind(4)}Update: {`);
    for (const c of cs) {
      if (c.gerada) { linhas.push(`${ind(5)}${c.coluna}?: never`); continue; }
      linhas.push(`${ind(5)}${c.coluna}?: ${tsTipo(c.udt, enums)}${c.nulo ? " | null" : ""}`);
    }
    linhas.push(`${ind(4)}}`);
    linhas.push(`${ind(4)}Relationships: ${relacoes(rel)}`);
    linhas.push(`${ind(3)}}`);
  }
  linhas.push(`${ind(2)}}`);

  // Views
  linhas.push(`${ind(2)}Views: {`);
  for (const [rel, cs] of [...porRel].filter(([, cs]) => cs[0].is_view)) {
    linhas.push(`${ind(3)}${rel}: {`);
    linhas.push(`${ind(4)}Row: {`);
    for (const c of cs) linhas.push(`${ind(5)}${c.coluna}: ${tsTipo(c.udt, enums)} | null`);
    linhas.push(`${ind(4)}}`);
    linhas.push(`${ind(4)}Relationships: []`);
    linhas.push(`${ind(3)}}`);
  }
  linhas.push(`${ind(2)}}`);

  // Functions
  const udtDe = (tipoSql: string): string => {
    const t = tipoSql.trim().replace(/^public\./, "");
    const mapa: Record<string, string> = {
      uuid: "uuid", date: "date", text: "text", boolean: "bool", integer: "int4", int: "int4", numeric: "numeric",
      bigint: "int8", "timestamp with time zone": "timestamptz", "uuid[]": "_uuid", jsonb: "jsonb",
    };
    return mapa[t] ?? t;
  };
  linhas.push(`${ind(2)}Functions: {`);
  for (const f of funcs) {
    linhas.push(`${ind(3)}${f.nome}: {`);
    const args = (f.args ?? "").split(/,(?![^()]*\))/).map((a) => a.trim()).filter(Boolean);
    linhas.push(`${ind(4)}Args: {`);
    for (const a of args) {
      const m = /^(?:IN\s+)?(\w+)\s+(.+?)(\s+DEFAULT\s+.+)?$/i.exec(a);
      if (!m) continue;
      linhas.push(`${ind(5)}${m[1]}${m[3] ? "?" : ""}: ${tsTipo(udtDe(m[2]), enums)}`);
    }
    linhas.push(`${ind(4)}}`);
    let ret: string;
    const tab = /^TABLE\((.*)\)$/i.exec(f.retorno);
    if (tab) {
      const campos = tab[1].split(/,(?![^()]*\))/).map((x) => x.trim()).map((x) => {
        const [n, ...t] = x.split(/\s+/);
        return `${n}: ${tsTipo(udtDe(t.join(" ")), enums)}`;
      });
      ret = `{ ${campos.join("; ")} }[]`;
    } else if (f.ret_rel && f.ret_kind === "r") {
      const cs = porRel.get(f.ret_rel) ?? [];
      ret = `{ ${cs.map((c) => `${c.coluna}: ${tsTipo(c.udt, enums)}${c.nulo ? " | null" : ""}`).join("; ")} }${f.retset ? "[]" : ""}`;
    } else {
      ret = tsTipo(f.ret_udt, enums) + (f.retset ? "[]" : "");
    }
    linhas.push(`${ind(4)}Returns: ${ret}`);
    linhas.push(`${ind(3)}}`);
  }
  linhas.push(`${ind(2)}}`);

  linhas.push(`${ind(2)}Enums: {`);
  for (const e of enumRows) linhas.push(`${ind(3)}${e.nome}: ${e.valores.map((v) => `"${v}"`).join(" | ")}`);
  linhas.push(`${ind(2)}}`);
  linhas.push(`${ind(2)}CompositeTypes: {`);
  linhas.push(`${ind(3)}[_ in never]: never`);
  linhas.push(`${ind(2)}}`);
  linhas.push(`${ind(1)}}`);
  linhas.push("}\n");

  linhas.push(`type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
${enumRows.map((e) => `      ${e.nome}: [${e.valores.map((v) => `"${v}"`).join(", ")}],`).join("\n")}
    },
  },
} as const
`);

  writeFileSync(SAIDA, linhas.join("\n"));
  console.log(`✓ ${path.relative(process.cwd(), SAIDA)} (${porRel.size} relações, ${funcs.length} funções, ${enumRows.length} enums)`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
