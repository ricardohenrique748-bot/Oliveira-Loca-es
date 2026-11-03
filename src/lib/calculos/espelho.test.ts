import { describe, expect, it } from "vitest";
import { calcularHorasDia, dataDaLinha, horasEmRelogio, linhasPreenchidas, linhasVazias, normalizarLinhas, totalHoras } from "./espelho";

describe("espelho de horas", () => {
  it("sempre 30 linhas, dia 1 a 30", () => {
    const l = linhasVazias();
    expect(l).toHaveLength(30);
    expect(l[0].dia).toBe(1);
    expect(l[29].dia).toBe(30);
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

  it("normaliza o que veio do banco (só dias preenchidos) para as 30 linhas", () => {
    const l = normalizarLinhas([{ dia: 3, inicio: "07:00", fim: "17:00", intervalo: 1, horas: 9, obs: "" }, { lixo: true }]);
    expect(l).toHaveLength(30);
    expect(l[2]).toEqual({ dia: 3, inicio: "07:00", fim: "17:00", intervalo: 1, horas: 9, obs: null });
    expect(l[0].horas).toBeNull();
    expect(normalizarLinhas(null)).toHaveLength(30);
  });

  it("total e linhas preenchidas", () => {
    const l = linhasVazias();
    l[0].horas = 8.5;
    l[1].horas = 4.25;
    l[4].obs = "chuva";
    expect(totalHoras(l)).toBe(12.75);
    expect(linhasPreenchidas(l).map((x) => x.dia)).toEqual([1, 2, 5]);
  });

  it("data da linha e dias que não existem no mês", () => {
    expect(dataDaLinha("2026-11-01", 1)).toMatchObject({ data: "2026-11-01", rotulo: "01/11", semana: "dom", fimDeSemana: true });
    expect(dataDaLinha("2026-11-01", 30)).toMatchObject({ semana: "seg", fimDeSemana: false });
    expect(dataDaLinha("2026-02-01", 28)).not.toBeNull();
    expect(dataDaLinha("2026-02-01", 29)).toBeNull();
  });

  it("horas em relógio", () => {
    expect(horasEmRelogio(8.5)).toBe("8:30");
    expect(horasEmRelogio(0.33)).toBe("0:20");
    expect(horasEmRelogio(null)).toBe("—");
  });
});
