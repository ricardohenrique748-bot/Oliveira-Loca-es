import { describe, expect, it } from "vitest";
import { contaPagarNovaSchema } from "./financeiro";

const PLACA_A = "aaaaaaaa-0000-0000-0000-00000000000a";
const PLACA_B = "aaaaaaaa-0000-0000-0000-00000000000b";

const boletoDuasPlacas = (extra: Record<string, unknown> = {}) => ({
  empresa_id: "11111111-0000-0000-0000-000000000001",
  descricao: "Silcar Pneus",
  tipo: "veiculo",
  veiculo_id: null,
  fornecedor_id: null,
  categoria_id: null,
  vencimento: "2026-11-10",
  valor: 1000,
  forma_pagamento: "boleto",
  conta_bancaria_id: null,
  descontar_locador: false,
  valor_locador: null,
  anexo_url: null,
  observacoes: null,
  rateio: true,
  itens: [
    { veiculo_id: PLACA_A, valor: 600, descontar_locador: false, valor_locador: null, nota: null },
    { veiculo_id: PLACA_B, valor: 400, descontar_locador: false, valor_locador: null, nota: null },
  ],
  ...extra,
});

describe("conta a pagar: boleto com várias placas", () => {
  it("aceita única", () => {
    expect(contaPagarNovaSchema.safeParse(boletoDuasPlacas()).success).toBe(true);
  });

  it("aceita parcelado (cada placa vira o seu parcelamento)", () => {
    const r = contaPagarNovaSchema.safeParse(boletoDuasPlacas({ repeticao: "parcelada", parcelas: 4, modo_valor: "total" }));
    expect(r.success).toBe(true);
  });

  it("parcelado ainda exige o número de parcelas", () => {
    const r = contaPagarNovaSchema.safeParse(boletoDuasPlacas({ repeticao: "parcelada", parcelas: null }));
    expect(r.success).toBe(false);
  });

  it("recusa recorrente", () => {
    const r = contaPagarNovaSchema.safeParse(boletoDuasPlacas({ repeticao: "recorrente" }));
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).join()).toMatch(/recorrente/);
  });

  it("soma das placas precisa bater com o valor", () => {
    const r = contaPagarNovaSchema.safeParse(boletoDuasPlacas({ valor: 900, repeticao: "parcelada", parcelas: 4 }));
    expect(r.success).toBe(false);
  });
});
