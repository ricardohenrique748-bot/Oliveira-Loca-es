/**
 * Fatura de locação (antigo "boletim de medição") para enviar ao cliente.
 * Função pura: os dados chegam prontos e o PDF é desenhado por pdf.ts.
 */
import { formatBRL, formatCompetencia, formatData, formatPeriodo, formatPlaca } from "@/lib/format";
import { ROTULOS } from "@/lib/schemas/cadastros";
import { FORMAS_FATURA, type FormaFatura, type ItemFatura } from "@/lib/schemas/operacao";
import type { Bloco, Documento } from "./pdf";
import { enderecoCompleto, type ClienteDoc, type EmpresaDoc } from "./proposta";

export interface DadosFatura {
  contrato_numero: string | null; tipo_cobranca: "mensal" | "diaria" | "hora"; base_dias: number;
  periodo_inicio: string; periodo_fim: string; dias: number;
  valor_mensal: number; valor_base: number; acrescimos: number; descontos: number; valor_final: number;
  numero_nf: string | null; data_emissao: string | null; data_vencimento: string | null;
  forma_pagamento: FormaFatura; acrescimos_itens: ItemFatura[]; descontos_itens: ItemFatura[]; observacoes: string | null;
  placa: string; veiculo_tipo: keyof typeof ROTULOS.tipoVeiculo | null; obra: string | null;
  empresa: EmpresaDoc; cliente: ClienteDoc;
}

// conta de recebimento impressa em toda fatura
const DADOS_BANCARIOS = "PIX: 32.511.022/0001-02    Banco Bradesco · Agência 0023-0 · C/C 0390538-1";

/** "Locação de munck placa CVP-0414" */
export function descricaoPadrao(d: Pick<DadosFatura, "veiculo_tipo" | "placa">): string {
  const tipo = d.veiculo_tipo ? ROTULOS.tipoVeiculo[d.veiculo_tipo]?.toLowerCase() : null;
  return `Locação ${tipo ? `de ${tipo} ` : ""}placa ${formatPlaca(d.placa)}`;
}

export function montarFatura(d: DadosFatura): Documento {
  const diaria = d.tipo_cobranca === "diaria";
  const competencia = formatCompetencia(d.periodo_fim.slice(0, 7), true);
  const hora = d.tipo_cobranca === "hora";
  const qtd = hora ? `${d.dias} h` : `${d.dias} ${diaria ? (d.dias === 1 ? "diária" : "diárias") : d.dias === 1 ? "dia" : "dias"}`;

  const itens: string[][] = [
    [descricaoPadrao(d), formatPeriodo(d.periodo_inicio, d.periodo_fim), qtd, formatBRL(d.valor_mensal), formatBRL(d.valor_base)],
  ];
  // cada acréscimo discriminado; fatura antiga só com o total sai numa linha "Acréscimos"
  const acrescimos = d.acrescimos_itens.length ? d.acrescimos_itens : d.acrescimos > 0 ? [{ descricao: "Acréscimos", valor: d.acrescimos }] : [];
  for (const a of acrescimos) itens.push([a.descricao, "", "", "", formatBRL(a.valor)]);
  const descontos = d.descontos_itens.length ? d.descontos_itens : d.descontos > 0 ? [{ descricao: "Descontos", valor: d.descontos }] : [];
  for (const a of descontos) itens.push([a.descricao, "", "", "", `- ${formatBRL(a.valor)}`]);

  const blocos: Bloco[] = [
    { t: "titulo", texto: "FATURA DE LOCAÇÃO", sub: `Competência ${competencia}` },
    { t: "secao", texto: "Cliente" },
    { t: "campos", colunas: 2, pares: [
      ["Razão social", d.cliente.razao_social], ["CNPJ/CPF", d.cliente.cnpj ?? ""],
      ["Endereço", enderecoCompleto(d.cliente)], ["Obra", d.obra ?? ""],
    ] },
    { t: "secao", texto: "Dados da fatura" },
    { t: "campos", colunas: 2, pares: [
      ["Contrato", d.contrato_numero ?? ""], ["Placa", formatPlaca(d.placa)],
      ["Nota fiscal", d.numero_nf ?? ""], ["Pagamento", FORMAS_FATURA[d.forma_pagamento] ?? d.forma_pagamento],
      ["Emissão", formatData(d.data_emissao)], ["Vencimento", formatData(d.data_vencimento)],
    ] },
    { t: "secao", texto: "Discriminação" },
    { t: "tabela", cabecalho: ["Descrição", "Período", "Qtd.", diaria ? "Diária" : hora ? "Valor/hora" : "Valor mensal", "Valor"], linhas: itens,
      direita: [2, 3, 4], larguras: [0, 40, 22, 28, 28], total: ["Total da fatura", "", "", "", formatBRL(d.valor_final)] },
    { t: "espaco", mm: 2 },
    ...(d.observacoes ? [{ t: "paragrafo", rotulo: "Observações:", texto: d.observacoes } as Bloco] : []),
    { t: "secao", texto: "Dados bancários" },
    { t: "paragrafo", texto: DADOS_BANCARIOS },
    { t: "espaco", mm: 6 },
    { t: "assinaturas", partes: [
      { titulo: d.empresa.razao_social, linhas: d.empresa.cnpj ? [`CNPJ ${d.empresa.cnpj}`] : [] },
      { titulo: "De acordo — cliente", linhas: [d.cliente.razao_social] },
    ] },
  ];

  return {
    arquivo: `fatura_${d.contrato_numero ?? formatPlaca(d.placa)}_${d.periodo_fim.slice(0, 7)}`,
    cabecalho: `Fatura${d.numero_nf ? ` · NF ${d.numero_nf}` : ""} · ${d.contrato_numero ?? formatPlaca(d.placa)}`,
    rodape: [], // fatura sem rodapé de empresa/contato
    blocos,
  };
}
