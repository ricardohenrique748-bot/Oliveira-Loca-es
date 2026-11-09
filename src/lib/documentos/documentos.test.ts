import { describe, expect, it } from "vitest";
import { montarContrato } from "./contrato";
import { contrato, propostaCaminhao, propostaGuindaste } from "./fixtures";
import { descricaoEquipamento, montarProposta } from "./proposta";
import { montarFatura } from "./fatura";
import { montarReciboRepasse } from "./recibo-repasse";
import type { Bloco, Documento } from "./pdf";

/** todo o texto do documento, para buscar trechos */
function texto(d: Documento): string {
  const de = (b: Bloco): string[] => {
    switch (b.t) {
      case "titulo": return [b.texto, b.sub ?? ""];
      case "secao": return [b.texto];
      case "paragrafo": return [`${b.rotulo ?? ""} ${b.texto}`];
      case "lista": return b.itens;
      case "tabela": return [...(b.cabecalho ?? []), ...b.linhas.flat()];
      case "campos": return b.pares.flat();
      case "assinaturas": return b.partes.flatMap((p) => [p.titulo, ...p.linhas]);
      default: return [];
    }
  };
  return [d.cabecalho, ...d.rodape, ...d.blocos.flatMap(de)].join("\n");
}

describe("proposta — modelo guindaste/munck", () => {
  const d = montarProposta(propostaGuindaste);
  const t = texto(d);

  it("cabeçalho, rodapé e dados das partes", () => {
    expect(d.cabecalho).toBe("Proposta Comercial Nº PR-098/26");
    expect(d.rodape[0]).toBe("TDTS & OLIVEIRA LOCAÇÕES LTDA  ·  CNPJ 32.511.022/0001-02");
    expect(d.rodape[1]).toContain("Contato: Thiago");
    expect(d.rodape[1]).toContain("(17) 99186-9942");
    expect(t).toContain("Data de emissão: 10/09/2026");
    expect(t).toContain("Otávio");
    expect(t).toContain("compras@raf.com.br");
  });

  it("preços com franquia, km livre, mobilização e desmobilização", () => {
    const precos = d.blocos.filter((b): b is Extract<Bloco, { t: "tabela" }> => b.t === "tabela");
    expect(precos[0].cabecalho).toEqual(["Item", "Descrição", "Quant.", "Valor mensal"]);
    expect(precos[0].linhas[0]).toEqual(["01", "Guindaste telescópico rodoviário 40t XCMG", "220 horas/mês", "R$ 55.000,00 / mês"]);
    expect(precos[0].linhas[1][1]).toBe("3 mil km livres/mês");
    expect(precos[1].linhas).toEqual([["01", "Mobilização", "01", "R$ 10.000,00"], ["02", "Desmobilização", "01", "R$ 10.000,00"]]);
  });

  it("condições do modelo e as digitadas na proposta", () => {
    expect(t).toContain("Local da operação: Usina Norte");
    expect(t).toContain("garantia de 10 horas por dia, de segunda a sexta-feira, das 07:00 às 17:00");
    expect(t).toContain("multa de 10% sobre o valor total da proposta");
    expect(t).toContain("30 dias após a medição");
    expect(t).toContain("Supervisor de rigging");
    expect(t).toContain("Seguro de carga por conta da contratante");
    expect(t).toContain("Fatura de Locação");
    expect(t).toContain("10/10/2026");
  });
});

describe("proposta — modelo caminhão", () => {
  const d = montarProposta(propostaCaminhao);
  const t = texto(d);

  it("data com a cidade da empresa e A/C do cliente", () => {
    expect(t).toContain("SÃO JOSÉ DO RIO PRETO/SP, 10/09/2026");
    expect(t).toContain("A/C RAF Empreendimento Imobiliário SPE Ltda (RAF) — Otávio");
  });

  it("diárias com franquia e o veículo do cadastro", () => {
    const tab = d.blocos.find((b): b is Extract<Bloco, { t: "tabela" }> => b.t === "tabela")!;
    expect(tab.linhas[0]).toEqual(["01", "Caminhão VW 13.180 2006 — placa AOI5A59", "2 diárias — mínima de 5 horas", "R$ 1.800,00 / diária"]);
    expect(d.blocos.filter((b) => b.t === "tabela")).toHaveLength(1);
  });

  it("escopo sem operador e condições A–H", () => {
    expect(t).toContain("Motoristas e todas as despesas trabalhistas.");
    expect(t).toContain("Pagamento em 15 dias após a emissão da fatura");
    expect(t).toContain("fechamento no último dia de cada mês");
    expect(t).toContain("lavagem e lubrificação mensal");
    expect(t).toContain("aprovado via e-mail");
    expect(t).not.toContain("Supervisor de rigging");
  });

  it("descrição livre tem prioridade e mantém a placa", () => {
    expect(descricaoEquipamento({ equipamento: "Caminhão munck 15t", veiculo: propostaCaminhao.veiculo })).toBe("Caminhão munck 15t (placa AOI5A59)");
  });
});

describe("contrato de locação", () => {
  const d = montarContrato(contrato);
  const t = texto(d);

  it("partes, objeto e ficha resumo", () => {
    expect(d.cabecalho).toBe("Contrato de Locação Nº CT-012/26");
    expect(t).toContain("TDTS & OLIVEIRA LOCAÇÕES LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob nº 32.511.022/0001-02");
    expect(t).toContain("com sede na Av. Brasil, 100 — Mirassol/SP");
    expect(t).toContain("9BWB672S06R619481");
    expect(t).toContain("VW 13.180 (2006) — Placa AOI5A59 — cláusula 1");
  });

  it("prazo, preço e pagamento por extenso", () => {
    expect(t).toContain("O início da locação está previsto para o dia 20/07/2026.");
    expect(t).toContain("O prazo de locação será de 180 (cento e oitenta) dias");
    expect(t).toContain("\n180 dias — cláusula 2");
    expect(t).toContain("R$ 9.000,00 (nove mil reais) por mês");
    expect(t).toContain("15 (quinze) dias contados da emissão da respectiva fatura/nota fiscal");
    expect(t).toContain("entre o primeiro e o último dia de cada mês");
  });

  it("multa de rescisão e foro na cidade da empresa", () => {
    expect(t).toContain("multa compensatória de 20% (vinte por cento)");
    expect(t).toContain("Foro da Comarca de São José do Rio Preto/SP");
    expect(t).toContain("Retirada e devolução em São José do Rio Preto/SP");
  });

  it("numera as 24 cláusulas e os itens em sequência", () => {
    const secoes = d.blocos.filter((b): b is Extract<Bloco, { t: "secao" }> => b.t === "secao").map((b) => b.texto);
    expect(secoes.filter((s) => /^\d+\. /.test(s))).toHaveLength(24);
    const rot = d.blocos.flatMap((b) => (b.t === "paragrafo" && b.rotulo ? [b.rotulo] : []));
    expect(rot.filter((r) => r.startsWith("1."))).toEqual(["1.1.", "1.2.", "1.3.", "1.4."]);
    expect(rot.filter((r) => r.startsWith("14."))).toHaveLength(7);
  });

  it("diária, corte 21 e prazo indeterminado", () => {
    const t2 = texto(montarContrato({ ...contrato, tipo_cobranca: "diaria", valor_mensal: 450, dia_corte_inicio: 21, data_fim: null }));
    expect(t2).toContain("R$ 450,00 (quatrocentos e cinquenta reais) por diária");
    expect(t2).toContain("entre o dia 21 (vinte e um) de cada mês e o dia 20 (vinte) do mês seguinte");
    expect(t2).toContain("prazo indeterminado");
    expect(t2).toContain("Indeterminado — cláusula 2");
  });
});

describe("fatura — nome do arquivo", () => {
  it("sai com a placa e o mês da competência", () => {
    const d = montarFatura({
      contrato_numero: "TD-001/26", tipo_cobranca: "mensal", base_dias: 30, periodo_inicio: "2026-10-01", periodo_fim: "2026-10-31", dias: 15,
      valor_mensal: 8500, valor_base: 4250, acrescimos: 0, descontos: 0, valor_final: 4250, numero_nf: null, data_emissao: "2026-10-23", data_vencimento: "2026-11-07",
      forma_pagamento: "boleto", acrescimos_itens: [], descontos_itens: [], observacoes: null,
      placa: "DWK9E10", veiculo_tipo: "caminhao", obra: null, empresa: propostaGuindaste.empresa, cliente: propostaGuindaste.cliente,
    });
    expect(d.arquivo).toBe("fatura_DWK9E10_outubro_2026");
  });
});

describe("recibo de repasse ao locador", () => {
  const base = {
    placa: "DWK9E10", data: "2026-11-05",
    empresa: { razao_social: "Oliveira Locações Ltda", cnpj: "32.511.022/0001-02", endereco: null, cidade: "São José do Rio Preto", uf: "SP", contato_nome: null, telefone: null, email: null },
    locador: { nome: "Robson", cpf_cnpj: "123.456.789-00", chave_pix: "robson@email.com", tipo_chave_pix: "email" as const, banco: null, nome_titular_pix: null },
  };

  it("só o repasse, por extenso, sem receita da fatura", () => {
    const d = montarReciboRepasse({ ...base, repasses: [{ periodo_inicio: "2026-10-01", periodo_fim: "2026-10-31", dias: 31, valor_bruto: 3000, valor_liquido: 3000, abatimentos: [] }] });
    const t = texto(d);
    expect(d.blocos[0]).toMatchObject({ t: "titulo", texto: "REPASSE" });
    expect(t).toContain("três mil reais");
    expect(t).toContain("E-mail: robson@email.com");
    expect(t).not.toMatch(/10\.680/);
    expect(d.arquivo).toBe("recibo_repasse_DWK9E10_2026-10-01_a_2026-10-31");
  });

  it("abatimentos descontados e total líquido", () => {
    const d = montarReciboRepasse({ ...base, repasses: [{ periodo_inicio: "2026-10-01", periodo_fim: "2026-10-31", dias: 31, valor_bruto: 3000, valor_liquido: 2700,
      abatimentos: [{ descricao: "Pneu", valor: 300 }] }] });
    const t = texto(d);
    expect(t).toContain("(-) Pneu");
    expect(t).toContain("dois mil e setecentos reais");
    expect(t).toContain("já descontadas as despesas");
  });

  it("acréscimos e descontos digitados só no recibo", () => {
    const d = montarReciboRepasse({ ...base, repasses: [{ periodo_inicio: "2026-10-01", periodo_fim: "2026-10-31", dias: 31, valor_bruto: 3000, valor_liquido: 3000, abatimentos: [] }],
      ajustes: { acrescimos: [{ descricao: "Frete", valor: 500 }], descontos: [{ descricao: "Adiantamento", valor: 1000 }] } });
    const t = texto(d);
    expect(t).toContain("(+) Frete");
    expect(t).toContain("(-) Adiantamento");
    expect(t).toContain("dois mil e quinhentos reais");
    expect(t).toContain("acréscimos e descontos acima");
  });
});

describe("fatura — emitente e cliente completos", () => {
  it("mostra razão social, endereço e CNPJ da empresa e o endereço com CEP do cliente", () => {
    const d = montarFatura({
      contrato_numero: "OL-008/26", tipo_cobranca: "mensal", base_dias: 30, periodo_inicio: "2026-10-01", periodo_fim: "2026-10-31", dias: 29,
      valor_mensal: 8000, valor_base: 7733.33, acrescimos: 0, descontos: 0, valor_final: 7733.33, numero_nf: null, data_emissao: "2026-11-03", data_vencimento: "2026-11-30",
      forma_pagamento: "pix", acrescimos_itens: [], descontos_itens: [], observacoes: "CONTRATO Nº355",
      placa: "KAQ0H45", veiculo_tipo: "caminhao", obra: null,
      empresa: { razao_social: "OLIVEIRA & OLIVEIRA RIO PRETO LTDA", cnpj: "44889430000181", endereco: "Rua Primavera, Quadra D Lote 22 · Condomínio Areia Branca",
        cidade: "São José do Rio Preto", uf: "SP", contato_nome: null, telefone: null, email: null },
      cliente: { razao_social: "CONSTRUTORA LUIZ COSTA LTDA", nome_fantasia: null, cnpj: "00779059000553", endereco: "Av. Wilson Rosado, 1 · Bairro do Planalto",
        cidade: "Mossoró", uf: "RN", email: null, cep: "59633629" },
    });
    const t = texto(d);
    expect(t).toContain("Emitente");
    expect(t).toContain("OLIVEIRA & OLIVEIRA RIO PRETO LTDA");
    expect(t).toContain("44.889.430/0001-81");
    expect(t).toContain("Rua Primavera, Quadra D Lote 22 · Condomínio Areia Branca — São José do Rio Preto/SP");
    expect(t).toContain("Locação");
    expect(t).toContain("00.779.059/0005-53");
    expect(t).toContain("Av. Wilson Rosado, 1 · Bairro do Planalto — Mossoró/RN · CEP 59633-629");
  });
});

describe("contrato — pagamento por dia fixo", () => {
  it("cláusula e quadro com o dia do mês seguinte", () => {
    const t = texto(montarContrato({ ...contrato, dia_pagamento: 10 }));
    expect(t).toContain("O pagamento será efetuado todo dia 10 (dez) do mês seguinte ao da emissão da respectiva fatura/nota fiscal");
    expect(t).toContain("Todo dia 10 do mês seguinte à emissão da fatura");
    expect(texto(montarContrato(contrato))).toContain("no prazo de 15 (quinze) dias contados da emissão");
  });
});

describe("contrato com várias placas", () => {
  const outros = [{ placa: "ABC1D23", marca: "Volvo", modelo: "FH 540", ano: 2021, chassi: "9BV123", cor: "Branca", valor_mensal: 9000 }];

  it("fatura: uma linha por placa, com os dias e o proporcional de cada uma", () => {
    const d = montarFatura({
      contrato_numero: "OL-020/26", tipo_cobranca: "mensal", base_dias: 30, periodo_inicio: "2026-10-01", periodo_fim: "2026-10-31", dias: 30,
      valor_mensal: 27000, valor_base: 24000, acrescimos: 0, descontos: 0, valor_final: 24000, numero_nf: null, data_emissao: null, data_vencimento: null,
      forma_pagamento: "boleto", acrescimos_itens: [], descontos_itens: [], observacoes: null,
      placa: "DWK9E10", veiculo_tipo: "caminhao", obra: null, empresa: propostaGuindaste.empresa, cliente: propostaGuindaste.cliente,
      placas: [
        { veiculo_id: "1", placa: "DWK9E10", tipo: "caminhao", proprietario: "proprio", principal: true, valor_mensal: 18000, valor_repasse_mensal: null, dias: 30, periodo_inicio: "2026-10-01", periodo_fim: "2026-10-31" },
        { veiculo_id: "2", placa: "ABC1D23", tipo: "munck", proprietario: "locador", principal: false, valor_mensal: 9000, valor_repasse_mensal: 6000, dias: 20, periodo_inicio: "2026-10-12", periodo_fim: "2026-10-31" },
      ],
    });
    const tabela = d.blocos.find((b) => b.t === "tabela");
    expect(tabela && tabela.t === "tabela" && tabela.linhas).toEqual([
      ["Locação de caminhão placa DWK9E10", "01/10 a 31/10/2026", "30 dias", "R$ 18.000,00", "R$ 18.000,00"],
      ["Locação de munck placa ABC1D23", "12/10 a 31/10/2026", "20 dias", "R$ 9.000,00", "R$ 6.000,00"],
    ]);
    expect(texto(d)).toContain("DWK9E10, ABC1D23");
  });

  it("contrato: todas as placas no objeto e o valor de cada uma", () => {
    const t = texto(montarContrato({ ...contrato, outros_veiculos: outros }));
    expect(t).toContain("dos seguintes veículos/equipamentos");
    expect(t).toContain("ABC1D23");
    expect(t).toContain("para a placa ABC1D23");
    expect(t).toMatch(/total R\$/);
  });
});
