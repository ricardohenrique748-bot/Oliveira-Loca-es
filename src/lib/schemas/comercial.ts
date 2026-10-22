import { z } from "zod";
import { dataOpc, moedaObr, moedaOpc, textoOpc, uuidObr, uuidOpc } from "./cadastros";

const textoLongo = z.string().trim().max(4000).nullish().transform((v) => (v ? v : null));

export const STATUS_PROPOSTA = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aprovada: "Aprovada",
  recusada: "Recusada",
  convertida: "Virou contrato",
} as const;
export type StatusProposta = keyof typeof STATUS_PROPOSTA;

/** frota própria = com motorista; sublocado = sem motorista */
export const MODALIDADE_PROPOSTA = {
  com_motorista: "Com motorista",
  sem_motorista: "Sem motorista",
} as const;
export type ModalidadeProposta = keyof typeof MODALIDADE_PROPOSTA;

/** layout do PDF: os dois modelos de proposta da Oliveira */
export const MODELO_PROPOSTA = {
  caminhao: "Caminhão — sem operador",
  guindaste: "Guindaste / munck — com operador",
} as const;
export type ModeloProposta = keyof typeof MODELO_PROPOSTA;

/** valor do select de cliente que libera o campo para digitar um cliente ainda sem cadastro */
export const CLIENTE_NOVO = "__novo__";

const propostaBase = z.object({
  modelo_documento: z.enum(["caminhao", "guindaste"]).default("guindaste"),
  empresa_id: uuidObr("a empresa"),
  cliente_id: uuidObr("o cliente"),
  obra_id: uuidOpc,
  veiculo_id: uuidOpc,
  equipamento: textoOpc,
  // com veículo escolhido o banco ajusta pelo dono do veículo
  modalidade: z.enum(["com_motorista", "sem_motorista"]).default("com_motorista"),
  /** diária: valor POR DIA (mesma regra do contrato) */
  tipo_cobranca: z.enum(["mensal", "diaria"]).default("mensal"),
  valor: moedaObr("o valor").refine((v) => v > 0, "Informe o valor"),
  dia_corte_inicio: z.coerce.number().refine((v) => v === 1 || v === 21, "Corte deve ser dia 1 ou 21"),
  prazo_pagamento_dias: z.number({ invalid_type_error: "Informe o prazo" }).int().min(0).max(365),
  data_inicio_prevista: dataOpc,
  periodo_minimo: textoOpc,
  validade: dataOpc,
  contato_cliente: textoOpc,
  local_operacao: textoOpc,
  quantidade: z.number().int().min(1, "Mínimo 1").max(999).nullish().transform((v) => v ?? 1),
  franquia: textoOpc,
  km_livre: textoOpc,
  jornada: textoOpc,
  valor_mobilizacao: moedaOpc,
  valor_desmobilizacao: moedaOpc,
  multa_rescisao_pct: z.number().min(0).max(100).nullish().transform((v) => v ?? 10),
  condicoes: textoLongo,
  observacoes: textoOpc,
  // "convertida" só pela geração do contrato
  status: z.enum(["rascunho", "enviada", "aprovada", "recusada"]),
  motivo_recusa: textoOpc,
});

const exigirItem = (p: { veiculo_id: string | null; equipamento: string | null }, ctx: z.RefinementCtx) => {
  if (!p.veiculo_id && !p.equipamento) ctx.addIssue({ code: "custom", path: ["equipamento"], message: "Escolha o veículo ou descreva o equipamento" });
};

/** o que é gravado em propostas */
export const propostaSchema = propostaBase.superRefine(exigirItem);

/** formulário: aceita cliente sem cadastro (CLIENTE_NOVO + nome digitado), que é cadastrado ao salvar */
export const propostaFormSchema = propostaBase.extend({
  cliente_id: z.string({ required_error: "Selecione o cliente", invalid_type_error: "Selecione o cliente" }).min(1, "Selecione o cliente"),
  cliente_novo: textoOpc,
}).superRefine((p, ctx) => {
  exigirItem(p, ctx);
  if (p.cliente_id === CLIENTE_NOVO) {
    if (!p.cliente_novo) ctx.addIssue({ code: "custom", path: ["cliente_novo"], message: "Digite o nome do cliente" });
  } else if (!z.string().uuid().safeParse(p.cliente_id).success) ctx.addIssue({ code: "custom", path: ["cliente_id"], message: "Selecione o cliente" });
});
export type PropostaForm = z.input<typeof propostaFormSchema>;
