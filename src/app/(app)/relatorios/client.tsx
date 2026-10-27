"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Cabecalho, Moeda, StatusBadge } from "@/components/app/comuns";
import { DataTable } from "@/components/app/data-table";
import { BarraFiltros, useUrlParams } from "@/components/app/url";
import { exportarPDF, exportarXLSX, type ColunaExport } from "@/lib/exportar";
import { formatCompetencia, formatData, formatHoras, formatPct, formatPlaca } from "@/lib/format";
import { ROTULOS } from "@/lib/schemas/cadastros";
import { DetalhePlaca } from "./detalhe-placa";

export type Relatorio = "dre_placa" | "dre_cliente" | "faturamento" | "aging" | "repasses" | "despesas" | "manutencao";
type Linha = Record<string, string | number | null>;
type Col = { chave: string; titulo: string; tipo?: "moeda" | "numero" | "data" | "pct" | "placa" | "competencia" | "status" | "horas" | "tipoOS"; largura?: number };

const RELATORIOS: Record<Relatorio, { titulo: string; descricao: string; colunas: Col[] }> = {
  dre_placa: {
    titulo: "DRE por placa", descricao: "Receita das medições − repasse ao locador − manutenção − outras despesas do veículo (despesas descontadas do locador não entram).",
    colunas: [
      { chave: "placa", titulo: "Placa", tipo: "placa" }, { chave: "empresa", titulo: "Empresa" }, { chave: "proprietario", titulo: "Frota" },
      { chave: "receita", titulo: "Receita", tipo: "moeda" }, { chave: "repasse", titulo: "Repasse", tipo: "moeda" }, { chave: "manutencao", titulo: "Manutenção", tipo: "moeda" },
      { chave: "outras_despesas", titulo: "Outras despesas", tipo: "moeda" }, { chave: "margem", titulo: "Margem", tipo: "moeda" }, { chave: "margem_pct", titulo: "Margem %", tipo: "pct" },
    ],
  },
  dre_cliente: {
    titulo: "DRE por cliente", descricao: "Receita medida, repasse bruto dos sublocados e margem bruta por cliente no período.",
    colunas: [
      { chave: "cliente", titulo: "Cliente", largura: 26 }, { chave: "medicoes", titulo: "Medições", tipo: "numero" }, { chave: "receita", titulo: "Receita", tipo: "moeda" },
      { chave: "repasse", titulo: "Repasse", tipo: "moeda" }, { chave: "margem", titulo: "Margem", tipo: "moeda" }, { chave: "margem_pct", titulo: "Margem %", tipo: "pct" },
      { chave: "recebido", titulo: "Recebido", tipo: "moeda" },
    ],
  },
  faturamento: {
    titulo: "Faturamento por cliente", descricao: "Valor medido por cliente e competência (mês de fim do período).",
    colunas: [
      { chave: "cliente", titulo: "Cliente", largura: 26 }, { chave: "competencia", titulo: "Competência", tipo: "competencia" }, { chave: "qtd", titulo: "Medições", tipo: "numero" },
      { chave: "valor_final", titulo: "Faturado", tipo: "moeda" }, { chave: "valor_recebido", titulo: "Recebido", tipo: "moeda" },
    ],
  },
  aging: {
    titulo: "Aging do contas a receber", descricao: "Faturas em aberto (situação atual, independe do período).",
    colunas: [
      { chave: "cliente_nome", titulo: "Cliente", largura: 22 }, { chave: "empresa_apelido", titulo: "Empresa" }, { chave: "placa", titulo: "Placa", tipo: "placa" },
      { chave: "numero_nf", titulo: "NF" }, { chave: "data_emissao", titulo: "Emissão", tipo: "data" }, { chave: "data_vencimento", titulo: "Vencimento", tipo: "data" },
      { chave: "dias_atraso", titulo: "Dias atraso", tipo: "numero" }, { chave: "faixa", titulo: "Faixa" }, { chave: "valor_final", titulo: "Valor", tipo: "moeda" },
      { chave: "valor_recebido", titulo: "Recebido", tipo: "moeda" }, { chave: "saldo", titulo: "Saldo", tipo: "moeda" },
    ],
  },
  repasses: {
    titulo: "Repasses por locador", descricao: "Repasses do período com abatimentos e situação.",
    colunas: [
      { chave: "locador_nome", titulo: "Locador", largura: 24 }, { chave: "placa", titulo: "Placa", tipo: "placa" }, { chave: "competencia", titulo: "Competência", tipo: "competencia" },
      { chave: "dias", titulo: "Dias", tipo: "numero" }, { chave: "valor_bruto", titulo: "Bruto", tipo: "moeda" }, { chave: "valor_abatimentos", titulo: "Abatimentos", tipo: "moeda" },
      { chave: "valor_liquido", titulo: "Líquido", tipo: "moeda" }, { chave: "status", titulo: "Status", tipo: "status" }, { chave: "adiantado", titulo: "Adiantado" },
    ],
  },
  despesas: {
    titulo: "Despesas por categoria", descricao: "Contas a pagar por vencimento no período.",
    colunas: [
      { chave: "categoria", titulo: "Categoria", largura: 24 }, { chave: "tipo", titulo: "Tipo" }, { chave: "valor", titulo: "Total", tipo: "moeda" },
      { chave: "pago", titulo: "Pago", tipo: "moeda" }, { chave: "aberto", titulo: "Em aberto", tipo: "moeda" }, { chave: "descontado", titulo: "Descontado do locador", tipo: "moeda" },
    ],
  },
  manutencao: {
    titulo: "Histórico de manutenção por veículo", descricao: "OS abertas no período, por placa.",
    colunas: [
      { chave: "placa", titulo: "Placa", tipo: "placa" }, { chave: "numero", titulo: "OS", tipo: "numero" }, { chave: "tipo", titulo: "Tipo", tipo: "tipoOS" },
      { chave: "data_abertura", titulo: "Abertura", tipo: "data" }, { chave: "data_fechamento", titulo: "Fechamento", tipo: "data" },
      { chave: "descricao", titulo: "Descrição", largura: 40 }, { chave: "fornecedor", titulo: "Fornecedor", largura: 22 },
      { chave: "horas_parado", titulo: "Parado", tipo: "horas" }, { chave: "custo_total", titulo: "Custo", tipo: "moeda" }, { chave: "status", titulo: "Status", tipo: "status" },
    ],
  },
};

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

export function RelatoriosCliente({ relatorio, linhas, totais, de, ate, ini, fim, empresa, empresaId }: {
  relatorio: Relatorio; linhas: Linha[]; totais: Record<string, number>; de: string; ate: string; empresa: string;
  /** período em datas (início do mês "de" e fim do mês "até") e empresa escolhida, para o detalhe da placa */
  ini: string; fim: string; empresaId: string | null;
}) {
  const url = useUrlParams();
  const cfg = RELATORIOS[relatorio];
  const periodo = `${formatCompetencia(de)} a ${formatCompetencia(ate)}`;
  // DRE por placa: clicar na placa abre os lançamentos dela no período
  const [detalhe, setDetalhe] = React.useState<{ veiculoId: string; placa: string } | null>(null);

  const colunas = React.useMemo<ColumnDef<Linha, unknown>[]>(() => cfg.colunas.map((c, i) => ({
    id: c.chave, header: c.titulo,
    meta: { direita: ["moeda", "numero", "pct", "horas"].includes(c.tipo ?? ""), tituloMobile: i === 0 },
    cell: ({ row }) => relatorio === "dre_placa" && c.chave === "placa" && row.original.veiculo_id
      ? <button type="button" className="underline-offset-2 hover:underline" title="Ver lançamentos da placa"
          onClick={() => setDetalhe({ veiculoId: String(row.original.veiculo_id), placa: String(row.original.placa) })}>{celula(c, row.original[c.chave])}</button>
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
          <Button variant="outline" onClick={() => exportarPDF(cfg.titulo, cfg.titulo, exp, linhas, { paisagem: true, subtitulo: `${empresa} · ${relatorio === "aging" ? "posição atual" : periodo}`, totais: linhaTotais })}><FileText /> PDF</Button>
        </>} />
      <Tabs value={relatorio} onValueChange={(v) => url.set({ r: v })}>
        <TabsList>
          {(Object.keys(RELATORIOS) as Relatorio[]).map((k) => <TabsTrigger key={k} value={k}>{RELATORIOS[k].titulo}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <BarraFiltros>
        <div className="flex flex-col gap-1"><Label htmlFor="rel-de" className="text-xs text-muted-foreground">De</Label>
          <Input id="rel-de" type="month" className="h-9 w-40" value={de} onChange={(e) => url.set({ de: e.target.value || null })} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor="rel-ate" className="text-xs text-muted-foreground">Até</Label>
          <Input id="rel-ate" type="month" className="h-9 w-40" value={ate} onChange={(e) => url.set({ ate: e.target.value || null })} /></div>
        <p className="pb-2 text-sm text-muted-foreground">{cfg.descricao}</p>
      </BarraFiltros>
      <DataTable colunas={colunas} dados={linhas} getId={(l) => cfg.colunas.map((c) => String(l[c.chave] ?? "")).join("|")} rodape />
      {relatorio === "dre_placa" && <DetalhePlaca placa={detalhe} onOpenChange={(v) => !v && setDetalhe(null)} ini={ini} fim={fim} empresaId={empresaId} periodo={periodo} />}
    </div>
  );
}
