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

const ajusteRepasse = z.object({
  tipo: z.enum(["acrescimo", "desconto"]),
  descricao: z.string().trim().min(1, "Descreva o acréscimo/desconto").max(200),
  valor: z.number().positive("Valor deve ser maior que zero"),
});

/** Acréscimos e descontos do recibo: gravados no repasse (mudam o líquido a pagar). Grava a lista inteira. */
export async function salvarAjustesRepasse(repasseId: string, ajustes: unknown) {
  return executar(async () => {
    await exigirEscrita("repasses");
    const p_repasse = z.string().uuid().parse(repasseId);
    const p_ajustes = z.array(ajusteRepasse).max(50).parse(ajustes);
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_salvar_ajustes_repasse", { p_repasse, p_ajustes });
    if (error && /fn_salvar_ajustes_repasse/.test(error.message)) throw new Error("O banco ainda não tem os ajustes do recibo: rode o SQL 0083 no Supabase");
    if (error) throw error;
    return null;
  }, REVALIDAR, "Acréscimos e descontos salvos no repasse");
}

/** Marca / desmarca uma despesa "descontar do locador" neste repasse (o que fica de fora espera o próximo). */
export async function escolherDescontoRepasse(repasseId: string, contaId: string, incluir: boolean) {
  return executar(async () => {
    await exigirEscrita("repasses");
    const p_repasse = z.string().uuid().parse(repasseId);
    const p_conta = z.string().uuid().parse(contaId);
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_escolher_desconto_repasse", { p_repasse, p_conta, p_incluir: z.boolean().parse(incluir) });
    if (error && /fn_escolher_desconto_repasse/.test(error.message)) throw new Error("O banco ainda não tem a escolha de descontos: rode o SQL 0075 no Supabase");
    if (error) throw error;
    return null;
  }, REVALIDAR, incluir ? "Desconto incluído neste repasse" : "Desconto tirado deste repasse");
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

const COLUNAS_REPASSE = `id, medicao_id, locador_id, locador_nome, empresa_id, empresa_apelido, veiculo_id, placa, valor_repasse_mensal,
      valor_bruto, valor_abatimentos, valor_liquido, data_prevista, data_pagamento, adiantado, aprovado_por, comprovante_url, status,
      periodo_inicio, periodo_fim, dias, numero_nf, medicao_valor, medicao_status, medicao_vencimento, competencia, cliente_nome, seria_adiantado,
      obra_nome, medicao_emissao, contrato_numero`;

/** Despesa "descontar do locador" da placa, com quanto ainda pode ser descontado e onde está hoje. */
export type DespesaPlaca = {
  id: string; descricao: string | null; fornecedor_nome: string | null; vencimento: string | null;
  parcela_num: number | null; parcela_total: number | null;
  /** o que ainda falta descontar do locador (total − o que já saiu em repasses pagos) */
  saldo: number;
  /** quanto está em cada repasse aberto hoje */
  porRepasse: Record<string, number>;
};

/**
 * Para pagar um repasse escolhendo os descontos: todos os repasses abertos da placa (as faturas/contratos)
 * e todas as despesas pendentes dela juntas, sem separar por repasse.
 */
export async function despesasParaPagar(repasseId: string) {
  return executar(async () => {
    await exigirEscrita("repasses");
    const id = z.string().uuid().parse(repasseId);
    const supabase = await createClient();
    const { data: alvo } = await supabase.from("repasses").select("veiculo_id").eq("id", id).single();
    if (!alvo) throw new Error("Repasse não encontrado");
    const [{ data: abertos }, { data: todos }, { data: contas }] = await Promise.all([
      supabase.from("repasses_v").select(COLUNAS_REPASSE).eq("veiculo_id", alvo.veiculo_id).in("status", ["previsto", "liberado"]).order("periodo_inicio"),
      supabase.from("repasses").select("id, status").eq("veiculo_id", alvo.veiculo_id).neq("status", "cancelado"),
      supabase.from("contas_pagar_v").select("id, descricao, fornecedor_nome, vencimento, parcela_num, parcela_total, valor, valor_locador")
        .eq("veiculo_id", alvo.veiculo_id).eq("descontar_locador", true).order("vencimento"),
    ]);
    const statusDe = new Map((todos ?? []).map((r) => [r.id, r.status]));
    const ids = [...statusDe.keys()];
    const { data: abats } = ids.length
      ? await supabase.from("repasse_abatimentos").select("repasse_id, conta_pagar_id, valor").in("repasse_id", ids)
      : { data: [] };
    // descontos que não são conta a pagar (da fatura e do recibo) já saem antes das despesas
    const outrosDescontos: Record<string, number> = {};
    const pagoAntes = new Map<string, number>();
    const porConta = new Map<string, Record<string, number>>();
    for (const a of abats ?? []) {
      const v = Number(a.valor);
      if (!a.conta_pagar_id) { outrosDescontos[a.repasse_id] = (outrosDescontos[a.repasse_id] ?? 0) + v; continue; }
      if (statusDe.get(a.repasse_id) === "pago") pagoAntes.set(a.conta_pagar_id, (pagoAntes.get(a.conta_pagar_id) ?? 0) + v);
      else {
        const m = porConta.get(a.conta_pagar_id) ?? {};
        m[a.repasse_id] = (m[a.repasse_id] ?? 0) + v;
        porConta.set(a.conta_pagar_id, m);
      }
    }
    const despesas: DespesaPlaca[] = (contas ?? []).map((c) => ({
      id: c.id!, descricao: c.descricao, fornecedor_nome: c.fornecedor_nome, vencimento: c.vencimento,
      parcela_num: c.parcela_num, parcela_total: c.parcela_total,
      saldo: Math.round((Number(c.valor_locador ?? c.valor ?? 0) - (pagoAntes.get(c.id!) ?? 0)) * 100) / 100,
      porRepasse: porConta.get(c.id!) ?? {},
    })).filter((d) => d.saldo > 0);
    return { repasses: (abertos ?? []) as Repasse[], despesas, outrosDescontos };
  });
}

/** Grava quais despesas saem deste repasse: as marcadas entram nele (e saem dos outros abertos da placa); as outras ficam fora. */
export async function definirDescontosRepasse(repasseId: string, contas: string[]) {
  return executar(async () => {
    await exigirEscrita("repasses");
    const p_repasse = z.string().uuid().parse(repasseId);
    const p_contas = z.array(z.string().uuid()).max(500).parse(contas);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_definir_descontos_repasse" as never, { p_repasse, p_contas } as never);
    if (error && /fn_definir_descontos_repasse/.test(error.message)) throw new Error("O banco ainda não tem a escolha de descontos na hora de pagar: rode o SQL 0087 no Supabase");
    if (error) throw error;
    return data as unknown as { valor_liquido: number; valor_abatimentos: number };
  }, REVALIDAR, "Descontos deste repasse salvos");
}
