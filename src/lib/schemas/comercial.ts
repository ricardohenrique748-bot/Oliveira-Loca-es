import { z } from "zod";
import { dataOpc, moedaObr, textoOpc, uuidObr, uuidOpc } from "./cadastros";

const textoLongo = z.string().trim().max(4000).nullish().transform((v) => (v ? v : null));

export const STATUS_PROPOSTA = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aprovada: "Aprovada",
  recusada: "Recusada",
  convertida: "Virou contrato",
} as const;
export type StatusProposta = keyof typeof STATUS_PROPOSTA;

export const propostaSchema = z.object({
  empresa_id: uuidObr("a empresa"),
  cliente_id: uuidObr("o cliente"),
  obra_id: uuidOpc,
  veiculo_id: uuidOpc,
  equipamento: textoOpc,
  /** diária: valor POR DIA (mesma regra do contrato) */
  tipo_cobranca: z.enum(["mensal", "diaria"]).default("mensal"),
  valor: moedaObr("o valor").refine((v) => v > 0, "Informe o valor"),
  dia_corte_inicio: z.coerce.number().refine((v) => v === 1 || v === 21, "Corte deve ser dia 1 ou 21"),
  prazo_pagamento_dias: z.number({ invalid_type_error: "Informe o prazo" }).int().min(0).max(365),
  data_inicio_prevista: dataOpc,
  periodo_minimo: textoOpc,
  validade: dataOpc,
  condicoes: textoLongo,
  observacoes: textoOpc,
  // "convertida" só pela geração do contrato
  status: z.enum(["rascunho", "enviada", "aprovada", "recusada"]),
  motivo_recusa: textoOpc,
}).superRefine((p, ctx) => {
  if (!p.veiculo_id && !p.equipamento) ctx.addIssue({ code: "custom", path: ["equipamento"], message: "Escolha o veículo ou descreva o equipamento" });
});
export type PropostaForm = z.input<typeof propostaSchema>;
