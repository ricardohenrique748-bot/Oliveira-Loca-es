import React from "react";
import Link from "next/link";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, FileBadge, Gauge, Plus, Wrench } from "lucide-react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { indicadoresFrota } from "@/lib/indicadores-frota";
import { addDias, hojeSP, inicioDoMes } from "@/lib/calculos";
import { formatBRL, formatData, formatHoras, formatKm, formatPct, formatPlaca } from "@/lib/format";
import { Badge, Card } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Cabecalho, Progresso, StatusBadge } from "@/components/app/comuns";
import { KpiCard } from "@/components/app/kpi";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { ROTULOS } from "@/lib/schemas/cadastros";
import { cn } from "@/lib/utils";
import { FiltroFrota } from "./filtro";

const COR_STATUS: Record<string, string> = {
  locado: "border-t-status-ok",
  disponivel: "border-t-sky-500",
  manutencao: "border-t-status-alerta",
  parado: "border-t-status-critico",
  vendido: "border-t-neutral-400",
};

export default function ManutencaoPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const statusParam = searchParams.get("status");
  const tipoParam = searchParams.get("tipo");

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const supabase = createClient();
    const hoje = hojeSP();

    let qv = supabase
      .from("veiculos")
      .select("id, placa, tipo, marca, modelo, proprietario, km_atual, horimetro_atual, status")
      .neq("status", "vendido")
      .order("placa");
    if (s.empresaId) qv = qv.eq("empresa_id", s.empresaId);
    if (statusParam) qv = qv.eq("status", statusParam as "locado");
    if (tipoParam) qv = qv.eq("tipo", tipoParam as "caminhao");

    const [{ data: veiculos }, { data: planos }, { data: os }, { data: docs }, ind] = await Promise.all([
      qv,
      supabase.from("vw_preventivas_status").select("veiculo_id, servico, status, pct, proxima_km, proxima_horas, proxima_data, criterio"),
      supabase.from("ordens_servico").select("id, numero, veiculo_id, tipo, status, data_abertura, descricao_problema").in("status", ["aberta", "em_execucao", "aguardando_peca"]),
      supabase.from("documentos_veiculo").select("veiculo_id, tipo, validade").lte("validade", addDias(hoje, 30)),
      indicadoresFrota(supabase, { inicio: inicioDoMes(hoje), fim: hoje, empresaId: s.empresaId }),
    ]);

    const lista = (veiculos ?? []).map((v) => {
      const ps = (planos ?? []).filter((p) => p.veiculo_id === v.id).sort((a, b) => Number(b.pct) - Number(a.pct));
      return { ...v, pior: ps[0], qtdPlanos: ps.length, os: (os ?? []).filter((o) => o.veiculo_id === v.id), docs: (docs ?? []).filter((d) => d.veiculo_id === v.id) };
    });
    const contagem = (st: string) => (veiculos ?? []).filter((v) => v.status === st).length;
    const vencidas = (planos ?? []).filter((p) => p.status === "vencida" && lista.some((v) => v.id === p.veiculo_id)).length;
    const podeEditar = podeEscrever(s.perfil, "manutencao");

    return {
      hoje,
      ind,
      lista,
      contagem,
      vencidas,
      podeEditar,
    };
  }, [statusParam, tipoParam, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;

  const { hoje, ind, lista, contagem, vencidas, podeEditar } = data;

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Painel da frota"
        descricao={`Indicadores de ${formatData(inicioDoMes(hoje))} a ${formatData(hoje)} · ${ind.veiculos} veículos`}
        acoes={
          podeEditar && (
            <>
              <Button asChild variant="outline"><Link href="/manutencao/leituras"><Gauge /> Lançar leituras</Link></Button>
              <Button asChild><Link href="/manutencao/ordens?novo=1"><Plus /> Abrir OS</Link></Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <KpiCard titulo="Disponibilidade" valor={formatPct(ind.disponibilidade)} tom={ind.disponibilidade < 90 ? "alerta" : "ok"} />
        <KpiCard titulo="Ocupação" valor={formatPct(ind.ocupacao)} />
        <KpiCard titulo="MTTR" valor={ind.mttr != null ? formatHoras(ind.mttr) : "—"} sub="média parado (corretivas)" />
        <KpiCard titulo="MTBF" valor={ind.mtbf != null ? `${ind.mtbf.toLocaleString("pt-BR")} d` : "—"} sub="dias entre falhas" />
        <KpiCard titulo="Custo / km" valor={ind.custoKm != null ? formatBRL(ind.custoKm) : "—"} sub={formatBRL(ind.custoTotal)} />
        <KpiCard titulo="Custo / hora" valor={ind.custoHora != null ? formatBRL(ind.custoHora) : "—"} />
        <KpiCard titulo="Preventiva × corretiva" valor={ind.pctPreventiva != null ? formatPct(ind.pctPreventiva, 0) : "—"} sub={`${ind.qtdPreventivas} × ${ind.qtdCorretivas}`} />
        <KpiCard titulo="Backlog" valor={ind.backlog} sub="OS em aberto" href="/manutencao/ordens" tom={ind.backlog > 5 ? "alerta" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="ok">Locados {contagem("locado")}</Badge>
        <Badge variant="info">Disponíveis {contagem("disponivel")}</Badge>
        <Badge variant="alerta">Manutenção {contagem("manutencao")}</Badge>
        <Badge variant="critico">Parados {contagem("parado")}</Badge>
        {vencidas > 0 && (
          <Link href="/manutencao/planos?status=vencida">
            <Badge variant="critico"><AlertTriangle className="h-3 w-3" /> {vencidas} preventiva(s) vencida(s)</Badge>
          </Link>
        )}
        <div className="ml-auto"><FiltroFrota /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {lista.map((v) => (
          <Card key={v.id} className={cn("flex flex-col gap-3 border-t-4 p-4", COR_STATUS[v.status])}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/cadastros/veiculos/${v.id}`} className="font-mono text-lg font-bold tracking-wider hover:underline">{formatPlaca(v.placa)}</Link>
                <p className="text-xs text-muted-foreground">{ROTULOS.tipoVeiculo[v.tipo]} · {[v.marca, v.modelo].filter(Boolean).join(" ")}{v.proprietario === "locador" ? " · sublocado" : ""}</p>
              </div>
              <StatusBadge status={v.status} />
            </div>
            <div className="flex gap-4 text-sm">
              <span><span className="text-xs text-muted-foreground">Km</span><br /><span className="num font-semibold">{formatKm(v.km_atual)}</span></span>
              {v.horimetro_atual > 0 && <span><span className="text-xs text-muted-foreground">Horímetro</span><br /><span className="num font-semibold">{formatHoras(v.horimetro_atual)}</span></span>}
            </div>
            {v.pior ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1 truncate"><CalendarClock className="h-3 w-3 shrink-0" />{v.pior.servico}</span>
                  <span className="num font-semibold">{Math.round(Number(v.pior.pct) * 100)}%</span>
                </div>
                <Progresso pct={Number(v.pior.pct)} />
                <p className="text-xs text-muted-foreground">
                  Próxima: {v.pior.proxima_km != null && formatKm(v.pior.proxima_km)}{v.pior.proxima_horas != null && ` ${formatHoras(v.pior.proxima_horas)}`}{v.pior.proxima_data && ` · ${formatData(v.pior.proxima_data)}`}
                  {v.qtdPlanos > 1 && ` · +${v.qtdPlanos - 1} plano(s)`}
                </p>
              </div>
            ) : <p className="text-xs text-muted-foreground">Sem plano preventivo · <Link className="underline" href="/manutencao/planos?novo=1">cadastrar</Link></p>}
            {(v.os.length > 0 || v.docs.length > 0) && (
              <div className="mt-auto space-y-1 border-t pt-2 text-xs">
                {v.os.map((o) => (
                  <Link key={o.id} href={`/manutencao/ordens/${o.id}`} className="flex items-center gap-1 hover:underline">
                    <Wrench className="h-3 w-3 text-status-alerta" /> OS #{o.numero} {ROTULOS.tipoOS[o.tipo]} · <StatusBadge status={o.status} className="text-[10px]" />
                  </Link>
                ))}
                {v.docs.map((d) => (
                  <p key={d.tipo} className={cn("flex items-center gap-1", d.validade! < hoje ? "text-status-critico" : "text-status-alerta")}>
                    <FileBadge className="h-3 w-3" /> {ROTULOS.tipoDocumento[d.tipo]} {d.validade! < hoje ? "vencido" : "vence"} {formatData(d.validade)}
                  </p>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
