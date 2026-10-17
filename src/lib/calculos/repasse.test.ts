import { describe, expect, it } from "vitest";
import { alocarAbatimentos, calcularRepasse, margemMedicao, validarPagamentoRepasse, type PendenciaAbatimento } from "./repasse";

const pend = (id: string, valor: number, data = "2026-09-10", desc = `Despesa ${id}`): PendenciaAbatimento => ({
  contaPagarId: id,
  descricao: desc,
  data,
  valorPendente: valor,
});

describe("repasse ao locador", () => {
  it("bruto proporcional aos dias (base 30)", () => {
    expect(calcularRepasse({ valorRepasseMensal: 12000, dias: 30, pendencias: [] })).toMatchObject({
      valorBruto: 12000, valorAbatimentos: 0, valorLiquido: 12000, saldoRemanescente: 0,
    });
    expect(calcularRepasse({ valorRepasseMensal: 10000, dias: 7, pendencias: [] }).valorBruto).toBe(2333.33);
  });

  it("abate multas/pneus marcados 'Descontar do locador'", () => {
    const r = calcularRepasse({
      valorRepasseMensal: 12000,
      dias: 30,
      pendencias: [pend("multa", 293.47), pend("pneu", 1850)],
    });
    expect(r.valorAbatimentos).toBe(2143.47);
    expect(r.valorLiquido).toBe(9856.53);
    expect(r.abatimentos).toHaveLength(2);
    expect(r.abatimentos.every((a) => a.quitada)).toBe(true);
  });

  it("abatimento maior que o repasse: líquido 0 e saldo vai para o próximo", () => {
    const r = alocarAbatimentos(4000, [pend("motor", 6500, "2026-09-01"), pend("multa", 200, "2026-09-20")]);
    expect(r.valorLiquido).toBe(0);
    expect(r.valorAbatimentos).toBe(4000);
    expect(r.saldoRemanescente).toBe(2700);
    expect(r.abatimentos).toEqual([
      { contaPagarId: "motor", ordemServicoId: null, descricao: "Despesa motor", valor: 4000, quitada: false },
    ]);

    // próximo repasse recebe o saldo pendente (2.500 do motor + 200 da multa)
    const prox = alocarAbatimentos(12000, [pend("motor", 2500, "2026-09-01"), pend("multa", 200, "2026-09-20")]);
    expect(prox.valorAbatimentos).toBe(2700);
    expect(prox.valorLiquido).toBe(9300);
    expect(prox.saldoRemanescente).toBe(0);
  });

  it("abate das pendências mais antigas primeiro", () => {
    const r = alocarAbatimentos(1000, [pend("nova", 800, "2026-10-01"), pend("antiga", 800, "2026-08-01")]);
    expect(r.abatimentos.map((a) => [a.contaPagarId, a.valor])).toEqual([["antiga", 800], ["nova", 200]]);
  });

  it("ignora pendências zeradas", () => {
    expect(alocarAbatimentos(1000, [pend("x", 0)]).abatimentos).toHaveLength(0);
  });

  it("margem = valor final − repasse líquido; frota própria = valor final", () => {
    expect(margemMedicao(18000, 9856.53)).toBe(8143.47);
    expect(margemMedicao(18000, null)).toBe(18000);
  });
});

describe("pagamento de repasse adiantado", () => {
  it("medição recebida → pagamento normal", () => {
    expect(validarPagamentoRepasse("liberado", "recebido", false)).toEqual({ permitido: true, adiantado: false });
  });

  it("medição não recebida exige confirmação", () => {
    expect(validarPagamentoRepasse("previsto", "faturado", false)).toEqual({ permitido: false, motivo: "CONFIRMACAO_ADIANTAMENTO" });
    expect(validarPagamentoRepasse("previsto", "recebido_parcial", true)).toEqual({ permitido: true, adiantado: true });
  });

  it("não paga duas vezes nem cancelado", () => {
    expect(validarPagamentoRepasse("pago", "recebido", true)).toMatchObject({ permitido: false, motivo: "REPASSE_JA_PAGO" });
    expect(validarPagamentoRepasse("cancelado", "recebido", true)).toMatchObject({ permitido: false });
  });
});
