import { z } from "zod";
import { dataObr, dataOpc, numeroOpc, textoObr, textoOpc, uuidObr, uuidOpc } from "./cadastros";

export const planoSchema = z.object({
  alvo: z.enum(["veiculo", "modelo"]).default("veiculo"),
  veiculo_id: uuidOpc,
  modelo: textoOpc,
  servico: textoObr("Serviço"),
  intervalo_km: numeroOpc,
  intervalo_horas: numeroOpc,
  intervalo_dias: z.number().int().positive().nullish().transform((v) => v ?? null),
  ultima_execucao_data: dataOpc,
  ultima_execucao_km: numeroOpc,
  ultima_execucao_horas: numeroOpc,
  ativo: z.boolean().default(true),
}).superRefine((p, ctx) => {
  if (!p.intervalo_km && !p.intervalo_horas && !p.intervalo_dias) ctx.addIssue({ code: "custom", path: ["intervalo_km"], message: "Informe ao menos um intervalo (km, horas ou dias)" });
  if (p.alvo === "veiculo" && !p.veiculo_id) ctx.addIssue({ code: "custom", path: ["veiculo_id"], message: "Selecione o veículo" });
  if (p.alvo === "modelo" && !p.modelo) ctx.addIssue({ code: "custom", path: ["modelo"], message: "Informe o modelo" });
}).transform(({ alvo, ...p }) => ({ ...p, veiculo_id: alvo === "veiculo" ? p.veiculo_id : null }));
export type PlanoForm = z.input<typeof planoSchema>;

export const abrirOSSchema = z.object({
  veiculo_id: uuidObr("o veículo"),
  tipo: z.enum(["preventiva", "corretiva", "pneu", "inspecao"]),
  plano_id: uuidOpc,
  data_abertura: dataObr("a data de abertura"),
  km: numeroOpc,
  horimetro: numeroOpc,
  fornecedor_id: uuidOpc,
  descricao_problema: textoObr("Descrição do problema", 2000),
  descontar_locador: z.boolean().default(false),
  /** desmarcado = serviço rápido, veículo não vai para "manutenção" */
  parar_veiculo: z.boolean().default(true),
});
export type AbrirOSForm = z.input<typeof abrirOSSchema>;

export const editarOSSchema = z.object({
  tipo: z.enum(["preventiva", "corretiva", "pneu", "inspecao"]),
  plano_id: uuidOpc,
  fornecedor_id: uuidOpc,
  descricao_problema: textoObr("Descrição do problema", 2000),
  diagnostico: textoOpc,
  km: numeroOpc,
  horimetro: numeroOpc,
  horas_parado: z.number().min(0).nullish().transform((v) => v ?? 0),
  descontar_locador: z.boolean().default(false),
  status: z.enum(["aberta", "em_execucao", "aguardando_peca"]),
});
export type EditarOSForm = z.input<typeof editarOSSchema>;

export const itemOSSchema = z.object({
  ordem_servico_id: z.string().uuid(),
  tipo: z.enum(["peca", "servico"]),
  descricao: textoObr("Descrição"),
  quantidade: z.number({ invalid_type_error: "Informe a quantidade" }).positive("Quantidade inválida"),
  valor_unitario: z.number({ invalid_type_error: "Informe o valor" }).min(0),
});
export type ItemOSForm = z.input<typeof itemOSSchema>;

export const fecharOSSchema = z.object({
  data_fechamento: dataObr("a data de fechamento"),
  km: numeroOpc,
  horimetro: numeroOpc,
  horas_parado: z.number().min(0).nullish().transform((v) => v ?? null),
  diagnostico: textoOpc,
  gerar_conta: z.boolean().default(true),
  vencimento: dataOpc,
  forma_pagamento: z.enum(["boleto", "debito_automatico", "cartao", "pix", "transferencia"]).default("boleto"),
  conta_bancaria_id: uuidOpc,
  categoria_id: uuidOpc,
});
export type FecharOSForm = z.input<typeof fecharOSSchema>;

export const documentoSchema = z.object({
  veiculo_id: uuidObr("o veículo"),
  tipo: z.enum(["licenciamento", "seguro", "tacografo", "inspecao_icamento", "antt", "outro"]),
  numero: textoOpc,
  validade: dataOpc,
  anexo_url: textoOpc,
  observacoes: textoOpc,
});
export type DocumentoForm = z.input<typeof documentoSchema>;

export const pneuSchema = z.object({
  veiculo_id: uuidOpc,
  posicao: textoOpc,
  marca: textoOpc,
  medida: textoOpc,
  numero_fogo: textoObr("Número de fogo", 30).transform((v) => v.toUpperCase()),
  data_compra: dataOpc,
  km_instalacao: numeroOpc,
  ressolagens: z.number().int().min(0).nullish().transform((v) => v ?? 0),
  status: z.enum(["em_uso", "estoque", "ressolagem", "descartado"]),
  observacoes: textoOpc,
});
export type PneuForm = z.input<typeof pneuSchema>;

export const leituraSchema = z.object({
  veiculo_id: z.string().uuid(),
  data: dataObr("a data"),
  km: numeroOpc,
  horimetro: numeroOpc,
}).refine((l) => l.km != null || l.horimetro != null, "Informe km ou horímetro");
