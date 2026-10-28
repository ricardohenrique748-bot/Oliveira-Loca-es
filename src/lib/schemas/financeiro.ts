import { z } from "zod";
import { dataObr, dataOpc, moedaObr, moedaOpc, textoObr, textoOpc, uuidObr, uuidOpc } from "./cadastros";

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
  /** quanto é descontado do sublocador no repasse (vazio = o valor da despesa) */
  valor_locador: moedaOpc,
  anexo_url: anexosOpc,
  observacoes: textoOpc,
};

function regrasVeiculo<T extends { tipo: string; veiculo_id: string | null; descontar_locador: boolean; valor_locador: number | null; rateio?: boolean }>(v: T, ctx: z.RefinementCtx) {
  if (v.rateio) return; // várias placas: as regras valem para cada item (ver contaPagarNovaSchema)
  if (v.tipo === "veiculo" && !v.veiculo_id) ctx.addIssue({ code: "custom", path: ["veiculo_id"], message: "Despesa de veículo exige a placa" });
  if (v.descontar_locador && !v.veiculo_id) ctx.addIssue({ code: "custom", path: ["descontar_locador"], message: "Só despesas de veículo podem ser descontadas do locador" });
  if (v.valor_locador != null && v.valor_locador <= 0) ctx.addIssue({ code: "custom", path: ["valor_locador"], message: "Informe um valor maior que zero ou deixe vazio" });
}

/** Uma nota do boleto com várias placas: cada uma vira uma conta na sua placa. */
const itemRateio = z.object({
  veiculo_id: uuidOpc,
  empresa_id: uuidOpc,
  nota: textoOpc,
  valor: moedaOpc,
  descontar_locador: z.boolean().default(false),
  valor_locador: moedaOpc,
});
export type ItemRateio = z.input<typeof itemRateio>;

export const contaPagarNovaSchema = z.object({
  ...base,
  /** boleto único com várias placas (uma nota por placa) */
  rateio: z.boolean().default(false),
  itens: z.array(itemRateio).default([]),
  repeticao: z.enum(["unica", "parcelada", "recorrente"]).default("unica"),
  parcelas: z.number().int().min(2, "Mínimo 2 parcelas").max(360).nullish(),
  parcela_inicial: z.number().int().min(1).nullish(),
  modo_valor: z.enum(["parcela", "total"]).default("parcela"),
}).superRefine((v, ctx) => {
  regrasVeiculo(v, ctx);
  if (v.repeticao === "parcelada" && !v.parcelas) ctx.addIssue({ code: "custom", path: ["parcelas"], message: "Informe o número de parcelas" });
  if (v.repeticao === "parcelada" && v.parcelas && v.parcela_inicial && v.parcela_inicial > v.parcelas) ctx.addIssue({ code: "custom", path: ["parcela_inicial"], message: "Parcela inicial maior que o total" });
  if (v.rateio) {
    const erro = (message: string) => ctx.addIssue({ code: "custom", path: ["itens"], message });
    if (v.tipo !== "veiculo") return erro("Boleto com várias placas só em despesa de veículo");
    if (v.repeticao !== "unica") return erro("Boleto com várias placas não pode ser parcelado nem recorrente");
    if (v.itens.length < 2) return erro("Adicione pelo menos 2 placas");
    if (v.itens.some((i) => !i.veiculo_id)) return erro("Escolha a placa em todas as linhas");
    if (v.itens.some((i) => !i.valor || i.valor <= 0)) return erro("Informe o valor de cada placa");
    if (v.itens.some((i) => i.valor_locador != null && i.valor_locador <= 0)) return erro("Valor para o locador deve ser maior que zero (ou vazio)");
    const soma = Math.round(v.itens.reduce((s, i) => s + (i.valor ?? 0), 0) * 100) / 100;
    if (Math.abs(soma - v.valor) > 0.005) erro(`A soma das placas (${soma.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) não bate com o valor do boleto (${v.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`);
  }
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
