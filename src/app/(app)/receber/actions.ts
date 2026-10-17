"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import type { LinhaReceber } from "./client";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { recebimentoSchema } from "@/lib/schemas/operacao";

const REVALIDAR = ["/receber", "/medicoes", "/repasses", "/dashboard"];

export async function registrarRecebimento(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("receber");
    const r = recebimentoSchema.parse(dados);
    const supabase = await createClient();
    const { data: m } = await supabase.from("medicoes_v").select("status, saldo").eq("id", r.medicao_id).single();
    if (!m) throw new Error("Medição não encontrada");
    if (m.status === "a_faturar") throw new Error("Fature a medição antes de registrar o recebimento");
    if (m.status === "cancelado") throw new Error("Medição cancelada");
    if (r.valor > Number(m.saldo) + 0.005) throw new Error(`Valor maior que o saldo em aberto`);
    checar(await supabase.from("recebimentos").insert(r));
    return null;
  }, REVALIDAR, "Recebimento registrado");
}

/** Baixa total em lote: registra recebimento do saldo de cada medição na data/conta informadas. */
export async function baixarEmLote(ids: unknown, data: string, contaId: string | null) {
  return executar(async () => {
    await exigirEscrita("receber");
    const lista = z.array(z.string().uuid()).min(1).parse(ids);
    const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(data);
    const supabase = await createClient();
    const { data: meds } = await supabase.from("medicoes_v").select("id, saldo, status").in("id", lista);
    const linhas = (meds ?? []).filter((m) => (m.status === "faturado" || m.status === "recebido_parcial") && Number(m.saldo) > 0)
      .map((m) => ({ medicao_id: m.id!, data: d, valor: Number(m.saldo), conta_bancaria_id: contaId }));
    if (linhas.length) checar(await supabase.from("recebimentos").insert(linhas));
    return { baixadas: linhas.length };
  }, REVALIDAR);
}

export async function estornarRecebimento(id: string) {
  return executar(async () => {
    await exigirEscrita("receber");
    const supabase = await createClient();
    checar(await supabase.from("recebimentos").delete().eq("id", z.string().uuid().parse(id)));
    return null;
  }, REVALIDAR, "Recebimento estornado");
}

/** Faturas com saldo em aberto para o "Lançar recebimento", buscando por placa, NF ou cliente (empresa do topo). */
export async function buscarFaturasAbertas(busca: string) {
  return executar(async () => {
    const s = await exigirEscrita("receber");
    const supabase = await createClient();
    let q = supabase.from("medicoes_v").select(`id, empresa_id, empresa_apelido, cliente_id, cliente_fantasia, obra_id, obra_nome, placa, periodo_inicio, periodo_fim,
      numero_nf, data_emissao, data_vencimento, valor_final, valor_recebido, saldo, status, status_exibicao, dias_atraso, data_ultimo_recebimento`)
      .in("status", ["faturado", "recebido_parcial"]).gt("saldo", 0);
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const termo = busca.trim();
    if (termo) {
      const placa = termo.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const livre = termo.replace(/[^\p{L}\p{N} ]/gu, "");
      q = q.or([placa && `placa.ilike.%${placa}%`, livre && `numero_nf.ilike.%${livre}%`, livre && `cliente_fantasia.ilike.%${livre}%`].filter(Boolean).join(","));
    }
    const { data } = await q.order("data_vencimento", { ascending: true, nullsFirst: false }).limit(30);
    return (data ?? []) as LinhaReceber[];
  });
}

export async function listarRecebimentos(medicaoId: string) {
  return executar(async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("recebimentos").select("id, data, valor, comprovante_url, observacoes, contas_bancarias(apelido)")
      .eq("medicao_id", z.string().uuid().parse(medicaoId)).order("data");
    return (data ?? []).map((r) => ({ id: r.id, data: r.data, valor: r.valor, comprovante_url: r.comprovante_url, observacoes: r.observacoes, conta: r.contas_bancarias?.apelido ?? null }));
  });
}
