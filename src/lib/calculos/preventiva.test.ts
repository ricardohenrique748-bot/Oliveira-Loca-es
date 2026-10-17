import { describe, expect, it } from "vitest";
import { calcularPreventiva } from "./preventiva";
import { disponibilidadeFisica, faixaAging, mtbf, mttr, pctPreventiva, taxaOcupacao, horasNoPeriodo, diasSobrepostos, custoPorUnidade } from "./indicadores";

const oleo = { intervaloKm: 10000, intervaloDias: 180, ultimaKm: 120000, ultimaData: "2026-06-01" };

describe("preventiva", () => {
  it("vence primeiro por km", () => {
    const r = calcularPreventiva(oleo, { km: 129500, data: "2026-08-01" });
    expect(r.criterio).toBe("km");
    expect(r.pct).toBeCloseTo(0.95);
    expect(r.status).toBe("proxima");
    expect(r.restante).toBe(500);
    expect(r.proximaKm).toBe(130000);
    expect(r.proximaData).toBe("2026-11-28");
  });

  it("vence primeiro por dias (veículo rodou pouco)", () => {
    const r = calcularPreventiva(oleo, { km: 122000, data: "2026-12-01" });
    expect(r.criterio).toBe("dias");
    expect(r.status).toBe("vencida");
    expect(r.restante).toBe(-3);
  });

  it("em dia abaixo de 90%", () => {
    const r = calcularPreventiva(oleo, { km: 125000, data: "2026-08-01" });
    expect(r.status).toBe("em_dia");
    expect(r.pct).toBeCloseTo(0.5);
  });

  it("exatamente 90% → próxima; 100% → vencida", () => {
    expect(calcularPreventiva(oleo, { km: 129000, data: "2026-06-02" }).status).toBe("proxima");
    expect(calcularPreventiva(oleo, { km: 130000, data: "2026-06-02" }).status).toBe("vencida");
  });

  it("guindaste por horímetro", () => {
    const r = calcularPreventiva({ intervaloHoras: 250, ultimaHoras: 4100 }, { horas: 4330, data: "2026-10-16" });
    expect(r).toMatchObject({ criterio: "horas", status: "proxima", proximaHoras: 4350, restante: 20 });
  });

  it("sem histórico é tratado como vencido", () => {
    const r = calcularPreventiva({ intervaloKm: 10000 }, { km: 5000, data: "2026-10-16" });
    expect(r).toMatchObject({ status: "vencida", semHistorico: true, criterio: null });
  });
});

describe("indicadores da frota", () => {
  it("disponibilidade física", () => {
    expect(disponibilidadeFisica(720, 36)).toBe(95);
    expect(disponibilidadeFisica(720, 0)).toBe(100);
    expect(disponibilidadeFisica(720, 1000)).toBe(0);
    expect(disponibilidadeFisica(0, 0)).toBe(0);
  });

  it("taxa de ocupação", () => {
    expect(taxaOcupacao(24, 30)).toBe(80);
  });

  it("MTTR e MTBF", () => {
    expect(mttr([10, 20, 36])).toBe(22);
    expect(mttr([])).toBeNull();
    expect(mtbf(90, 3)).toBe(30);
    expect(mtbf(90, 0)).toBeNull();
  });

  it("% preventiva, custo por km/hora, horas e sobreposição", () => {
    expect(pctPreventiva(3, 1)).toBe(75);
    expect(custoPorUnidade(1500, 10000)).toBe(0.15);
    expect(custoPorUnidade(1500, 0)).toBeNull();
    expect(horasNoPeriodo("2026-10-01", "2026-10-31")).toBe(744);
    expect(diasSobrepostos({ inicio: "2026-10-01", fim: "2026-10-31" }, { inicio: "2026-10-20", fim: "2026-11-05" })).toBe(12);
  });

  it("faixas de aging", () => {
    expect(faixaAging("2026-10-20", "2026-10-16")).toBe("a_vencer");
    expect(faixaAging("2026-10-01", "2026-10-16")).toBe("1-30");
    expect(faixaAging("2026-08-10", "2026-10-16")).toBe("61-90");
    expect(faixaAging("2026-06-01", "2026-10-16")).toBe("90+");
  });
});
