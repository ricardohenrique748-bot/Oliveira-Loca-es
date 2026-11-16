import { describe, expect, it } from "vitest";
import { barrasDaLinha, barrasI25, formatarLinhaDigitavel } from "./boleto";

// linha montada a partir de um código de barras conhecido (campos e DVs na ordem Febraban)
const BARRAS = "34191" + "84140000032000" + "1790010435100479102015000"; // banco+moeda, DV, fator+valor, campo livre (25)
const LINHA = BARRAS.slice(0, 4) + BARRAS.slice(19, 24) + "0" + BARRAS.slice(24, 34) + "0" + BARRAS.slice(34, 44) + "0" + BARRAS[4] + BARRAS.slice(5, 19);

describe("boleto (PDF desenhado no app)", () => {
  it("remonta o código de barras a partir da linha digitável", () => {
    expect(LINHA).toHaveLength(47);
    expect(barrasDaLinha(LINHA)).toBe(BARRAS);
    expect(barrasDaLinha("123")).toBe("");
  });

  it("intercalado 2 de 5: 44 dígitos = 405 unidades (≈ 103 mm com 0,254 mm)", () => {
    const larguras = barrasI25(BARRAS);
    expect(larguras.reduce((a, b) => a + b, 0)).toBe(405);
    expect(larguras.length).toBe(4 + 22 * 10 + 3);
    expect(barrasI25("123")).toEqual([]); // ímpar não codifica
  });

  it("formata a linha digitável como impressa", () => {
    expect(formatarLinhaDigitavel(LINHA)).toMatch(/^\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}$/);
  });
});
