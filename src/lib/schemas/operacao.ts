import { z } from "zod";
import { clienteFormCampos, dataObr, dataOpc, moedaObr, moedaOpc, textoOpc, uuidObr, uuidOpc, validarClienteForm } from "./cadastros";

/** "HH:MM" (o banco devolve "HH:MM:SS") */
const horaOpc = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida").nullish().transform((v) => (v ? v.slice(0, 5) : null));

const contratoBase = z.object({
  empresa_id: uuidObr("a empresa"),
  cliente_id: uuidObr("o cliente"),
  obra_id: uuidOpc,
  veiculo_id: uuidObr("o veículo"),
  numero: textoOpc,
  /** diária / hora: valor_mensal e valor_repasse_mensal guardam o valor POR DIA / POR HORA */
  tipo_cobranca: z.enum(["mensal", "diaria", "hora"]).default("mensal"),
  valor_mensal: moedaObr("o valor").refine((v) => v > 0, "Informe o valor"),
  valor_repasse_mensal: moedaOpc,
  dia_corte_inicio: z.coerce.number().refine((v) => v === 1 || v === 21, "Corte deve ser dia 1 ou 21"),
  prazo_pagamento_dias: z.number({ invalid_type_error: "Informe o prazo" }).int().min(0).max(365),
  data_inicio: dataObr("a data de início"),
  data_fim: dataOpc,
  /** por hora: horário do dia (as horas da fatura saem daqui) */
  hora_inicio: horaOpc,
  hora_fim: horaOpc,
  status: z.enum(["ativo", "encerrado", "suspenso"]),
  observacoes: textoOpc,
  /** PDF do contrato enviado pelo cliente: "anexos/contratos/..." */
  anexo_url: textoOpc,
});

const validarDatas = (c: { data_inicio: string; data_fim: string | null; tipo_cobranca: string; hora_inicio: string | null; hora_fim: string | null }, ctx: z.RefinementCtx) => {
  if (c.data_fim && c.data_fim < c.data_inicio) ctx.addIssue({ code: "custom", path: ["data_fim"], message: "Fim antes do início" });
  if (c.tipo_cobranca === "hora") {
    if (!c.hora_inicio) ctx.addIssue({ code: "custom", path: ["hora_inicio"], message: "Informe a hora de início" });
    if (!c.hora_fim) ctx.addIssue({ code: "custom", path: ["hora_fim"], message: "Informe a hora de término" });
  }
};

/** o que é gravado em contratos */
export const contratoSchema = contratoBase.superRefine(validarDatas);

/** formulário: aceita cliente sem cadastro (CLIENTE_NOVO + nome digitado), que é cadastrado ao salvar */
export const contratoFormSchema = contratoBase.extend(clienteFormCampos).superRefine((c, ctx) => {
  validarDatas(c, ctx);
  validarClienteForm(c, ctx);
});
export type ContratoForm = z.input<typeof contratoFormSchema>;

export const desmobilizarSchema = z.object({
  contrato_id: z.string().uuid(),
  data: dataObr("a data de desmobilização"),
});

/** Renovação de contrato por diária ou hora: mais um dia, com fatura própria. */
export const renovacaoSchema = z.object({
  contrato_id: z.string().uuid(),
  data: dataObr("o dia da renovação"),
  /** por hora: horário do dia renovado */
  hora_inicio: horaOpc,
  hora_fim: horaOpc,
});

/** linhas de acréscimo/desconto da fatura: descrição + valor */
const itensFatura = (nome: string) => z.array(z.object({
  descricao: z.string().trim().min(1, `Descreva o ${nome}`).max(200),
  valor: z.number().positive(`Valor do ${nome} deve ser maior que zero`),
})).max(50);

/** Edição na grade de medições (estilo planilha) */
export const edicaoMedicaoSchema = z.object({
  id: z.string().uuid(),
  /** até 31 com contrato (o banco confere); fatura avulsa usa como quantidade */
  dias: z.number().int().min(0).max(99_999).optional(),
  /** valor mensal (ou da diária) desta medição; o contrato só dá o valor inicial */
  valor_mensal: z.number().min(0).max(999_999_999).optional(),
  acrescimos: z.number().min(0).optional(),
  descontos: z.number().min(0).optional(),
  numero_nf: z.string().trim().max(30).nullable().optional(),
  data_emissao: dataOpc.optional(),
  data_vencimento: dataOpc.optional(),
  observacoes: z.string().trim().max(1000).nullable().optional(),
  forma_pagamento: z.enum(["boleto", "pix"]).optional(),
  /** acréscimos e descontos discriminados; quando vêm, o total (acrescimos / descontos) é a soma deles */
  acrescimos_itens: itensFatura("acréscimo").optional(),
  descontos_itens: itensFatura("desconto").optional(),
});
export type ItemFatura = { descricao: string; valor: number };
export type EdicaoMedicao = z.infer<typeof edicaoMedicaoSchema>;

/** Condição de pagamento da fatura */
export const FORMAS_FATURA = { boleto: "Boleto", pix: "PIX" } as const;
export type FormaFatura = keyof typeof FORMAS_FATURA;

export const lancamentoMedicaoSchema = z.object({
  contrato_id: uuidObr("o contrato"),
  periodo_inicio: dataObr("o início do período"),
  periodo_fim: dataObr("o fim do período"),
  dias: z.number().int().min(1, "Dias deve ser ao menos 1").max(31, "Dias deve ser no máximo 31"),
  acrescimos: z.number().min(0).default(0),
  descontos: z.number().min(0).default(0),
  forma_pagamento: z.enum(["boleto", "pix"]).default("boleto"),
  observacoes: z.string().trim().max(1000).nullable().optional(),
}).refine((d) => d.periodo_fim >= d.periodo_inicio, { message: "O fim do período deve ser depois do início", path: ["periodo_fim"] });
export type LancamentoMedicao = z.input<typeof lancamentoMedicaoSchema>;

/** Unidade da quantidade na fatura avulsa (espelho do check em medicoes.unidade) */
export const UNIDADES_AVULSA = { mes: "Mês", semana: "Semana", dia: "Diária", hora: "Hora" } as const;
export type UnidadeAvulsa = keyof typeof UNIDADES_AVULSA;

/** "3 meses", "1 semana", "8 h"; sem unidade (fatura antiga) só o número */
export function formatQuantidadeAvulsa(qtd: number, unidade: string | null | undefined): string {
  const plural = qtd === 1 ? 0 : 1;
  const n = qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  switch (unidade) {
    case "mes": return `${n} ${["mês", "meses"][plural]}`;
    case "semana": return `${n} ${["semana", "semanas"][plural]}`;
    case "dia": return `${n} ${["diária", "diárias"][plural]}`;
    case "hora": return `${n} h`;
    default: return n;
  }
}

/** Item da fatura avulsa: descrição, placa opcional, período, quantidade × valor unitário (espelho de medicoes.itens) */
export const itemAvulsoSchema = z.object({
  descricao: z.string({ required_error: "Descreva o serviço" }).trim().min(1, "Descreva o serviço de cada item").max(500),
  /** placa opcional (sem repasse) */
  veiculo_id: uuidOpc,
  /** pode ter fração (7,5 h), até 2 casas */
  quantidade: z.number().positive("Informe a quantidade").max(99_999).refine((q) => Math.round(q * 100) === q * 100, "Quantidade com no máximo 2 casas"),
  unidade: z.enum(["mes", "semana", "dia", "hora"], { required_error: "Escolha a unidade" }),
  valor_unitario: z.number({ invalid_type_error: "Informe o valor" }).positive("Informe o valor de cada item").max(999_999_999),
  /** cada item tem o seu período; o da fatura vai do primeiro início ao último fim */
  periodo_inicio: dataObr("o início de cada item"),
  periodo_fim: dataObr("o fim de cada item"),
}).refine((i) => i.periodo_fim >= i.periodo_inicio, { message: "O fim do item deve ser depois do início", path: ["periodo_fim"] });
export type ItemAvulso = z.infer<typeof itemAvulsoSchema>;
/** como fica em medicoes.itens: com a placa copiada (para a fatura, a NF e a tela sem precisar do veículo);
 *  itens lançados antes do período por item não têm as datas (valem as da fatura) */
export type ItemAvulsoSalvo = Omit<ItemAvulso, "periodo_inicio" | "periodo_fim"> & { placa: string | null; periodo_inicio?: string; periodo_fim?: string };

/** Fatura avulsa: sem contrato, direto para o cliente; valor = soma (valor unitário × quantidade) dos itens + acréscimos − descontos. */
export const lancamentoAvulsoSchema = z.object({
  empresa_id: uuidObr("a empresa"),
  cliente_id: uuidObr("o cliente"),
  itens: z.array(itemAvulsoSchema).min(1, "Inclua ao menos um item").max(50),
  acrescimos: z.number().min(0).default(0),
  descontos: z.number().min(0).default(0),
  data_vencimento: dataOpc,
  forma_pagamento: z.enum(["boleto", "pix"]).default("boleto"),
  observacoes: z.string().trim().max(1000).nullable().optional(),
});
export type LancamentoAvulso = z.input<typeof lancamentoAvulsoSchema>;

export const recebimentoSchema = z.object({
  medicao_id: z.string().uuid(),
  data: dataObr("a data do recebimento"),
  valor: z.number({ invalid_type_error: "Informe o valor" }).positive("Valor deve ser maior que zero"),
  conta_bancaria_id: uuidOpc,
  comprovante_url: textoOpc,
  observacoes: textoOpc,
});
export type RecebimentoForm = z.input<typeof recebimentoSchema>;

export const pagarRepasseSchema = z.object({
  repasse_id: z.string().uuid(),
  data: dataObr("a data do pagamento"),
  comprovante_url: textoOpc,
  confirmar_adiantado: z.boolean().default(false),
});
