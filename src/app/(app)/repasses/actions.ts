"use server";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar, traduzirErro } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { pagarRepasseSchema } from "@/lib/schemas/operacao";

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

export async function cancelarRepasse(repasseId: string) {
  return executar(async () => {
    await exigirEscrita("repasses");
    const supabase = await createClient();
    checar(await supabase.from("repasses").update({ status: "cancelado" }).eq("id", repasseId).in("status", ["previsto", "liberado"]));
    return null;
  }, REVALIDAR, "Repasse cancelado");
}
