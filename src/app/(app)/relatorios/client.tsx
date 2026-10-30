"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { Label } from "@/components/ui/basicos";
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
type Col = { chave: string; titulo: string; tipo?: "moeda" | "numero" | "data" | "pct" | "placa" | "competencia" | "status" | "horas" | "tipoOS"; largura?: number };

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
      { chave: "cliente_nome", titulo: "Cliente", largura: 22 }, { chave: "empresa_apelido", titulo: "Empresa" }, { chave: "placa", titulo: "Placa", tipo: "placa" },
      { chave: "numero_nf", titulo: "NF" }, { chave: "data_emissao", titulo: "Emissão", tipo: "data" }, { chave: "data_vencimento", titulo: "Vencimento", tipo: "data" },
      { chave: "dias_atraso", titulo: "Dias atraso", tipo: "numero" }, { chave: "faixa", titulo: "Faixa" }, { chave: "valor_final", titulo: "Valor", tipo: "moeda" },
      { chave: "valor_recebido", titulo: "Recebido", tipo: "moeda" }, { chave: "saldo", titulo: "Saldo", tipo: "moeda" },
    ],
    filtros: ["cliente_nome", "empresa_apelido", "placa", "faixa"],
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
    default: return v;
  }
}

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
    case "numero": return Number(v).toLocaleString("pt-BR");
    default: return String(v);
  }
}

export function RelatoriosCliente({ carregando, relatorio, linhas: todas, totais: totaisPeriodo, de, ate, ini, fim, empresa, empresaId }: {
  carregando?: boolean; relatorio: Relatorio; linhas: Linha[]; totais: Record<string, number>; de: string; ate: string; empresa: string;
  /** período em datas (início do mês "de" e fim do mês "até") e empresa escolhida, para o detalhe da placa */
  ini: string; fim: string; empresaId: string | null;
}) {
  const url = useUrlParams();
  const cfg = RELATORIOS[relatorio];
  const periodo = `${formatCompetencia(de)} a ${formatCompetencia(ate)}`;
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

  const colunas = React.useMemo<ColumnDef<Linha, unknown>[]>(() => cfg.colunas.map((c, i): ColumnDef<Linha, unknown> => ({
    id: c.chave, header: c.titulo,
    meta: { direita: ["moeda", "numero", "pct", "horas"].includes(c.tipo ?? ""), tituloMobile: i === 0 },
    cell: ({ row }) => relatorio === "dre_placa" && c.chave === "placa" && row.original.veiculo_id
      ? <button type="button" className="inline-flex items-center gap-1 text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid" title="Ver lançamentos da placa"
          onClick={() => setDetalhe({ veiculoId: String(row.original.veiculo_id), placa: String(row.original.placa) })}>{celula(c, row.original[c.chave])}<ChevronRight className="h-3.5 w-3.5" /></button>
      : celula(c, row.original[c.chave]),
    footer: () => (i === 0 ? "Total" : c.tipo === "moeda" && totais[c.chave] !== undefined ? <Moeda valor={totais[c.chave]} /> : null),
  })), [cfg, totais, relatorio]);

  const exp: ColunaExport<Linha>[] = cfg.colunas.map((c) => ({
    titulo: c.titulo, largura: c.largura,
    tipo: c.tipo === "moeda" ? "moeda" : c.tipo === "data" ? "data" : ["numero", "pct", "horas"].includes(c.tipo ?? "") ? "numero" : "texto",
    valor: (l) => (c.tipo === "competencia" && l[c.chave] ? formatCompetencia(String(l[c.chave])) : c.tipo === "tipoOS" ? ROTULOS.tipoOS[l[c.chave] as keyof typeof ROTULOS.tipoOS] : l[c.chave]),
  }));
  const linhaTotais = cfg.colunas.map((c, i) => (i === 0 ? "Total" : c.tipo === "moeda" ? totais[c.chave] ?? "" : ""));

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
          <CampoMes id="rel-de" rotulo="De" valor={de} max={ate} onChange={(v) => url.set({ de: v })} />
          <CampoMes id="rel-ate" rotulo="Até" valor={ate} min={de} onChange={(v) => url.set({ ate: v })} />
        </>}
        {filtros.map((f) => (
          <div key={f.col.chave} className="flex flex-col gap-1"><Label htmlFor={`rel-f-${f.col.chave}`} className="text-xs text-muted-foreground">{f.col.titulo}</Label>
            <SelectBusca id={`rel-f-${f.col.chave}`} className="h-9 w-48" busca="Buscar…" value={f.valor} opcoes={f.opcoes} vazio="Todos"
              onChange={(v) => url.set({ [PARAM(f.col.chave)]: v })} /></div>
        ))}
        {ativos.length > 0 && <Button variant="ghost" className="h-9" onClick={() => url.set(limparFiltros)}><X /> Limpar filtros</Button>}
        {carregando && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
      </BarraFiltros>
      <p className="text-sm text-muted-foreground">{cfg.descricao}{ativos.length > 0 && ` · ${linhas.length} de ${todas.length} linhas`}</p>
      <DataTable colunas={colunas} dados={linhas} getId={(l) => cfg.colunas.map((c) => String(l[c.chave] ?? "")).join("|")} rodape />
      {relatorio === "dre_placa" && <DetalhePlaca placa={detalhe} onOpenChange={(v) => !v && setDetalhe(null)} ini={ini} fim={fim} empresaId={empresaId} periodo={periodo} />}
    </div>
  );
}
