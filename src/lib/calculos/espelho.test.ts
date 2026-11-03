import { describe, expect, it } from "vitest";
import { calcularFechamento, calcularHorasDia, calcularValoresEspelho, normalizarFechamento, dataDaLinha, diasDoEspelho, erroDatas, fimPeriodo, horasEmRelogio, linhasDoPeriodo, linhasPreenchidas, linhasVazias, normalizarLinhas, ordenarDatas, remapearLinhas, rotuloDias, totalHoras } from "./espelho";

describe("espelho de horas", () => {
  it("sempre 62 linhas (a tela mostra só as do período)", () => {
    const l = linhasVazias();
    expect(l).toHaveLength(62);
    expect(l[0].dia).toBe(1);
    expect(l[61].dia).toBe(62);
  });

  it("horas = fim − início − intervalo", () => {
    expect(calcularHorasDia("07:00", "17:00", 1)).toBe(9);
    expect(calcularHorasDia("07:30", "12:00", null)).toBe(4.5);
    expect(calcularHorasDia("07:00", "07:20", null)).toBe(0.33);
  });

  it("fim antes do início passa da meia-noite", () => {
    expect(calcularHorasDia("22:00", "06:00", null)).toBe(8);
  });

  it("sem início ou fim não calcula; intervalo maior que o turno não fica negativo", () => {
    expect(calcularHorasDia("07:00", null, null)).toBeNull();
    expect(calcularHorasDia("07:00", "08:00", 2)).toBe(0);
    expect(calcularHorasDia("25:00", "08:00", null)).toBeNull();
  });

  it("normaliza o que veio do banco (só dias preenchidos) para as 62 linhas", () => {
    const l = normalizarLinhas([{ dia: 3, inicio: "07:00", fim: "17:00", intervalo: 1, horas: 9, obs: "" }, { lixo: true }]);
    expect(l).toHaveLength(62);
    expect(l[2]).toEqual({ dia: 3, inicio: "07:00", fim: "17:00", intervalo: 1, horas: 9, obs: null });
    expect(l[0].horas).toBeNull();
    expect(normalizarLinhas(null)).toHaveLength(62);
  });

  it("total e linhas preenchidas", () => {
    const l = linhasVazias();
    l[0].horas = 8.5;
    l[1].horas = 4.25;
    l[4].obs = "chuva";
    expect(totalHoras(l)).toBe(12.75);
    expect(linhasPreenchidas(l).map((x) => x.dia)).toEqual([1, 2, 5]);
  });

  const mes = (c: string) => diasDoEspelho(c);
  const de = (inicio: string, fim?: string) => diasDoEspelho("2026-11-01", inicio, fim);

  it("sem dias marcados: o mês inteiro, uma linha por dia", () => {
    expect(mes("2026-11-01")).toHaveLength(30);
    expect(dataDaLinha(mes("2026-11-01"), 1)).toMatchObject({ data: "2026-11-01", rotulo: "01/11", semana: "dom", fimDeSemana: true });
    expect(dataDaLinha(mes("2026-11-01"), 30)).toMatchObject({ semana: "seg", fimDeSemana: false });
    expect(dataDaLinha(mes("2026-11-01"), 31)).toBeNull();
    expect(dataDaLinha(mes("2026-10-01"), 31)).toMatchObject({ rotulo: "31/10" });
    expect(dataDaLinha(mes("2026-02-01"), 29)).toBeNull();
    expect(rotuloDias(mes("2026-11-01"))).toBe("01/11 a 30/11/2026");
  });

  it("espelhos antigos com início/fim continuam iguais", () => {
    expect(de("2026-10-21")).toHaveLength(31);
    expect(rotuloDias(de("2026-10-21"))).toBe("21/10 a 20/11/2026");
    expect(rotuloDias(de("2026-10-21", "2026-10-25"))).toBe("21/10 a 25/10/2026");
    expect(fimPeriodo("2027-01-31")).toBe("2027-02-28");
  });

  it("dias marcados no calendário: só eles, em ordem, podendo pular dias", () => {
    const dias = diasDoEspelho("2026-11-01", null, null, ["2026-10-27", "2026-10-21", "2026-10-23", "2026-10-21", "lixo"]);
    expect(dias).toEqual(["2026-10-21", "2026-10-23", "2026-10-27"]);
    expect(dataDaLinha(dias, 2)).toMatchObject({ data: "2026-10-23", rotulo: "23/10", semana: "sex" });
    expect(dataDaLinha(dias, 4)).toBeNull();
    expect(rotuloDias(dias)).toBe("3 dias entre 21/10 e 27/10/2026");
    expect(rotuloDias(["2026-12-30", "2026-12-31", "2027-01-01"])).toBe("30/12/2026 a 01/01/2027");
    expect(rotuloDias(["2026-10-21"])).toBe("21/10/2026");
    expect(ordenarDatas(["2026-11-02", "2026-11-01"])).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("limite de dias", () => {
    expect(erroDatas([])).toBeNull();
    expect(erroDatas(["2026-13-1"])).toMatch(/inválida/);
    const muitos = Array.from({ length: 63 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
    expect(erroDatas(muitos)).toMatch(/No máximo 62 dias/);
    expect(erroDatas(muitos.slice(0, 62))).toBeNull();
  });

  it("linhas do espelho: só as dos dias marcados aparecem e contam", () => {
    const l = linhasVazias();
    l[30].horas = 9;
    expect(linhasDoPeriodo(l, mes("2026-11-01"))).toHaveLength(30);
    expect(linhasDoPeriodo(l, de("2026-10-21"))).toHaveLength(31);
    expect(linhasDoPeriodo(l, ["2026-10-21", "2026-10-23"])).toHaveLength(2);
  });

  it("trocar os dias: cada linha acompanha a sua data; dias desmarcados saem", () => {
    const antes = ["2026-10-21", "2026-10-22", "2026-10-23"];
    const linhas = [{ dia: 1, horas: 8 }, { dia: 2, horas: 9 }, { dia: 3, horas: 10 }];
    // desmarcou 22/10 e marcou 20/10
    const depois = ["2026-10-20", "2026-10-21", "2026-10-23"];
    expect(remapearLinhas(linhas, antes, depois)).toEqual([{ dia: 2, horas: 8 }, { dia: 3, horas: 10 }]);
  });

  it("horas em relógio", () => {
    expect(horasEmRelogio(8.5)).toBe("8:30");
    expect(horasEmRelogio(0.33)).toBe("0:20");
    expect(horasEmRelogio(null)).toBe("—");
  });
});

describe("valores do espelho (franquia de horas)", () => {
  it("exemplo da planilha: 242 h, R$ 80.000 por 220 h", () => {
    expect(calcularValoresEspelho(242, 80_000, 220)).toEqual({ valorHora: 363.64, horasExcedentes: 22, valorExcedente: 8000.08, total: 88000.08 });
  });

  it("sem passar da franquia: só o valor mensal", () => {
    expect(calcularValoresEspelho(200, 80_000, 220)).toEqual({ valorHora: 363.64, horasExcedentes: 0, valorExcedente: 0, total: 80000 });
  });

  it("horas quebradas", () => {
    expect(calcularValoresEspelho(220.5, 80_000, 220)).toMatchObject({ horasExcedentes: 0.5, valorExcedente: 181.82, total: 80181.82 });
  });

  it("sem valor mensal ou horas do mês: não calcula", () => {
    expect(calcularValoresEspelho(242, null, 220)).toBeNull();
    expect(calcularValoresEspelho(242, 80_000, null)).toBeNull();
    expect(calcularValoresEspelho(242, 80_000, 0)).toBeNull();
  });
});

describe("fechamento como na planilha", () => {
  it("exemplo: 242 h, R$ 80.000 / 220 h, 30 dias, sem descontos", () => {
    expect(calcularFechamento(242, 80_000, 220, {})).toMatchObject({
      valorHora: 363.64, horasExcedentes: 22, valorExcedente: 8000.08, diasTrabalhados: 30, valorDiasTrabalhados: 80000,
      totalDescontos: 0, totalBruto: 88000.08, totalLiquido: 88000.08,
    });
  });

  it("dias em reparo saem dos dias trabalhados; descontos e mobilização", () => {
    const r = calcularFechamento(242, 80_000, 220, { dias_reparo: 3, combustivel: 1500, pneus: 500.5, mobilizacao: 2000 })!;
    expect(r.valorDiasReparo).toBe(8000);
    expect(r.diasTrabalhados).toBe(27);
    expect(r.valorDiasTrabalhados).toBe(72000);
    expect(r.totalBruto).toBe(82000.08);
    expect(r.totalDescontos).toBe(2000.5);
    expect(r.totalLiquido).toBe(79999.58);
  });

  it("lê do banco só os campos numéricos conhecidos", () => {
    expect(normalizarFechamento({ combustivel: 10, lixo: 5, lavagem: "x" })).toEqual({ combustivel: 10 });
    expect(normalizarFechamento(null)).toEqual({});
  });
});
