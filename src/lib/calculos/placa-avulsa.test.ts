import { describe, expect, it } from "vitest";
import { placaLivreParaAvulsa } from "./placa-avulsa";

describe("placaLivreParaAvulsa", () => {
  it("disponível e parado podem", () => {
    expect(placaLivreParaAvulsa({ status: "disponivel", locado_avulsa_ate: null }, false)).toBe(true);
    expect(placaLivreParaAvulsa({ status: "parado", locado_avulsa_ate: null }, false)).toBe(true);
  });
  it("locada só por outra avulsa pode (várias avulsas da mesma placa)", () => {
    expect(placaLivreParaAvulsa({ status: "locado", locado_avulsa_ate: "2026-11-05" }, false)).toBe(true);
  });
  it("contrato ativo, locado à mão e manutenção bloqueiam", () => {
    expect(placaLivreParaAvulsa({ status: "locado", locado_avulsa_ate: "2026-11-05" }, true)).toBe(false);
    expect(placaLivreParaAvulsa({ status: "locado", locado_avulsa_ate: null }, false)).toBe(false);
    expect(placaLivreParaAvulsa({ status: "manutencao", locado_avulsa_ate: null }, false)).toBe(false);
    expect(placaLivreParaAvulsa({ status: "vendido", locado_avulsa_ate: null }, false)).toBe(false);
  });
});
