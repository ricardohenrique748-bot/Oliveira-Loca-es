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

// ---------- boletos (Edge Function sicredi-boleto) ----------
export type Boleto = {
  id: string; medicao_id: string; nosso_numero: string; linha_digitavel: string; pix_copia_cola: string | null; valor: number;
  data_vencimento: string; status: "emitido" | "pago" | "baixado"; data_pagamento: string | null; ambiente: "sandbox" | "producao";
  multa_pct: number | null; juros_mes_pct: number | null; protesto_dias: number | null; negativacao_dias: number | null;
};

async function sicredi<T>(corpo: Record<string, unknown>): Promise<T> {
  await exigirEscrita("receber");
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("sicredi-boleto", { body: corpo });
  if (error) {
    const resp = (error as { context?: Response }).context;
    const msg = resp ? await resp.json().then((j) => j?.erro as string | undefined).catch(() => undefined) : undefined;
    throw new Error(msg ?? "Não foi possível falar com o serviço de boletos. Verifique se a função sicredi-boleto está rodando.");
  }
  return data as T;
}

/** Multa e juros em %, protesto/negativação em dias após o vencimento; a Edge Function aplica os limites do Sicredi. */
export type EncargosBoleto = { multa_pct: number | null; juros_mes_pct: number | null; apos_vencimento: "protesto" | "negativacao" | null; dias_apos_vencimento: number | null };

export async function emitirBoleto(medicaoId: string, contaId: string | null, vencimento: string, encargos: EncargosBoleto) {
  return executar(() => sicredi<Boleto>({ acao: "emitir", medicao_id: z.string().uuid().parse(medicaoId), conta_bancaria_id: contaId ?? undefined, vencimento, encargos }),
    REVALIDAR, "Boleto gerado");
}

export async function cancelarBoleto(boletoId: string) {
  return executar(() => sicredi({ acao: "baixar", boleto_id: z.string().uuid().parse(boletoId) }), REVALIDAR, "Boleto cancelado no banco");
}

/** Consulta no Sicredi os boletos em aberto; os pagos viram recebimento. */
export async function atualizarBoletos(ids?: string[]) {
  return executar(() => sicredi<{ consultados: number; pagos: number; baixados: number; erros: string[] }>({ acao: "atualizar", boleto_ids: ids }), REVALIDAR);
}

export async function baixarPdfBoleto(b: Pick<Boleto, "id" | "nosso_numero">) {
  return executar(async () => {
    const { pdf_base64 } = await sicredi<{ pdf_base64: string }>({ acao: "pdf", boleto_id: b.id });
    const bytes = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `boleto-${b.nosso_numero}.pdf` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return null;
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
