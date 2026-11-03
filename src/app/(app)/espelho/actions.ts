"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { LINHAS_ESPELHO, linhasPreenchidas, type LinhaEspelho } from "@/lib/calculos/espelho";
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
});

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
    }).select("id").single();
    if (r.error?.code === "23505") throw new Error("Já existe espelho desta placa para este cliente neste mês.");
    return checar(r)!.id;
  }, REVALIDAR);
}

/** Grava as linhas (só os dias preenchidos) e a observação geral. */
export async function salvarEspelho(id: string, linhas: LinhaEspelho[], observacoes: string | null) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const espelhoId = uuid.parse(id);
    const validas = z.array(linhaSchema).max(LINHAS_ESPELHO).parse(linhasPreenchidas(linhas));
    const obs = z.string().max(1000, "Observação: no máximo 1000 caracteres").nullable().parse(observacoes?.trim() || null);
    const supabase = await createClient();
    checar(await supabase.from("espelhos").update({ linhas: validas as unknown as Json, observacoes: obs }).eq("id", espelhoId).select("id").single());
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
