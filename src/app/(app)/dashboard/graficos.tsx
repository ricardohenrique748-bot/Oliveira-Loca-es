"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatBRL, formatCompetencia } from "@/lib/format";
import { Painel, Seta, TituloPainel } from "./cartoes";
import type { DadosDashboard } from "./dados";

const S1 = "var(--series-1)";
const S2 = "var(--series-2)";
const NEG = "var(--series-neg)";
const STATUS_COR: Record<string, string> = { locado: "#fce501", disponivel: "#d4d4d8", manutencao: "#f97316", parado: "#ef4444" };
const STATUS_ROTULO: Record<string, string> = { locado: "Locado", disponivel: "Disponível", manutencao: "Manutenção", parado: "Parado" };
const FAIXA_ROTULO: Record<string, string> = { a_vencer: "A vencer", "1-30": "1–30 dias", "31-60": "31–60 dias", "61-90": "61–90 dias", "90+": "+90 dias" };

const compacto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR");
};
const eixo = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grade = <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="4 6" />;
const cursor = { fill: "var(--chart-grid)", opacity: 0.6, radius: 10 } as const;

function Dica({ active, payload, label, rotulo }: Partial<TooltipContentProps<number, string>> & { rotulo?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#141414] px-3 py-2 text-xs text-white shadow-xl shadow-black/50">
      <p className="mb-1 font-semibold text-primary">{rotulo ? rotulo(String(label)) : String(label)}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-white/60">{p.name}</span>
          <span className="num ml-auto font-semibold">{typeof p.value === "number" ? formatBRL(p.value) : String(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Legenda em pílulas, no cabeçalho do painel. */
function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {itens.map((i) => (
        <span key={i.nome} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70">
          <span className="h-2 w-2 rounded-full" style={{ background: i.cor }} aria-hidden />{i.nome}
        </span>
      ))}
    </div>
  );
}

function Quadro({ altura = 260, children }: { altura?: number; children: React.ReactElement }) {
  return (
    <div style={{ height: altura }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

/** Donut de ocupação da frota com legenda por status. */
export function CartaoFrota({ dados: d }: { dados: DadosDashboard }) {
  const router = useRouter();
  const k = d.kpis;
  const pct = k.frotaTotal ? Math.round((k.frotaLocada / k.frotaTotal) * 100) : 0;
  const fatias = d.statusFrota.filter((s) => s.qtd > 0);
  return (
    <Painel className="flex h-full flex-col">
      <TituloPainel titulo="Frota" descricao={`${k.frotaLocada} de ${k.frotaTotal} veículos locados`} acao={<Seta href="/manutencao" rotulo="Abrir painel da frota" />} />
      <div className="relative mx-auto h-[150px] w-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={fatias.length ? fatias : [{ status: "vazio", qtd: 1 }]} dataKey="qtd" nameKey="status" innerRadius="72%" outerRadius="100%"
              paddingAngle={fatias.length > 1 ? 3 : 0} cornerRadius={8} stroke="none" startAngle={90} endAngle={-270}
              className="cursor-pointer" onClick={(_, i) => { const s = fatias[i]; if (s) router.push(`/manutencao?status=${s.status}`); }}>
              {(fatias.length ? fatias : [{ status: "vazio" }]).map((s) => <Cell key={s.status} fill={STATUS_COR[s.status] ?? "rgba(255,255,255,.1)"} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-2xl font-black">{pct}%</span>
          <span className="text-[11px] text-white/60">ocupação</span>
        </div>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-1 xl:grid-cols-1">
        {d.statusFrota.map((s) => (
          <li key={s.status}>
            <Link href={`/manutencao?status=${s.status}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-white/5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COR[s.status] }} aria-hidden />
              <span className="truncate text-white/60">{STATUS_ROTULO[s.status]}</span>
              <span className="num ml-auto font-semibold">{s.qtd}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Painel>
  );
}

export function GraficoFaturamento({ dados: d }: { dados: DadosDashboard }) {
  const router = useRouter();
  return (
    <Painel className="h-full">
      <TituloPainel titulo="Faturamento × recebimento" descricao="Últimos 12 meses. Clique num mês para ver as medições."
        acao={<Legenda itens={[{ nome: "Faturado", cor: S1 }, { nome: "Recebido", cor: S2 }]} />} />
      <Quadro altura={280}>
        <BarChart data={d.faturamento12} barGap={4} barCategoryGap="26%" margin={{ left: 0, right: 4, top: 8 }}
          onClick={(e) => e?.activeLabel && router.push(`/medicoes?comp=${e.activeLabel}`)}>
          {grade}
          <XAxis dataKey="mes" {...eixo} tickFormatter={(c: string) => formatCompetencia(c).slice(0, 3)} />
          <YAxis {...eixo} tickFormatter={compacto} width={52} />
          <Tooltip cursor={cursor} content={<Dica rotulo={(l) => formatCompetencia(l, true)} />} />
          <Bar dataKey="faturado" name="Faturado" fill={S1} radius={[8, 8, 8, 8]} maxBarSize={14} className="cursor-pointer" />
          <Bar dataKey="recebido" name="Recebido" fill={S2} radius={[8, 8, 8, 8]} maxBarSize={14} className="cursor-pointer" />
        </BarChart>
      </Quadro>
    </Painel>
  );
}

export function GraficoAging({ dados: d }: { dados: DadosDashboard }) {
  const max = Math.max(1, ...d.aging.map((a) => a.valor));
  return (
    <Painel className="h-full">
      <TituloPainel titulo="Aging a receber" descricao="Saldo em aberto por faixa de atraso." acao={<Seta href="/receber" rotulo="Abrir contas a receber" />} />
      <ul className="space-y-4">
        {d.aging.map((a, n) => (
          <li key={a.faixa}>
            <Link href={`/receber?faixa=${a.faixa}`} className="block rounded-xl hover:opacity-80">
              <div className="mb-1.5 flex items-baseline justify-between text-xs">
                <span className="text-white/60">{FAIXA_ROTULO[a.faixa]}</span>
                <span className="num font-semibold">{formatBRL(a.valor)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{
                  width: `${Math.max(a.valor ? 3 : 0, (a.valor / max) * 100)}%`,
                  background: a.faixa === "a_vencer" ? S1 : NEG,
                  opacity: a.faixa === "a_vencer" ? 1 : 0.4 + n * 0.15,
                }} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Painel>
  );
}

/** Margem do mês por placa: receita − (repasse + manutenção + outras despesas). */
export function PainelMargemPlaca({ dados: d, mes }: { dados: DadosDashboard; mes: string }) {
  const lista = d.margemPlacas;
  const total = lista.reduce((a, m) => ({ receita: a.receita + m.receita, margem: a.margem + m.margem }), { receita: 0, margem: 0 });
  const max = Math.max(1, ...lista.map((m) => Math.abs(m.margem)));
  return (
    <Painel className="h-full">
      <TituloPainel titulo="Margem por placa" acao={<Seta href={`/relatorios?r=dre_placa&de=${mes}&ate=${mes}`} rotulo="Abrir DRE por placa" />}
        descricao={<>{formatCompetencia(mes, true)} · margem total <span className="num font-semibold text-white">{formatBRL(total.margem)}</span>
          {total.receita > 0 && <> ({(Math.round((total.margem / total.receita) * 1000) / 10).toLocaleString("pt-BR")}%)</>}</>} />
      {lista.length === 0 ? <p className="text-sm text-white/60">Nenhuma receita ou despesa por placa no mês.</p> : (
        <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {lista.map((m) => (
            <li key={m.placa}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                <span><span className="font-mono font-semibold">{m.placa}</span> <span className="text-white/50">{m.proprietario === "locador" ? "sublocado" : "própria"}</span></span>
                <span className="num">
                  <span className="text-white/50">receita {formatBRL(m.receita)} · custos {formatBRL(m.custos)} · </span>
                  <span className={m.margem < 0 ? "font-semibold text-red-400" : "font-semibold"}>{formatBRL(m.margem)}</span>
                  {m.pct != null && <span className="text-white/50"> ({m.pct.toLocaleString("pt-BR")}%)</span>}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${Math.max(m.margem ? 3 : 0, (Math.abs(m.margem) / max) * 100)}%`, background: m.margem < 0 ? NEG : S1 }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}
