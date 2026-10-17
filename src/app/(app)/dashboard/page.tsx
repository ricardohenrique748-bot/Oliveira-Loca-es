import React from "react";
import Link from "next/link";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, ClipboardList, HandCoins, Receipt, TrendingUp, Truck, Wallet } from "lucide-react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { veReceita } from "@/lib/permissoes";
import { competenciaDe, hojeSP } from "@/lib/calculos";
import { formatBRL, formatCompetencia } from "@/lib/format";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Cabecalho } from "@/components/app/comuns";
import { KpiCard } from "@/components/app/kpi";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { carregarDashboard } from "./dados";
import { FiltrosDashboard } from "./filtros";
import { Graficos } from "./graficos";

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
      receita,
      empresa,
      s,
    };
  }, [mesParam, clienteParam, placaParam, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;

  const { d, clientes, mes, receita, empresa, s } = data;
  const k = d.kpis;

  return (
    <div className="space-y-6">
      <Cabecalho titulo="Dashboard" descricao={`${empresa} · ${formatCompetencia(mes, true)}`} />
      {semPermissao && (
        <p role="alert" className="rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Seu perfil não tem acesso àquela página.
        </p>
      )}

      <FiltrosDashboard
        empresas={s.empresas.map((e) => ({ value: e.id, label: e.apelido }))}
        empresaId={s.empresaId}
        mes={mes}
        clientes={clientes.map((c) => ({ value: c.id, label: c.nome_fantasia ?? c.razao_social }))}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        {receita && (
          <>
            <KpiCard titulo="Faturado no mês" valor={formatBRL(k.faturado)} variacao={k.variacao} sub="vs mês anterior" icone={TrendingUp} href={`/medicoes?comp=${mes}`} />
            <KpiCard titulo="A faturar" valor={formatBRL(k.aFaturar)} sub={`${k.qtdAFaturar} medições`} icone={ClipboardList} href="/medicoes?comp=todas" tom={k.qtdAFaturar ? "alerta" : undefined} />
            <KpiCard titulo="A receber" valor={formatBRL(k.aReceber)} icone={HandCoins} href="/receber" />
            <KpiCard titulo="Vencido" valor={formatBRL(k.vencido)} sub={`${k.qtdVencidas} faturas`} icone={AlertTriangle} href="/receber?status=vencido" tom={k.qtdVencidas ? "critico" : "ok"} />
            <KpiCard titulo="Repasses pendentes" valor={formatBRL(k.repasses)} sub={`${k.qtdRepasses} repasses`} icone={Wallet} href="/repasses" />
            <KpiCard titulo="A pagar · 7 dias" valor={formatBRL(k.pagar7)} sub={`${k.qtdPagar7} contas`} icone={Receipt} href="/pagar" tom={k.qtdPagar7 ? "alerta" : undefined} />
          </>
        )}
        <KpiCard titulo="Frota locada" valor={`${k.frotaLocada} / ${k.frotaTotal}`} sub={k.frotaTotal ? `${Math.round((k.frotaLocada / k.frotaTotal) * 100)}% ocupação` : undefined} icone={Truck} href="/manutencao" />
        <KpiCard titulo="Preventivas vencidas" valor={k.preventivasVencidas} icone={CalendarClock} href="/manutencao/planos?status=vencida" tom={k.preventivasVencidas ? "critico" : "ok"} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Hoje</CardTitle>
          <Badge variant="secondary">{d.hoje.length} ações</Badge>
        </CardHeader>
        <CardContent>
          {d.hoje.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nada pendente para hoje. ✔</p>
          ) : (
            <ul className="max-h-[26rem] divide-y overflow-y-auto">
              {d.hoje.map((i, n) => (
                <li key={n} className="flex flex-wrap items-center gap-3 py-2">
                  <Badge variant={i.severidade === "critico" ? "critico" : i.severidade === "alerta" ? "alerta" : "info"} className="w-32 justify-center">{i.tipo}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">{i.detalhe}</p>
                  </div>
                  {i.valor !== undefined && <span className="num text-sm font-semibold">{formatBRL(i.valor)}</span>}
                  <Button asChild size="xs" variant="outline"><Link href={i.href}>{i.acao}</Link></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Graficos dados={d} mes={mes} veReceita={receita} />
    </div>
  );
}
