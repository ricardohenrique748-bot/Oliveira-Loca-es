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

export interface RepasseNoRecibo {
  periodo_inicio: string; periodo_fim: string; dias: number | null; valor_bruto: number; valor_liquido: number;
  abatimentos: { descricao: string; valor: number }[];
  /** recibo com várias placas: a placa e a empresa pagadora deste repasse (sem: as do recibo) */
  placa?: string;
  empresa?: EmpresaDoc;
  /** acréscimos gravados neste repasse (somam ao líquido) */
  acrescimos?: ItemRecibo[];
}

export interface DadosReciboRepasse {
  /** placa e empresa padrão (recibo de uma placa só) */
  placa: string;
  empresa: EmpresaDoc;
  locador: { nome: string; cpf_cnpj: string | null; chave_pix: string | null; tipo_chave_pix: keyof typeof ROTULOS.tipoChavePix | null; banco: string | null; nome_titular_pix: string | null };
  repasses: RepasseNoRecibo[];
  /** data impressa no recibo (yyyy-mm-dd) */
  data: string;
  /** digitados na hora de gerar: só saem no recibo, não mudam o repasse registrado (contam na empresa padrão) */
  ajustes?: { acrescimos: ItemRecibo[]; descontos: ItemRecibo[] };
}
export type ItemRecibo = { descricao: string; valor: number };

const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

/**
 * Um recibo para um ou vários repasses do mesmo locador. Várias placas: cada linha diz a placa.
 * Várias empresas pagadoras: subtotal de cada uma e o texto do recibo cita cada empresa com o seu valor.
 */
export function montarReciboRepasse(d: DadosReciboRepasse): Documento {
  const rs = [...d.repasses].sort((a, b) => (a.placa ?? d.placa).localeCompare(b.placa ?? d.placa) || a.periodo_inicio.localeCompare(b.periodo_inicio));
  const ini = rs.reduce((m, r) => (r.periodo_inicio < m ? r.periodo_inicio : m), rs[0].periodo_inicio);
  const fim = rs.reduce((m, r) => (r.periodo_fim > m ? r.periodo_fim : m), rs[0].periodo_fim);
  const placas = [...new Set(rs.map((r) => formatPlaca(r.placa ?? d.placa)))];
  const placa = placas.join(", ");
  const extras = d.ajustes?.acrescimos ?? [], descontos = d.ajustes?.descontos ?? [];
  const acrescimosDe = (r: RepasseNoRecibo) => r.acrescimos ?? [];
  const liquidoDe = (r: RepasseNoRecibo) => somar([r.valor_liquido, ...acrescimosDe(r).map((a) => a.valor)]);
  const temAcrescimo = extras.length > 0 || rs.some((r) => acrescimosDe(r).length > 0);
  const temAbatimento = rs.some((r) => r.abatimentos.length > 0) || descontos.length > 0;

  // empresas pagadoras, na ordem em que aparecem; os ajustes digitados contam na empresa padrão
  const chave = (e: EmpresaDoc) => `${e.razao_social}|${e.cnpj ?? ""}`;
  const empresas: { e: EmpresaDoc; valor: number }[] = [];
  const empresaDe = (e: EmpresaDoc) => {
    let x = empresas.find((y) => chave(y.e) === chave(e));
    if (!x) empresas.push(x = { e, valor: 0 });
    return x;
  };
  for (const r of rs) { const x = empresaDe(r.empresa ?? d.empresa); x.valor = somar([x.valor, liquidoDe(r)]); }
  const padrao = empresaDe(d.empresa);
  padrao.valor = somar([padrao.valor, ...extras.map((a) => a.valor), ...descontos.map((a) => -a.valor)]);
  const pagadoras = empresas.filter((x) => x.valor !== 0 || x === padrao);
  const liquido = somar(pagadoras.map((x) => x.valor));
  const variasEmpresas = pagadoras.length > 1;

  // uma linha por repasse; acréscimos e despesas descontadas logo abaixo; com várias empresas, subtotal de cada uma
  const linhasDoRepasse = (r: RepasseNoRecibo) => [
    [`Repasse da locação · placa ${formatPlaca(r.placa ?? d.placa)}`, formatPeriodo(r.periodo_inicio, r.periodo_fim), r.dias != null ? String(r.dias) : "", formatBRL(r.valor_bruto)],
    ...acrescimosDe(r).map((a) => [`   (+) ${a.descricao}`, "", "", formatBRL(a.valor)]),
    ...r.abatimentos.map((a) => [`   (-) ${a.descricao}`, "", "", `- ${formatBRL(a.valor)}`]),
  ];
  const ajustesDigitados = [
    ...extras.map((a) => [`(+) ${a.descricao}`, "", "", formatBRL(a.valor)]),
    ...descontos.map((a) => [`(-) ${a.descricao}`, "", "", `- ${formatBRL(a.valor)}`]),
  ];
  const linhas: string[][] = variasEmpresas
    ? pagadoras.flatMap((x) => [
      ...rs.filter((r) => chave(r.empresa ?? d.empresa) === chave(x.e)).flatMap(linhasDoRepasse),
      ...(x === padrao ? ajustesDigitados : []),
      [`Subtotal · ${x.e.razao_social}`, "", "", formatBRL(x.valor)],
    ])
    : [...rs.flatMap(linhasDoRepasse), ...ajustesDigitados];
  const l = d.locador;
  const pix = l.chave_pix ? `${l.tipo_chave_pix ? `${ROTULOS.tipoChavePix[l.tipo_chave_pix]}: ` : ""}${l.chave_pix}${l.nome_titular_pix ? ` (${l.nome_titular_pix})` : ""}` : "";

  const deQuem = (e: EmpresaDoc) => `${e.razao_social}${e.cnpj ? `, CNPJ ${e.cnpj},` : ""}`;
  const recebi = variasEmpresas
    ? `Recebi ${lista(pagadoras.map((x) => `de ${deQuem(x.e)} a importância de ${formatBRL(x.valor)} (${valorPorExtenso(x.valor)})`))}, totalizando ${formatBRL(liquido)} (${valorPorExtenso(liquido)}), `
    : `Recebi de ${deQuem(d.empresa)} a importância de ${formatBRL(liquido)} (${valorPorExtenso(liquido)}), `;
  const veiculos = placas.length > 1 ? `dos veículos placas ${lista(placas)}` : `do veículo placa ${placa}`;
  const ressalva = temAcrescimo ? ", já considerados os acréscimos e descontos acima" : temAbatimento ? ", já descontadas as despesas acima" : "";

  const blocos: Bloco[] = [
    { t: "titulo", texto: "REPASSE", sub: `${placas.length > 1 ? "Placas" : "Placa"} ${placa} · ${formatPeriodo(ini, fim)}` },
    { t: "secao", texto: "Locador" },
    { t: "campos", colunas: 2, pares: [["Nome", l.nome], ["CPF/CNPJ", l.cpf_cnpj ?? ""], ["PIX", pix], ["Banco", l.banco ?? ""]] },
    { t: "secao", texto: variasEmpresas ? "Pagadores" : "Pagador" },
    { t: "campos", colunas: 2, pares: pagadoras.flatMap((x) => [["Razão social", x.e.razao_social], ["CNPJ", x.e.cnpj ?? ""]] as [string, string][]) },
    { t: "secao", texto: "Discriminação" },
    { t: "tabela", cabecalho: ["Descrição", "Período", "Dias", "Valor"], linhas, direita: [2, 3], larguras: [0, 40, 16, 30],
      total: [temAbatimento || temAcrescimo ? "Total líquido do repasse" : "Total do repasse", "", "", formatBRL(liquido)] },
    { t: "espaco", mm: 4 },
    { t: "paragrafo", texto: `${recebi}referente ao repasse da locação ${veiculos} no período de ${formatData(ini)} a ${formatData(fim)}${ressalva}, dando plena quitação ${variasEmpresas ? "destes valores" : "deste valor"}.` },
    { t: "espaco", mm: 2 },
    { t: "paragrafo", alinhar: "direita", texto: `${d.empresa.cidade ? `${d.empresa.cidade}${d.empresa.uf ? `/${d.empresa.uf}` : ""}, ` : ""}${formatData(d.data)}` },
    { t: "espaco", mm: 10 },
    { t: "assinaturas", partes: [{ titulo: l.nome, linhas: [l.cpf_cnpj ? `CPF/CNPJ ${l.cpf_cnpj}` : "Locador"] }] },
  ];

  const nomeArquivo = placas.length > 1 ? placas.join("_") : placa;
  return {
    arquivo: `recibo_repasse_${nomeArquivo}_${ini}_a_${fim}`,
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
