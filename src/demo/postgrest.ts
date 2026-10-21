/**
 * Modo demonstração: atende as requisições REST que o supabase-js faria ao PostgREST,
 * traduzindo-as para SQL no Postgres embutido (PGlite). Cobre o subconjunto usado pelo sistema:
 * select com recursos embutidos (FK, !inner), filtros, or/and/not, ordem, paginação, contagem,
 * insert/upsert/update/delete com retorno e chamadas rpc.
 */
import type { PGlite, Transaction } from "@electric-sql/pglite";

type Fk = { nome: string; tabela: string; colunas: string[]; ref: string; refColunas: string[] };
type Funcao = { args: { nome: string; tipo: string; array: boolean }[]; retset: boolean; composto: boolean; void: boolean };

type ItemSelect =
  | { tipo: "coluna"; expr: string; alias: string | null; cast: string | null }
  | { tipo: "todas" }
  | { tipo: "embed"; nome: string; alias: string | null; dica: string | null; inner: boolean; itens: ItemSelect[] };

type Filtro = { caminho: string[]; chave: string; valor: string };

export class ErroRest extends Error {
  constructor(public status: number, public code: string, message: string, public details: string | null = null, public hint: string | null = null) {
    super(message);
  }
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

// ---------------------------------------------------------------- parsing

/** Divide por vírgula fora de parênteses e aspas. */
function dividir(s: string, sep = ","): string[] {
  const partes: string[] = [];
  let nivel = 0, aspas = false, atual = "";
  for (const c of s) {
    if (c === '"') aspas = !aspas;
    if (!aspas && c === "(") nivel++;
    if (!aspas && c === ")") nivel--;
    if (!aspas && nivel === 0 && c === sep) {
      partes.push(atual);
      atual = "";
    } else atual += c;
  }
  if (atual.length) partes.push(atual);
  return partes;
}

function parseSelect(s: string): ItemSelect[] {
  return dividir(s.replace(/\s+/g, "")).filter(Boolean).map((parte): ItemSelect => {
    const abre = parte.indexOf("(");
    if (abre > 0 && parte.endsWith(")")) {
      let cabeca = parte.slice(0, abre);
      const dentro = parte.slice(abre + 1, -1);
      let alias: string | null = null;
      if (cabeca.includes(":")) [alias, cabeca] = cabeca.split(":");
      const [nome, ...mods] = cabeca.split("!");
      const inner = mods.includes("inner");
      const dica = mods.find((m) => m !== "inner" && m !== "left") ?? null;
      return { tipo: "embed", nome, alias, dica, inner, itens: parseSelect(dentro || "*") };
    }
    if (parte === "*") return { tipo: "todas" };
    let alias: string | null = null;
    let expr = parte;
    const m = expr.match(/^([^:]+):([^:].*)$/);
    if (m) [, alias, expr] = m;
    let cast: string | null = null;
    if (expr.includes("::")) [expr, cast] = expr.split("::");
    return { tipo: "coluna", expr, alias, cast };
  });
}

function desaspar(v: string) {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v;
}

// ---------------------------------------------------------------- tradutor

export class PostgrestDemo {
  private fks: Fk[] = [];
  private pks = new Map<string, string[]>();
  private funcoes = new Map<string, Funcao>();

  constructor(private db: PGlite, private usuarioId: () => string) {}

  async carregarCatalogo() {
    const fks = await this.db.query<{ nome: string; tabela: string; ref: string; colunas: string; ref_colunas: string }>(`
      select c.conname as nome, cl.relname as tabela, rf.relname as ref,
        array_to_json(array(select a.attname::text from unnest(c.conkey) with ordinality k(n, o)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.o))::text as colunas,
        array_to_json(array(select a.attname::text from unnest(c.confkey) with ordinality k(n, o)
          join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.o))::text as ref_colunas
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_class rf on rf.oid = c.confrelid
      join pg_namespace n on n.oid = cl.relnamespace
      where c.contype = 'f' and n.nspname = 'public'
      order by c.conname`);
    this.fks = fks.rows.map((r) => ({ nome: r.nome, tabela: r.tabela, ref: r.ref, colunas: JSON.parse(r.colunas), refColunas: JSON.parse(r.ref_colunas) }));

    const pks = await this.db.query<{ tabela: string; colunas: string }>(`
      select cl.relname as tabela,
        array_to_json(array(select a.attname::text from unnest(i.indkey) with ordinality k(n, o)
          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n order by k.o))::text as colunas
      from pg_index i join pg_class cl on cl.oid = i.indrelid join pg_namespace n on n.oid = cl.relnamespace
      where i.indisprimary and n.nspname = 'public'`);
    for (const r of pks.rows) this.pks.set(r.tabela, JSON.parse(r.colunas));

    const fns = await this.db.query<{ nome: string; nomes: string | null; tipos: string; retset: boolean; composto: boolean; void: boolean }>(`
      select p.proname as nome, array_to_json(p.proargnames)::text as nomes,
        array_to_json(array(select format_type(t, null) from unnest(p.proargtypes) t))::text as tipos,
        p.proretset as retset, (rt.typtype = 'c') as composto, (p.prorettype = 'void'::regtype) as void
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
      where n.nspname = 'public'`);
    for (const f of fns.rows) {
      const nomes: string[] = f.nomes ? JSON.parse(f.nomes) : [];
      const tipos: string[] = JSON.parse(f.tipos);
      this.funcoes.set(f.nome, {
        args: tipos.map((tipo, i) => ({ nome: nomes[i] ?? `$${i + 1}`, tipo, array: tipo.endsWith("[]") })),
        retset: f.retset, composto: f.composto, void: f.void,
      });
    }
  }

  /** Atende uma requisição do supabase-js. */
  async atender(metodo: string, url: URL, headers: Headers, corpo: string | null): Promise<Response> {
    try {
      const caminho = decodeURIComponent(url.pathname.replace(/^.*\/rest\/v1\//, ""));
      const prefer = headers.get("Prefer") ?? "";
      const umObjeto = (headers.get("Accept") ?? "").includes("vnd.pgrst.object");
      const resultado = await this.db.transaction(async (tx) => {
        await tx.query(
          `select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true),
                  set_config('request.jwt.claims', $2, true)`,
          [this.usuarioId(), JSON.stringify({ sub: this.usuarioId(), role: "authenticated" })],
        );
        await tx.exec("set local role authenticated");
        if (caminho.startsWith("rpc/")) return this.rpc(tx, caminho.slice(4), metodo === "GET" ? Object.fromEntries(url.searchParams) : JSON.parse(corpo || "{}"));
        return this.tabela(tx, metodo, caminho, url.searchParams, prefer, corpo);
      });
      return this.responder(metodo, resultado, umObjeto);
    } catch (e) {
      return erroResposta(e);
    }
  }

  private responder(metodo: string, r: { corpo: unknown; total: number | null; inicio: number; minimo?: boolean }, umObjeto: boolean): Response {
    const h = new Headers({ "Content-Type": "application/json" });
    const linhas = Array.isArray(r.corpo) ? r.corpo.length : 0;
    if (r.total !== null) h.set("Content-Range", linhas ? `${r.inicio}-${r.inicio + linhas - 1}/${r.total}` : `*/${r.total}`);
    if (metodo === "HEAD") return new Response(null, { status: 200, headers: h });
    if (umObjeto && Array.isArray(r.corpo)) {
      if (r.corpo.length !== 1) {
        return json(406, {
          code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned",
          details: `The result contains ${r.corpo.length} rows`, hint: null,
        });
      }
      return new Response(JSON.stringify(r.corpo[0]), { status: 200, headers: h });
    }
    if (r.minimo) return new Response(null, { status: metodo === "POST" ? 201 : 204, headers: h });
    if (r.corpo === undefined) return new Response(null, { status: 204, headers: h });
    return new Response(JSON.stringify(r.corpo), { status: metodo === "POST" ? 201 : 200, headers: h });
  }

  // ------------------------------------------------------------ tabelas e views

  private async tabela(tx: Transaction, metodo: string, tabela: string, params: URLSearchParams, prefer: string, corpo: string | null) {
    const ctx = new Contexto();
    const itens = parseSelect(params.get("select") ?? "*");
    const filtros: Filtro[] = [];
    const reservados = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
    for (const [chave, valor] of params) {
      const partes = chave.split(".");
      const ultimo = partes[partes.length - 1];
      if (reservados.has(chave)) continue;
      if (["order", "limit", "offset"].includes(ultimo) && partes.length > 1) {
        filtros.push({ caminho: partes.slice(0, -1), chave: ultimo, valor });
        continue;
      }
      // or/and/not.or/not.and no nível raiz ou embutido
      if (["or", "and"].includes(ultimo) && (partes.length === 1 || partes[partes.length - 2] !== "not")) {
        filtros.push({ caminho: partes.slice(0, -1), chave: ultimo, valor });
      } else if (["or", "and"].includes(ultimo)) {
        filtros.push({ caminho: partes.slice(0, -2), chave: `not.${ultimo}`, valor });
      } else {
        filtros.push({ caminho: partes.slice(0, -1), chave: ultimo, valor });
      }
    }

    const contar = /count=(exact|planned|estimated)/.test(prefer);
    const inicio = Number(params.get("offset") ?? 0);
    const limite = params.get("limit");

    if (metodo === "GET" || metodo === "HEAD") {
      const alias = ctx.alias();
      const nivel = this.nivel(ctx, tabela, alias, itens, filtros, []);
      const where = nivel.condicoes.length ? `where ${nivel.condicoes.join(" and ")}` : "";
      const ordem = this.ordem(params.get("order"), alias);
      const sql = `select coalesce(json_agg(_r), '[]'::json)::text as corpo from (
        select ${nivel.colunas.join(", ")} from ${q(tabela)} as ${q(alias)} ${where} ${ordem}
        ${limite !== null ? `limit ${Number(limite)}` : ""} ${inicio ? `offset ${inicio}` : ""}) _r`;
      const res = await tx.query<{ corpo: string }>(sql, ctx.params);
      let total: number | null = null;
      if (contar) {
        // conta sobre a mesma consulta (sem paginação) para usar todos os parâmetros
        const c = await tx.query<{ n: number }>(
          `select count(*)::int as n from (select ${nivel.colunas.join(", ")} from ${q(tabela)} as ${q(alias)} ${where}) _c`, ctx.params);
        total = c.rows[0].n;
      }
      return { corpo: JSON.parse(res.rows[0].corpo), total, inicio };
    }

    // mutações: o CTE recebe o mesmo alias da consulta de retorno
    const alias = ctx.alias();
    let cte: string;
    if (metodo === "POST") {
      const dados = JSON.parse(corpo || "[]");
      const linhas: Record<string, unknown>[] = Array.isArray(dados) ? dados : [dados];
      const colunas = params.get("columns")?.split(",").map((c) => c.replace(/"/g, "")) ?? [...new Set(linhas.flatMap((l) => Object.keys(l)))];
      const p = ctx.param(JSON.stringify(linhas));
      const lista = colunas.map(q).join(", ");
      let conflito = "";
      if (prefer.includes("resolution=")) {
        const alvo = params.get("on_conflict")?.split(",") ?? this.pks.get(tabela) ?? ["id"];
        const atualizar = colunas.filter((c) => !alvo.includes(c));
        conflito = prefer.includes("ignore-duplicates") || !atualizar.length
          ? `on conflict (${alvo.map(q).join(", ")}) do nothing`
          : `on conflict (${alvo.map(q).join(", ")}) do update set ${atualizar.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}`;
      }
      cte = `insert into ${q(tabela)} (${lista}) select ${lista} from json_populate_recordset(null::${q(tabela)}, ${p}::json) ${conflito} returning *`;
    } else if (metodo === "PATCH") {
      const dados = JSON.parse(corpo || "{}") as Record<string, unknown>;
      const p = ctx.param(JSON.stringify(dados));
      const conds = this.nivel(ctx, tabela, alias, [], filtros, []).condicoes;
      const sets = Object.keys(dados).map((c) => `${q(c)} = _j.${q(c)}`).join(", ");
      cte = `update ${q(tabela)} as ${q(alias)} set ${sets} from json_populate_record(null::${q(tabela)}, ${p}::json) as _j
        ${conds.length ? `where ${conds.join(" and ")}` : ""} returning ${q(alias)}.*`;
    } else if (metodo === "DELETE") {
      const conds = this.nivel(ctx, tabela, alias, [], filtros, []).condicoes;
      cte = `delete from ${q(tabela)} as ${q(alias)} ${conds.length ? `where ${conds.join(" and ")}` : ""} returning ${q(alias)}.*`;
    } else {
      throw new ErroRest(405, "PGRST117", `Método ${metodo} não suportado`);
    }

    const retorno = this.nivel(ctx, tabela, alias, itens, filtros.filter((f) => f.caminho.length > 0), []);
    const sql = `with ${q(alias)} as (${cte})
      select (select coalesce(json_agg(_r), '[]'::json) from (select ${retorno.colunas.join(", ")} from ${q(alias)}) _r)::text as corpo,
             (select count(*)::int from ${q(alias)}) as n`;
    const res = await tx.query<{ corpo: string; n: number }>(sql, ctx.params);
    const quer = prefer.includes("return=representation");
    return { corpo: quer ? JSON.parse(res.rows[0].corpo) : [], total: contar ? res.rows[0].n : null, inicio: 0, minimo: !quer };
  }

  /** Monta colunas e condições de um nível (tabela raiz ou embutida). */
  private nivel(ctx: Contexto, tabela: string, alias: string, itens: ItemSelect[], filtros: Filtro[], caminho: string[]) {
    const colunas: string[] = [];
    const condicoes: string[] = [];
    const embeds = new Map<string, string>();

    for (const item of itens) {
      if (item.tipo === "todas") colunas.push(`${q(alias)}.*`);
      else if (item.tipo === "coluna") {
        const nome = item.alias ?? item.expr;
        colunas.push(`${this.coluna(alias, item.expr)}${item.cast ? `::${item.cast}` : ""} as ${q(nome)}`);
      } else {
        const nome = item.alias ?? item.nome;
        const expr = this.embed(ctx, tabela, alias, item, filtros, [...caminho, nome]);
        colunas.push(`${expr.sql} as ${q(nome)}`);
        embeds.set(nome, expr.sql);
        if (item.inner) condicoes.push(expr.objeto ? `(${expr.sql}) is not null` : `json_array_length(${expr.sql}) > 0`);
      }
    }
    if (!colunas.length) colunas.push(`${q(alias)}.*`);

    for (const f of filtros) {
      if (f.caminho.length !== caminho.length || f.caminho.some((c, i) => c !== caminho[i])) continue;
      if (["order", "limit", "offset"].includes(f.chave)) continue;
      if (f.chave === "or" || f.chave === "and" || f.chave === "not.or" || f.chave === "not.and") {
        const neg = f.chave.startsWith("not.");
        const op = f.chave.replace("not.", "");
        condicoes.push(`${neg ? "not " : ""}${this.logico(ctx, alias, op, f.valor.replace(/^\(|\)$/g, ""), embeds)}`);
      } else {
        condicoes.push(this.condicao(ctx, alias, f.chave, f.valor, embeds));
      }
    }
    return { colunas, condicoes };
  }

  private embed(ctx: Contexto, pai: string, aliasPai: string, item: Extract<ItemSelect, { tipo: "embed" }>, filtros: Filtro[], caminho: string[]) {
    const alvo = item.nome;
    const combina = (fk: Fk) => !item.dica || fk.nome === item.dica || fk.colunas.includes(item.dica) || fk.refColunas.includes(item.dica);
    const aliasFilho = ctx.alias();
    let juncao: string;
    let objeto: boolean;
    const muitosParaUm = this.fks.find((fk) => fk.tabela === pai && fk.ref === alvo && combina(fk));
    const umParaMuitos = !muitosParaUm && this.fks.find((fk) => fk.tabela === alvo && fk.ref === pai && combina(fk));
    if (muitosParaUm) {
      objeto = true;
      juncao = muitosParaUm.colunas.map((c, i) => `${q(aliasFilho)}.${q(muitosParaUm.refColunas[i])} = ${q(aliasPai)}.${q(c)}`).join(" and ");
    } else if (umParaMuitos) {
      objeto = false;
      juncao = umParaMuitos.colunas.map((c, i) => `${q(aliasFilho)}.${q(c)} = ${q(aliasPai)}.${q(umParaMuitos.refColunas[i])}`).join(" and ");
    } else {
      throw new ErroRest(400, "PGRST200", `Could not find a relationship between '${pai}' and '${alvo}' in the schema cache`);
    }
    const nivel = this.nivel(ctx, alvo, aliasFilho, item.itens, filtros, caminho);
    const where = [juncao, ...nivel.condicoes].join(" and ");
    const chave = caminho.join(".");
    const ordem = filtros.find((f) => f.caminho.join(".") === chave && f.chave === "order");
    const limite = filtros.find((f) => f.caminho.join(".") === chave && f.chave === "limit");
    const sub = `select ${nivel.colunas.join(", ")} from ${q(alvo)} as ${q(aliasFilho)} where ${where}
      ${ordem ? this.ordem(ordem.valor, aliasFilho) : ""} ${objeto ? "limit 1" : limite ? `limit ${Number(limite.valor)}` : ""}`;
    const sql = objeto
      ? `(select row_to_json(_e) from (${sub}) _e)`
      : `coalesce((select json_agg(_e) from (${sub}) _e), '[]'::json)`;
    return { sql, objeto };
  }

  private coluna(alias: string, expr: string) {
    // suporte simples a json: col->chave / col->>chave
    const m = expr.match(/^([^-]+)(->>?)(.+)$/);
    if (m) return `${q(alias)}.${q(m[1])}${m[2]}'${m[3].replace(/'/g, "''")}'`;
    return `${q(alias)}.${q(expr)}`;
  }

  private ordem(ordem: string | null, alias: string) {
    if (!ordem) return "";
    const partes = dividir(ordem).map((p) => {
      const [col, ...mods] = p.split(".");
      const dir = mods.includes("desc") ? "desc" : "asc";
      const nulos = mods.includes("nullsfirst") ? "nulls first" : mods.includes("nullslast") ? "nulls last" : "";
      return `${this.coluna(alias, col)} ${dir} ${nulos}`;
    });
    return `order by ${partes.join(", ")}`;
  }

  private logico(ctx: Contexto, alias: string, op: string, conteudo: string, embeds: Map<string, string>): string {
    const partes = dividir(conteudo).map((p) => {
      const m = p.match(/^(not\.)?(and|or)\((.*)\)$/);
      if (m) return `${m[1] ? "not " : ""}${this.logico(ctx, alias, m[2], m[3], embeds)}`;
      const i = p.indexOf(".");
      return this.condicao(ctx, alias, p.slice(0, i), p.slice(i + 1), embeds);
    });
    if (!partes.length) return "true";
    return `(${partes.join(op === "or" ? " or " : " and ")})`;
  }

  private condicao(ctx: Contexto, alias: string, coluna: string, expr: string, embeds: Map<string, string>): string {
    let neg = false;
    if (expr.startsWith("not.")) {
      neg = true;
      expr = expr.slice(4);
    }
    const i = expr.indexOf(".");
    let op = expr.slice(0, i);
    const valor = expr.slice(i + 1);
    op = op.replace(/\(.*\)$/, "");
    const embed = embeds.get(coluna);
    const col = embed ?? this.coluna(alias, coluna);
    let sql: string;
    switch (op) {
      case "eq": sql = `${col} = ${ctx.param(valor)}`; break;
      case "neq": sql = `${col} <> ${ctx.param(valor)}`; break;
      case "gt": sql = `${col} > ${ctx.param(valor)}`; break;
      case "gte": sql = `${col} >= ${ctx.param(valor)}`; break;
      case "lt": sql = `${col} < ${ctx.param(valor)}`; break;
      case "lte": sql = `${col} <= ${ctx.param(valor)}`; break;
      case "like": sql = `${col}::text like ${ctx.param(valor.replace(/\*/g, "%"))}`; break;
      case "ilike": sql = `${col}::text ilike ${ctx.param(valor.replace(/\*/g, "%"))}`; break;
      case "match": sql = `${col}::text ~ ${ctx.param(valor)}`; break;
      case "imatch": sql = `${col}::text ~* ${ctx.param(valor)}`; break;
      case "is": {
        const v = valor.toLowerCase();
        sql = `${col} is ${v === "null" ? "null" : v === "true" ? "true" : v === "false" ? "false" : "unknown"}`;
        break;
      }
      case "in": {
        const itens = dividir(valor.replace(/^\(|\)$/g, "")).map(desaspar);
        sql = itens.length ? `${col} in (${itens.map((v) => ctx.param(v)).join(", ")})` : "false";
        break;
      }
      case "cs": sql = `${col} @> ${ctx.param(valor)}`; break;
      case "cd": sql = `${col} <@ ${ctx.param(valor)}`; break;
      case "ov": sql = `${col} && ${ctx.param(valor)}`; break;
      default:
        throw new ErroRest(400, "PGRST100", `Operador '${op}' não suportado na demonstração`);
    }
    return neg ? `not (${sql})` : sql;
  }

  // ------------------------------------------------------------ rpc

  private async rpc(tx: Transaction, nome: string, args: Record<string, unknown>) {
    const fn = this.funcoes.get(nome);
    if (!fn) throw new ErroRest(404, "PGRST202", `Could not find the function public.${nome} in the schema cache`);
    const ctx = new Contexto();
    const lista = fn.args
      .filter((a) => a.nome in args)
      .map((a) => {
        const v = args[a.nome];
        let expr: string;
        if (v === null || v === undefined) expr = `null::${a.tipo}`;
        else if (a.tipo === "json" || a.tipo === "jsonb") expr = `${ctx.param(JSON.stringify(v))}::${a.tipo}`;
        else if (a.array) expr = `(select coalesce(array_agg(x), '{}') from json_array_elements_text(${ctx.param(JSON.stringify(v))}::json) x)::${a.tipo}`;
        else expr = `${ctx.param(typeof v === "object" ? JSON.stringify(v) : String(v))}::${a.tipo}`;
        return `${q(a.nome)} => ${expr}`;
      })
      .join(", ");
    const chamada = `public.${q(nome)}(${lista})`;
    if (fn.void) {
      await tx.query(`select ${chamada}`, ctx.params);
      return { corpo: undefined, total: null, inicio: 0 };
    }
    const sql = fn.retset
      ? `select coalesce(json_agg(_r), '[]'::json)::text as corpo from ${chamada} _r`
      : fn.composto
        ? `select row_to_json(_r)::text as corpo from ${chamada} _r`
        : `select to_json(${chamada})::text as corpo`;
    const res = await tx.query<{ corpo: string | null }>(sql, ctx.params);
    return { corpo: JSON.parse(res.rows[0]?.corpo ?? "null"), total: null, inicio: 0 };
  }
}

class Contexto {
  params: unknown[] = [];
  private n = 0;
  alias() {
    return `t${this.n++}`;
  }
  param(v: unknown) {
    this.params.push(v);
    return `$${this.params.length}`;
  }
}

function json(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function erroResposta(e: unknown): Response {
  if (e instanceof ErroRest) return json(e.status, { code: e.code, message: e.message, details: e.details, hint: e.hint });
  const pg = e as { code?: string; message?: string; detail?: string; hint?: string };
  const status = pg.code === "42501" ? 403 : pg.code === "23505" || pg.code === "23503" ? 409 : pg.code === "P0002" ? 404 : 400;
  console.warn("[demo] erro SQL:", pg.message);
  return json(status, { code: pg.code ?? "", message: pg.message ?? String(e), details: pg.detail ?? null, hint: pg.hint ?? null });
}
