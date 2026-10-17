/**
 * Testes de integração das funções SQL (migrations + seed em PGlite) e paridade
 * com as funções puras de src/lib/calculos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { criarBanco, comoUsuario } from "../../scripts/db/pglite";
import {
  calcularDias,
  calcularPreventiva,
  calcularValorMedicao,
  periodoContendo,
  periodoDaCompetencia,
  type DiaCorte,
} from "../../src/lib/calculos";

const HOJE = "2026-10-16";
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
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const num = (v: unknown) => Number(v);

beforeAll(async () => {
  db = await criarBanco({ seed: true, hoje: HOJE });
});
afterAll(async () => {
  await db?.close();
});

describe("paridade SQL × TypeScript", () => {
  const competencias = ["2026-01", "2026-02", "2026-09", "2026-10", "2026-12", "2027-02", "2028-02"];
  const inicios = ["2025-01-01", "2026-01-15", "2026-02-10", "2026-09-16", "2026-10-02", "2026-12-25", "2027-02-21"];
  const fins: (string | null)[] = [null, "2026-02-14", "2026-09-30", "2026-10-05", "2027-01-10", "2028-02-28"];

  it("período, dias e valor batem para todas as combinações", async () => {
    let casos = 0;
    for (const corte of [1, 21] as DiaCorte[]) {
      for (const comp of competencias) {
        const p = periodoDaCompetencia(corte, comp);
        const [sqlP] = await q<{ inicio: string; fim: string }>(
          "select inicio::text, fim::text from app.periodo_competencia($1, $2::date)", [corte, `${comp}-01`]);
        expect(sqlP).toEqual(p);
        for (const ini of inicios) {
          for (const fim of fins) {
            if (fim && fim < ini) continue;
            const dias = calcularDias({ periodo: p, dataInicioContrato: ini, dataFimEfetiva: fim });
            const [r] = await q<{ dias: number; valor: string }>(
              "select app.calcular_dias($1::date, $2::date, $3::date, $4::date, 30) as dias, app.valor_proporcional(17345.67, app.calcular_dias($1::date, $2::date, $3::date, $4::date, 30), 30)::text as valor",
              [p.inicio, p.fim, ini, fim]);
            expect(r.dias, `${corte} ${comp} ${ini} ${fim}`).toBe(dias);
            expect(Number(r.valor)).toBe(calcularValorMedicao({ valorMensal: 17345.67, dias }).valorBase);
            casos++;
          }
        }
      }
    }
    expect(casos).toBeGreaterThan(400);
  });

  it("período que contém uma data", async () => {
    for (const corte of [1, 21] as DiaCorte[]) {
      for (const d of ["2026-10-01", "2026-10-20", "2026-10-21", "2026-12-31", "2027-02-28"]) {
        const [r] = await q<{ inicio: string; fim: string }>("select inicio::text, fim::text from app.periodo_contendo($1, $2::date)", [corte, d]);
        expect(r).toEqual(periodoContendo(corte, d));
      }
    }
  });

  it("preventiva", async () => {
    const casos = [
      { plano: { intervaloKm: 10000, intervaloDias: 180, ultimaKm: 120000, ultimaData: "2026-06-01" }, atual: { km: 129500, data: "2026-08-01" } },
      { plano: { intervaloKm: 10000, intervaloDias: 180, ultimaKm: 120000, ultimaData: "2026-06-01" }, atual: { km: 122000, data: "2026-12-01" } },
      { plano: { intervaloHoras: 250, ultimaHoras: 4100 }, atual: { horas: 4330, data: "2026-10-16" } },
      { plano: { intervaloKm: 10000 }, atual: { km: 1, data: "2026-10-16" } },
    ];
    for (const c of casos) {
      const ts = calcularPreventiva(c.plano, c.atual);
      const [r] = await q<{ status: string; pct: string; criterio: string | null; restante: string | null }>(
        "select status, pct::text, criterio, restante::text from app.calcular_preventiva($1, $2, $3, $4, $5, $6::date, $7, $8, $9::date, 0.9)",
        [c.plano.intervaloKm ?? null, c.plano.intervaloHoras ?? null, c.plano.intervaloDias ?? null, c.plano.ultimaKm ?? null,
          c.plano.ultimaHoras ?? null, c.plano.ultimaData ?? null, c.atual.km ?? null, c.atual.horas ?? null, c.atual.data]);
      expect(r.status).toBe(ts.status);
      expect(r.criterio).toBe(ts.criterio);
      expect(Number(r.pct)).toBeCloseTo(ts.pct, 6);
      if (ts.restante != null) expect(Number(r.restante)).toBe(ts.restante);
    }
  });
});

describe("medições geradas pelo seed (regra base 30)", () => {
  const med = async (contrato: string, inicio: string) =>
    (await q<{ dias: number; valor_final: string; final: boolean; status: string; data_vencimento: string }>(
      `select dias, valor_final::text, final, status, data_vencimento::text from public.medicoes
        where contrato_id = $1 and periodo_inicio = $2::date and status <> 'cancelado'`, [contrato, inicio]))[0];

  it("período completo = 30 dias / valor mensal", async () => {
    expect(await med("99999999-0000-0000-0000-000000000001", "2026-07-01")).toMatchObject({ dias: 30, valor_final: "18000.00" });
    // corte 21: 21/08 a 20/09
    expect(await med("99999999-0000-0000-0000-000000000002", "2026-08-21")).toMatchObject({ dias: 30, valor_final: "16500.00" });
  });

  it("mobilização no meio do período (21/06–20/07 com início 10/07 = 11 dias)", async () => {
    expect(await med("99999999-0000-0000-0000-000000000004", "2026-06-21")).toMatchObject({ dias: 11, valor_final: "8066.67" });
    expect(await med("99999999-0000-0000-0000-000000000006", "2026-08-01")).toMatchObject({ dias: 20 });
  });

  it("desmobilização (15/08) → medição final proporcional e nada em setembro", async () => {
    expect(await med("99999999-0000-0000-0000-000000000008", "2026-08-01")).toMatchObject({ dias: 15, valor_final: "7500.00", final: true });
    expect(await med("99999999-0000-0000-0000-000000000008", "2026-09-01")).toBeUndefined();
  });

  it("vencimento = emissão + prazo do contrato", async () => {
    // Zopone corte 21, prazo 28: período 21/08–20/09, emissão 21/09 → 19/10
    expect((await med("99999999-0000-0000-0000-000000000002", "2026-08-21")).data_vencimento).toBe("2026-10-19");
  });

  it("status pelos recebimentos (parcial / recebido) e vencido derivado", async () => {
    expect((await med("99999999-0000-0000-0000-000000000003", "2026-08-01")).status).toBe("recebido_parcial");
    expect((await med("99999999-0000-0000-0000-000000000001", "2026-07-01")).status).toBe("recebido");
    const [v] = await q<{ status_exibicao: string }>(
      "select status_exibicao from public.medicoes_v where contrato_id = '99999999-0000-0000-0000-000000000007' and periodo_inicio = '2026-07-21'");
    expect(v.status_exibicao).toBe("vencido");
  });

  it("gerar medições com 1 clique é idempotente e respeita a prévia", async () => {
    const previa = await q<{ contrato_id: string; dias: number; valor_final: string; medicao_id: string | null }>(
      "select contrato_id, dias, valor_final::text, medicao_id from public.fn_gerar_medicoes('2026-10-01', null, null, true)");
    // corte 1 (out/2026) + corte 21 (21/09–20/10) de todos os ativos
    expect(previa.length).toBe(11);
    expect(previa.every((p) => p.medicao_id === null)).toBe(true);
    const antes = num((await q<{ n: number }>("select count(*)::int n from public.medicoes"))[0].n);
    const geradas = await q<{ contrato_id: string; dias: number; valor_final: string }>(
      "select contrato_id, dias, valor_final::text from public.fn_gerar_medicoes('2026-10-01')");
    expect(geradas.map((g) => [g.contrato_id, g.dias, g.valor_final])).toEqual(previa.map((p) => [p.contrato_id, p.dias, p.valor_final]));
    expect((await q("select * from public.fn_gerar_medicoes('2026-10-01')")).length).toBe(0);
    expect(num((await q<{ n: number }>("select count(*)::int n from public.medicoes"))[0].n)).toBe(antes + 11);
    // limpa para não afetar os demais testes
    await db.exec(`delete from public.repasses where medicao_id in (select id from public.medicoes where periodo_fim >= '2026-10-01');
                   delete from public.medicoes where periodo_fim >= '2026-10-01';`);
  });

  it("emitir NF recalcula vencimento, mas vencimento editado é respeitado", async () => {
    const [m] = await q<{ id: string }>("select id from public.medicoes where status = 'a_faturar' limit 1");
    await db.query("update public.medicoes set data_emissao = '2026-10-05', status = 'faturado', numero_nf = '9999' where id = $1", [m.id]);
    const [a] = await q<{ data_vencimento: string }>("select data_vencimento::text from public.medicoes where id = $1", [m.id]);
    await db.query("update public.medicoes set data_vencimento = '2026-11-30' where id = $1", [m.id]);
    await db.query("update public.medicoes set observacoes = 'x' where id = $1", [m.id]);
    const [b] = await q<{ data_vencimento: string }>("select data_vencimento::text from public.medicoes where id = $1", [m.id]);
    expect(a.data_vencimento).toMatch(/^2026-1[01]-/);
    expect(b.data_vencimento).toBe("2026-11-30");
    await db.query("update public.medicoes set status = 'a_faturar', data_emissao = null, data_vencimento = null, numero_nf = null where id = $1", [m.id]);
  });

  it("faturar sem emissão é bloqueado", async () => {
    const [m] = await q<{ id: string }>("select id from public.medicoes where status = 'a_faturar' limit 1");
    await expect(db.query("update public.medicoes set status = 'faturado' where id = $1", [m.id])).rejects.toThrow(/data de emissão/);
  });
});

describe("repasses e abatimentos", () => {
  const V12 = "88888888-0000-0000-0000-000000000012"; // Robson, OS motor 14.800 descontar
  const V11 = "88888888-0000-0000-0000-000000000011"; // Robson, Silcar 4×1.250 + multa 293,47

  it("abatimento maior que o repasse: líquido 0 e saldo passa para o próximo", async () => {
    const r = await q<{ periodo_inicio: string; status: string; valor_bruto: string; valor_abatimentos: string; valor_liquido: string }>(
      `select m.periodo_inicio::text, r.status, r.valor_bruto::text, r.valor_abatimentos::text, r.valor_liquido::text
         from public.repasses r join public.medicoes m on m.id = r.medicao_id
        where r.veiculo_id = $1 order by m.periodo_inicio`, [V12]);
    expect(r).toEqual([
      { periodo_inicio: "2026-06-21", status: "pago", valor_bruto: "12500.00", valor_abatimentos: "0.00", valor_liquido: "12500.00" },
      { periodo_inicio: "2026-07-21", status: "liberado", valor_bruto: "12500.00", valor_abatimentos: "12500.00", valor_liquido: "0.00" },
      { periodo_inicio: "2026-08-21", status: "previsto", valor_bruto: "12500.00", valor_abatimentos: "2300.00", valor_liquido: "10200.00" },
    ]);
    const [ab] = await q<{ ordem_servico_id: string | null }>(
      `select a.ordem_servico_id from public.repasse_abatimentos a join public.repasses r on r.id = a.repasse_id where r.veiculo_id = $1 limit 1`, [V12]);
    expect(ab.ordem_servico_id).toBe("cccccccc-0000-0000-0000-000000000001");
  });

  it("multas/pneus 'Descontar' já vêm abatidos no repasse em aberto mais antigo", async () => {
    const r = await q<{ periodo_inicio: string; valor_abatimentos: string; valor_liquido: string }>(
      `select m.periodo_inicio::text, r.valor_abatimentos::text, r.valor_liquido::text
         from public.repasses r join public.medicoes m on m.id = r.medicao_id
        where r.veiculo_id = $1 and r.status <> 'pago' order by m.periodo_inicio`, [V11]);
    // 4×1.250 + 293,47 = 5.293,47 cabem no repasse de agosto (12.000)
    expect(r[0]).toEqual({ periodo_inicio: "2026-08-01", valor_abatimentos: "5293.47", valor_liquido: "6706.53" });
    expect(r[1].valor_abatimentos).toBe("0.00");
  });

  it("não permite pagar adiantado sem confirmação; com confirmação grava adiantado + aprovado_por", async () => {
    const [rp] = await q<{ id: string }>(
      `select r.id from public.repasses r join public.medicoes m on m.id = r.medicao_id
        where r.veiculo_id = $1 and m.periodo_inicio = '2026-08-21'`, [V12]);
    await comoUsuario(db, U.financeiro, async () => {
      await expect(db.query("select public.fn_pagar_repasse($1, '2026-10-16', null, false)", [rp.id])).rejects.toThrow(/adiantado/);
      await db.query("select public.fn_pagar_repasse($1, '2026-10-16', null, true)", [rp.id]);
    });
    const [p] = await q<{ status: string; adiantado: boolean; aprovado_por: string; valor_liquido: string }>(
      "select status, adiantado, aprovado_por, valor_liquido::text from public.repasses where id = $1", [rp.id]);
    expect(p).toEqual({ status: "pago", adiantado: true, aprovado_por: U.financeiro, valor_liquido: "10200.00" });
    // conta da OS (14.800) ainda não quitada: 12.500 estão no repasse de agosto, não pago
    const contaOS = () => q<{ repasse_id: string | null; valor_abatido: string }>(
      "select repasse_id, valor_abatido::text from public.contas_pagar_v where ordem_servico_id = 'cccccccc-0000-0000-0000-000000000001'");
    expect((await contaOS())[0]).toEqual({ repasse_id: null, valor_abatido: "14800.00" });

    // pagar agosto (medição recebida → não é adiantado) quita a conta
    const [ago] = await q<{ id: string }>(
      `select r.id from public.repasses r join public.medicoes m on m.id = r.medicao_id
        where r.veiculo_id = $1 and m.periodo_inicio = '2026-07-21'`, [V12]);
    await comoUsuario(db, U.financeiro, () => db.query("select public.fn_pagar_repasse($1, '2026-10-16')", [ago.id]));
    const [pa] = await q<{ adiantado: boolean; valor_liquido: string }>("select adiantado, valor_liquido::text from public.repasses where id = $1", [ago.id]);
    expect(pa).toEqual({ adiantado: false, valor_liquido: "0.00" });
    expect((await contaOS())[0]).toEqual({ repasse_id: ago.id, valor_abatido: "14800.00" });
  });

  it("faturamento não pode pagar repasse", async () => {
    const [rp] = await q<{ id: string }>("select id from public.repasses where status = 'liberado' limit 1");
    await comoUsuario(db, U.faturamento, async () => {
      await expect(db.query("select public.fn_pagar_repasse($1, '2026-10-16')", [rp.id])).rejects.toThrow(/permissão/);
    });
  });

  it("recebimento total libera o repasse", async () => {
    const [m] = await q<{ id: string; saldo: string }>(
      `select m.id, m.saldo::text from public.medicoes_v m join public.repasses r on r.medicao_id = m.id
        where r.status = 'previsto' and m.status = 'faturado' limit 1`);
    await db.query("insert into public.recebimentos (medicao_id, data, valor) values ($1, '2026-10-16', $2)", [m.id, m.saldo]);
    const [r] = await q<{ status: string }>("select status from public.repasses where medicao_id = $1", [m.id]);
    expect(r.status).toBe("liberado");
  });
});

describe("manutenção", () => {
  it("fechar OS cria conta a pagar vinculada à placa e atualiza o plano preventivo", async () => {
    const [conta] = await q<{ tipo: string; veiculo_id: string; valor: string; placa: string; categoria_nome: string }>(
      "select tipo, veiculo_id, valor::text, placa, categoria_nome from public.contas_pagar_v where ordem_servico_id = 'cccccccc-0000-0000-0000-000000000004'");
    expect(conta).toEqual({ tipo: "veiculo", veiculo_id: "88888888-0000-0000-0000-000000000006", valor: "1123.00", placa: "FMZ5E63", categoria_nome: "Manutenção" });
    const [plano] = await q<{ ultima_execucao_data: string; ultima_execucao_km: string }>(
      "select ultima_execucao_data::text, ultima_execucao_km::text from public.planos_manutencao where id = 'bbbbbbbb-0000-0000-0000-000000000003'");
    expect(plano).toEqual({ ultima_execucao_data: "2026-09-12", ultima_execucao_km: "120900.0" });
  });

  it("abrir OS → manutenção; fechar → volta ao status anterior e registra leitura", async () => {
    const V = "88888888-0000-0000-0000-000000000001";
    const [{ id }] = await q<{ id: string }>(
      `insert into public.ordens_servico (veiculo_id, tipo, plano_id, descricao_problema)
       values ($1, 'preventiva', 'bbbbbbbb-0000-0000-0000-000000000002', 'Troca de óleo') returning id`, [V]);
    expect((await q<{ status: string }>("select status from public.veiculos where id = $1", [V]))[0].status).toBe("manutencao");
    await db.query("insert into public.os_itens (ordem_servico_id, tipo, descricao, quantidade, valor_unitario) values ($1, 'peca', 'Óleo', 30, 28.5), ($1, 'servico', 'Troca', 1, 200)", [id]);
    let contaId: string | null = null;
    await comoUsuario(db, U.manutencao, async () => {
      const [r] = await q<{ c: string }>("select public.fn_fechar_os($1, '2026-10-16', 186000, null, 6, true, '2026-11-15') as c", [id]);
      contaId = r.c;
    });
    expect(contaId).not.toBeNull();
    const [v] = await q<{ status: string; km_atual: string }>("select status, km_atual::text from public.veiculos where id = $1", [V]);
    expect(v).toEqual({ status: "locado", km_atual: "186000.0" });
    const [c] = await q<{ valor: string; vencimento: string }>("select valor::text, vencimento::text from public.contas_pagar where id = $1", [contaId]);
    expect(c).toEqual({ valor: "1055.00", vencimento: "2026-11-15" });
    const [p] = await q<{ status_calculado: string; ultima_execucao_km: string }>(
      "select status_calculado, ultima_execucao_km::text from public.planos_manutencao where id = 'bbbbbbbb-0000-0000-0000-000000000002'");
    expect(p).toEqual({ status_calculado: "em_dia", ultima_execucao_km: "186000.0" });
  });

  it("serviço rápido não muda o status do veículo", async () => {
    const V = "88888888-0000-0000-0000-000000000002";
    await db.query("insert into public.ordens_servico (veiculo_id, descricao_problema, parar_veiculo) values ($1, 'Lâmpada', false)", [V]);
    expect((await q<{ status: string }>("select status from public.veiculos where id = $1", [V]))[0].status).toBe("locado");
  });

  it("preventivas vencidas aparecem na view e geram alerta", async () => {
    const vencidas = await q<{ placa: string }>("select placa from public.vw_preventivas_status where status = 'vencida' order by placa");
    expect(vencidas.length).toBeGreaterThan(0);
    const [a] = await q<{ n: number }>("select count(*)::int n from public.alertas where tipo = 'preventiva_vencida'");
    expect(a.n).toBeGreaterThan(0);
  });
});

describe("contratos", () => {
  it("desmobilizar gera medição final, encerra contrato e libera veículo", async () => {
    const K = "99999999-0000-0000-0000-000000000005"; // TDTS, corte 1, set/2026 a faturar
    const [{ id }] = await q<{ id: string }>("select public.fn_desmobilizar_contrato($1, '2026-10-09') as id", [K]);
    const [m] = await q<{ periodo_inicio: string; dias: number; valor_final: string; final: boolean }>(
      "select periodo_inicio::text, dias, valor_final::text, final from public.medicoes where id = $1", [id]);
    expect(m).toEqual({ periodo_inicio: "2026-10-01", dias: 9, valor_final: "2850.00", final: true });
    const [c] = await q<{ status: string; data_desmobilizacao: string }>("select status, data_desmobilizacao::text from public.contratos where id = $1", [K]);
    expect(c).toEqual({ status: "encerrado", data_desmobilizacao: "2026-10-09" });
    expect((await q<{ status: string }>("select status from public.veiculos where id = '88888888-0000-0000-0000-000000000005'"))[0].status).toBe("disponivel");
  });
});

describe("contas a pagar", () => {
  it("recorrentes mantêm 12 meses à frente (out/26–set/27) sem duplicar", async () => {
    const [r] = await q<{ n: number; min: string; max: string }>(
      "select count(*)::int n, min(vencimento)::text min, max(vencimento)::text max from public.contas_pagar where descricao = 'Aluguel galpão' and vencimento >= '2026-10-01'");
    expect(r).toEqual({ n: 12, min: "2026-10-05", max: "2027-09-05" });
    const [{ n }] = await q<{ n: number }>("select app.job_gerar_recorrentes() as n");
    expect(n).toBe(0);
  });

  it("despesa de veículo exige placa", async () => {
    await expect(db.query(
      "insert into public.contas_pagar (empresa_id, descricao, tipo, vencimento, valor) values ($1, 'x', 'veiculo', '2026-10-20', 10)", [OLIVEIRA],
    )).rejects.toThrow(/conta_veiculo_ck/);
  });

  it("status calculado pago/vencido/a_vencer", async () => {
    const rows = await q<{ status: string; n: number }>("select status, count(*)::int n from public.contas_pagar_v group by status");
    const s = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    expect(s.pago).toBeGreaterThan(0);
    expect(s.vencido).toBeGreaterThan(0);
    expect(s.a_vencer).toBeGreaterThan(0);
  });
});

describe("RLS por perfil e empresa", () => {
  const contar = async (user: string, tabela: string) =>
    comoUsuario(db, user, async () => (await q<{ n: number }>(`select count(*)::int n from ${tabela}`))[0].n);

  it("faturamento (só OLIVEIRA) vê medições só da OLIVEIRA e nenhum repasse/locador", async () => {
    const empresas = await comoUsuario(db, U.faturamento, () => q<{ empresa_id: string }>("select distinct empresa_id from public.medicoes"));
    expect(empresas.map((e) => e.empresa_id)).toEqual([OLIVEIRA]);
    expect(await contar(U.faturamento, "public.repasses")).toBe(0);
    expect(await contar(U.faturamento, "public.locadores")).toBe(0);
    expect(await contar(U.faturamento, "public.vw_locadores_publico")).toBe(3);
  });

  it("manutenção não vê receitas, mas vê custos de veículo", async () => {
    expect(await contar(U.manutencao, "public.medicoes")).toBe(0);
    expect(await contar(U.manutencao, "public.contratos")).toBe(0);
    const tipos = await comoUsuario(db, U.manutencao, () => q<{ tipo: string }>("select distinct tipo from public.contas_pagar"));
    expect(tipos.map((t) => t.tipo)).toEqual(["veiculo"]);
    expect(await contar(U.manutencao, "public.ordens_servico")).toBeGreaterThan(0);
  });

  it("consulta lê tudo mas não escreve", async () => {
    expect(await contar(U.consulta, "public.vw_margem_placa_mes")).toBeGreaterThan(0);
    await comoUsuario(db, U.consulta, async () => {
      await expect(db.query("insert into public.clientes (razao_social) values ('X')")).rejects.toThrow(/row-level security/);
    });
  });

  it("admin vê as duas empresas; auditoria só para admin", async () => {
    const e = await comoUsuario(db, U.admin, () => q<{ n: number }>("select count(distinct empresa_id)::int n from public.medicoes"));
    expect(e[0].n).toBe(2);
    expect(await contar(U.admin, "public.auditoria")).toBeGreaterThan(0);
    expect(await contar(U.financeiro, "public.auditoria")).toBe(0);
  });

  it("financeiro vê PIX dos locadores (LGPD: admin/financeiro)", async () => {
    const r = await comoUsuario(db, U.financeiro, () => q<{ chave_pix: string }>("select chave_pix from public.locadores"));
    expect(r.length).toBe(3);
    expect(r.every((x) => !!x.chave_pix)).toBe(true);
  });

  it("dashboard: margem por placa do mês filtrando por empresa", async () => {
    const r = await comoUsuario(db, U.consulta, () => q<{ placa: string; receita: string; margem: string }>(
      "select placa, receita::text, margem::text from public.vw_margem_placa_mes where mes = '2026-09-01' and empresa_id = $1 order by margem::numeric desc", [TDTS]));
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => Number(x.receita) >= 0)).toBe(true);
  });
});
