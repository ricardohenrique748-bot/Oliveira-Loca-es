import { describe, expect, it } from "vitest";
import {
  calcularDias,
  calcularValorMedicao,
  calcularVencimento,
  derivarStatusMedicao,
  periodoContendo,
  periodoDaCompetencia,
  preverMedicao,
  statusExibicaoMedicao,
  type ContratoParaMedir,
} from "./medicao";

const contrato = (over: Partial<ContratoParaMedir> = {}): ContratoParaMedir => ({
  id: "c1",
  valorMensal: 18000,
  valorRepasseMensal: null,
  diaCorte: 1,
  dataInicio: "2025-01-01",
  dataFim: null,
  dataDesmobilizacao: null,
  prazoPagamentoDias: 30,
  ...over,
});

describe("período de medição", () => {
  it("corte 1 → 01 ao último dia do mês", () => {
    expect(periodoDaCompetencia(1, "2026-09")).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(periodoDaCompetencia(1, "2026-10")).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
    expect(periodoDaCompetencia(1, "2027-02")).toEqual({ inicio: "2027-02-01", fim: "2027-02-28" });
    expect(periodoDaCompetencia(1, "2028-02")).toEqual({ inicio: "2028-02-01", fim: "2028-02-29" });
  });

  it("corte 21 → dia 21 ao dia 20 do mês seguinte (competência = mês do fim)", () => {
    expect(periodoDaCompetencia(21, "2026-10")).toEqual({ inicio: "2026-09-21", fim: "2026-10-20" });
    expect(periodoDaCompetencia(21, "2027-01")).toEqual({ inicio: "2026-12-21", fim: "2027-01-20" });
    expect(periodoDaCompetencia(21, "2027-03")).toEqual({ inicio: "2027-02-21", fim: "2027-03-20" });
  });

  it("período que contém uma data", () => {
    expect(periodoContendo(1, "2026-10-16")).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
    expect(periodoContendo(21, "2026-10-16")).toEqual({ inicio: "2026-09-21", fim: "2026-10-20" });
    expect(periodoContendo(21, "2026-10-21")).toEqual({ inicio: "2026-10-21", fim: "2026-11-20" });
    expect(periodoContendo(21, "2026-12-25")).toEqual({ inicio: "2026-12-21", fim: "2027-01-20" });
  });
});

describe("dias medidos", () => {
  it("período completo 01–30 conta 30", () => {
    expect(calcularDias({ periodo: periodoDaCompetencia(1, "2026-09"), dataInicioContrato: "2025-01-01" })).toBe(30);
  });

  it("período completo 21–20 conta 30 (mesmo com 31 dias corridos)", () => {
    const p = periodoDaCompetencia(21, "2026-11"); // 21/10 a 20/11 = 31 dias corridos
    expect(calcularDias({ periodo: p, dataInicioContrato: "2025-01-01" })).toBe(30);
  });

  it("mês de 28 dias completo conta 30", () => {
    expect(calcularDias({ periodo: periodoDaCompetencia(1, "2027-02"), dataInicioContrato: "2026-01-01" })).toBe(30);
  });

  it("mês de 31 dias completo conta 30", () => {
    expect(calcularDias({ periodo: periodoDaCompetencia(1, "2026-10"), dataInicioContrato: "2026-01-01" })).toBe(30);
  });

  it("mobilização no meio do período conta dias efetivos (inclusive)", () => {
    const p = periodoDaCompetencia(1, "2026-09");
    expect(calcularDias({ periodo: p, dataInicioContrato: "2026-09-16" })).toBe(15);
    expect(calcularDias({ periodo: periodoDaCompetencia(1, "2027-02"), dataInicioContrato: "2027-02-15" })).toBe(14);
    expect(calcularDias({ periodo: periodoDaCompetencia(21, "2026-10"), dataInicioContrato: "2026-10-01" })).toBe(20);
  });

  it("mobilização no dia 2 de mês de 31 dias limita a 30", () => {
    expect(calcularDias({ periodo: periodoDaCompetencia(1, "2026-10"), dataInicioContrato: "2026-10-02" })).toBe(30);
  });

  it("desmobilização no meio do período", () => {
    const p = periodoDaCompetencia(1, "2026-09");
    expect(calcularDias({ periodo: p, dataInicioContrato: "2025-01-01", dataFimEfetiva: "2026-09-10" })).toBe(10);
    expect(calcularDias({ periodo: periodoDaCompetencia(21, "2026-10"), dataInicioContrato: "2025-01-01", dataFimEfetiva: "2026-09-30" })).toBe(10);
  });

  it("mobilização e desmobilização no mesmo período", () => {
    const p = periodoDaCompetencia(1, "2026-09");
    expect(calcularDias({ periodo: p, dataInicioContrato: "2026-09-05", dataFimEfetiva: "2026-09-14" })).toBe(10);
  });

  it("contrato fora do período → 0", () => {
    const p = periodoDaCompetencia(1, "2026-09");
    expect(calcularDias({ periodo: p, dataInicioContrato: "2026-10-01" })).toBe(0);
    expect(calcularDias({ periodo: p, dataInicioContrato: "2025-01-01", dataFimEfetiva: "2026-08-31" })).toBe(0);
  });

  it("respeita base de dias configurável", () => {
    expect(calcularDias({ periodo: periodoDaCompetencia(1, "2026-10"), dataInicioContrato: "2025-01-01", baseDias: 31 })).toBe(31);
  });
});

describe("valor da medição", () => {
  it("(mensal / 30) × dias + acréscimos − descontos", () => {
    expect(calcularValorMedicao({ valorMensal: 18000, dias: 30 })).toEqual({ valorBase: 18000, valorFinal: 18000 });
    expect(calcularValorMedicao({ valorMensal: 18000, dias: 15 })).toEqual({ valorBase: 9000, valorFinal: 9000 });
    expect(calcularValorMedicao({ valorMensal: 18000, dias: 15, acrescimos: 350.5, descontos: 100 }).valorFinal).toBe(9250.5);
  });

  it("arredonda a 2 casas no final", () => {
    expect(calcularValorMedicao({ valorMensal: 10000, dias: 7 }).valorFinal).toBe(2333.33);
    expect(calcularValorMedicao({ valorMensal: 12345.67, dias: 17 }).valorFinal).toBe(6995.88);
    // meio centavo arredonda para cima: 0,01 × 15 / 30 = 0,005 → 0,01
    expect(calcularValorMedicao({ valorMensal: 0.01, dias: 15 }).valorFinal).toBe(0.01);
  });

  it("desconto maior que o valor não deixa negativo", () => {
    expect(calcularValorMedicao({ valorMensal: 3000, dias: 1, descontos: 500 }).valorFinal).toBe(0);
  });

  it("vencimento = emissão + prazo", () => {
    expect(calcularVencimento("2026-10-01", 30)).toBe("2026-10-31");
    expect(calcularVencimento("2026-12-15", 28)).toBe("2027-01-12");
    expect(calcularVencimento(null, 30)).toBeNull();
  });
});

describe("prévia de medição por competência", () => {
  it("contrato completo", () => {
    const m = preverMedicao(contrato(), "2026-09")!;
    expect(m).toMatchObject({ dias: 30, valorFinal: 18000, periodo: { inicio: "2026-09-01", fim: "2026-09-30" } });
  });

  it("contrato sublocado já traz repasse bruto proporcional", () => {
    const m = preverMedicao(contrato({ valorRepasseMensal: 12000, dataInicio: "2026-09-11" }), "2026-09")!;
    expect(m.dias).toBe(20);
    expect(m.valorFinal).toBe(12000);
    expect(m.valorRepasseBruto).toBe(8000);
  });

  it("usa a menor entre data_fim e desmobilização", () => {
    const m = preverMedicao(contrato({ diaCorte: 21, dataFim: "2026-10-31", dataDesmobilizacao: "2026-10-05" }), "2026-10")!;
    expect(m.periodo).toEqual({ inicio: "2026-09-21", fim: "2026-10-20" });
    expect(m.dias).toBe(15);
    expect(m.valorFinal).toBe(9000);
  });

  it("não gera para contrato ainda não iniciado", () => {
    expect(preverMedicao(contrato({ dataInicio: "2026-11-01" }), "2026-10")).toBeNull();
  });
});

describe("status da medição", () => {
  it("recebido quando soma ≥ valor final; parcial se > 0", () => {
    expect(derivarStatusMedicao("faturado", 1000, 0)).toBe("faturado");
    expect(derivarStatusMedicao("faturado", 1000, 400)).toBe("recebido_parcial");
    expect(derivarStatusMedicao("recebido_parcial", 1000, 1000)).toBe("recebido");
    expect(derivarStatusMedicao("faturado", 1000, 1000.01)).toBe("recebido");
    expect(derivarStatusMedicao("recebido", 1000, 0)).toBe("faturado");
    expect(derivarStatusMedicao("cancelado", 1000, 1000)).toBe("cancelado");
  });

  it("vencido é derivado: hoje > vencimento e não recebido", () => {
    expect(statusExibicaoMedicao("faturado", "2026-10-15", "2026-10-16")).toBe("vencido");
    expect(statusExibicaoMedicao("recebido_parcial", "2026-10-15", "2026-10-16")).toBe("vencido");
    expect(statusExibicaoMedicao("faturado", "2026-10-16", "2026-10-16")).toBe("faturado");
    expect(statusExibicaoMedicao("recebido", "2026-10-01", "2026-10-16")).toBe("recebido");
  });
});
