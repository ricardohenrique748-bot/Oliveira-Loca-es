/**
 * Histórico de tentativas de NFS-e (migration 0039): quem lê, quem grava, e que o histórico não é alterável.
 * Migrations + seed em PGlite; perfis e empresas do seed (faturamento só vê OLIVEIRA).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { criarBanco, comoUsuario } from "../../scripts/db/pglite";

const U = {
  admin: "aaaaaaaa-0000-0000-0000-000000000001",
  financeiro: "aaaaaaaa-0000-0000-0000-000000000002",
  faturamento: "aaaaaaaa-0000-0000-0000-000000000003",
  manutencao: "aaaaaaaa-0000-0000-0000-000000000004",
  consulta: "aaaaaaaa-0000-0000-0000-000000000005",
};
const OLIVEIRA = "11111111-0000-0000-0000-000000000001";
const TDTS = "11111111-0000-0000-0000-000000000002";

let db: PGlite;
let fatOliveira: string;
let fatTdts: string;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const inserir = (medicao: string, extra = "") =>
  db.query(`insert into public.nfse_tentativas (medicao_id, ambiente, numero_dps, xml_enviado, http_status, resposta_corpo${extra ? ", " + extra.split("=")[0] : ""})
            values ($1, 'producao', 7, '<DPS/>', 400, '{"erros":[{"Codigo":"E0084"}]}'${extra ? ", " + extra.split("=")[1] : ""}) returning id`, [medicao]);

beforeAll(async () => {
  db = await criarBanco({ seed: true });
  [{ id: fatOliveira }] = await q<{ id: string }>("select id from public.medicoes where empresa_id = $1 limit 1", [OLIVEIRA]);
  [{ id: fatTdts }] = await q<{ id: string }>("select id from public.medicoes where empresa_id = $1 limit 1", [TDTS]);
});
afterAll(async () => {
  await db?.close();
});

describe("nfse_tentativas — gravação", () => {
  it("faturamento grava na fatura da sua empresa; criado_por = usuário logado", async () => {
    const [r] = await comoUsuario(db, U.faturamento, async () => (await inserir(fatOliveira)).rows as { id: string }[]);
    const [t] = await q<{ criado_por: string; criado_em: string }>("select criado_por, criado_em from public.nfse_tentativas where id = $1", [r.id]);
    expect(t.criado_por).toBe(U.faturamento);
    expect(t.criado_em).toBeTruthy();
  });

  it("não grava em fatura de outra empresa, nem se passando por outro usuário", async () => {
    await comoUsuario(db, U.faturamento, async () => {
      await expect(inserir(fatTdts)).rejects.toThrow(/row-level security/);
      await expect(inserir(fatOliveira, `criado_por='${U.admin}'`)).rejects.toThrow(/row-level security/);
    });
  });

  it("manutenção e consulta não gravam", async () => {
    for (const u of [U.manutencao, U.consulta]) {
      await comoUsuario(db, u, async () => {
        await expect(inserir(fatOliveira)).rejects.toThrow(/row-level security/);
      });
    }
  });

  it("exige resposta HTTP ou erro de conexão", async () => {
    await comoUsuario(db, U.admin, async () => {
      await expect(db.query("insert into public.nfse_tentativas (medicao_id, ambiente, xml_enviado) values ($1, 'producao', '<DPS/>')", [fatOliveira]))
        .rejects.toThrow(/nfse_tentativas_resultado_ck/);
    });
  });
});

describe("nfse_tentativas — leitura e histórico", () => {
  const contar = (u: string) => comoUsuario(db, u, async () => (await q<{ n: number }>("select count(*)::int n from public.nfse_tentativas"))[0].n);

  it("quem emite lê; manutenção e consulta não leem nada", async () => {
    expect(await contar(U.faturamento)).toBeGreaterThan(0);
    expect(await contar(U.financeiro)).toBeGreaterThan(0);
    expect(await contar(U.admin)).toBeGreaterThan(0);
    expect(await contar(U.manutencao)).toBe(0);
    expect(await contar(U.consulta)).toBe(0);
  });

  it("faturamento (só OLIVEIRA) não lê tentativas da TDTS", async () => {
    await comoUsuario(db, U.admin, () => inserir(fatTdts));
    const empresas = await comoUsuario(db, U.faturamento, () =>
      q<{ empresa_id: string }>("select distinct m.empresa_id from public.nfse_tentativas t join public.medicoes m on m.id = t.medicao_id"));
    expect(empresas.map((e) => e.empresa_id)).toEqual([OLIVEIRA]);
  });

  it("histórico não é alterado nem apagado pelo app (nem pelo admin)", async () => {
    const antes = await q<{ n: number }>("select count(*)::int n from public.nfse_tentativas");
    await comoUsuario(db, U.admin, async () => {
      await db.query("update public.nfse_tentativas set resposta_corpo = 'x'");
      await db.query("delete from public.nfse_tentativas");
    });
    expect(await q<{ n: number }>("select count(*)::int n from public.nfse_tentativas")).toEqual(antes);
    expect(await q("select 1 from public.nfse_tentativas where resposta_corpo = 'x'")).toHaveLength(0);
  });

  it("anônimo não lê nem grava", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.nfse_tentativas")).rejects.toThrow(/permission denied/);
      await expect(inserir(fatOliveira)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("não altera as faturas existentes", async () => {
    const [m] = await q<{ n: number }>("select count(*)::int n from public.medicoes where nfse_erro is not null or nfse_chave is not null");
    expect(m.n).toBe(0);
  });
});
