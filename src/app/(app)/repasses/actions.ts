"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar, traduzirErro } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { pagarRepasseSchema } from "@/lib/schemas/operacao";
import type { Repasse } from "./client";

const REVALIDAR = ["/repasses", "/pagar", "/dashboard"];

/**
 * Paga o repasse via RPC fn_pagar_repasse. Se a medição ainda não foi recebida e
 * não houver confirmação, retorna codigo CONFIRMACAO_ADIANTAMENTO para a UI pedir.
 */
export async function pagarRepasse(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("repasses");
    const d = pagarRepasseSchema.parse(dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_pagar_repasse", {
      p_repasse: d.repasse_id, p_data: d.data, p_comprovante_url: d.comprovante_url ?? undefined, p_confirmar_adiantado: d.confirmar_adiantado,
    });
    if (error) throw error;
    return { adiantado: data?.adiantado ?? false };
  }, REVALIDAR, "Repasse pago");
}

/** Valor mensal digitado no repasse pendente: o banco recalcula bruto, abatimentos e líquido. */
export async function alterarValorRepasse(repasseId: string, valorMensal: number) {
  return executar(async () => {
    await exigirEscrita("repasses");
    const id = z.string().uuid().parse(repasseId);
    const valor = z.number().min(0).max(999_999_999).parse(valorMensal);
    const supabase = await createClient();
    checar(await supabase.rpc("fn_alterar_valor_repasse", { p_repasse: id, p_valor_mensal: valor }));
    return null;
  }, REVALIDAR, "Valor do repasse salvo");
}

/** Pré-checagem: o repasse seria adiantado? (medição não recebida) */
export async function verificarAdiantamento(repasseId: string) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("repasses_v").select("seria_adiantado, medicao_status").eq("id", repasseId).single();
    return { ok: true as const, dados: { adiantado: !!data?.seria_adiantado, statusMedicao: data?.medicao_status ?? null } };
  } catch (e) {
    return { ok: false as const, ...traduzirErro(e) };
  }
}

/** Repasses pendentes para o "Lançar pagamento", buscando por locador, placa ou cliente (empresa do topo). Liberados primeiro. */
export async function buscarRepassesPendentes(busca: string) {
  return executar(async () => {
    const s = await exigirEscrita("repasses");
    const supabase = await createClient();
    let q = supabase.from("repasses_v").select(`id, medicao_id, locador_id, locador_nome, empresa_id, empresa_apelido, veiculo_id, placa, valor_repasse_mensal,
      valor_bruto, valor_abatimentos, valor_liquido, data_prevista, data_pagamento, adiantado, aprovado_por, comprovante_url, status,
      periodo_inicio, periodo_fim, dias, numero_nf, medicao_valor, medicao_status, medicao_vencimento, competencia, cliente_nome, seria_adiantado`)
      .in("status", ["previsto", "liberado"]);
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const termo = busca.trim();
    if (termo) {
      const placa = termo.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const livre = termo.replace(/[^\p{L}\p{N} ]/gu, "");
      q = q.or([placa && `placa.ilike.%${placa}%`, livre && `locador_nome.ilike.%${livre}%`, livre && `cliente_nome.ilike.%${livre}%`].filter(Boolean).join(","));
    }
    const { data } = await q.order("status").order("periodo_inicio").limit(40);
    // "liberado" (cliente já pagou) antes de "previsto"
    return ((data ?? []) as Repasse[]).sort((a, b) => Number(b.status === "liberado") - Number(a.status === "liberado"));
  });
}

export async function cancelarRepasse(repasseId: string) {
  return executar(async () => {
    await exigirEscrita("repasses");
    const supabase = await createClient();
    checar(await supabase.from("repasses").update({ status: "cancelado" }).eq("id", repasseId).in("status", ["previsto", "liberado"]));
    return null;
  }, REVALIDAR, "Repasse cancelado");
}
