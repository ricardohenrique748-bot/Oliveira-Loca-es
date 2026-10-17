import type { SupabaseServer } from "@/lib/supabase/server";
import { custoPorUnidade, diffDias, disponibilidadeFisica, horasNoPeriodo, mtbf, mttr, pctPreventiva, taxaOcupacao } from "@/lib/calculos";

export interface IndicadoresFrota {
  disponibilidade: number;
  ocupacao: number;
  mttr: number | null;
  mtbf: number | null;
  custoKm: number | null;
  custoHora: number | null;
  pctPreventiva: number | null;
  backlog: number;
  custoTotal: number;
  qtdPreventivas: number;
  qtdCorretivas: number;
  veiculos: number;
}

/** Indicadores de manutenção no período (padrão: mês corrente até hoje). */
export async function indicadoresFrota(supabase: SupabaseServer, p: { inicio: string; fim: string; empresaId: string | null; veiculoId?: string | null }): Promise<IndicadoresFrota> {
  let qv = supabase.from("veiculos").select("id").neq("status", "vendido");
  if (p.empresaId) qv = qv.eq("empresa_id", p.empresaId);
  if (p.veiculoId) qv = qv.eq("id", p.veiculoId);
  const { data: veiculos } = await qv;
  const ids = (veiculos ?? []).map((v) => v.id);
  if (!ids.length) {
    return { disponibilidade: 0, ocupacao: 0, mttr: null, mtbf: null, custoKm: null, custoHora: null, pctPreventiva: null, backlog: 0, custoTotal: 0, qtdPreventivas: 0, qtdCorretivas: 0, veiculos: 0 };
  }

  const [{ data: osPeriodo }, { count: backlog }, { data: leituras }, { data: medicoes }] = await Promise.all([
    supabase.from("ordens_servico").select("tipo, horas_parado, custo_total").in("veiculo_id", ids).eq("status", "fechada")
      .gte("data_fechamento", p.inicio).lte("data_fechamento", p.fim),
    supabase.from("ordens_servico").select("id", { count: "exact", head: true }).in("veiculo_id", ids).in("status", ["aberta", "em_execucao", "aguardando_peca"]),
    supabase.from("leituras").select("veiculo_id, km, horimetro").in("veiculo_id", ids).gte("data", p.inicio).lte("data", p.fim),
    supabase.from("medicoes_v").select("veiculo_id, periodo_inicio, periodo_fim, dias").in("veiculo_id", ids).neq("status", "cancelado")
      .lte("periodo_inicio", p.fim).gte("periodo_fim", p.inicio),
  ]);

  const horasPeriodo = horasNoPeriodo(p.inicio, p.fim) * ids.length;
  const horasParadas = (osPeriodo ?? []).reduce((s, o) => s + Number(o.horas_parado), 0);
  const corretivas = (osPeriodo ?? []).filter((o) => o.tipo === "corretiva");
  const preventivas = (osPeriodo ?? []).filter((o) => o.tipo === "preventiva");
  const custoTotal = (osPeriodo ?? []).reduce((s, o) => s + Number(o.custo_total), 0);

  // km/horas rodados no período: (máx − mín) das leituras de cada veículo
  const faixa = new Map<string, { kmMin: number; kmMax: number; hMin: number; hMax: number }>();
  for (const l of leituras ?? []) {
    const f = faixa.get(l.veiculo_id) ?? { kmMin: Infinity, kmMax: -Infinity, hMin: Infinity, hMax: -Infinity };
    if (l.km != null) { f.kmMin = Math.min(f.kmMin, l.km); f.kmMax = Math.max(f.kmMax, l.km); }
    if (l.horimetro != null) { f.hMin = Math.min(f.hMin, l.horimetro); f.hMax = Math.max(f.hMax, l.horimetro); }
    faixa.set(l.veiculo_id, f);
  }
  let km = 0, horas = 0;
  for (const f of faixa.values()) {
    if (f.kmMax > f.kmMin) km += f.kmMax - f.kmMin;
    if (f.hMax > f.hMin) horas += f.hMax - f.hMin;
  }

  // dias locados no período (interseção dos períodos medidos, limitado aos dias da medição)
  const diasPeriodo = diffDias(p.inicio, p.fim) + 1;
  let diasLocados = 0;
  for (const m of medicoes ?? []) {
    const ini = m.periodo_inicio! > p.inicio ? m.periodo_inicio! : p.inicio;
    const fim = m.periodo_fim! < p.fim ? m.periodo_fim! : p.fim;
    const sobrepoe = Math.max(0, diffDias(ini, fim) + 1);
    const totalMed = diffDias(m.periodo_inicio!, m.periodo_fim!) + 1;
    diasLocados += Math.min(sobrepoe, Math.round((m.dias! * sobrepoe) / totalMed));
  }

  const diasOperando = diasPeriodo * ids.length - horasParadas / 24;
  return {
    disponibilidade: disponibilidadeFisica(horasPeriodo, horasParadas),
    ocupacao: taxaOcupacao(diasLocados, diasPeriodo * ids.length),
    mttr: mttr(corretivas.map((o) => Number(o.horas_parado))),
    mtbf: mtbf(diasOperando, corretivas.length),
    custoKm: custoPorUnidade(custoTotal, km),
    custoHora: custoPorUnidade(custoTotal, horas),
    pctPreventiva: pctPreventiva(preventivas.length, corretivas.length),
    backlog: backlog ?? 0,
    custoTotal,
    qtdPreventivas: preventivas.length,
    qtdCorretivas: corretivas.length,
    veiculos: ids.length,
  };
}
