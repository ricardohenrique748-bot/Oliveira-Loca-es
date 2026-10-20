"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { edicaoMedicaoSchema, lancamentoMedicaoSchema } from "@/lib/schemas/operacao";
import { diffDias, minData, periodoContendo, proximoPeriodo, type DiaCorte, type Periodo } from "@/lib/calculos";

const REVALIDAR = ["/medicoes", "/receber", "/repasses", "/dashboard"];
const competencia = z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida");

export interface LinhaPrevia {
  contrato_id: string;
  placa: string;
  cliente: string;
  obra: string | null;
  empresa: string;
  periodo_inicio: string;
  periodo_fim: string;
  dias: number;
  valor_mensal: number;
  valor_final: number;
  valor_repasse_bruto: number | null;
}

/** Prévia (dry-run) do que será gerado para a competência. */
export async function previaMedicoes(comp: string) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const c = competencia.parse(comp);
    const supabase = await createClient();
    const linhas = checar(await supabase.rpc("fn_gerar_medicoes", { p_competencia: `${c}-01`, p_dry_run: true })) ?? [];
    if (!linhas.length) return [] as LinhaPrevia[];
    const { data: contratos } = await supabase.from("contratos")
      .select("id, clientes(razao_social, nome_fantasia), obras(nome), veiculos(placa), empresas(apelido)")
      .in("id", linhas.map((l) => l.contrato_id));
    const mapa = new Map((contratos ?? []).map((k) => [k.id, k]));
    return linhas.map((l): LinhaPrevia => {
      const k = mapa.get(l.contrato_id);
      return {
        contrato_id: l.contrato_id, placa: k?.veiculos?.placa ?? "", cliente: k?.clientes?.nome_fantasia ?? k?.clientes?.razao_social ?? "",
        obra: k?.obras?.nome ?? null, empresa: k?.empresas?.apelido ?? "", periodo_inicio: l.periodo_inicio, periodo_fim: l.periodo_fim,
        dias: l.dias, valor_mensal: Number(l.valor_mensal), valor_final: Number(l.valor_final),
        valor_repasse_bruto: l.valor_repasse_bruto == null ? null : Number(l.valor_repasse_bruto),
      };
    }).sort((a, b) => a.empresa.localeCompare(b.empresa) || a.cliente.localeCompare(b.cliente) || a.placa.localeCompare(b.placa));
  });
}

export async function gerarMedicoes(comp: string, contratos?: string[]) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const c = competencia.parse(comp);
    const ids = contratos ? z.array(z.string().uuid()).parse(contratos) : undefined;
    const supabase = await createClient();
    const r = checar(await supabase.rpc("fn_gerar_medicoes", { p_competencia: `${c}-01`, ...(ids ? { p_contratos: ids } : {}) })) ?? [];
    return { geradas: r.length };
  }, REVALIDAR);
}

export interface ContratoLancamento {
  id: string;
  placa: string;
  cliente: string;
  obra: string | null;
  valor_mensal: number;
  data_inicio: string;
  /** menor entre término previsto e desmobilização */
  data_fim_efetiva: string | null;
  ultimo_periodo: Periodo | null;
  sugestao: Periodo;
}

/** Dados do contrato para o lançamento manual, com o próximo período sugerido (mês seguinte à última medição). */
export async function dadosLancamento(contratoId: string) {
  return executar(async () => {
    const id = z.string().uuid().parse(contratoId);
    const supabase = await createClient();
    const { data: c } = await supabase.from("contratos")
      .select("id, valor_mensal, dia_corte_inicio, data_inicio, data_fim, data_desmobilizacao, clientes(razao_social, nome_fantasia), obras(nome), veiculos(placa)")
      .eq("id", id).maybeSingle();
    if (!c) throw new Error("Contrato não encontrado");
    const { data: ultima } = await supabase.from("medicoes").select("periodo_inicio, periodo_fim")
      .eq("contrato_id", id).neq("status", "cancelado").order("periodo_fim", { ascending: false }).limit(1).maybeSingle();
    const ultimo = ultima ? { inicio: ultima.periodo_inicio, fim: ultima.periodo_fim } : null;
    return {
      id: c.id, placa: c.veiculos?.placa ?? "", cliente: c.clientes?.nome_fantasia ?? c.clientes?.razao_social ?? "", obra: c.obras?.nome ?? null,
      valor_mensal: Number(c.valor_mensal), data_inicio: c.data_inicio, data_fim_efetiva: minData(c.data_fim, c.data_desmobilizacao),
      ultimo_periodo: ultimo,
      sugestao: ultimo ? proximoPeriodo(ultimo.fim) : periodoContendo(c.dia_corte_inicio as DiaCorte, c.data_inicio),
    } satisfies ContratoLancamento;
  });
}

/** Lança uma medição manual de um contrato para o período informado. */
export async function lancarMedicao(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const d = lancamentoMedicaoSchema.parse(dados);
    if (diffDias(d.periodo_inicio, d.periodo_fim) > 31) throw new Error("O período pode ter no máximo um mês");
    const supabase = await createClient();
    const { data: c } = await supabase.from("contratos").select("id, empresa_id, valor_mensal, data_inicio, data_fim, data_desmobilizacao")
      .eq("id", d.contrato_id).maybeSingle();
    if (!c) throw new Error("Contrato não encontrado");
    const fimEfetivo = minData(c.data_fim, c.data_desmobilizacao);
    if (d.periodo_fim < c.data_inicio || (fimEfetivo && d.periodo_inicio > fimEfetivo)) throw new Error("O período está fora da vigência do contrato");
    const { data: conflito } = await supabase.from("medicoes").select("periodo_inicio, periodo_fim").eq("contrato_id", c.id).neq("status", "cancelado")
      .lte("periodo_inicio", d.periodo_fim).gte("periodo_fim", d.periodo_inicio).limit(1).maybeSingle();
    if (conflito) throw new Error(`Já existe medição deste contrato que cobre parte desse período (${conflito.periodo_inicio.split("-").reverse().join("/")} a ${conflito.periodo_fim.split("-").reverse().join("/")})`);
    const nova = checar(await supabase.from("medicoes").insert({
      contrato_id: c.id, empresa_id: c.empresa_id, periodo_inicio: d.periodo_inicio, periodo_fim: d.periodo_fim, dias: d.dias,
      valor_mensal: c.valor_mensal, acrescimos: d.acrescimos, descontos: d.descontos, observacoes: d.observacoes ?? null,
      final: !!c.data_desmobilizacao && c.data_desmobilizacao >= d.periodo_inicio && c.data_desmobilizacao <= d.periodo_fim,
    }).select("id").single());
    return { id: nova!.id, competencia: d.periodo_fim.slice(0, 7) };
  }, REVALIDAR, "Medição lançada");
}

/** Salva as edições da grade (dias, acréscimos, descontos, NF, emissão, vencimento, observações). */
export async function salvarMedicoes(edicoes: unknown) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const lista = z.array(edicaoMedicaoSchema).max(500).parse(edicoes);
    const supabase = await createClient();
    for (const { id, ...campos } of lista) {
      const { data: atual } = await supabase.from("medicoes").select("status").eq("id", id).single();
      if (!atual) throw new Error("Medição não encontrada");
      if (atual.status === "cancelado" || atual.status === "recebido") throw new Error("Medições recebidas ou canceladas não podem ser editadas");
      if (atual.status !== "a_faturar" && campos.dias !== undefined) delete campos.dias;
      checar(await supabase.from("medicoes").update(campos).eq("id", id));
    }
    return { salvas: lista.length };
  }, REVALIDAR, "Medições salvas");
}

/** Marca como faturado. Emissão: a já informada na linha ou a data padrão. */
export async function faturarMedicoes(ids: unknown, emissaoPadrao: string | null) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const lista = z.array(z.string().uuid()).min(1).parse(ids);
    const padrao = emissaoPadrao ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(emissaoPadrao) : null;
    const supabase = await createClient();
    const { data: meds } = await supabase.from("medicoes").select("id, status, data_emissao").in("id", lista);
    let n = 0;
    for (const m of meds ?? []) {
      if (m.status !== "a_faturar") continue;
      const emissao = m.data_emissao ?? padrao;
      if (!emissao) throw new Error("Informe a data de emissão (na linha ou a data padrão)");
      checar(await supabase.from("medicoes").update({ status: "faturado", data_emissao: emissao }).eq("id", m.id));
      n++;
    }
    return { faturadas: n };
  }, REVALIDAR);
}

export async function voltarParaAFaturar(ids: unknown) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const lista = z.array(z.string().uuid()).min(1).parse(ids);
    const supabase = await createClient();
    checar(await supabase.from("medicoes").update({ status: "a_faturar" }).in("id", lista).eq("status", "faturado"));
    return null;
  }, REVALIDAR, "Medições voltaram para 'a faturar'");
}

export async function cancelarMedicoes(ids: unknown) {
  return executar(async () => {
    await exigirEscrita("medicoes");
    const lista = z.array(z.string().uuid()).min(1).parse(ids);
    const supabase = await createClient();
    checar(await supabase.from("medicoes").update({ status: "cancelado" }).in("id", lista).in("status", ["a_faturar", "faturado"]));
    return null;
  }, REVALIDAR, "Medições canceladas");
}

export interface EventoHistorico {
  quando: string;
  usuario: string | null;
  acao: "INSERT" | "UPDATE" | "DELETE";
  /** campo → [antes, depois] */
  mudancas: [string, unknown, unknown][];
}

const CAMPOS_HISTORICO = ["status", "periodo_inicio", "periodo_fim", "dias", "valor_mensal", "acrescimos", "descontos", "valor_final",
  "numero_nf", "data_emissao", "data_vencimento", "observacoes", "final"] as const;

/** Linha do tempo da medição, a partir da auditoria (gravada por trigger; leitura restrita a admin pelo RLS). */
export async function historicoMedicao(id: string) {
  return executar(async () => {
    const mid = z.string().uuid().parse(id);
    const supabase = await createClient();
    const { data: eventos } = await supabase.from("auditoria").select("criado_em, user_id, acao, antes, depois")
      .eq("tabela", "medicoes").eq("registro_id", mid).order("criado_em", { ascending: true });
    const ids = [...new Set((eventos ?? []).map((e) => e.user_id).filter((u): u is string => !!u))];
    const { data: usuarios } = ids.length ? await supabase.from("usuarios_perfil").select("user_id, nome").in("user_id", ids) : { data: [] };
    const nomes = new Map((usuarios ?? []).map((u) => [u.user_id, u.nome]));
    return (eventos ?? []).map((e): EventoHistorico => {
      const antes = (e.antes ?? {}) as Record<string, unknown>;
      const depois = (e.depois ?? {}) as Record<string, unknown>;
      const mudancas = CAMPOS_HISTORICO
        .filter((k) => e.acao === "INSERT" ? depois[k] != null && depois[k] !== "" : JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
        .map((k): [string, unknown, unknown] => [k, antes[k], depois[k]]);
      return { quando: e.criado_em, usuario: e.user_id ? nomes.get(e.user_id) ?? null : "Sistema", acao: e.acao as EventoHistorico["acao"], mudancas };
    }).filter((e) => e.acao !== "UPDATE" || e.mudancas.length > 0);
  });
}

export interface LinhaLembrete {
  id: string;
  empresa: string;
  cliente: string;
  obra: string | null;
  placa: string;
  periodo_inicio: string;
  periodo_fim: string;
  dias: number;
  valor_final: number;
  numero_nf: string | null;
  data_emissao: string | null;
  data_vencimento: string | null;
  status: string;
  observacoes: string | null;
  contatos: string;
}

/** Dados do "Lembrete de faturamento" com os contatos de faturamento de cada cliente/obra. */
export async function dadosLembrete(ids: unknown) {
  return executar(async () => {
    const lista = z.array(z.string().uuid()).min(1).parse(ids);
    const supabase = await createClient();
    const { data: meds } = await supabase.from("medicoes_v")
      .select("id, empresa_apelido, cliente_id, cliente_fantasia, obra_id, obra_nome, placa, periodo_inicio, periodo_fim, dias, valor_final, numero_nf, data_emissao, data_vencimento, status_exibicao, observacoes")
      .in("id", lista);
    const clientes = [...new Set((meds ?? []).map((m) => m.cliente_id!))];
    const { data: contatos } = await supabase.from("contatos").select("cliente_id, obra_id, nome, email, whatsapp").in("cliente_id", clientes).eq("recebe_fatura", true);
    return (meds ?? []).map((m): LinhaLembrete => {
      const cs = (contatos ?? []).filter((c) => c.cliente_id === m.cliente_id && (!c.obra_id || c.obra_id === m.obra_id));
      return {
        id: m.id!, empresa: m.empresa_apelido!, cliente: m.cliente_fantasia!, obra: m.obra_nome, placa: m.placa!,
        periodo_inicio: m.periodo_inicio!, periodo_fim: m.periodo_fim!, dias: m.dias!, valor_final: Number(m.valor_final), numero_nf: m.numero_nf,
        data_emissao: m.data_emissao, data_vencimento: m.data_vencimento, status: m.status_exibicao!, observacoes: m.observacoes,
        contatos: cs.map((c) => [c.nome, c.email, c.whatsapp].filter(Boolean).join(" · ")).join(" | "),
      };
    }).sort((a, b) => a.cliente.localeCompare(b.cliente) || a.placa.localeCompare(b.placa));
  });
}
