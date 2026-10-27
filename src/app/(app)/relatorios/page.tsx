import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { addCompetencia, competenciaDe, fimDoMes, hojeSP, somar } from "@/lib/calculos";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { RelatoriosCliente, type Relatorio } from "./client";

type Linha = Record<string, string | number | null>;

export default function RelatoriosPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const rParam = searchParams.get("r");
  const deParam = searchParams.get("de");
  const ateParam = searchParams.get("ate");

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("relatorios");
    const supabase = createClient();
    const atual = competenciaDe(hojeSP());
    const de = deParam && /^\d{4}-\d{2}$/.test(deParam) ? deParam : addCompetencia(atual, -2);
    const ate = ateParam && /^\d{4}-\d{2}$/.test(ateParam) ? ateParam : atual;
    const ini = `${de}-01`;
    const fim = fimDoMes(`${ate}-01`);
    const r = (rParam ?? "dre_placa") as Relatorio;
    const emp = s.empresaId;

    const agrupar = <T extends Record<string, unknown>>(rows: T[], chave: (x: T) => string, campos: (keyof T)[], extra: (x: T) => Linha) => {
      const m = new Map<string, Linha>();
      for (const x of rows) {
        const k = chave(x);
        const atualL = m.get(k) ?? { ...extra(x), ...Object.fromEntries(campos.map((c) => [c, 0])) };
        for (const c of campos) atualL[c as string] = Math.round(((Number(atualL[c as string]) || 0) + (Number(x[c]) || 0)) * 100) / 100;
        m.set(k, atualL);
      }
      return [...m.values()];
    };

    let linhas: Linha[] = [];
    if (r === "dre_placa") {
      let q = supabase.from("vw_margem_placa_mes").select("veiculo_id, placa, tipo, proprietario, empresa_apelido, receita, repasse, manutencao, outras_despesas, margem").gte("mes", ini).lte("mes", fim);
      if (emp) q = q.eq("empresa_id", emp);
      const { data: res } = await q;
      linhas = agrupar(res ?? [], (x) => x.placa!, ["receita", "repasse", "manutencao", "outras_despesas", "margem"], (x) => ({ veiculo_id: x.veiculo_id, placa: x.placa, empresa: x.empresa_apelido, proprietario: x.proprietario === "locador" ? "Sublocado" : "Própria" }))
        .map((l): Linha => ({ ...l, margem_pct: Number(l.receita) ? Math.round((Number(l.margem) / Number(l.receita)) * 1000) / 10 : null }))
        .sort((a, b) => Number(b.margem) - Number(a.margem));
    } else if (r === "dre_cliente") {
      let q = supabase.from("vw_dre_cliente_mes").select("cliente_nome, empresa_apelido, receita, repasse, recebido, margem, medicoes").gte("mes", ini).lte("mes", fim);
      if (emp) q = q.eq("empresa_id", emp);
      const { data: res } = await q;
      linhas = agrupar(res ?? [], (x) => x.cliente_nome!, ["receita", "repasse", "recebido", "margem", "medicoes"], (x) => ({ cliente: x.cliente_nome }))
        .map((l): Linha => ({ ...l, margem_pct: Number(l.receita) ? Math.round((Number(l.margem) / Number(l.receita)) * 1000) / 10 : null }))
        .sort((a, b) => Number(b.receita) - Number(a.receita));
    } else if (r === "faturamento") {
      let q = supabase.from("medicoes_v").select("cliente_fantasia, competencia, valor_final, valor_recebido, status").gte("competencia", ini).lte("competencia", fim).neq("status", "cancelado");
      if (emp) q = q.eq("empresa_id", emp);
      const { data: res } = await q;
      linhas = agrupar(res ?? [], (x) => `${x.cliente_fantasia}|${x.competencia}`, ["valor_final", "valor_recebido"], (x) => ({ cliente: x.cliente_fantasia, competencia: x.competencia }))
        .map((l): Linha => ({ ...l, qtd: (res ?? []).filter((x) => x.cliente_fantasia === l.cliente && x.competencia === l.competencia).length }))
        .sort((a, b) => String(a.cliente).localeCompare(String(b.cliente)) || String(a.competencia).localeCompare(String(b.competencia)));
    } else if (r === "aging") {
      let q = supabase.from("vw_aging_receber").select("cliente_nome, placa, numero_nf, data_emissao, data_vencimento, dias_atraso, valor_final, valor_recebido, saldo, faixa, empresa_apelido");
      if (emp) q = q.eq("empresa_id", emp);
      const { data: res } = await q.order("data_vencimento");
      linhas = (res ?? []) as Linha[];
    } else if (r === "repasses") {
      let q = supabase.from("repasses_v").select("locador_nome, placa, competencia, dias, valor_bruto, valor_abatimentos, valor_liquido, status, adiantado").gte("competencia", ini).lte("competencia", fim).neq("status", "cancelado");
      if (emp) q = q.eq("empresa_id", emp);
      const { data: res } = await q.order("locador_nome").order("competencia");
      linhas = (res ?? []).map((x) => ({ ...x, adiantado: x.adiantado ? "Sim" : "" })) as Linha[];
    } else if (r === "despesas") {
      let q = supabase.from("contas_pagar_v").select("categoria_nome, tipo, valor, valor_pago, pago_em, descontar_locador").gte("vencimento", ini).lte("vencimento", fim);
      if (emp) q = q.eq("empresa_id", emp);
      const { data: res } = await q;
      linhas = agrupar((res ?? []).map((x) => ({ ...x, pago: x.pago_em ? x.valor_pago ?? x.valor : 0, aberto: x.pago_em ? 0 : x.valor, descontado: x.descontar_locador ? x.valor : 0 })),
        (x) => `${x.categoria_nome ?? "Sem categoria"}|${x.tipo}`, ["valor", "pago", "aberto", "descontado"], (x) => ({ categoria: x.categoria_nome ?? "Sem categoria", tipo: x.tipo === "veiculo" ? "Veículo" : x.tipo === "variavel" ? "Variável" : "Fixa" }))
        .sort((a, b) => Number(b.valor) - Number(a.valor));
    } else if (r === "manutencao") {
      let q = supabase.from("ordens_servico").select("numero, tipo, data_abertura, data_fechamento, descricao_problema, custo_total, horas_parado, status, veiculos(placa), fornecedores(nome)")
        .gte("data_abertura", ini).lte("data_abertura", fim).neq("status", "cancelada");
      if (emp) q = q.eq("empresa_id", emp);
      const { data: res } = await q.order("data_abertura");
      linhas = (res ?? []).map((o) => ({ placa: o.veiculos?.placa ?? "", numero: o.numero, tipo: o.tipo, data_abertura: o.data_abertura, data_fechamento: o.data_fechamento,
        descricao: o.descricao_problema, fornecedor: o.fornecedores?.nome ?? "Própria", horas_parado: o.horas_parado, custo_total: o.custo_total, status: o.status }))
        .sort((a, b) => a.placa.localeCompare(b.placa) || a.data_abertura.localeCompare(b.data_abertura));
    }

    const totais = Object.fromEntries(
      linhas.length ? Object.keys(linhas[0]).filter((k) => typeof linhas[0][k] === "number" && !["margem_pct", "numero", "dias_atraso", "dias"].includes(k)).map((k) => [k, somar(linhas.map((l) => Number(l[k]) || 0))]) : [],
    );
    const empresa = s.empresas.find((e) => e.id === emp)?.apelido ?? "Todas as empresas";

    return {
      r,
      linhas,
      totais,
      de,
      ate,
      ini,
      fim,
      empresa,
      empresaId: emp,
    };
  }, [rParam, deParam, ateParam, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <RelatoriosCliente relatorio={data.r} linhas={data.linhas} totais={data.totais} de={data.de} ate={data.ate} ini={data.ini} fim={data.fim} empresa={data.empresa} empresaId={data.empresaId} />;
}
