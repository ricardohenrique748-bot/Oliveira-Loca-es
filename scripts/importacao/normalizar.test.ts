import { describe, expect, it } from "vitest";
import { chave, clienteObra, competenciaAba, contato, data, ehErroFormula, formaBanco, nfDasObservacoes, parcela, periodo, placa, simNao, statusMedicao, valor } from "./normalizar";

describe("normalização da importação", () => {
  it("placas maiúsculas sem hífen", () => {
    expect(placa("ght-3b45")).toBe("GHT3B45");
    expect(placa(" dqx 4521 ")).toBe("DQX4521");
    expect(placa("TOTAL")).toBeNull();
  });

  it("clientes com sinônimos e obra", () => {
    expect(clienteObra("Omexon")).toEqual({ cliente: "Omexom", obra: null });
    expect(clienteObra("GUARANA")).toEqual({ cliente: "Guaraná", obra: null });
    expect(clienteObra("CARAMURU - obra 3800-D")).toEqual({ cliente: "Caramuru", obra: "3800-D" });
    expect(clienteObra("Lopes Infraestrutura")).toEqual({ cliente: "Lopes Infra", obra: null });
    expect(clienteObra("construtora nova")).toEqual({ cliente: "Construtora Nova", obra: null });
  });

  it("datas: serial Excel, dd/mm/aa e ISO", () => {
    expect(data(46311)).toBe("2026-10-16");
    expect(data("16/10/26")).toBe("2026-10-16");
    expect(data("1/2/2026")).toBe("2026-02-01");
    expect(data("31/02/2026")).toBeNull();
    expect(data("#REF!")).toBeNull();
  });

  it("período 'dd/mm/aa A dd/mm/aa'", () => {
    expect(periodo("21/08/26 A 20/09/26")).toEqual({ inicio: "2026-08-21", fim: "2026-09-20" });
    expect(periodo("01/09/2026 a 30/09/2026")).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(periodo("setembro")).toBeNull();
    // sem ano: vem da competência da aba (planilha "Valor Repasse", aba "Sub-locado SET26")
    expect(periodo("21/08 A 20/09", "2026-09")).toEqual({ inicio: "2026-08-21", fim: "2026-09-20" });
    expect(periodo("01/08 a 31/08", "2026-09")).toEqual({ inicio: "2026-08-01", fim: "2026-08-31" });
    expect(periodo("30/09 A 30/10", "2026-09")).toEqual({ inicio: "2026-09-30", fim: "2026-10-30" });
    expect(periodo("21/12 a 20/01", "2027-01")).toEqual({ inicio: "2026-12-21", fim: "2027-01-20" });
    expect(periodo("01/12 a 31/12", "2027-01")).toEqual({ inicio: "2026-12-01", fim: "2026-12-31" });
    expect(periodo("21/08 A 20/09")).toBeNull();
    expect(periodo("31/02 a 10/03", "2026-03")).toBeNull();
  });

  it("valores, fórmulas quebradas e flags", () => {
    expect(valor("R$ 18.000,00")).toBe(18000);
    expect(valor(1234.567)).toBe(1234.57);
    expect(valor("#REF!")).toBeNull();
    expect(ehErroFormula("#N/D")).toBe(true);
    expect(simNao("ok")).toBe(true);
    expect(simNao("Não")).toBe(false);
  });

  it("status livres → enum", () => {
    expect(statusMedicao("FATURADO")).toBe("faturado");
    expect(statusMedicao("Faturar")).toBe("a_faturar");
    expect(statusMedicao("pago")).toBe("recebido");
    expect(statusMedicao("", "2026-09-10")).toBe("recebido");
    expect(statusMedicao("Cancelada")).toBe("cancelado");
  });

  it("responsável vira contato", () => {
    expect(contato("Juliana - faturamento@cymi.com.br")).toMatchObject({ email: "faturamento@cymi.com.br", whatsapp: null });
    expect(contato("(17) 99123-4567")).toMatchObject({ email: null, whatsapp: "5517991234567" });
  });

  it("forma/banco, parcela e competência da aba", () => {
    expect(formaBanco("Cartão Inter")).toEqual({ forma: "cartao", banco: "Inter" });
    expect(formaBanco("Boleto Bradesco")).toEqual({ forma: "boleto", banco: "Bradesco" });
    expect(formaBanco("Débito automático Sicredi")).toEqual({ forma: "debito_automatico", banco: "Sicredi" });
    expect(parcela("Financiamento Guindaste 15/53")).toEqual({ num: 15, total: 53 });
    expect(competenciaAba("Oliveira SET26")).toBe("2026-09");
    expect(competenciaAba("Sub-locado SET26")).toBe("2026-09");
    expect(competenciaAba("Outubro26")).toBe("2026-10");
    expect(competenciaAba("Março27")).toBe("2027-03");
    expect(chave(" Período Medição ")).toBe("periodo medicao");
  });
});

describe("nfDasObservacoes", () => {
  it.each([
    ["2330", { nf: "2330", resto: null }],
    ["NF 159", { nf: "159", resto: null }],
    ["Fatura 2305", { nf: "2305", resto: null }],
    ["Desmobilizado 20/08 - faturar mês de setembro até dia 20/09 2326", { nf: "2326", resto: "Desmobilizado 20/08 - faturar mês de setembro até dia 20/09" }],
    ["faturar até 20/09", { nf: null, resto: "faturar até 20/09" }],
    ["cliente pediu desconto", { nf: null, resto: "cliente pediu desconto" }],
    ["", { nf: null, resto: null }],
  ])("%s", (obs, esperado) => expect(nfDasObservacoes(obs)).toEqual(esperado));
});

