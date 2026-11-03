"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { LINHAS_ESPELHO, MAX_DIAS_ESPELHO, diasDoEspelho, erroDatas, linhasPreenchidas, ordenarDatas, remapearLinhas, normalizarFechamento, type FechamentoEspelho, type LinhaEspelho } from "@/lib/calculos/espelho";
import type { Json } from "@/lib/supabase/database.types";

const REVALIDAR = ["/espelho"];
const uuid = z.string().uuid();
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (use HH:MM)").nullable();

const novoSchema = z.object({
  veiculo_id: uuid,
  cliente_id: z.string({ required_error: "Escolha o cliente" }).uuid("Escolha o cliente"),
  contrato_id: uuid.nullable(),
  obra_id: uuid.nullable(),
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Escolha o mês"),
  /** dias marcados no calendário (vazio = mês inteiro da competência) */
  datas: z.array(z.string()).max(MAX_DIAS_ESPELHO, `No máximo ${MAX_DIAS_ESPELHO} dias por espelho`).default([]),
}).superRefine((d, ctx) => {
  const erro = erroDatas(d.datas);
  if (erro) ctx.addIssue({ code: z.ZodIssueCode.custom, message: erro, path: ["datas"] });
}).transform((d) => ({ ...d, datas: ordenarDatas(d.datas) }));

const linhaSchema = z.object({
  dia: z.number().int().min(1).max(LINHAS_ESPELHO),
  inicio: hora,
  fim: hora,
  intervalo: z.number().min(0).max(24).nullable(),
  horas: z.number().min(0, "Horas não podem ser negativas").max(24, "No máximo 24 horas por dia").nullable(),
  obs: z.string().max(200, "Observação do dia: no máximo 200 caracteres").nullable(),
});

/** Cria o espelho (rascunho) da placa no mês; a empresa vem do veículo. */
export async function criarEspelho(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const d = novoSchema.parse(dados);
    const supabase = await createClient();
    const veiculo = checar(await supabase.from("veiculos").select("empresa_id").eq("id", d.veiculo_id).single())!;
    const r = await supabase.from("espelhos").insert({
      empresa_id: veiculo.empresa_id,
      veiculo_id: d.veiculo_id,
      cliente_id: d.cliente_id,
      contrato_id: d.contrato_id,
      obra_id: d.obra_id,
      competencia: `${d.competencia}-01`,
      datas: d.datas.length ? d.datas : null,
    }).select("id").single();
    if (r.error?.code === "23505") throw new Error("Já existe espelho desta placa para este cliente neste mês.");
    return checar(r)!.id;
  }, REVALIDAR);
}

/**
 * Troca placa, cliente, obra, mês ou início do período de um espelho ainda não aprovado (as horas lançadas ficam).
 * Se ele já tinha sido enviado, o link continua o mesmo e o cliente vê os dados novos.
 */
export async function editarDadosEspelho(id: string, dados: unknown) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const espelhoId = uuid.parse(id);
    const d = novoSchema.parse(dados);
    const supabase = await createClient();
    const atual = checar(await supabase.from("espelhos").select("status, linhas, competencia, data_inicio, data_fim, datas").eq("id", espelhoId).single())!;
    if (atual.status === "aprovado") throw new Error("Espelho aprovado pelo cliente não pode ser alterado.");
    // dias trocados: cada linha lançada vai para a sua data; dias desmarcados saem (não somam no total)
    const antes = diasDoEspelho(atual.competencia, atual.data_inicio, atual.data_fim, atual.datas);
    const depois = diasDoEspelho(`${d.competencia}-01`, null, null, d.datas);
    const salvas = (Array.isArray(atual.linhas) ? atual.linhas : []) as unknown as { dia: number }[];
    const linhas = remapearLinhas(salvas.filter((l) => typeof l?.dia === "number"), antes, depois);
    const veiculo = checar(await supabase.from("veiculos").select("empresa_id").eq("id", d.veiculo_id).single())!;
    const r = await supabase.from("espelhos").update({
      empresa_id: veiculo.empresa_id,
      veiculo_id: d.veiculo_id,
      cliente_id: d.cliente_id,
      contrato_id: d.contrato_id,
      obra_id: d.obra_id,
      competencia: `${d.competencia}-01`,
      // o calendário substitui o período de início/fim
      data_inicio: null,
      data_fim: null,
      datas: d.datas.length ? d.datas : null,
      linhas: linhas as unknown as Json,
    }).eq("id", espelhoId).select("id").single();
    if (r.error?.code === "23505") throw new Error("Já existe espelho desta placa para este cliente neste mês.");
    checar(r);
    return null;
  }, REVALIDAR, "Dados do espelho atualizados");
}

const valoresSchema = z.object({
  valor_mensal: z.number().min(0, "Valor mensal não pode ser negativo").max(999_999_999).nullable(),
  horas_franquia: z.number().gt(0, "Horas do mês devem ser maiores que zero").max(9999).nullable(),
  /** itens do fechamento: valores em reais e dias (todos opcionais, nunca negativos) */
  fechamento: z.record(z.string(), z.number().min(0, "Valores do fechamento não podem ser negativos").max(999_999_999).nullable())
    .default({}).transform((f) => normalizarFechamento(f)),
});

/** Grava as linhas (só os dias preenchidos), a observação geral e o valor mensal / horas do mês. */
export async function salvarEspelho(id: string, linhas: LinhaEspelho[], observacoes: string | null,
  valores: { valor_mensal: number | null; horas_franquia: number | null; fechamento?: FechamentoEspelho } = { valor_mensal: null, horas_franquia: null }) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const espelhoId = uuid.parse(id);
    const validas = z.array(linhaSchema).max(LINHAS_ESPELHO).parse(linhasPreenchidas(linhas));
    const obs = z.string().max(1000, "Observação: no máximo 1000 caracteres").nullable().parse(observacoes?.trim() || null);
    const v = valoresSchema.parse(valores);
    const supabase = await createClient();
    checar(await supabase.from("espelhos").update({ linhas: validas as unknown as Json, observacoes: obs, valor_mensal: v.valor_mensal, horas_franquia: v.horas_franquia, fechamento: v.fechamento as unknown as Json }).eq("id", espelhoId).select("id").single());
    return null;
  }, REVALIDAR, "Espelho salvo");
}

/**
 * Marca como enviado ao cliente (libera o link). Reenviar depois de uma recusa
 * apaga a resposta anterior para o cliente poder responder de novo.
 */
export async function enviarEspelho(id: string) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const espelhoId = uuid.parse(id);
    const supabase = await createClient();
    const atual = checar(await supabase.from("espelhos").select("status, total_horas").eq("id", espelhoId).single())!;
    if (atual.status === "aprovado") throw new Error("Este espelho já foi aprovado pelo cliente.");
    if (!atual.total_horas) throw new Error("Lance as horas antes de enviar ao cliente.");
    const r = checar(await supabase.from("espelhos").update({
      status: "enviado", enviado_em: new Date().toISOString(), respondido_em: null, respondido_por: null, motivo_recusa: null,
    }).eq("id", espelhoId).select("token").single())!;
    return r.token;
  }, REVALIDAR);
}

export async function excluirEspelho(id: string) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const espelhoId = uuid.parse(id);
    const supabase = await createClient();
    const r = checar(await supabase.from("espelhos").delete().eq("id", espelhoId).neq("status", "aprovado").select("id")) ?? [];
    if (!r.length) throw new Error("Espelho aprovado pelo cliente não pode ser excluído.");
    return null;
  }, REVALIDAR, "Espelho excluído");
}
