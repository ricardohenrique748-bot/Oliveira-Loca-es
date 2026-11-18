import { describe, expect, it } from "vitest";
import { montarContrato } from "./contrato";
import { contrato } from "./fixtures";

const texto = (q: number | null) => JSON.stringify(montarContrato({ ...contrato, quantidade: q }).blocos);

describe("contrato: quantidade informativa", () => {
  it("sai na ficha resumo e na cláusula 1, sem mexer no valor", () => {
    const t = texto(3);
    expect(t).toContain("3 (três) veículos/equipamentos");
    expect(t).toContain("A quantidade contratada é de 3 (três) veículos/equipamentos.");
    // o valor continua o digitado (não multiplica pela quantidade)
    expect(t).toContain(`${contrato.valor_mensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    expect(t).not.toContain(`${(contrato.valor_mensal * 3).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  });

  it("vazia não aparece", () => {
    expect(texto(null)).not.toContain("quantidade contratada");
    expect(texto(null)).not.toContain('"Quantidade"');
  });
});
