import { describe, expect, it } from "vitest";
import { numeroPorExtenso, valorPorExtenso } from "./extenso";

describe("numeroPorExtenso", () => {
  it.each([
    [0, "zero"], [1, "um"], [15, "quinze"], [21, "vinte e um"], [100, "cem"], [101, "cento e um"],
    [180, "cento e oitenta"], [365, "trezentos e sessenta e cinco"], [1000, "mil"], [1500, "mil e quinhentos"],
    [1234, "mil duzentos e trinta e quatro"], [2026, "dois mil e vinte e seis"], [9000, "nove mil"],
    [55000, "cinquenta e cinco mil"], [1_000_000, "um milhão"], [2_300_000, "dois milhões trezentos mil"],
  ])("%i → %s", (n, esperado) => expect(numeroPorExtenso(n)).toBe(esperado));
});

describe("valorPorExtenso", () => {
  it.each([
    [9000, "nove mil reais"], [1, "um real"], [1800.5, "mil e oitocentos reais e cinquenta centavos"],
    [0.01, "um centavo"], [1_000_000, "um milhão de reais"], [0, "zero reais"],
  ])("%d → %s", (v, esperado) => expect(valorPorExtenso(v)).toBe(esperado));
});
