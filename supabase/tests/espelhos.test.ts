/**
 * Espelho de horas (migration 0057): total calculado, permissões, link público e aprovação do cliente.
 * Migrations + seed em PGlite; perfis e empresas do seed (faturamento só vê OLIVEIRA).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { criarBanco, comoUsuario } from "../../scripts/db/pglite";

const U = {
  admin: "aaaaaaaa-0000-0000-0000-000000000001",
  faturamento: "aaaaaaaa-0000-0000-0000-000000000003",
  manutencao: "aaaaaaaa-0000-0000-0000-000000000004",
  consulta: "aaaaaaaa-0000-0000-0000-000000000005",
};
const OLIVEIRA = "11111111-0000-0000-0000-000000000001";

let db: PGlite;
let veiculo: string;
let cliente: string;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const LINHAS = JSON.stringify([
  { dia: 1, inicio: "07:00", fim: "17:00", intervalo: 1, horas: 9, obs: null },
  { dia: 2, inicio: "07:00", fim: "12:00", intervalo: null, horas: 5, obs: "meio período" },
  { dia: 3, inicio: null, fim: null, intervalo: null, horas: null, obs: null },
]);

const criar = (competencia: string) =>
  db.query<{ id: string; token: string; total_horas: string }>(
    `insert into public.espelhos (empresa_id, veiculo_id, cliente_id, competencia, linhas)
     values ($1, $2, $3, $4, $5::jsonb) returning id, token::text, total_horas`,
    [OLIVEIRA, veiculo, cliente, competencia, LINHAS]);

/** chamada sem login, como o PostgREST faz com a chave anon */
async function comoAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const publico = async (token: string) =>
  (await q<{ r: Record<string, unknown> | null }>("select public.fn_espelho_publico($1) as r", [token]))[0].r;
const responder = (token: string, aprovado: boolean, nome: string, motivo: string | null = null) =>
  db.query("select public.fn_responder_espelho($1, $2, $3, $4)", [token, aprovado, nome, motivo]);

beforeAll(async () => {
  db = await criarBanco({ seed: true });
  [{ id: veiculo }] = await q<{ id: string }>("select id from public.veiculos where empresa_id = $1 order by placa limit 1", [OLIVEIRA]);
  [{ id: cliente }] = await q<{ id: string }>("select id from public.clientes order by razao_social limit 1");
});
afterAll(async () => {
  await db?.close();
});

describe("espelhos — cadastro", () => {
  it("faturamento cria; total de horas sai das linhas", async () => {
    const [e] = await comoUsuario(db, U.faturamento, async () => (await criar("2026-10-01")).rows);
    expect(Number(e.total_horas)).toBe(14);
  });

  it("competência precisa ser o dia 1 do mês e não aceita mais de 30 linhas", async () => {
    await comoUsuario(db, U.admin, async () => {
      await expect(criar("2026-10-15")).rejects.toThrow(/check/);
      const muitas = JSON.stringify(Array.from({ length: 31 }, (_, i) => ({ dia: i + 1 })));
      await expect(db.query(
        "insert into public.espelhos (empresa_id, veiculo_id, cliente_id, competencia, linhas) values ($1, $2, $3, '2026-07-01', $4::jsonb)",
        [OLIVEIRA, veiculo, cliente, muitas])).rejects.toThrow(/check/);
    });
  });

  it("manutenção e consulta não gravam", async () => {
    for (const u of [U.manutencao, U.consulta]) {
      await comoUsuario(db, u, async () => {
        await expect(criar("2026-09-01")).rejects.toThrow(/row-level security/);
      });
    }
  });
});

describe("espelhos — link do cliente", () => {
  it("rascunho não aparece no link; enviado aparece com placa, cliente e linhas", async () => {
    const [e] = (await criar("2026-08-01")).rows;
    expect(await comoAnon(() => publico(e.token))).toBeNull();

    await q("update public.espelhos set status = 'enviado', enviado_em = now() where id = $1", [e.id]);
    const r = await comoAnon(() => publico(e.token));
    expect(r).toMatchObject({ status: "enviado", competencia: "2026-08-01", total_horas: 14 });
    expect(r?.placa).toBeTruthy();
    expect(r?.cliente).toBeTruthy();
    expect((r?.linhas as unknown[]).length).toBe(3);
  });

  it("token desconhecido devolve nulo; sem login a tabela não mostra nenhum espelho (nem os tokens)", async () => {
    expect(await comoAnon(() => publico("00000000-0000-0000-0000-000000000000"))).toBeNull();
    expect(await comoAnon(() => q("select token from public.espelhos"))).toEqual([]);
    await comoAnon(async () => {
      await expect(q("update public.espelhos set status = 'aprovado' returning id")).resolves.toEqual([]);
    });
  });

  it("recusa exige nome e motivo; depois de recusado, reenviado e aprovado, fica travado", async () => {
    const [e] = (await criar("2026-06-01")).rows;
    await q("update public.espelhos set status = 'enviado', enviado_em = now() where id = $1", [e.id]);

    await comoAnon(async () => {
      await expect(responder(e.token, false, "Jo")).rejects.toThrow(/nome/);
      await expect(responder(e.token, false, "João Cliente")).rejects.toThrow(/motivo/);
      await responder(e.token, false, "João Cliente", "Dia 2 foi período integral");
    });
    let [s] = await q<{ status: string; motivo_recusa: string; respondido_por: string }>(
      "select status, motivo_recusa, respondido_por from public.espelhos where id = $1", [e.id]);
    expect(s).toMatchObject({ status: "recusado", motivo_recusa: "Dia 2 foi período integral", respondido_por: "João Cliente" });

    // recusado não pode ser respondido de novo pelo link até ser reenviado
    await comoAnon(async () => {
      await expect(responder(e.token, true, "João Cliente")).rejects.toThrow(/já foi respondido/);
    });

    await q("update public.espelhos set status = 'enviado', respondido_em = null, respondido_por = null, motivo_recusa = null where id = $1", [e.id]);
    await comoAnon(() => responder(e.token, true, "João Cliente"));
    [s] = await q("select status, motivo_recusa, respondido_por from public.espelhos where id = $1", [e.id]);
    expect(s).toMatchObject({ status: "aprovado", motivo_recusa: null });

    await comoUsuario(db, U.admin, async () => {
      await expect(q("update public.espelhos set linhas = '[]'::jsonb where id = $1", [e.id])).rejects.toThrow(/aprovado/);
    });
  });
});
