import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { addCompetencia, competenciaDe, fimDoMes, hojeSP, somar } from "@/lib/calculos";
import { buscarTudo } from "@/lib/consulta";
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
    const valida = (v: string | null) => !!v && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(v);
    // sem "de"/"até" na URL: todo o período (inclusive parcelas futuras); escolhendo um mês, filtra
    const tudo = !valida(deParam) && !valida(ateParam);
    let de = valida(deParam) ? deParam! : addCompetencia(atual, -2);
    let ate = valida(ateParam) ? ateParam! : atual;
    if (de > ate) [de, ate] = [ate, de];
    const ini = tudo ? "2000-01-01" : `${de}-01`;
    const fim = tudo ? "2100-12-31" : fimDoMes(`${ate}-01`);
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
      let q = supabase.from("vw_margem_placa_mes").select("veiculo_id, placa, tipo, proprietario, empresa_apelido, receita, repasse, manutencao, outras_despesas").gte("mes", ini).lte("mes", fim);
      if (emp) q = q.eq("empresa_id", emp);
      const res = await buscarTudo(q.order("veiculo_id").order("mes").order("empresa_id"));
      linhas = agrupar(res, (x) => x.placa!, ["receita", "repasse", "manutencao", "outras_despesas"], (x) => ({ veiculo_id: x.veiculo_id, placa: x.placa, empresa: x.empresa_apelido, proprietario: x.proprietario === "locador" ? "Sublocado" : "Própria" }))
        .sort((a, b) => Number(b.receita) - Number(a.receita));
    } else if (r === "dre_cliente") {
      let q = supabase.from("vw_dre_cliente_mes").select("cliente_nome, empresa_apelido, receita, repasse, recebido, margem, medicoes").gte("mes", ini).lte("mes", fim);
      if (emp) q = q.eq("empresa_id", emp);
      const res = await buscarTudo(q.order("cliente_nome").order("mes").order("empresa_id"));
      linhas = agrupar(res, (x) => x.cliente_nome!, ["receita", "repasse", "recebido", "margem", "medicoes"], (x) => ({ cliente: x.cliente_nome }))
        .map((l): Linha => ({ ...l, margem_pct: Number(l.receita) ? Math.round((Number(l.margem) / Number(l.receita)) * 1000) / 10 : null }))
        .sort((a, b) => Number(b.receita) - Number(a.receita));
    } else if (r === "faturamento") {
      let q = supabase.from("medicoes_v").select("cliente_fantasia, competencia, valor_final, valor_recebido, status").gte("competencia", ini).lte("competencia", fim).neq("status", "cancelado");
      if (emp) q = q.eq("empresa_id", emp);
      const res = await buscarTudo(q.order("id"));
      linhas = agrupar(res, (x) => `${x.cliente_fantasia}|${x.competencia}`, ["valor_final", "valor_recebido"], (x) => ({ cliente: x.cliente_fantasia, competencia: x.competencia }))
        .map((l): Linha => ({ ...l, qtd: res.filter((x) => x.cliente_fantasia === l.cliente && x.competencia === l.competencia).length }))
        .sort((a, b) => String(a.cliente).localeCompare(String(b.cliente)) || String(a.competencia).localeCompare(String(b.competencia)));
    } else if (r === "aging") {
      let q = supabase.from("vw_aging_receber").select("medicao_id, cliente_nome, placa, numero_nf, data_emissao, data_vencimento, dias_atraso, valor_final, valor_recebido, saldo, faixa, empresa_apelido");
      if (emp) q = q.eq("empresa_id", emp);
      const res = await buscarTudo(q.order("data_vencimento").order("numero_nf").order("placa"));
      // dados da fatura como em Contas a receber: obra, período, status e se tem contrato (senão é avulsa)
      const ids = [...new Set(res.map((x) => x.medicao_id).filter((x): x is string => !!x))];
      const extra = new Map<string, { obra_nome: string | null; periodo_inicio: string | null; periodo_fim: string | null; status_exibicao: string | null; contrato_id: string | null }>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase.from("medicoes_v").select("id, obra_nome, periodo_inicio, periodo_fim, status_exibicao, contrato_id").in("id", ids.slice(i, i + 150));
        (data ?? []).forEach((m) => extra.set(m.id!, m));
      }
      linhas = res.map(({ medicao_id, ...x }) => {
        const e = medicao_id ? extra.get(medicao_id) : undefined;
        return { ...x, id: medicao_id, obra_nome: e?.obra_nome ?? null, periodo_inicio: e?.periodo_inicio ?? null, periodo_fim: e?.periodo_fim ?? null,
          status_exibicao: e?.status_exibicao ?? null, tipo_fatura: e?.contrato_id ? "Contrato" : "Avulsa" };
      }) as Linha[];
    } else if (r === "repasses") {
      let q = supabase.from("repasses_v").select("locador_nome, placa, competencia, dias, dias_placa, valor_bruto, valor_abatimentos, valor_liquido, status, adiantado").gte("competencia", ini).lte("competencia", fim).neq("status", "cancelado");
      if (emp) q = q.eq("empresa_id", emp);
      const res = await buscarTudo(q.order("locador_nome").order("competencia").order("id"));
      linhas = res.map(({ dias_placa, ...x }) => ({ ...x, dias: dias_placa ?? x.dias, adiantado: x.adiantado ? "Sim" : "" })) as Linha[];
    } else if (r === "despesas") {
      let q = supabase.from("contas_pagar_v").select("categoria_nome, tipo, valor, valor_pago, pago_em, descontar_locador").gte("vencimento", ini).lte("vencimento", fim);
      if (emp) q = q.eq("empresa_id", emp);
      const res = await buscarTudo(q.order("id"));
      linhas = agrupar(res.map((x) => ({ ...x, pago: x.pago_em ? x.valor_pago ?? x.valor : 0, aberto: x.pago_em ? 0 : x.valor, descontado: x.descontar_locador ? x.valor : 0 })),
        (x) => `${x.categoria_nome ?? "Sem categoria"}|${x.tipo}`, ["valor", "pago", "aberto", "descontado"], (x) => ({ categoria: x.categoria_nome ?? "Sem categoria", tipo: x.tipo === "veiculo" ? "Veículo" : x.tipo === "variavel" ? "Variável" : "Fixa" }))
        .sort((a, b) => Number(b.valor) - Number(a.valor));
    } else if (r === "manutencao") {
      let q = supabase.from("ordens_servico").select("numero, tipo, data_abertura, data_fechamento, descricao_problema, custo_total, horas_parado, status, veiculos(placa), fornecedores(nome)")
        .gte("data_abertura", ini).lte("data_abertura", fim).neq("status", "cancelada");
      if (emp) q = q.eq("empresa_id", emp);
      const res = await buscarTudo(q.order("data_abertura").order("id"));
      linhas = res.map((o) => ({ placa: o.veiculos?.placa ?? "", numero: o.numero, tipo: o.tipo, data_abertura: o.data_abertura, data_fechamento: o.data_fechamento,
        descricao: o.descricao_problema, fornecedor: o.fornecedores?.nome ?? "Própria", horas_parado: o.horas_parado, custo_total: o.custo_total, status: o.status }))
        .sort((a, b) => a.placa.localeCompare(b.placa) || a.data_abertura.localeCompare(b.data_abertura));
    }

    const totais = Object.fromEntries(
      linhas.length ? Object.keys(linhas[0]).filter((k) => typeof linhas[0][k] === "number" && !["margem_pct", "numero", "dias_atraso", "dias"].includes(k)).map((k) => [k, somar(linhas.map((l) => Number(l[k]) || 0))]) : [],
    );
    const empresa = s.empresas.find((e) => e.id === emp)?.apelido ?? "Todas as empresas";

    return {
      r,
      tudo,
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

  // ao trocar filtro mantém a tela com os dados anteriores (desmontar perdia o foco dos campos e os filtros locais)
  if (!data) return <CarregandoPagina />;
  return <RelatoriosCliente carregando={loading} tudo={data.tudo} relatorio={data.r} linhas={data.linhas} totais={data.totais} de={data.de} ate={data.ate} ini={data.ini} fim={data.fim} empresa={data.empresa} empresaId={data.empresaId} />;
}
