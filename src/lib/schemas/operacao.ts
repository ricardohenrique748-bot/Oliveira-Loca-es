import { z } from "zod";
import { clienteFormCampos, dataObr, dataOpc, moedaObr, moedaOpc, textoOpc, uuidObr, uuidOpc, validarClienteForm } from "./cadastros";

const contratoBase = z.object({
  empresa_id: uuidObr("a empresa"),
  cliente_id: uuidObr("o cliente"),
  obra_id: uuidOpc,
  veiculo_id: uuidObr("o veículo"),
  numero: textoOpc,
  /** diária: valor_mensal / valor_repasse_mensal guardam o valor POR DIA */
  tipo_cobranca: z.enum(["mensal", "diaria"]).default("mensal"),
  valor_mensal: moedaObr("o valor").refine((v) => v > 0, "Informe o valor"),
  valor_repasse_mensal: moedaOpc,
  dia_corte_inicio: z.coerce.number().refine((v) => v === 1 || v === 21, "Corte deve ser dia 1 ou 21"),
  prazo_pagamento_dias: z.number({ invalid_type_error: "Informe o prazo" }).int().min(0).max(365),
  data_inicio: dataObr("a data de início"),
  data_fim: dataOpc,
  status: z.enum(["ativo", "encerrado", "suspenso"]),
  observacoes: textoOpc,
});

const validarDatas = (c: { data_inicio: string; data_fim: string | null }, ctx: z.RefinementCtx) => {
  if (c.data_fim && c.data_fim < c.data_inicio) ctx.addIssue({ code: "custom", path: ["data_fim"], message: "Fim antes do início" });
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

/** Edição na grade de medições (estilo planilha) */
export const edicaoMedicaoSchema = z.object({
  id: z.string().uuid(),
  dias: z.number().int().min(0).max(31).optional(),
  /** valor mensal (ou da diária) desta medição; o contrato só dá o valor inicial */
  valor_mensal: z.number().min(0).max(999_999_999).optional(),
  acrescimos: z.number().min(0).optional(),
  descontos: z.number().min(0).optional(),
  numero_nf: z.string().trim().max(30).nullable().optional(),
  data_emissao: dataOpc.optional(),
  data_vencimento: dataOpc.optional(),
  observacoes: z.string().trim().max(1000).nullable().optional(),
});
export type EdicaoMedicao = z.infer<typeof edicaoMedicaoSchema>;

export const lancamentoMedicaoSchema = z.object({
  contrato_id: uuidObr("o contrato"),
  periodo_inicio: dataObr("o início do período"),
  periodo_fim: dataObr("o fim do período"),
  dias: z.number().int().min(1, "Dias deve ser ao menos 1").max(31, "Dias deve ser no máximo 31"),
  acrescimos: z.number().min(0).default(0),
  descontos: z.number().min(0).default(0),
  observacoes: z.string().trim().max(1000).nullable().optional(),
}).refine((d) => d.periodo_fim >= d.periodo_inicio, { message: "O fim do período deve ser depois do início", path: ["periodo_fim"] });
export type LancamentoMedicao = z.input<typeof lancamentoMedicaoSchema>;

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
