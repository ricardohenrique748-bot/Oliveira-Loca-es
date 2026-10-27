import type { SupabaseServer } from "@/lib/supabase/server";
import { addCompetencia, addDias, competenciaDe, diffDias, fimDoMes, somar } from "@/lib/calculos";
import { getConfig } from "@/lib/config";

export interface FiltrosDashboard {
  empresaId: string | null;
  mes: string; // yyyy-MM
  clienteId: string | null;
  placa: string | null;
  hoje: string;
  veReceita: boolean;
}

export interface ItemHoje {
  tipo: string;
  titulo: string;
  detalhe: string;
  valor?: number;
  href: string;
  acao: string;
  severidade: "info" | "alerta" | "critico";
}

/** Carrega KPIs, painel "Hoje" e séries dos gráficos do dashboard. */
export async function carregarDashboard(sb: SupabaseServer, f: FiltrosDashboard) {
  const cfg = await getConfig();
  const ini = `${f.mes}-01`;
  const fim = fimDoMes(ini);
  const iniAnt = `${addCompetencia(f.mes, -1)}-01`;
  const ini12 = `${addCompetencia(f.mes, -11)}-01`;
  const em5 = addDias(f.hoje, Number(cfg.alerta_dias_fatura) || 5);
  const em7 = addDias(f.hoje, Number(cfg.alerta_dias_pagar) || 7);

  const emp = <T extends { eq: (c: string, v: string) => T }>(q: T, col = "empresa_id") => (f.empresaId ? q.eq(col, f.empresaId) : q);
  const med = <T extends { eq: (c: string, v: string) => T; ilike: (c: string, v: string) => T }>(q: T) => {
    let r = emp(q);
    if (f.clienteId) r = r.eq("cliente_id", f.clienteId);
    if (f.placa) r = r.ilike("placa", `%${f.placa}%`);
    return r;
  };
  const vazio = Promise.resolve({ data: [] as never[] });

  const [
    medicoes12, abertas, recebimentos, repasses, contas, veiculos, preventivas, osAbertas, docs, margens,
  ] = await Promise.all([
    f.veReceita ? med(sb.from("medicoes_v").select("data_emissao, valor_final, status").gte("data_emissao", ini12).lte("data_emissao", fim).neq("status", "cancelado")) : vazio,
    f.veReceita ? med(sb.from("medicoes_v").select("id, placa, cliente_fantasia, periodo_fim, valor_final, saldo, status, status_exibicao, data_vencimento, numero_nf").in("status", ["a_faturar", "faturado", "recebido_parcial"])) : vazio,
    f.veReceita ? (() => {
      // fatura avulsa não tem contrato: o join com contrato/veículo só é obrigatório ao filtrar por placa; o cliente é filtrado abaixo
      let q = sb.from("recebimentos").select(f.placa
        ? "data, valor, medicoes!inner(empresa_id, cliente_id, contratos!inner(cliente_id, veiculos!inner(placa)))"
        : "data, valor, medicoes!inner(empresa_id, cliente_id, contratos(cliente_id))").gte("data", ini12).lte("data", fim);
      if (f.empresaId) q = q.eq("medicoes.empresa_id", f.empresaId);
      if (f.placa) q = q.ilike("medicoes.contratos.veiculos.placa", `%${f.placa}%`);
      return q;
    })() : vazio,
    f.veReceita ? emp(sb.from("repasses_v").select("id, locador_nome, placa, valor_liquido, status").in("status", ["previsto", "liberado"])) : vazio,
    f.veReceita ? emp(sb.from("contas_pagar").select("id, descricao, vencimento, valor").is("pago_em", null).lte("vencimento", addDias(f.hoje, 90))) : vazio,
    emp(sb.from("veiculos").select("id, placa, status").neq("status", "vendido")),
    emp(sb.from("vw_preventivas_status").select("plano_id, placa, servico, status")),
    emp(sb.from("ordens_servico").select("id, numero, data_abertura, descricao_problema, status, veiculos(placa)").in("status", ["aberta", "em_execucao", "aguardando_peca"])),
    sb.from("documentos_veiculo").select("id, tipo, validade, veiculos!inner(placa, empresa_id)").lte("validade", addDias(f.hoje, 30)).order("validade"),
    // margem por placa no mês (mesma conta do DRE por placa)
    f.veReceita ? (() => {
      let q = emp(sb.from("vw_margem_placa_mes").select("veiculo_id, placa, proprietario, receita, repasse, manutencao, outras_despesas, margem").eq("mes", ini));
      if (f.placa) q = q.ilike("placa", `%${f.placa}%`);
      return q;
    })() : vazio,
  ]);

  // ----- KPIs -----
  const doMes = (d: string | null, i: string, fm: string) => !!d && d >= i && d <= fm;
  const m12 = (medicoes12.data ?? []) as { data_emissao: string; valor_final: number; status: string }[];
  const faturado = somar(m12.filter((m) => m.status !== "a_faturar" && doMes(m.data_emissao, ini, fim)).map((m) => m.valor_final));
  const faturadoAnt = somar(m12.filter((m) => m.status !== "a_faturar" && doMes(m.data_emissao, iniAnt, fimDoMes(iniAnt))).map((m) => m.valor_final));
  type Ab = { id: string; placa: string; cliente_fantasia: string; periodo_fim: string; valor_final: number; saldo: number; status: string; status_exibicao: string; data_vencimento: string | null; numero_nf: string | null };
  const ab = (abertas.data ?? []) as Ab[];
  const aFaturar = ab.filter((m) => m.status === "a_faturar");
  const aReceber = ab.filter((m) => m.status !== "a_faturar");
  const vencidas = aReceber.filter((m) => m.status_exibicao === "vencido");
  const rep = (repasses.data ?? []) as { id: string; locador_nome: string; placa: string; valor_liquido: number; status: string }[];
  const cts = (contas.data ?? []) as { id: string; descricao: string; vencimento: string; valor: number }[];
  const veics = veiculos.data ?? [];
  const prev = (preventivas.data ?? []) as { plano_id: string; placa: string; servico: string; status: string }[];
  const docsEmp = ((docs.data ?? []) as unknown as { id: string; tipo: string; validade: string; veiculos: { placa: string; empresa_id: string } }[])
    .filter((d) => !f.empresaId || d.veiculos.empresa_id === f.empresaId);

  const kpis = {
    faturado,
    variacao: faturadoAnt > 0 ? ((faturado - faturadoAnt) / faturadoAnt) * 100 : null,
    aFaturar: somar(aFaturar.map((m) => m.valor_final)),
    qtdAFaturar: aFaturar.length,
    aReceber: somar(aReceber.map((m) => m.saldo)),
    vencido: somar(vencidas.map((m) => m.saldo)),
    qtdVencidas: vencidas.length,
    repasses: somar(rep.map((r) => r.valor_liquido)),
    qtdRepasses: rep.length,
    repassesLiberado: somar(rep.filter((r) => r.status === "liberado").map((r) => r.valor_liquido)),
    repassesPrevisto: somar(rep.filter((r) => r.status === "previsto").map((r) => r.valor_liquido)),
    pagar7: somar(cts.filter((c) => c.vencimento <= em7).map((c) => c.valor)),
    qtdPagar7: cts.filter((c) => c.vencimento <= em7).length,
    frotaLocada: veics.filter((v) => v.status === "locado").length,
    frotaTotal: veics.length,
    preventivasVencidas: prev.filter((p) => p.status === "vencida").length,
    preventivasProximas: prev.filter((p) => p.status === "proxima").length,
    preventivasEmDia: prev.filter((p) => p.status === "em_dia").length,
  };

  // ----- Hoje -----
  const hoje: ItemHoje[] = [];
  for (const m of aFaturar.filter((m) => m.periodo_fim < f.hoje))
    hoje.push({ tipo: "Faturar", titulo: `${m.placa ?? "Avulsa"} · ${m.cliente_fantasia}`, detalhe: `período encerrado em ${m.periodo_fim.split("-").reverse().join("/")}`, valor: m.valor_final, href: `/medicoes?comp=todas&placa=${m.placa}`, acao: "Faturar", severidade: "alerta" });
  for (const m of vencidas)
    hoje.push({ tipo: "Vencida", titulo: `NF ${m.numero_nf ?? "—"} · ${m.cliente_fantasia}`, detalhe: `${diffDias(m.data_vencimento!, f.hoje)} dias em atraso · ${m.placa ?? "avulsa"}`, valor: m.saldo, href: `/receber?id=${m.id}`, acao: "Cobrar", severidade: "critico" });
  for (const m of aReceber.filter((m) => m.status_exibicao !== "vencido" && m.data_vencimento && m.data_vencimento <= em5))
    hoje.push({ tipo: "Vence em breve", titulo: `NF ${m.numero_nf ?? "—"} · ${m.cliente_fantasia}`, detalhe: `vence ${m.data_vencimento!.split("-").reverse().join("/")}`, valor: m.saldo, href: `/receber?id=${m.id}`, acao: "Lembrar", severidade: "info" });
  for (const r of rep.filter((r) => r.status === "liberado"))
    hoje.push({ tipo: "Repasse liberado", titulo: `${r.locador_nome} · ${r.placa}`, detalhe: "cliente já pagou", valor: r.valor_liquido, href: "/repasses?status=liberado", acao: "Pagar", severidade: "info" });
  for (const c of cts.filter((c) => c.vencimento <= f.hoje))
    hoje.push({ tipo: c.vencimento < f.hoje ? "Conta vencida" : "Pagar hoje", titulo: c.descricao, detalhe: `vencimento ${c.vencimento.split("-").reverse().join("/")}`, valor: c.valor, href: `/pagar?id=${c.id}`, acao: "Pagar", severidade: c.vencimento < f.hoje ? "critico" : "alerta" });
  const limiteOS = Number(cfg.alerta_dias_os_aberta) || 3;
  for (const o of (osAbertas.data ?? []) as unknown as { id: string; numero: number; data_abertura: string; descricao_problema: string; veiculos: { placa: string } | null }[]) {
    const dias = diffDias(o.data_abertura, f.hoje);
    if (dias > limiteOS) hoje.push({ tipo: "OS aberta", titulo: `OS #${o.numero} · ${o.veiculos?.placa ?? ""}`, detalhe: `há ${dias} dias · ${o.descricao_problema.slice(0, 60)}`, href: `/manutencao/ordens/${o.id}`, acao: "Ver OS", severidade: "alerta" });
  }
  for (const d of docsEmp) {
    const dias = diffDias(f.hoje, d.validade);
    hoje.push({ tipo: "Documento", titulo: `${d.tipo.replace(/_/g, " ")} · ${d.veiculos.placa}`, detalhe: dias < 0 ? `vencido há ${-dias} dias` : dias === 0 ? "vence hoje" : `vence em ${dias} dias`, href: "/manutencao/documentos?prazo=30", acao: "Renovar", severidade: dias <= 0 ? "critico" : dias <= 15 ? "alerta" : "info" });
  }
  const peso = { critico: 0, alerta: 1, info: 2 };
  hoje.sort((a, b) => peso[a.severidade] - peso[b.severidade]);

  // ----- Gráficos -----
  const meses = Array.from({ length: 12 }, (_, i) => addCompetencia(f.mes, i - 11));
  const rec = ((recebimentos.data ?? []) as unknown as { data: string; valor: number; medicoes: { cliente_id: string | null; contratos: { cliente_id: string } | null } | null }[])
    .filter((r) => !f.clienteId || (r.medicoes?.contratos?.cliente_id ?? r.medicoes?.cliente_id) === f.clienteId);
  const faturamento12 = meses.map((c) => ({
    mes: c,
    faturado: somar(m12.filter((m) => m.status !== "a_faturar" && m.data_emissao && competenciaDe(m.data_emissao) === c).map((m) => m.valor_final)),
    recebido: somar(rec.filter((r) => competenciaDe(r.data) === c).map((r) => r.valor)),
  }));

  const faixas = ["a_vencer", "1-30", "31-60", "61-90", "90+"] as const;
  const aging = faixas.map((fx) => ({
    faixa: fx,
    valor: somar(aReceber.filter((m) => {
      if (!m.data_vencimento || m.data_vencimento >= f.hoje) return fx === "a_vencer";
      const d = diffDias(m.data_vencimento, f.hoje);
      return fx === (d <= 30 ? "1-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+");
    }).map((m) => m.saldo)),
  }));

  // uma linha por placa (a view separa por empresa); maior margem primeiro
  type Mg = { veiculo_id: string; placa: string; proprietario: string; receita: number; repasse: number; manutencao: number; outras_despesas: number; margem: number };
  const porPlaca = new Map<string, { placa: string; proprietario: string; receita: number; custos: number; margem: number }>();
  for (const m of (margens.data ?? []) as Mg[]) {
    const a = porPlaca.get(m.veiculo_id) ?? { placa: m.placa, proprietario: m.proprietario, receita: 0, custos: 0, margem: 0 };
    a.receita = somar([a.receita, m.receita]);
    a.custos = somar([a.custos, m.repasse, m.manutencao, m.outras_despesas]);
    a.margem = somar([a.margem, m.margem]);
    porPlaca.set(m.veiculo_id, a);
  }
  const margemPlacas = [...porPlaca.values()].map((m) => ({ ...m, pct: m.receita > 0 ? Math.round((m.margem / m.receita) * 1000) / 10 : null }))
    .sort((a, b) => b.margem - a.margem);

  const statusFrota = ["locado", "disponivel", "manutencao", "parado"].map((s) => ({ status: s, qtd: veics.filter((v) => v.status === s).length }));

  return { kpis, hoje, faturamento12, aging, statusFrota, margemPlacas };
}

export type DadosDashboard = Awaited<ReturnType<typeof carregarDashboard>>;
