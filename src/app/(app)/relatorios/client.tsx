"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { Badge, Label } from "@/components/ui/basicos";
import { KpiCard } from "@/components/app/kpi";
import { Button } from "@/components/ui/button";
import { SelectBusca } from "@/components/ui/select-busca";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Cabecalho, Moeda, StatusBadge, rotuloStatus } from "@/components/app/comuns";
import { DataTable } from "@/components/app/data-table";
import { BarraFiltros, useUrlParams } from "@/components/app/url";
import { SeletorMes } from "@/components/app/seletor-mes";
import { exportarPDF, exportarXLSX, type ColunaExport } from "@/lib/exportar";
import { formatCompetencia, formatData, formatHoras, formatPct, formatPlaca } from "@/lib/format";
import { somar } from "@/lib/calculos";
import { ROTULOS } from "@/lib/schemas/cadastros";
import { DetalhePlaca } from "./detalhe-placa";

export type Relatorio = "dre_placa" | "dre_cliente" | "faturamento" | "aging" | "repasses" | "despesas" | "manutencao";
type Linha = Record<string, string | number | null>;
type Col = { chave: string; titulo: string; tipo?: "moeda" | "numero" | "data" | "pct" | "placa" | "competencia" | "status" | "horas" | "tipoOS" | "faixa"; largura?: number };

/** faixas do aging, iguais aos cards de Contas a receber */
const FAIXAS = [
  { chave: "a_vencer", rotulo: "A vencer", tom: undefined },
  { chave: "1-30", rotulo: "1–30 dias", tom: "alerta" as const },
  { chave: "31-60", rotulo: "31–60 dias", tom: "alerta" as const },
  { chave: "61-90", rotulo: "61–90 dias", tom: "critico" as const },
  { chave: "90+", rotulo: "+90 dias", tom: "critico" as const },
];
const rotuloFaixa = (v: string) => FAIXAS.find((f) => f.chave === v)?.rotulo ?? v;
const placaOuAvulsa = (l: Linha) => (l.placa ? formatPlaca(String(l.placa)) : "Avulsa");

const RELATORIOS: Record<Relatorio, { titulo: string; descricao: string; colunas: Col[]; /** colunas que viram filtro (valores distintos do relatório) */ filtros: string[] }> = {
  dre_placa: {
    titulo: "DRE por placa", descricao: "Receita das medições, repasse ao locador, manutenção e outras despesas do veículo (despesas descontadas do locador não entram). A margem por placa fica no Dashboard. Clique na placa para ver os lançamentos.",
    colunas: [
      { chave: "placa", titulo: "Placa", tipo: "placa" }, { chave: "empresa", titulo: "Empresa" }, { chave: "proprietario", titulo: "Frota" },
      { chave: "receita", titulo: "Receita", tipo: "moeda" }, { chave: "repasse", titulo: "Repasse", tipo: "moeda" }, { chave: "manutencao", titulo: "Manutenção", tipo: "moeda" },
      { chave: "outras_despesas", titulo: "Outras despesas", tipo: "moeda" },
    ],
    filtros: ["placa", "empresa", "proprietario"],
  },
  dre_cliente: {
    titulo: "DRE por cliente", descricao: "Receita medida, repasse bruto dos sublocados e margem bruta por cliente no período.",
    colunas: [
      { chave: "cliente", titulo: "Cliente", largura: 26 }, { chave: "medicoes", titulo: "Medições", tipo: "numero" }, { chave: "receita", titulo: "Receita", tipo: "moeda" },
      { chave: "repasse", titulo: "Repasse", tipo: "moeda" }, { chave: "margem", titulo: "Margem", tipo: "moeda" }, { chave: "margem_pct", titulo: "Margem %", tipo: "pct" },
      { chave: "recebido", titulo: "Recebido", tipo: "moeda" },
    ],
    filtros: ["cliente"],
  },
  faturamento: {
    titulo: "Faturamento por cliente", descricao: "Valor medido por cliente e competência (mês de fim do período).",
    colunas: [
      { chave: "cliente", titulo: "Cliente", largura: 26 }, { chave: "competencia", titulo: "Competência", tipo: "competencia" }, { chave: "qtd", titulo: "Medições", tipo: "numero" },
      { chave: "valor_final", titulo: "Faturado", tipo: "moeda" }, { chave: "valor_recebido", titulo: "Recebido", tipo: "moeda" },
    ],
    filtros: ["cliente", "competencia"],
  },
  aging: {
    titulo: "Aging do contas a receber", descricao: "Faturas em aberto (situação atual, independe do período).",
    colunas: [
      { chave: "cliente_nome", titulo: "Cliente", largura: 22 }, { chave: "empresa_apelido", titulo: "Empresa" }, { chave: "tipo_fatura", titulo: "Tipo" }, { chave: "placa", titulo: "Placa", tipo: "placa" },
      { chave: "numero_nf", titulo: "NF" }, { chave: "data_emissao", titulo: "Emissão", tipo: "data" }, { chave: "data_vencimento", titulo: "Vencimento", tipo: "data" },
      { chave: "dias_atraso", titulo: "Dias atraso", tipo: "numero" }, { chave: "faixa", titulo: "Faixa", tipo: "faixa" }, { chave: "valor_final", titulo: "Valor", tipo: "moeda" },
      { chave: "valor_recebido", titulo: "Recebido", tipo: "moeda" }, { chave: "saldo", titulo: "Saldo", tipo: "moeda" },
    ],
    filtros: ["cliente_nome", "empresa_apelido", "tipo_fatura", "placa", "faixa"],
  },
  repasses: {
    titulo: "Repasses por locador", descricao: "Repasses do período com abatimentos e situação.",
    colunas: [
      { chave: "locador_nome", titulo: "Locador", largura: 24 }, { chave: "placa", titulo: "Placa", tipo: "placa" }, { chave: "competencia", titulo: "Competência", tipo: "competencia" },
      { chave: "dias", titulo: "Dias", tipo: "numero" }, { chave: "valor_bruto", titulo: "Bruto", tipo: "moeda" }, { chave: "valor_abatimentos", titulo: "Abatimentos", tipo: "moeda" },
      { chave: "valor_liquido", titulo: "Líquido", tipo: "moeda" }, { chave: "status", titulo: "Status", tipo: "status" }, { chave: "adiantado", titulo: "Adiantado" },
    ],
    filtros: ["locador_nome", "placa", "competencia", "status"],
  },
  despesas: {
    titulo: "Despesas por categoria", descricao: "Contas a pagar por vencimento no período.",
    colunas: [
      { chave: "categoria", titulo: "Categoria", largura: 24 }, { chave: "tipo", titulo: "Tipo" }, { chave: "valor", titulo: "Total", tipo: "moeda" },
      { chave: "pago", titulo: "Pago", tipo: "moeda" }, { chave: "aberto", titulo: "Em aberto", tipo: "moeda" }, { chave: "descontado", titulo: "Descontado do locador", tipo: "moeda" },
    ],
    filtros: ["categoria", "tipo"],
  },
  manutencao: {
    titulo: "Histórico de manutenção por veículo", descricao: "OS abertas no período, por placa.",
    colunas: [
      { chave: "placa", titulo: "Placa", tipo: "placa" }, { chave: "numero", titulo: "OS", tipo: "numero" }, { chave: "tipo", titulo: "Tipo", tipo: "tipoOS" },
      { chave: "data_abertura", titulo: "Abertura", tipo: "data" }, { chave: "data_fechamento", titulo: "Fechamento", tipo: "data" },
      { chave: "descricao", titulo: "Descrição", largura: 40 }, { chave: "fornecedor", titulo: "Fornecedor", largura: 22 },
      { chave: "horas_parado", titulo: "Parado", tipo: "horas" }, { chave: "custo_total", titulo: "Custo", tipo: "moeda" }, { chave: "status", titulo: "Status", tipo: "status" },
    ],
    filtros: ["placa", "tipo", "fornecedor", "status"],
  },
};

/** parâmetro da URL de cada filtro (prefixo evita colidir com r/de/ate) */
const PARAM = (chave: string) => `f_${chave}`;
const TODOS_FILTROS = [...new Set(Object.values(RELATORIOS).flatMap((r) => r.filtros))];

/** texto da opção do filtro, no mesmo formato da célula */
function rotuloFiltro(c: Col, v: string) {
  switch (c.tipo) {
    case "placa": return formatPlaca(v);
    case "competencia": return formatCompetencia(v);
    case "status": return rotuloStatus(v);
    case "tipoOS": return ROTULOS.tipoOS[v as keyof typeof ROTULOS.tipoOS] ?? v;
    case "faixa": return rotuloFaixa(v);
    default: return v;
  }
}

/** colunas do aging no mesmo formato da tela de Contas a receber */
function colunasAging(linhas: Linha[]): ColumnDef<Linha, unknown>[] {
  return [
    { id: "placa", header: "Placa / cliente", meta: { tituloMobile: true }, cell: ({ row: { original: m } }) => (
      <div className="max-w-[13rem]" title={`${m.cliente_nome ?? ""}${m.obra_nome ? ` · ${m.obra_nome}` : ""}`}>
        <span className="font-mono font-semibold">{placaOuAvulsa(m)}</span> <span className="text-xs text-muted-foreground">{m.empresa_apelido}</span>
        <p className="truncate text-xs text-muted-foreground">{m.cliente_nome}</p>
        {m.obra_nome && <p className="truncate text-xs text-muted-foreground">{m.obra_nome}</p>}
      </div>
    ) },
    { id: "numero_nf", header: "NF", cell: ({ row: { original: m } }) => <span className="num">{m.numero_nf ?? "—"}</span> },
    { id: "periodo", header: "Período", cell: ({ row: { original: m } }) => (m.periodo_inicio
      ? <span className="whitespace-nowrap text-xs leading-tight">{formatData(String(m.periodo_inicio))}<br /><span className="text-muted-foreground">a {formatData(String(m.periodo_fim))}</span></span>
      : "—") },
    { id: "data_vencimento", header: "Vencimento", cell: ({ row: { original: m } }) => (
      <div className="whitespace-nowrap leading-tight">
        {formatData(m.data_vencimento as string | null)}{m.status_exibicao === "vencido" && m.dias_atraso ? <Badge variant="critico" className="ml-1 px-1.5 py-0 text-[11px]">{m.dias_atraso} d</Badge> : null}
        <p className="text-[11px] text-muted-foreground">emissão {formatData(m.data_emissao as string | null)}</p>
      </div>
    ) },
    { id: "valor_final", header: "Valor", meta: { direita: true }, cell: ({ row: { original: m } }) => (
      <div className="whitespace-nowrap leading-tight">
        <Moeda valor={Number(m.valor_final)} />
        {Number(m.valor_recebido) > 0 && <p className="text-[11px] text-status-ok">recebido <Moeda valor={Number(m.valor_recebido)} /></p>}
      </div>
    ), footer: () => (
      <div className="leading-tight"><Moeda valor={somar(linhas.map((l) => Number(l.valor_final) || 0))} />
        <p className="text-[11px] font-normal text-muted-foreground">recebido <Moeda valor={somar(linhas.map((l) => Number(l.valor_recebido) || 0))} /></p></div>
    ) },
    { id: "saldo", header: "Saldo", meta: { direita: true }, cell: ({ row: { original: m } }) => <Moeda valor={Number(m.saldo)} className="whitespace-nowrap font-semibold" />,
      footer: () => <Moeda valor={somar(linhas.map((l) => Number(l.saldo) || 0))} /> },
    { id: "status", header: "Status", cell: ({ row: { original: m } }) => (m.status_exibicao ? <StatusBadge status={String(m.status_exibicao)} className="whitespace-nowrap" /> : "—") },
  ];
}

/** exportação do aging com as colunas da exportação de Contas a receber (+ tipo e faixa) */
const EXPORT_AGING: ColunaExport<Linha>[] = [
  { titulo: "Empresa", valor: (m) => m.empresa_apelido }, { titulo: "Cliente", valor: (m) => m.cliente_nome, largura: 22 },
  { titulo: "Obra", valor: (m) => m.obra_nome, largura: 20 }, { titulo: "Tipo", valor: (m) => m.tipo_fatura }, { titulo: "Placa", valor: (m) => placaOuAvulsa(m) },
  { titulo: "NF", valor: (m) => m.numero_nf }, { titulo: "Emissão", valor: (m) => m.data_emissao, tipo: "data" }, { titulo: "Vencimento", valor: (m) => m.data_vencimento, tipo: "data" },
  { titulo: "Dias atraso", valor: (m) => (m.status_exibicao === "vencido" ? m.dias_atraso : null), tipo: "numero" }, { titulo: "Faixa", valor: (m) => rotuloFaixa(String(m.faixa ?? "")) },
  { titulo: "Valor", valor: (m) => m.valor_final, tipo: "moeda" }, { titulo: "Recebido", valor: (m) => m.valor_recebido, tipo: "moeda" },
  { titulo: "Saldo", valor: (m) => m.saldo, tipo: "moeda" }, { titulo: "Status", valor: (m) => (m.status_exibicao ? rotuloStatus(String(m.status_exibicao)) : "") },
];

/** campo de mês com calendário (grade de meses do ano) */
function CampoMes({ id, rotulo, valor, onChange, min, max }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <div className="flex flex-col gap-1"><Label htmlFor={id} className="text-xs text-muted-foreground">{rotulo}</Label>
      <SeletorMes id={id} value={valor} min={min} max={max} onChange={(v) => v !== valor && onChange(v)} /></div>
  );
}

function celula(c: Col, v: string | number | null) {
  if (v === null || v === undefined || v === "") return "—";
  switch (c.tipo) {
    case "moeda": return <Moeda valor={Number(v)} sinal={c.chave === "margem"} />;
    case "pct": return formatPct(Number(v));
    case "data": return formatData(String(v));
    case "placa": return <span className="font-mono font-semibold">{formatPlaca(String(v))}</span>;
    case "competencia": return formatCompetencia(String(v));
    case "status": return <StatusBadge status={String(v)} />;
    case "horas": return formatHoras(Number(v));
    case "tipoOS": return ROTULOS.tipoOS[v as keyof typeof ROTULOS.tipoOS] ?? String(v);
    case "faixa": return rotuloFaixa(String(v));
    case "numero": return Number(v).toLocaleString("pt-BR");
    default: return String(v);
  }
}

export function RelatoriosCliente({ carregando, tudo = false, relatorio, linhas: todas, totais: totaisPeriodo, de, ate, ini, fim, empresa, empresaId }: {
  carregando?: boolean; /** sem filtro de meses: todo o período */ tudo?: boolean; relatorio: Relatorio; linhas: Linha[]; totais: Record<string, number>; de: string; ate: string; empresa: string;
  /** período em datas (início do mês "de" e fim do mês "até") e empresa escolhida, para o detalhe da placa */
  ini: string; fim: string; empresaId: string | null;
}) {
  const url = useUrlParams();
  const cfg = RELATORIOS[relatorio];
  const periodo = tudo ? "Todo o período" : `${formatCompetencia(de)} a ${formatCompetencia(ate)}`;
  // DRE por placa: clicar na placa abre os lançamentos dela no período
  const [detalhe, setDetalhe] = React.useState<{ veiculoId: string; placa: string } | null>(null);

  // filtros por coluna (placa, cliente, status…): valores distintos do relatório, guardados na URL; filtram as linhas e refazem os totais
  const params = url.params.toString();
  const filtros = React.useMemo(() => {
    const sp = new URLSearchParams(params);
    return cfg.filtros.map((chave) => {
      const col = cfg.colunas.find((c) => c.chave === chave)!;
      const opcoes = [...new Set(todas.map((l) => String(l[chave] ?? "")).filter(Boolean))]
        .map((v) => ({ value: v, label: rotuloFiltro(col, v) }))
        .sort((x, y) => (col.tipo === "competencia" ? x.value.localeCompare(y.value) : x.label.localeCompare(y.label, "pt-BR")));
      const sel = sp.get(PARAM(chave));
      return { col, opcoes, valor: sel && opcoes.some((o) => o.value === sel) ? sel : null };
    });
  }, [cfg, todas, params]);
  const ativos = React.useMemo(() => filtros.filter((f) => f.valor), [filtros]);
  const linhas = React.useMemo(
    () => (ativos.length ? todas.filter((l) => ativos.every((f) => String(l[f.col.chave] ?? "") === f.valor)) : todas),
    [todas, ativos]);
  const totais = React.useMemo(
    () => (ativos.length ? Object.fromEntries(Object.keys(totaisPeriodo).map((k) => [k, somar(linhas.map((l) => Number(l[k]) || 0))])) : totaisPeriodo),
    [ativos.length, totaisPeriodo, linhas]);
  const limparFiltros = Object.fromEntries(TODOS_FILTROS.map((k) => [PARAM(k), null]));
  const descFiltros = ativos.map((f) => `${f.col.titulo}: ${f.opcoes.find((o) => o.value === f.valor)?.label}`).join(" · ");

  const aging = relatorio === "aging";
  // cards do aging: saldo por faixa com os outros filtros aplicados (o de faixa não, para os cards mostrarem todas)
  const faixaSel = filtros.find((f) => f.col.chave === "faixa")?.valor ?? null;
  const resumoAging = React.useMemo(() => {
    if (!aging) return null;
    const outros = ativos.filter((f) => f.col.chave !== "faixa");
    const base = todas.filter((l) => outros.every((f) => String(l[f.col.chave] ?? "") === f.valor));
    const r: Record<string, number> = Object.fromEntries(FAIXAS.map((f) => [f.chave, 0]));
    for (const l of base) r[String(l.faixa)] = (r[String(l.faixa)] ?? 0) + (Number(l.saldo) || 0);
    return { porFaixa: r, total: somar(Object.values(r)) };
  }, [aging, ativos, todas]);

  const colunasAgingMemo = React.useMemo(() => colunasAging(linhas), [linhas]);
  const colunasPadrao = React.useMemo<ColumnDef<Linha, unknown>[]>(() => cfg.colunas.map((c, i): ColumnDef<Linha, unknown> => ({
    id: c.chave, header: c.titulo,
    meta: { direita: ["moeda", "numero", "pct", "horas"].includes(c.tipo ?? ""), tituloMobile: i === 0 },
    cell: ({ row }) => relatorio === "dre_placa" && c.chave === "placa" && row.original.veiculo_id
      ? <button type="button" className="inline-flex items-center gap-1 text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid" title="Ver lançamentos da placa"
          onClick={() => setDetalhe({ veiculoId: String(row.original.veiculo_id), placa: String(row.original.placa) })}>{celula(c, row.original[c.chave])}<ChevronRight className="h-3.5 w-3.5" /></button>
      : celula(c, row.original[c.chave]),
    footer: () => (i === 0 ? "Total" : c.tipo === "moeda" && totais[c.chave] !== undefined ? <Moeda valor={totais[c.chave]} /> : null),
  })), [cfg, totais, relatorio]);
  const colunas = aging ? colunasAgingMemo : colunasPadrao;

  const expPadrao: ColunaExport<Linha>[] = cfg.colunas.map((c) => ({
    titulo: c.titulo, largura: c.largura,
    tipo: c.tipo === "moeda" ? "moeda" : c.tipo === "data" ? "data" : ["numero", "pct", "horas"].includes(c.tipo ?? "") ? "numero" : "texto",
    valor: (l) => (c.tipo === "competencia" && l[c.chave] ? formatCompetencia(String(l[c.chave])) : c.tipo === "tipoOS" ? ROTULOS.tipoOS[l[c.chave] as keyof typeof ROTULOS.tipoOS] : c.tipo === "faixa" ? rotuloFaixa(String(l[c.chave] ?? "")) : l[c.chave]),
  }));
  const exp = aging ? EXPORT_AGING : expPadrao;
  const linhaTotais = aging
    ? EXPORT_AGING.map((c, i) => (i === 0 ? "Total" : c.titulo === "Valor" ? totais.valor_final ?? "" : c.titulo === "Recebido" ? totais.valor_recebido ?? "" : c.titulo === "Saldo" ? totais.saldo ?? "" : ""))
    : cfg.colunas.map((c, i) => (i === 0 ? "Total" : c.tipo === "moeda" ? totais[c.chave] ?? "" : ""));

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Relatórios" descricao={`${empresa} · ${relatorio === "aging" ? "posição atual" : periodo}`}
        acoes={<>
          <Button variant="outline" onClick={() => exportarXLSX(cfg.titulo, exp, linhas)}><FileSpreadsheet /> XLSX</Button>
          <Button variant="outline" onClick={() => exportarPDF(cfg.titulo, cfg.titulo, exp, linhas, { paisagem: true, subtitulo: `${empresa} · ${relatorio === "aging" ? "posição atual" : periodo}${descFiltros ? ` · ${descFiltros}` : ""}`, totais: linhaTotais })}><FileText /> PDF</Button>
        </>} />
      <Tabs value={relatorio} onValueChange={(v) => url.set({ r: v, ...limparFiltros })}>
        <TabsList>
          {(Object.keys(RELATORIOS) as Relatorio[]).map((k) => <TabsTrigger key={k} value={k}>{RELATORIOS[k].titulo}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <BarraFiltros>
        {relatorio !== "aging" && <>
          <div className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Período</span>
            <div className="flex h-9 rounded-md border p-0.5">
              <Button type="button" size="sm" variant={tudo ? "default" : "ghost"} className="h-full" onClick={() => url.set({ de: null, ate: null })}>Tudo</Button>
              <Button type="button" size="sm" variant={tudo ? "ghost" : "default"} className="h-full" onClick={() => tudo && url.set({ de, ate })}>Escolher meses</Button>
            </div>
          </div>
          {!tudo && <>
            <CampoMes id="rel-de" rotulo="De" valor={de} max={ate} onChange={(v) => url.set({ de: v, ate })} />
            <CampoMes id="rel-ate" rotulo="Até" valor={ate} min={de} onChange={(v) => url.set({ ate: v, de })} />
          </>}
        </>}
        {filtros.map((f) => (
          <div key={f.col.chave} className="flex flex-col gap-1"><Label htmlFor={`rel-f-${f.col.chave}`} className="text-xs text-muted-foreground">{f.col.titulo}</Label>
            <SelectBusca id={`rel-f-${f.col.chave}`} className="h-9 w-48" busca="Buscar…" value={f.valor} opcoes={f.opcoes} vazio="Todos"
              onChange={(v) => url.set({ [PARAM(f.col.chave)]: v })} /></div>
        ))}
        {ativos.length > 0 && <Button variant="ghost" className="h-9" onClick={() => url.set(limparFiltros)}><X /> Limpar filtros</Button>}
        {carregando && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
      </BarraFiltros>
      {resumoAging && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <button type="button" className="text-left" onClick={() => url.set({ [PARAM("faixa")]: null })}>
            <KpiCard titulo="Total em aberto" valor={<Moeda valor={resumoAging.total} />} destaque={!faixaSel} />
          </button>
          {FAIXAS.map((f) => (
            <button key={f.chave} type="button" className="text-left" onClick={() => url.set({ [PARAM("faixa")]: faixaSel === f.chave ? null : f.chave })}>
              <KpiCard titulo={f.rotulo} valor={<Moeda valor={resumoAging.porFaixa[f.chave] ?? 0} />} tom={(resumoAging.porFaixa[f.chave] ?? 0) > 0 ? f.tom : undefined} destaque={faixaSel === f.chave} />
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{cfg.descricao}{ativos.length > 0 && ` · ${linhas.length} de ${todas.length} linhas`}</p>
      <DataTable colunas={colunas} dados={linhas} rodape compacta={aging}
        getId={(l) => (aging && l.id ? String(l.id) : cfg.colunas.map((c) => String(l[c.chave] ?? "")).join("|"))}
        classeLinha={aging ? (l) => (l.status_exibicao === "vencido" ? "border-l-2 border-l-status-critico" : undefined) : undefined} />
      {relatorio === "dre_placa" && <DetalhePlaca placa={detalhe} onOpenChange={(v) => !v && setDetalhe(null)} ini={ini} fim={fim} empresaId={empresaId} periodo={periodo} />}
    </div>
  );
}
