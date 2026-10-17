"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/basicos";
import { formatBRL, formatCompetencia, formatData, formatPlaca } from "@/lib/format";
import type { DadosDashboard } from "./dados";

const S1 = "var(--series-1)";
const S2 = "var(--series-2)";
const S3 = "var(--series-3)";
const NEG = "var(--series-neg)";
const STATUS_COR: Record<string, string> = { locado: "#0ca30c", disponivel: "var(--series-1)", manutencao: "#fab219", parado: "#d03b3b" };
const STATUS_ROTULO: Record<string, string> = { locado: "Locado", disponivel: "Disponível", manutencao: "Manutenção", parado: "Parado" };
const FAIXA_ROTULO: Record<string, string> = { a_vencer: "A vencer", "1-30": "1–30 dias", "31-60": "31–60 dias", "61-90": "61–90 dias", "90+": "+90 dias" };

const compacto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR");
};
const eixo = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grade = <CartesianGrid vertical={false} stroke="var(--chart-grid)" />;

function Dica({ active, payload, label, rotulo }: Partial<TooltipContentProps<number, string>> & { rotulo?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{rotulo ? rotulo(String(label)) : String(label)}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-foreground">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="num ml-auto font-semibold">{typeof p.value === "number" ? formatBRL(p.value) : String(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Grafico({ titulo, descricao, children, altura = 260 }: { titulo: string; descricao?: string; children: React.ReactElement; altura?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription className="text-xs">{descricao}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div style={{ height: altura }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function Graficos({ dados: d, mes, veReceita }: { dados: DadosDashboard; mes: string; veReceita: boolean }) {
  const router = useRouter();
  const ir = (href: string) => router.push(href);
  const legenda = <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--chart-axis)" }} />;
  const fluxoMin = Math.min(0, ...d.fluxo90.map((x) => x.saldo));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {veReceita && (
        <Grafico titulo="Faturamento × recebimento" descricao="Últimos 12 meses (faturado por emissão; recebido por data da baixa). Clique num mês para ver as medições.">
          <BarChart data={d.faturamento12} barGap={2} barCategoryGap="22%" margin={{ left: 0, right: 8, top: 8 }}
            onClick={(e) => e?.activeLabel && ir(`/medicoes?comp=${e.activeLabel}`)}>
            {grade}
            <XAxis dataKey="mes" {...eixo} tickFormatter={(c: string) => formatCompetencia(c).slice(0, 3)} />
            <YAxis {...eixo} tickFormatter={compacto} width={52} />
            <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={<Dica rotulo={(l) => formatCompetencia(l, true)} />} />
            {legenda}
            <Bar dataKey="faturado" name="Faturado" fill={S1} radius={[4, 4, 0, 0]} className="cursor-pointer" />
            <Bar dataKey="recebido" name="Recebido" fill={S2} radius={[4, 4, 0, 0]} className="cursor-pointer" />
          </BarChart>
        </Grafico>
      )}

      {veReceita && (
        <Grafico titulo="Aging do contas a receber" descricao="Saldo em aberto por faixa de atraso. Clique para filtrar.">
          <BarChart data={d.aging} layout="vertical" margin={{ left: 8, right: 16 }} onClick={(e) => e?.activeLabel && ir(`/receber?faixa=${e.activeLabel}`)}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" {...eixo} tickFormatter={compacto} />
            <YAxis type="category" dataKey="faixa" {...eixo} width={80} tickFormatter={(f: string) => FAIXA_ROTULO[f]} />
            <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={<Dica rotulo={(l) => FAIXA_ROTULO[l]} />} />
            <Bar dataKey="valor" name="Saldo" radius={[0, 4, 4, 0]} className="cursor-pointer">
              {d.aging.map((a) => <Cell key={a.faixa} fill={a.faixa === "a_vencer" ? S1 : NEG} fillOpacity={a.faixa === "a_vencer" ? 1 : 0.55 + ["1-30", "31-60", "61-90", "90+"].indexOf(a.faixa) * 0.15} />)}
            </Bar>
          </BarChart>
        </Grafico>
      )}

      {veReceita && (
        <Grafico titulo={`Margem por placa — top 10 · ${formatCompetencia(mes)}`} descricao="Receita − repasse − manutenção − outras despesas. Clique para abrir a ficha." altura={300}>
          <BarChart data={d.margemTop} layout="vertical" margin={{ left: 8, right: 16 }} onClick={(e) => {
            const v = d.margemTop.find((x) => x.placa === e?.activeLabel); if (v) ir(`/cadastros/veiculos/${v.veiculo_id}`);
          }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" {...eixo} tickFormatter={compacto} />
            <YAxis type="category" dataKey="placa" {...eixo} width={72} tickFormatter={formatPlaca} />
            <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={<Dica rotulo={formatPlaca} />} />
            <ReferenceLine x={0} stroke="var(--chart-axis)" />
            <Bar dataKey="margem" name="Margem" radius={[0, 4, 4, 0]} className="cursor-pointer">
              {d.margemTop.map((m) => <Cell key={m.placa} fill={m.margem >= 0 ? S1 : NEG} />)}
            </Bar>
          </BarChart>
        </Grafico>
      )}

      {veReceita && (
        <Grafico titulo={`Margem por placa — piores 10 · ${formatCompetencia(mes)}`} descricao="Placas com menor margem no mês (vermelho = prejuízo)." altura={300}>
          <BarChart data={d.margemPiores} layout="vertical" margin={{ left: 8, right: 16 }} onClick={(e) => {
            const v = d.margemPiores.find((x) => x.placa === e?.activeLabel); if (v) ir(`/cadastros/veiculos/${v.veiculo_id}`);
          }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" {...eixo} tickFormatter={compacto} />
            <YAxis type="category" dataKey="placa" {...eixo} width={72} tickFormatter={formatPlaca} />
            <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={<Dica rotulo={formatPlaca} />} />
            <ReferenceLine x={0} stroke="var(--chart-axis)" />
            <Bar dataKey="margem" name="Margem" radius={[0, 4, 4, 0]} className="cursor-pointer">
              {d.margemPiores.map((m) => <Cell key={m.placa} fill={m.margem >= 0 ? S1 : NEG} />)}
            </Bar>
          </BarChart>
        </Grafico>
      )}

      <Grafico titulo="Status da frota" descricao="Veículos ativos por situação. Clique para ver no painel da frota.">
        <BarChart data={d.statusFrota} margin={{ left: 0, right: 8, top: 16 }} onClick={(e) => e?.activeLabel && ir(`/manutencao?status=${e.activeLabel}`)}>
          {grade}
          <XAxis dataKey="status" {...eixo} tickFormatter={(s: string) => STATUS_ROTULO[s]} />
          <YAxis {...eixo} allowDecimals={false} width={32} />
          <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={({ active, payload }) => active && payload?.length ? (
            <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
              <span className="font-semibold">{STATUS_ROTULO[String(payload[0].payload.status)]}</span>: {String(payload[0].value)} veículo(s)
            </div>
          ) : null} />
          <Bar dataKey="qtd" name="Veículos" radius={[4, 4, 0, 0]} className="cursor-pointer" label={{ position: "top", fontSize: 12, fill: "var(--chart-axis)" }}>
            {d.statusFrota.map((s) => <Cell key={s.status} fill={STATUS_COR[s.status]} />)}
          </Bar>
        </BarChart>
      </Grafico>

      <Grafico titulo="Custo de manutenção" descricao="Por mês de fechamento da OS — preventiva × corretiva (pneus e inspeções em “outras”).">
        <BarChart data={d.manutencao12} margin={{ left: 0, right: 8, top: 8 }} onClick={() => ir("/manutencao/ordens?visao=lista")}>
          {grade}
          <XAxis dataKey="mes" {...eixo} tickFormatter={(c: string) => formatCompetencia(c).slice(0, 3)} />
          <YAxis {...eixo} tickFormatter={compacto} width={52} />
          <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={<Dica rotulo={(l) => formatCompetencia(l, true)} />} />
          {legenda}
          <Bar dataKey="preventiva" name="Preventiva" stackId="m" fill={S1} stroke="var(--chart-surface)" strokeWidth={2} />
          <Bar dataKey="corretiva" name="Corretiva" stackId="m" fill={S2} stroke="var(--chart-surface)" strokeWidth={2} />
          <Bar dataKey="outras" name="Outras" stackId="m" fill={S3} stroke="var(--chart-surface)" strokeWidth={2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </Grafico>

      {veReceita && (
        <div className="lg:col-span-2">
          <Grafico titulo="Fluxo de caixa projetado — 90 dias"
            descricao={`Saldo acumulado: medições a receber − contas a pagar − repasses previstos (sem saldo bancário inicial). Fora da curva, já vencidos: ${formatBRL(d.atrasado.entrada)} a receber e ${formatBRL(d.atrasado.saida)} a pagar.`}>
            <LineChart data={d.fluxo90} margin={{ left: 0, right: 16, top: 8 }} onClick={() => ir("/pagar")}>
              {grade}
              <XAxis dataKey="data" {...eixo} tickFormatter={(x: string) => formatData(x).slice(0, 5)} minTickGap={24} />
              <YAxis {...eixo} tickFormatter={compacto} width={56} domain={[fluxoMin, "auto"]} />
              <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 4" />
              <Tooltip cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }} content={<Dica rotulo={(l) => formatData(l)} />} />
              {legenda}
              <Line type="monotone" dataKey="saldo" name="Saldo projetado" stroke={S1} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "var(--chart-surface)", strokeWidth: 2 }} />
            </LineChart>
          </Grafico>
        </div>
      )}
    </div>
  );
}
