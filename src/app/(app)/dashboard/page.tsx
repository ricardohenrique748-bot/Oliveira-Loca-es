import React from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, ClipboardList, HandCoins, Receipt, TrendingUp, Wallet } from "lucide-react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { veReceita } from "@/lib/permissoes";
import { competenciaDe, hojeSP } from "@/lib/calculos";
import { formatBRL, formatCompetencia } from "@/lib/format";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { carregarDashboard } from "./dados";
import { FiltrosDashboard } from "./filtros";
import { BarraSegmentada, BarrasMini, CartaoDestaque, ListaHoje, Painel, TituloPainel, Variacao } from "./cartoes";
import { CartaoFrota, GraficoAging, GraficoFaturamento, GraficoFluxo } from "./graficos";

const ROTULO_ATRASO: Record<string, string> = { "1-30": "até 30d", "31-60": "31–60d", "61-90": "61–90d", "90+": "+90d" };
const compactoBRL = (v: number) => v >= 10_000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : formatBRL(v);

export default function DashboardPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const mesParam = searchParams.get("mes");
  const clienteParam = searchParams.get("cliente");
  const placaParam = searchParams.get("placa");
  const semPermissao = searchParams.get("sem_permissao");

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("dashboard");
    const supabase = createClient();
    const hoje = hojeSP();
    const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : competenciaDe(hoje);
    const receita = veReceita(s.perfil);
    const placa = placaParam?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;

    const [d, { data: clientes }] = await Promise.all([
      carregarDashboard(supabase, {
        empresaId: s.empresaId,
        mes,
        clienteId: clienteParam ?? null,
        placa,
        hoje,
        veReceita: receita,
      }),
      supabase.from("clientes").select("id, razao_social, nome_fantasia").eq("ativo", true).order("nome_fantasia"),
    ]);

    const empresa = s.empresas.find((e) => e.id === s.empresaId)?.apelido ?? "Todas as empresas";

    return {
      d,
      clientes: clientes ?? [],
      mes,
      hoje,
      receita,
      empresa,
      s,
    };
  }, [mesParam, clienteParam, placaParam, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;

  const { d, clientes, mes, hoje, receita, empresa, s } = data;
  const k = d.kpis;
  const dataExtenso = new Date(`${hoje}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const aVencer = d.aging.find((a) => a.faixa === "a_vencer")?.valor ?? 0;
  const atrasos = d.aging.filter((a) => a.faixa !== "a_vencer");
  const preventivas = (
    <CartaoDestaque titulo="Preventivas vencidas" valor={k.preventivasVencidas} icone={CalendarClock} href="/manutencao/planos?status=vencida"
      sub={`de ${k.preventivasVencidas + k.preventivasProximas + k.preventivasEmDia} planos de manutenção`} critico={k.preventivasVencidas > 0}>
      <BarraSegmentada partes={[
        { rotulo: "Vencidas", valor: k.preventivasVencidas, cor: "#ef4444" },
        { rotulo: "Próximas", valor: k.preventivasProximas, cor: "#FCE501" },
        { rotulo: "Em dia", valor: k.preventivasEmDia, cor: "#22c55e" },
      ]} />
    </CartaoDestaque>
  );

  const hojePainel = (
    <Painel className="h-full">
      <TituloPainel titulo="Hoje" descricao={dataExtenso}
        acao={<span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">{d.hoje.length} ações</span>} />
      <ListaHoje itens={d.hoje} />
    </Painel>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 px-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{dataExtenso}</p>
          <h1 className="mt-1 truncate text-2xl font-black uppercase leading-tight tracking-tight sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-xs font-medium uppercase text-muted-foreground">{empresa} · {formatCompetencia(mes, true)}</p>
        </div>
        <div className="rounded-2xl border border-foreground/[0.06] bg-card px-4 py-3 shadow-sm dark:shadow-2xl dark:shadow-black/40">
          <FiltrosDashboard
            empresas={s.empresas.map((e) => ({ value: e.id, label: e.apelido }))}
            empresaId={s.empresaId}
            mes={mes}
            clientes={clientes.map((c) => ({ value: c.id, label: c.nome_fantasia ?? c.razao_social }))}
          />
        </div>
      </div>

      {semPermissao && (
        <p role="alert" className="rounded-2xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Seu perfil não tem acesso àquela página.
        </p>
      )}

      {receita ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <CartaoDestaque titulo="Faturado no mês" valor={formatBRL(k.faturado)} icone={TrendingUp} href={`/medicoes?comp=${mes}`}
              sub={k.variacao !== null && k.variacao !== undefined ? <><Variacao valor={k.variacao} escuro /> vs mês anterior</> : "últimos 12 meses"}>
              <BarrasMini compacto formatar={formatBRL} barras={d.faturamento12.map((f) => ({
                rotulo: formatCompetencia(f.mes).slice(0, 1), titulo: formatCompetencia(f.mes, true), valor: f.faturado,
                cor: f.mes === mes ? "#FCE501" : "rgba(255,255,255,.28)",
              }))} />
            </CartaoDestaque>
            <CartaoDestaque titulo="A receber" valor={formatBRL(k.aReceber)} sub="saldo de faturas em aberto" icone={HandCoins} href="/receber">
              <BarraSegmentada formatar={compactoBRL} partes={[
                { rotulo: "A vencer", valor: aVencer, cor: "#FCE501" },
                { rotulo: "Em atraso", valor: k.vencido, cor: "#ef4444" },
              ]} />
            </CartaoDestaque>
            <CartaoDestaque titulo="Vencido" valor={formatBRL(k.vencido)} sub={`${k.qtdVencidas} ${k.qtdVencidas === 1 ? "fatura" : "faturas"} · por dias de atraso`} icone={AlertTriangle} href="/receber?status=vencido" critico={k.vencido > 0}>
              <BarrasMini formatar={formatBRL} barras={atrasos.map((a) => ({ rotulo: ROTULO_ATRASO[a.faixa], valor: a.valor, cor: "#ef4444" }))} />
            </CartaoDestaque>
            <CartaoDestaque titulo="Repasses pendentes" valor={formatBRL(k.repasses)} sub={`${k.qtdRepasses} ${k.qtdRepasses === 1 ? "repasse" : "repasses"} aos locadores`} icone={Wallet} href="/repasses">
              <BarraSegmentada formatar={compactoBRL} partes={[
                { rotulo: "Liberado para pagar", valor: k.repassesLiberado, cor: "#FCE501" },
                { rotulo: "Previsto", valor: k.repassesPrevisto, cor: "rgba(255,255,255,.35)" },
              ]} />
            </CartaoDestaque>
            {preventivas}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-4"><CartaoFrota dados={d} /></div>
            <div className="grid gap-4 lg:col-span-3">
              <CartaoDestaque titulo="A faturar" valor={formatBRL(k.aFaturar)} sub={`${k.qtdAFaturar} ${k.qtdAFaturar === 1 ? "medição" : "medições"} aguardando nota`} icone={ClipboardList} href="/medicoes?comp=todas" />
              <CartaoDestaque titulo="A pagar · 7 dias" valor={formatBRL(k.pagar7)} sub={`${k.qtdPagar7} ${k.qtdPagar7 === 1 ? "conta" : "contas"} vencendo`} icone={Receipt} href="/pagar" />
            </div>
            <div className="sm:col-span-2 lg:col-span-5"><GraficoAging dados={d} /></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8"><GraficoFaturamento dados={d} /></div>
            <div className="lg:col-span-4">{hojePainel}</div>
          </div>

          <GraficoFluxo dados={d} />
        </>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
            <div className="xl:col-span-4"><CartaoFrota dados={d} /></div>
            <div className="xl:col-span-3">
              {preventivas}
            </div>
            <div className="lg:col-span-2 xl:col-span-5">{hojePainel}</div>
          </div>
        </>
      )}
    </div>
  );
}
