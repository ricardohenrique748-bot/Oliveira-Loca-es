import { z } from "zod";
import { dataObr, dataOpc, moedaObr, textoObr, textoOpc, uuidObr, uuidOpc } from "./cadastros";

/** Anexos podem ser vários, um por linha (ver CampoAnexo multiplo). */
const anexosOpc = z.string().trim().max(5000).nullish().transform((v) => (v ? v : null));

const base = {
  empresa_id: uuidObr("a empresa"),
  fornecedor_id: uuidOpc,
  descricao: textoObr("Descrição"),
  categoria_id: uuidOpc,
  tipo: z.enum(["fixa", "variavel", "veiculo"]),
  veiculo_id: uuidOpc,
  vencimento: dataObr("o vencimento"),
  valor: moedaObr("o valor").refine((v) => v > 0, "Informe o valor"),
  forma_pagamento: z.enum(["boleto", "debito_automatico", "cartao", "pix", "transferencia"]),
  conta_bancaria_id: uuidOpc,
  descontar_locador: z.boolean().default(false),
  anexo_url: anexosOpc,
  observacoes: textoOpc,
};

function regrasVeiculo<T extends { tipo: string; veiculo_id: string | null; descontar_locador: boolean }>(v: T, ctx: z.RefinementCtx) {
  if (v.tipo === "veiculo" && !v.veiculo_id) ctx.addIssue({ code: "custom", path: ["veiculo_id"], message: "Despesa de veículo exige a placa" });
  if (v.descontar_locador && !v.veiculo_id) ctx.addIssue({ code: "custom", path: ["descontar_locador"], message: "Só despesas de veículo podem ser descontadas do locador" });
}

export const contaPagarNovaSchema = z.object({
  ...base,
  repeticao: z.enum(["unica", "parcelada", "recorrente"]).default("unica"),
  parcelas: z.number().int().min(2, "Mínimo 2 parcelas").max(360).nullish(),
  parcela_inicial: z.number().int().min(1).nullish(),
  modo_valor: z.enum(["parcela", "total"]).default("parcela"),
}).superRefine((v, ctx) => {
  regrasVeiculo(v, ctx);
  if (v.repeticao === "parcelada" && !v.parcelas) ctx.addIssue({ code: "custom", path: ["parcelas"], message: "Informe o número de parcelas" });
  if (v.repeticao === "parcelada" && v.parcelas && v.parcela_inicial && v.parcela_inicial > v.parcelas) ctx.addIssue({ code: "custom", path: ["parcela_inicial"], message: "Parcela inicial maior que o total" });
});
export type ContaPagarNovaForm = z.input<typeof contaPagarNovaSchema>;

export const contaPagarEdicaoSchema = z.object({
  ...base,
  escopo: z.enum(["esta", "seguintes"]).default("esta"),
}).superRefine(regrasVeiculo);
export type ContaPagarEdicaoForm = z.input<typeof contaPagarEdicaoSchema>;

export const baixaContaSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  pago_em: dataObr("a data do pagamento"),
  /** só para baixa individual; em lote usa o valor de cada conta */
  valor_pago: z.number().positive().nullish(),
  conta_bancaria_id: uuidOpc,
  anexo_url: anexosOpc,
});

export const estornoContaSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export const FORMAS = { boleto: "Boleto", debito_automatico: "Débito automático", cartao: "Cartão", pix: "PIX", transferencia: "Transferência" } as const;

export { dataOpc };
