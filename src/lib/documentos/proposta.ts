/**
 * Conteúdo da proposta comercial nos dois modelos da Oliveira:
 * - caminhão: locação sem operador (motorista e despesas trabalhistas por conta do cliente);
 * - guindaste/munck: com operador da Oliveira, franquia de horas, jornada e mobilização.
 * Função pura: os dados chegam prontos e o PDF é desenhado por pdf.ts.
 */
import { formatBRL, formatData, formatPlaca, maskTelefone } from "@/lib/format";
import { hojeSP } from "@/lib/calculos/datas";
import { ROTULOS } from "@/lib/schemas/cadastros";
import type { ModalidadeProposta, ModeloProposta } from "@/lib/schemas/comercial";
import type { Bloco, Documento } from "./pdf";

export interface EmpresaDoc {
  razao_social: string; cnpj: string | null; endereco: string | null; cidade: string | null; uf: string | null;
  contato_nome: string | null; telefone: string | null; email: string | null;
}
export interface ClienteDoc {
  razao_social: string; nome_fantasia: string | null; cnpj: string | null; endereco: string | null; cidade: string | null; uf: string | null; email: string | null;
}
export interface VeiculoDoc {
  placa: string; tipo: keyof typeof ROTULOS.tipoVeiculo; marca: string | null; modelo: string | null; ano: number | null;
}

export interface DadosProposta {
  numero: string | null; created_at: string; modelo_documento: ModeloProposta; modalidade: ModalidadeProposta;
  tipo_cobranca: "mensal" | "diaria"; valor: number; quantidade: number; franquia: string | null; km_livre: string | null; jornada: string | null;
  equipamento: string | null; veiculo: VeiculoDoc | null; obra: string | null; contato_cliente: string | null; local_operacao: string | null;
  data_inicio_prevista: string | null; periodo_minimo: string | null; validade: string | null;
  prazo_pagamento_dias: number; dia_corte_inicio: number;
  valor_mobilizacao: number | null; valor_desmobilizacao: number | null; multa_rescisao_pct: number; condicoes: string | null;
  empresa: EmpresaDoc; cliente: ClienteDoc;
}

export const JORNADA_PADRAO = "10 horas por dia, de segunda a sexta-feira, das 07:00 às 17:00";

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export const enderecoCompleto = (e: { endereco: string | null; cidade: string | null; uf: string | null }) =>
  [e.endereco, [e.cidade, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" — ");

export const cidadeUF = (e: { cidade: string | null; uf: string | null }) => [e.cidade, e.uf].filter(Boolean).join("/");

/** linhas do rodapé: razão social, CNPJ e contato comercial da empresa emissora */
export function rodapeEmpresa(e: EmpresaDoc): string[] {
  const contato = [e.contato_nome && `Contato: ${e.contato_nome}`, e.telefone && `Telefone: ${maskTelefone(e.telefone)}`, e.email].filter(Boolean).join("  ·  ");
  return [[e.razao_social.toUpperCase(), e.cnpj && `CNPJ ${e.cnpj}`].filter(Boolean).join("  ·  "), ...(contato ? [contato] : [])];
}

/** "Guindaste telescópico 40t" ou, sem descrição, o veículo do cadastro */
export function descricaoEquipamento(p: Pick<DadosProposta, "equipamento" | "veiculo">): string {
  const v = p.veiculo;
  const doVeiculo = v ? [ROTULOS.tipoVeiculo[v.tipo], v.marca, v.modelo, v.ano].filter(Boolean).join(" ") : "";
  if (p.equipamento) return v ? `${p.equipamento} (placa ${formatPlaca(v.placa)})` : p.equipamento;
  return v ? `${doVeiculo} — placa ${formatPlaca(v.placa)}` : "";
}

const fechamento = (dia: number) => (dia === 21 ? "no dia 20 de cada mês (período do dia 21 ao dia 20)" : "no último dia de cada mês (período do dia 01 ao fim do mês)");

/** linhas extras digitadas em "Condições comerciais" */
const extras = (c: string | null) => (c ?? "").split(/\r?\n/).map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);

function tabelaPrecos(p: DadosProposta, colunaQtd: (p: DadosProposta) => string): Bloco[] {
  const diaria = p.tipo_cobranca === "diaria";
  const linhas: string[][] = [["01", descricaoEquipamento(p), colunaQtd(p), `${formatBRL(p.valor)}${diaria ? " / diária" : " / mês"}`]];
  if (p.km_livre) linhas.push(["", p.km_livre, "", ""]);
  const blocos: Bloco[] = [{ t: "tabela", cabecalho: ["Item", "Descrição", "Quant.", diaria ? "Valor por diária" : "Valor mensal"], linhas, direita: [3], larguras: [12, 0, 38, 36] }];
  const mob: string[][] = [];
  if (p.valor_mobilizacao != null) mob.push([String(mob.length + 1).padStart(2, "0"), "Mobilização", "01", formatBRL(p.valor_mobilizacao)]);
  if (p.valor_desmobilizacao != null) mob.push([String(mob.length + 1).padStart(2, "0"), "Desmobilização", "01", formatBRL(p.valor_desmobilizacao)]);
  if (mob.length) blocos.push({ t: "tabela", cabecalho: ["Item", "Descrição", "Quant.", "Valor"], linhas: mob, direita: [3], larguras: [12, 0, 38, 36] });
  return blocos;
}

function modeloCaminhao(p: DadosProposta): Bloco[] {
  const diaria = p.tipo_cobranca === "diaria";
  const qtd = (x: DadosProposta) => {
    // quantidade = nº de diárias (diária) ou de equipamentos (mensal)
    const base = diaria ? `${x.quantidade} diária${x.quantidade > 1 ? "s" : ""}` : `${x.quantidade} unidade${x.quantidade > 1 ? "s" : ""}`;
    return x.franquia ? `${base} — ${x.franquia}` : base;
  };
  const condicoes = [
    "Em caso de descumprimento dos deveres da contratante sobre as condições, sendo pagamentos e/ou alguma condição que venha a prejudicar a contratada, o equipamento será paralisado após notificação da contratada.",
    `Fechamento de acordo com as diretrizes da contratante, ficando acordado o fechamento ${fechamento(p.dia_corte_inicio)}.`,
    `Pagamento em ${p.prazo_pagamento_dias} dias após a emissão da fatura, subsequente ao fechamento.`,
    "Os equipamentos deverão ser entregues da mesma forma que entregamos, exceto desgaste natural, incluindo PNEUS.",
    "Desgaste excessivo e cortes de pneus serão custeados pela empresa contratante.",
    "Em caso de sinistro que venha a ser necessário o acionamento do seguro, a empresa contratante fica responsável pelo pagamento da franquia.",
    "Não descontar em medição dias/horas que foram paralisados por questões climáticas.",
    "A empresa contratante será responsável pelo serviço de borracheiro em caso de furo e corte, lavagem e lubrificação mensal.",
    ...(p.multa_rescisao_pct > 0 ? [`Em caso de quebra de contrato por parte da contratante, será aplicada multa de ${pct(p.multa_rescisao_pct)} sobre o valor total da proposta.`] : []),
    ...extras(p.condicoes),
  ];
  const prazos: [string, string][] = [
    ...(p.data_inicio_prevista ? [["Previsão de mobilização", formatData(p.data_inicio_prevista)] as [string, string]] : []),
    ...(p.periodo_minimo ? [["Período mínimo", p.periodo_minimo] as [string, string]] : []),
    ...(p.validade ? [["Validade da proposta", formatData(p.validade)] as [string, string]] : []),
  ];
  return [
    { t: "secao", texto: "Objetivo" },
    { t: "lista", marcador: "letra", itens: [`Locação de equipamentos${p.local_operacao || p.obra ? ` — ${p.local_operacao || p.obra}` : ""}.`] },
    { t: "secao", texto: "Equipamento e valores" },
    ...tabelaPrecos(p, qtd),
    ...(prazos.length ? [{ t: "campos", pares: prazos, colunas: 1 } as Bloco] : []),
    { t: "secao", texto: "Escopo de fornecimento da contratada" },
    { t: "lista", marcador: "letra", itens: [
      "Prestar assistência e apoio mecânico, quando solicitado e sempre que necessário.",
      "Realizar todas as manutenções preventivas/corretivas dos equipamentos.",
    ] },
    { t: "secao", texto: "Escopo de fornecimento da contratante" },
    { t: "lista", marcador: "letra", itens: ["Fornecimento de combustível.", "Manutenção por má utilização.", "Motoristas e todas as despesas trabalhistas."] },
    { t: "secao", texto: "Condições de pagamento e condições gerais" },
    { t: "lista", marcador: "letra", itens: condicoes },
    { t: "paragrafo", negrito: true, texto: "Para darmos início às mobilizações, é necessário o acordo da contratante sobre as cláusulas acima descritas, sendo aprovado via e-mail." },
  ];
}

function modeloGuindaste(p: DadosProposta): Bloco[] {
  const diaria = p.tipo_cobranca === "diaria";
  const jornada = p.jornada || JORNADA_PADRAO;
  const qtd = (x: DadosProposta) => x.franquia || (diaria ? `${x.quantidade} diária${x.quantidade > 1 ? "s" : ""}` : String(x.quantidade).padStart(2, "0"));
  const aCargoOliveira = ["Fornecimento dos equipamentos", "Fornecimento do operador para operar os equipamentos", "Manutenção",
    "EPIs, obedecendo às normas de segurança", "Óleos lubrificantes"];
  const aCargoContratante = ["Fornecer local para guarda dos equipamentos", "Alimentação do operador", "Hospedagem do operador",
    "Garantir liberações de acesso às áreas", "Encarregados para acompanhamento dos serviços",
    "Ajudante para amarração e arrumação de cargas e auxílio no calçamento de patolas", "Supervisor de rigging", "Combustível",
    "Manter as áreas de trabalho livres, desimpedidas, compactadas, niveladas e livres de contaminações",
    "Material de sinalização (cones, cavaletes, fitas sinalizadoras etc.)",
    "Material de içamento (cabos, estropos, manilhas, cintas, gabaritos, balancim/spreader)"];
  const n = Math.max(aCargoOliveira.length, aCargoContratante.length);
  const adicionais = extras(p.condicoes);
  return [
    { t: "paragrafo", texto: "Conforme solicitação, viemos através desta fornecer nossos preços e condições para locação do(s) equipamento(s) abaixo." },
    { t: "paragrafo", rotulo: "Escopo:", texto: `Proposta de locação com uso de ${descricaoEquipamento(p)}.` },
    { t: "paragrafo", rotulo: "Local da operação:", texto: p.local_operacao || p.obra || "a definir" },
    { t: "secao", texto: "Preço(s)" },
    ...tabelaPrecos(p, qtd),
    { t: "campos", colunas: 1, pares: [
      ["Previsão para mobilização", p.data_inicio_prevista ? formatData(p.data_inicio_prevista) : "a combinar"],
      ["Previsão para execução", p.periodo_minimo || "a combinar"],
    ] },
    { t: "paragrafo", rotulo: "Obs.:", texto: "Combustível, alimentação e hospedagem (pousada/hotel ou quarto individual) por conta da CONTRATANTE." },
    { t: "paragrafo", rotulo: "Impostos:", texto: "Fatura de Locação." },
    { t: "secao", texto: "Jornada de trabalho" },
    { t: "paragrafo", texto: `O(s) equipamento(s) terá(ão) garantia de ${jornada}. Serão consideradas as horas trabalhadas a partir da apresentação do equipamento na portaria da empresa contratante e até a saída do mesmo.` },
    { t: "paragrafo", texto: "Será contabilizado na medição mesmo se o equipamento estiver aguardando ordens, aguardando liberação de entrada, em horas de abastecimento, paradas por motivo de greve e manifestações, indisposições climáticas ou condições de vento inadequadas." },
    { t: "paragrafo", texto: "Caso seja necessário trabalhar aos sábados, domingos e feriados ou fora do horário, serão consideradas horas adicionais." },
    { t: "paragrafo", texto: "Em caso de manutenção do veículo, será concedido o prazo de 5 (cinco) dias úteis sem que haja desconto no valor da medição referente ao período." },
    { t: "paragrafo", texto: "Caso seja necessária a alteração na jornada de trabalho, ela deverá ser acordada com antecedência junto à área comercial da Oliveira Locações." },
    ...(p.multa_rescisao_pct > 0 ? [{ t: "paragrafo", rotulo: "Obs.:", texto: `Em caso de quebra de contrato por parte da contratante, será aplicada multa de ${pct(p.multa_rescisao_pct)} sobre o valor total da proposta.` } as Bloco] : []),
    { t: "secao", texto: "Medições" },
    { t: "paragrafo", texto: diaria
      ? "A medição será emitida por evento, no término dos serviços e/ou no último dia do serviço."
      : `A medição será mensal, com fechamento ${fechamento(p.dia_corte_inicio)}, e no término dos serviços.` },
    { t: "paragrafo", rotulo: "Condições de pagamento:", texto: `${p.prazo_pagamento_dias} dias após a medição.` },
    { t: "tabela", cabecalho: ["A cargo da Oliveira", "A cargo da contratante"],
      linhas: Array.from({ length: n }, (_, i) => [aCargoOliveira[i] ?? "", aCargoContratante[i] ?? ""]) },
    ...(adicionais.length ? [{ t: "secao", texto: "Condições adicionais" } as Bloco, { t: "lista", itens: adicionais } as Bloco] : []),
    { t: "secao", texto: "Condições comerciais" },
    { t: "campos", colunas: 1, pares: [
      ["Condições de pagamento", `${p.prazo_pagamento_dias} dias após a medição`],
      ["Impostos", "Fatura de Locação"],
      ["Prazo de execução", p.periodo_minimo || "a combinar"],
      ["Validade da proposta", p.validade ? formatData(p.validade) : "30 dias"],
      ["CNPJ de faturamento", p.empresa.cnpj ?? "—"],
    ] },
  ];
}

export function montarProposta(p: DadosProposta): Documento {
  const emissao = hojeSP(new Date(p.created_at));
  const cli = p.cliente;
  const nomeCliente = cli.nome_fantasia && cli.nome_fantasia !== cli.razao_social ? `${cli.razao_social} (${cli.nome_fantasia})` : cli.razao_social;
  const cidade = cidadeUF(p.empresa);
  const cabecalhoDados: Bloco[] = p.modelo_documento === "caminhao"
    ? [
      { t: "paragrafo", alinhar: "direita", texto: `${cidade ? `${cidade.toUpperCase()}, ` : ""}${formatData(emissao)}` },
      { t: "paragrafo", rotulo: "A/C", texto: [nomeCliente, p.contato_cliente].filter(Boolean).join(" — ") },
      ...(cli.cnpj ? [{ t: "paragrafo", rotulo: "CNPJ:", texto: cli.cnpj } as Bloco] : []),
    ]
    : [
      { t: "paragrafo", rotulo: "Data de emissão:", texto: formatData(emissao) },
      { t: "secao", texto: "Dados do cliente" },
      { t: "campos", colunas: 2, pares: [
        ["Cliente", nomeCliente], ["CNPJ", cli.cnpj ?? ""],
        ["Endereço", enderecoCompleto(cli)], ["A/C", p.contato_cliente ?? ""],
        ["E-mail", cli.email ?? ""], ["Obra", p.obra ?? ""],
      ] },
      { t: "secao", texto: "Dados do fornecedor" },
      { t: "campos", colunas: 2, pares: [
        ["Fornecedor", p.empresa.razao_social], ["CNPJ", p.empresa.cnpj ?? ""],
        ["Endereço", enderecoCompleto(p.empresa)], ["A/C", p.empresa.contato_nome ?? ""],
        ["E-mail", p.empresa.email ?? ""], ["Telefone", p.empresa.telefone ? maskTelefone(p.empresa.telefone) : ""],
      ] },
      { t: "secao", texto: "Descrição do serviço" },
    ];

  return {
    arquivo: `proposta_${p.numero ?? "sem-numero"}_${cli.nome_fantasia ?? cli.razao_social}`,
    cabecalho: `Proposta Comercial Nº ${p.numero ?? "—"}`,
    rodape: rodapeEmpresa(p.empresa),
    blocos: [...cabecalhoDados, ...(p.modelo_documento === "caminhao" ? modeloCaminhao(p) : modeloGuindaste(p))],
  };
}
