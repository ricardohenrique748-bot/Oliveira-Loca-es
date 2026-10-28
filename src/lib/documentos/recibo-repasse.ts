/**
 * Recibo de repasse para o locador (sublocado) assinar.
 * Só o repasse: período, valor, abatimentos e líquido — sem receita da fatura nem margem.
 * Função pura: os dados chegam prontos e o PDF é desenhado por pdf.ts.
 */
import { formatBRL, formatData, formatPeriodo, formatPlaca } from "@/lib/format";
import { somar } from "@/lib/calculos";
import { ROTULOS } from "@/lib/schemas/cadastros";
import { valorPorExtenso } from "./extenso";
import type { Bloco, Documento } from "./pdf";
import type { EmpresaDoc } from "./proposta";

export interface DadosReciboRepasse {
  placa: string;
  empresa: EmpresaDoc;
  locador: { nome: string; cpf_cnpj: string | null; chave_pix: string | null; tipo_chave_pix: keyof typeof ROTULOS.tipoChavePix | null; banco: string | null; nome_titular_pix: string | null };
  repasses: { periodo_inicio: string; periodo_fim: string; dias: number | null; valor_bruto: number; valor_liquido: number; abatimentos: { descricao: string; valor: number }[] }[];
  /** data impressa no recibo (yyyy-mm-dd) */
  data: string;
  /** digitados na hora de gerar: só saem no recibo, não mudam o repasse registrado */
  ajustes?: { acrescimos: ItemRecibo[]; descontos: ItemRecibo[] };
}
export type ItemRecibo = { descricao: string; valor: number };

export function montarReciboRepasse(d: DadosReciboRepasse): Documento {
  const placa = formatPlaca(d.placa);
  const rs = [...d.repasses].sort((a, b) => a.periodo_inicio.localeCompare(b.periodo_inicio));
  const ini = rs[0].periodo_inicio, fim = rs.reduce((m, r) => (r.periodo_fim > m ? r.periodo_fim : m), rs[0].periodo_fim);
  const acrescimos = d.ajustes?.acrescimos ?? [], descontos = d.ajustes?.descontos ?? [];
  const liquido = somar([...rs.map((r) => r.valor_liquido), ...acrescimos.map((a) => a.valor), ...descontos.map((a) => -a.valor)]);
  const temAbatimento = rs.some((r) => r.abatimentos.length > 0) || descontos.length > 0;

  // uma linha por repasse; com abatimento, as despesas descontadas logo abaixo
  const linhas: string[][] = rs.flatMap((r) => [
    [`Repasse da locação · placa ${placa}`, formatPeriodo(r.periodo_inicio, r.periodo_fim), r.dias != null ? String(r.dias) : "", formatBRL(r.valor_bruto)],
    ...r.abatimentos.map((a) => [`   (-) ${a.descricao}`, "", "", `- ${formatBRL(a.valor)}`]),
  ]).concat(
    acrescimos.map((a) => [`(+) ${a.descricao}`, "", "", formatBRL(a.valor)]),
    descontos.map((a) => [`(-) ${a.descricao}`, "", "", `- ${formatBRL(a.valor)}`]),
  );
  const l = d.locador;
  const pix = l.chave_pix ? `${l.tipo_chave_pix ? `${ROTULOS.tipoChavePix[l.tipo_chave_pix]}: ` : ""}${l.chave_pix}${l.nome_titular_pix ? ` (${l.nome_titular_pix})` : ""}` : "";

  const blocos: Bloco[] = [
    { t: "titulo", texto: "REPASSE", sub: `Placa ${placa} · ${formatPeriodo(ini, fim)}` },
    { t: "secao", texto: "Locador" },
    { t: "campos", colunas: 2, pares: [["Nome", l.nome], ["CPF/CNPJ", l.cpf_cnpj ?? ""], ["PIX", pix], ["Banco", l.banco ?? ""]] },
    { t: "secao", texto: "Pagador" },
    { t: "campos", colunas: 2, pares: [["Razão social", d.empresa.razao_social], ["CNPJ", d.empresa.cnpj ?? ""]] },
    { t: "secao", texto: "Discriminação" },
    { t: "tabela", cabecalho: ["Descrição", "Período", "Dias", "Valor"], linhas, direita: [2, 3], larguras: [0, 40, 16, 30],
      total: [temAbatimento || acrescimos.length ? "Total líquido do repasse" : "Total do repasse", "", "", formatBRL(liquido)] },
    { t: "espaco", mm: 4 },
    { t: "paragrafo", texto: `Recebi de ${d.empresa.razao_social}${d.empresa.cnpj ? `, CNPJ ${d.empresa.cnpj},` : ""} a importância de ${formatBRL(liquido)} (${valorPorExtenso(liquido)}), `
      + `referente ao repasse da locação do veículo placa ${placa} no período de ${formatData(ini)} a ${formatData(fim)}${acrescimos.length ? ", já considerados os acréscimos e descontos acima" : temAbatimento ? ", já descontadas as despesas acima" : ""}, dando plena quitação deste valor.` },
    { t: "espaco", mm: 2 },
    { t: "paragrafo", alinhar: "direita", texto: `${d.empresa.cidade ? `${d.empresa.cidade}${d.empresa.uf ? `/${d.empresa.uf}` : ""}, ` : ""}${formatData(d.data)}` },
    { t: "espaco", mm: 10 },
    { t: "assinaturas", partes: [{ titulo: l.nome, linhas: [l.cpf_cnpj ? `CPF/CNPJ ${l.cpf_cnpj}` : "Locador"] }] },
  ];

  return {
    arquivo: `recibo_repasse_${placa}_${ini}_a_${fim}`,
    cabecalho: `Recibo de repasse · ${placa}`,
    rodape: [],
    blocos,
  };
}

export interface DadosReciboDescontos {
  placa: string;
  empresa: EmpresaDoc;
  locador: DadosReciboRepasse["locador"];
  descontos: { descricao: string; data: string | null; valor: number }[];
  data: string;
  /** digitados na hora de gerar: só saem no recibo */
  ajustes?: { acrescimos: ItemRecibo[]; descontos: ItemRecibo[] };
}

/**
 * Mesmo modelo do recibo de repasse, para a placa que ainda não tem fatura:
 * só as despesas que serão descontadas no próximo repasse (o locador assina a ciência).
 */
export function montarReciboDescontos(d: DadosReciboDescontos): Documento {
  const placa = formatPlaca(d.placa);
  const ds = [...d.descontos].sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
  const acrescimos = d.ajustes?.acrescimos ?? [], extras = d.ajustes?.descontos ?? [];
  // saldo: negativo = a descontar do locador; positivo = a favor dele
  const saldo = somar([...acrescimos.map((a) => a.valor), ...ds.map((x) => -x.valor), ...extras.map((x) => -x.valor)]);
  const total = Math.abs(saldo);
  const linhas = [
    ...ds.map((x) => [`(-) ${x.descricao}`, formatData(x.data), `- ${formatBRL(x.valor)}`]),
    ...extras.map((x) => [`(-) ${x.descricao}`, "", `- ${formatBRL(x.valor)}`]),
    ...acrescimos.map((x) => [`(+) ${x.descricao}`, "", formatBRL(x.valor)]),
  ];
  const l = d.locador;
  const pix = l.chave_pix ? `${l.tipo_chave_pix ? `${ROTULOS.tipoChavePix[l.tipo_chave_pix]}: ` : ""}${l.chave_pix}${l.nome_titular_pix ? ` (${l.nome_titular_pix})` : ""}` : "";

  const blocos: Bloco[] = [
    { t: "titulo", texto: "DESCONTOS A ABATER", sub: `Placa ${placa} · aguardando fatura` },
    { t: "secao", texto: "Locador" },
    { t: "campos", colunas: 2, pares: [["Nome", l.nome], ["CPF/CNPJ", l.cpf_cnpj ?? ""], ["PIX", pix], ["Banco", l.banco ?? ""]] },
    { t: "secao", texto: "Pagador" },
    { t: "campos", colunas: 2, pares: [["Razão social", d.empresa.razao_social], ["CNPJ", d.empresa.cnpj ?? ""]] },
    { t: "secao", texto: "Discriminação" },
    { t: "tabela", cabecalho: ["Descrição", "Data", "Valor"], linhas, direita: [2], larguras: [0, 40, 30],
      total: saldo <= 0 ? ["Total a descontar", "", `- ${formatBRL(total)}`] : ["Saldo a favor do locador", "", formatBRL(total)] },
    { t: "espaco", mm: 4 },
    { t: "paragrafo", texto: saldo <= 0
      ? `Estou ciente de que os valores acima, do veículo placa ${placa}, no total de ${formatBRL(total)} (${valorPorExtenso(total)}), `
        + `serão descontados do próximo repasse da locação a ser pago por ${d.empresa.razao_social}${d.empresa.cnpj ? `, CNPJ ${d.empresa.cnpj}` : ""}.`
      : `Estou ciente dos valores acima, do veículo placa ${placa}, que resultam em saldo de ${formatBRL(total)} (${valorPorExtenso(total)}) a meu favor, `
        + `a ser considerado no próximo repasse da locação pago por ${d.empresa.razao_social}${d.empresa.cnpj ? `, CNPJ ${d.empresa.cnpj}` : ""}.` },
    { t: "espaco", mm: 2 },
    { t: "paragrafo", alinhar: "direita", texto: `${d.empresa.cidade ? `${d.empresa.cidade}${d.empresa.uf ? `/${d.empresa.uf}` : ""}, ` : ""}${formatData(d.data)}` },
    { t: "espaco", mm: 10 },
    { t: "assinaturas", partes: [{ titulo: l.nome, linhas: [l.cpf_cnpj ? `CPF/CNPJ ${l.cpf_cnpj}` : "Locador"] }] },
  ];

  return { arquivo: `descontos_${placa}_${d.data}`, cabecalho: `Descontos a abater · ${placa}`, rodape: [], blocos };
}
