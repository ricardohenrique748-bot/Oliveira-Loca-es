"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarPlus, CheckCheck, Eye, FileDown, FileSpreadsheet, FileText, Loader2, Save, Undo2, Wand2 } from "lucide-react";
import { Badge, Card, Checkbox, Label, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import type { Opcao } from "@/components/ui/select";
import { Cabecalho, Confirmar, Moeda, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { InputMoeda, InputNumero } from "@/components/app/campos";
import { BarraFiltros, BuscaUrl, FiltroSelectUrl, useUrlParams } from "@/components/app/url";
import { calcularValorMedicao, calcularVencimento, hojeSP, somar } from "@/lib/calculos";
import { formatCompetencia, formatData, formatPeriodo, formatPlaca } from "@/lib/format";
import { exportarPDF, exportarXLSX, type ColunaExport } from "@/lib/exportar";
import { cn } from "@/lib/utils";
import {
  cancelarMedicoes, dadosLembrete, faturarMedicoes, gerarMedicoes, previaMedicoes, salvarMedicoes, voltarParaAFaturar,
  type LinhaLembrete, type LinhaPrevia,
} from "./actions";

export type LinhaMedicao = {
  id: string; contrato_id: string; empresa_id: string; empresa_apelido: string; periodo_inicio: string; periodo_fim: string; competencia: string;
  dias: number; valor_mensal: number; valor_base: number; acrescimos: number; descontos: number; valor_final: number; numero_nf: string | null;
  data_emissao: string | null; data_vencimento: string | null; status: string; status_exibicao: string; observacoes: string | null; final: boolean;
  cliente_id: string; cliente_fantasia: string; obra_nome: string | null; placa: string; proprietario: string; prazo_pagamento_dias: number;
  dia_corte_inicio: number; valor_recebido: number; repasse_liquido: number | null; margem: number;
  contrato_numero: string | number | null; cliente_nome: string | null; veiculo_tipo: string | null; saldo: number;
};

type Editavel = Pick<LinhaMedicao, "dias" | "acrescimos" | "descontos" | "numero_nf" | "data_emissao" | "data_vencimento" | "observacoes">;
const COLS = ["dias", "acrescimos", "descontos", "numero_nf", "data_emissao", "data_vencimento", "observacoes"] as const;

const STATUS_OPCOES: Opcao[] = [
  { value: "a_faturar", label: "A faturar" }, { value: "faturado", label: "Faturado" }, { value: "vencido", label: "Vencido" },
  { value: "recebido_parcial", label: "Recebido parcial" }, { value: "recebido", label: "Recebido" }, { value: "cancelado", label: "Cancelado" },
];

const COLUNAS_LEMBRETE: ColunaExport<LinhaLembrete>[] = [
  { titulo: "Empresa", valor: (l) => l.empresa }, { titulo: "Cliente", valor: (l) => l.cliente, largura: 20 }, { titulo: "Obra", valor: (l) => l.obra, largura: 22 },
  { titulo: "Placa", valor: (l) => l.placa }, { titulo: "Período", valor: (l) => formatPeriodo(l.periodo_inicio, l.periodo_fim), largura: 20 },
  { titulo: "Dias", valor: (l) => l.dias, tipo: "numero" }, { titulo: "Valor (R$)", valor: (l) => l.valor_final, tipo: "moeda", largura: 14 },
  { titulo: "NF", valor: (l) => l.numero_nf }, { titulo: "Emissão", valor: (l) => l.data_emissao, tipo: "data" },
  { titulo: "Vencimento", valor: (l) => l.data_vencimento, tipo: "data" }, { titulo: "Status", valor: (l) => l.status },
  { titulo: "Responsável (faturamento)", valor: (l) => l.contatos, largura: 50 }, { titulo: "Observações", valor: (l) => l.observacoes, largura: 30 },
];

export function MedicoesCliente({ linhas, total, pagina, tamanho, competencia, competenciaPadrao, clientes, baseDias, podeEditar }: {
  linhas: LinhaMedicao[]; total: number; pagina: number; tamanho: number; competencia: string; competenciaPadrao: string;
  clientes: Opcao[]; baseDias: number; podeEditar: boolean;
}) {
  const router = useRouter();
  const url = useUrlParams();
  const [edicoes, setEdicoes] = React.useState<Record<string, Partial<Editavel>>>({});
  const [selecao, setSelecao] = React.useState<Set<string>>(new Set());
  const [salvando, setSalvando] = React.useState(false);
  const [gerarAberto, setGerarAberto] = React.useState(false);
  const [faturarAberto, setFaturarAberto] = React.useState(false);
  const [cancelarAberto, setCancelarAberto] = React.useState(false);
  const [detalhe, setDetalhe] = React.useState<LinhaMedicao | null>(null);
  const tabela = React.useRef<HTMLTableElement>(null);

  React.useEffect(() => { setEdicoes({}); setSelecao(new Set()); }, [linhas]);

  const valor = <K extends keyof Editavel>(m: LinhaMedicao, k: K): Editavel[K] => (k in (edicoes[m.id] ?? {}) ? (edicoes[m.id]![k] as Editavel[K]) : m[k]);
  const editar = (m: LinhaMedicao, k: keyof Editavel, v: unknown) => {
    setEdicoes((e) => {
      const atual: Partial<Editavel> = { ...(e[m.id] ?? {}), [k]: v };
      // emissão alterada e vencimento não mexido → recalcula vencimento (emissão + prazo)
      if (k === "data_emissao" && !("data_vencimento" in (e[m.id] ?? {}) && e[m.id]!.data_vencimento !== m.data_vencimento)) {
        atual.data_vencimento = calcularVencimento(v as string | null, m.prazo_pagamento_dias);
      }
      return { ...e, [m.id]: atual };
    });
  };
  const calc = (m: LinhaMedicao) => calcularValorMedicao({
    valorMensal: m.valor_mensal, dias: valor(m, "dias"), acrescimos: valor(m, "acrescimos"), descontos: valor(m, "descontos"), baseDias,
  });
  const alterados = Object.keys(edicoes).filter((id) => {
    const m = linhas.find((l) => l.id === id);
    return m && COLS.some((k) => k in edicoes[id] && edicoes[id][k] !== m[k]);
  });

  const salvar = React.useCallback(async () => {
    if (!alterados.length) return;
    setSalvando(true);
    const payload = alterados.map((id) => {
      const m = linhas.find((l) => l.id === id)!;
      const e = edicoes[id];
      const out: Record<string, unknown> = { id };
      for (const k of COLS) if (k in e && e[k] !== m[k]) out[k] = e[k];
      return out;
    });
    const r = await rodarAcao(salvarMedicoes(payload));
    setSalvando(false);
    if (r.ok) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alterados, edicoes, linhas]);

  // Ctrl+S salva a grade
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); salvar(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [salvar]);

  // Enter/↓/↑ navegam na mesma coluna (estilo planilha)
  const navegar = (e: React.KeyboardEvent<HTMLElement>) => {
    const alvo = e.target as HTMLElement;
    const linha = Number(alvo.dataset.linha);
    const col = alvo.dataset.col;
    if (Number.isNaN(linha) || !col) return;
    let prox: number | null = null;
    if (e.key === "Enter" || (e.key === "ArrowDown" && (alvo as HTMLInputElement).type !== "date")) prox = linha + (e.shiftKey && e.key === "Enter" ? -1 : 1);
    else if (e.key === "ArrowUp" && (alvo as HTMLInputElement).type !== "date") prox = linha - 1;
    if (prox === null) return;
    const el = tabela.current?.querySelector<HTMLElement>(`[data-linha="${prox}"][data-col="${col}"]`);
    if (el) { e.preventDefault(); el.focus(); (el as HTMLInputElement).select?.(); }
  };

  const selecionados = linhas.filter((l) => selecao.has(l.id));
  const todos = linhas.length > 0 && selecao.size === linhas.length;
  const alternar = (id: string) => setSelecao((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const exportarLembrete = async (tipo: "xlsx" | "pdf") => {
    const ids = (selecionados.length ? selecionados : linhas).map((l) => l.id);
    if (!ids.length) return toast.info("Nada para exportar");
    const r = await dadosLembrete(ids);
    if (!r.ok) return toast.error(r.erro);
    const titulo = `Lembrete de faturamento — ${competencia === "todas" ? "pendentes" : formatCompetencia(competencia, true)}`;
    if (tipo === "xlsx") {
      const porCliente = Object.entries(r.dados.reduce<Record<string, LinhaLembrete[]>>((acc, l) => ((acc[l.cliente] ??= []).push(l), acc), {}));
      await exportarXLSX("lembrete_faturamento", COLUNAS_LEMBRETE, r.dados, [{ nome: "Todos", linhas: r.dados }, ...porCliente.map(([nome, ls]) => ({ nome, linhas: ls }))]);
    } else {
      await exportarPDF("lembrete_faturamento", titulo, COLUNAS_LEMBRETE.filter((c) => c.titulo !== "Observações"), r.dados, {
        paisagem: true, totais: ["Total", "", "", "", "", "", somar(r.dados.map((l) => l.valor_final)), "", "", "", "", ""],
      });
    }
  };

  const editavel = (m: LinhaMedicao) => podeEditar && (m.status === "a_faturar" || m.status === "faturado");
  const totalValor = somar(linhas.map((m) => calc(m).valorFinal));

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Medições e faturamento"
        descricao={<>Valor = (mensal ÷ {baseDias}) × dias + acréscimos − descontos. Vencimento = emissão + prazo do contrato. <kbd className="rounded border px-1 text-xs">Ctrl+S</kbd> salva · <kbd className="rounded border px-1 text-xs">Enter</kbd> desce na coluna.</>}
        acoes={podeEditar && <Button onClick={() => setGerarAberto(true)}><Wand2 /> Gerar medições do período</Button>} />

      <BarraFiltros>
        <div className="flex flex-col gap-1">
          <Label htmlFor="comp" className="text-xs text-muted-foreground">Competência (mês de fim do período)</Label>
          <div className="flex gap-1">
            <Input id="comp" type="month" className="h-9 w-40" value={competencia === "todas" ? "" : competencia}
              onChange={(e) => url.set({ comp: e.target.value || "todas" })} />
            <Button variant={competencia === "todas" ? "default" : "outline"} size="sm" onClick={() => url.set({ comp: competencia === "todas" ? competenciaPadrao : "todas" })}>
              Todas pendentes
            </Button>
          </div>
        </div>
        <FiltroSelectUrl param="status" rotulo="Status" opcoes={STATUS_OPCOES} />
        <FiltroSelectUrl param="cliente" rotulo="Cliente" opcoes={clientes} />
        <BuscaUrl placeholder="Placa…" className="sm:w-40" />
      </BarraFiltros>

      <div className="flex flex-wrap items-center gap-2">
        {selecionados.length > 0 && podeEditar && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary bg-accent px-3 py-1.5 text-sm">
            <span className="font-medium">{selecionados.length} selecionada(s)</span>
            <Button size="xs" onClick={() => setFaturarAberto(true)}><CheckCheck /> Marcar como faturado</Button>
            <Button size="xs" variant="outline" onClick={async () => { const r = await rodarAcao(voltarParaAFaturar(selecionados.map((s) => s.id))); if (r.ok) router.refresh(); }}><Undo2 /> Voltar p/ a faturar</Button>
            <Button size="xs" variant="outline" onClick={() => setCancelarAberto(true)}><Ban /> Cancelar</Button>
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportarLembrete("xlsx")}><FileSpreadsheet /> Lembrete XLSX</Button>
          <Button variant="outline" size="sm" onClick={() => exportarLembrete("pdf")}><FileText /> Lembrete PDF</Button>
          {podeEditar && (
            <Button size="sm" disabled={!alterados.length || salvando} onClick={salvar} variant={alterados.length ? "default" : "outline"}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações{alterados.length ? ` (${alterados.length})` : ""}
            </Button>
          )}
        </div>
      </div>

      {/* grade desktop */}
      <Card className={cn("hidden overflow-hidden md:block", url.pendente && "opacity-60")}>
        <Table ref={tabela} onKeyDown={navegar}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8"><Checkbox aria-label="Selecionar todas" checked={todos ? true : selecao.size ? "indeterminate" : false}
                onCheckedChange={(v) => setSelecao(v ? new Set(linhas.map((l) => l.id)) : new Set())} /></TableHead>
              <TableHead>Placa / cliente</TableHead>
              <TableHead>Período</TableHead>
              <TableHead className="w-16 text-right">Dias</TableHead>
              <TableHead className="text-right">Mensal</TableHead>
              <TableHead className="w-32 text-right">Acréscimos</TableHead>
              <TableHead className="w-32 text-right">Descontos</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-24">NF</TableHead>
              <TableHead className="w-36">Emissão</TableHead>
              <TableHead className="w-36">Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[10rem]">Observações</TableHead>
              <TableHead className="w-10"><span className="sr-only">Abrir</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow><TableCell colSpan={14}className="h-24 text-center text-muted-foreground">
                Nenhuma medição {competencia === "todas" ? "pendente" : `em ${formatCompetencia(competencia)}`}. {podeEditar && "Use “Gerar medições do período”."}
              </TableCell></TableRow>
            )}
            {linhas.map((m, i) => {
              const ed = editavel(m);
              const { valorFinal } = calc(m);
              const mudou = alterados.includes(m.id);
              return (
                <TableRow key={m.id} data-state={selecao.has(m.id) ? "selected" : undefined} className={cn(mudou && "bg-accent/50", m.status_exibicao === "vencido" && "border-l-2 border-l-status-critico")}>
                  <TableCell><Checkbox aria-label={`Selecionar ${m.placa}`} checked={selecao.has(m.id)} onCheckedChange={() => alternar(m.id)} /></TableCell>
                  <TableCell className="cursor-pointer" onClick={() => setDetalhe(m)} title="Abrir medição">
                    <span className="font-mono font-semibold hover:underline">{formatPlaca(m.placa)}</span>
                    {m.proprietario === "locador" && <Badge variant="info" className="ml-1">Sub</Badge>}
                    {m.final && <Badge variant="neutro" className="ml-1">Final</Badge>}
                    <p className="max-w-[14rem] truncate text-xs text-muted-foreground">{m.empresa_apelido} · {m.cliente_fantasia}{m.obra_nome ? ` · ${m.obra_nome}` : ""}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatPeriodo(m.periodo_inicio, m.periodo_fim)}</TableCell>
                  <TableCell>
                    <InputNumero data-linha={i} data-col="dias" aria-label="Dias" className="h-8 w-14 px-2 text-right" value={valor(m, "dias")}
                      disabled={!podeEditar || m.status !== "a_faturar"} onChange={(v) => editar(m, "dias", Math.min(31, v ?? 0))} />
                  </TableCell>
                  <TableCell className="num text-right text-xs text-muted-foreground"><Moeda valor={m.valor_mensal} /></TableCell>
                  <TableCell><InputMoeda data-linha={i} data-col="acrescimos" aria-label="Acréscimos" className="h-8" permitirVazio={false} disabled={!ed} value={valor(m, "acrescimos")} onChange={(v) => editar(m, "acrescimos", v ?? 0)} /></TableCell>
                  <TableCell><InputMoeda data-linha={i} data-col="descontos" aria-label="Descontos" className="h-8" permitirVazio={false} disabled={!ed} value={valor(m, "descontos")} onChange={(v) => editar(m, "descontos", v ?? 0)} /></TableCell>
                  <TableCell className="text-right font-semibold"><Moeda valor={valorFinal} /></TableCell>
                  <TableCell><Input data-linha={i} data-col="numero_nf" aria-label="Número da NF" className="h-8 px-2" disabled={!ed} value={valor(m, "numero_nf") ?? ""} onChange={(e) => editar(m, "numero_nf", e.target.value || null)} /></TableCell>
                  <TableCell><Input data-linha={i} data-col="data_emissao" aria-label="Data de emissão" type="date" className="h-8 px-2" disabled={!ed} value={valor(m, "data_emissao") ?? ""} onChange={(e) => editar(m, "data_emissao", e.target.value || null)} /></TableCell>
                  <TableCell><Input data-linha={i} data-col="data_vencimento" aria-label="Vencimento" type="date" className="h-8 px-2" disabled={!ed} value={valor(m, "data_vencimento") ?? ""} onChange={(e) => editar(m, "data_vencimento", e.target.value || null)} /></TableCell>
                  <TableCell><StatusBadge status={m.status_exibicao} /></TableCell>
                  <TableCell><Input data-linha={i} data-col="observacoes" aria-label="Observações" className="h-8 px-2" disabled={!podeEditar || m.status === "cancelado"} value={valor(m, "observacoes") ?? ""} onChange={(e) => editar(m, "observacoes", e.target.value || null)} /></TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Abrir medição ${m.placa}`} onClick={() => setDetalhe(m)}><Eye /></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {linhas.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={7}>{linhas.length} medições{total > linhas.length ? ` (de ${total})` : ""}</TableCell>
                <TableCell className="text-right"><Moeda valor={totalValor} /></TableCell>
                <TableCell colSpan={6} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>

      {/* mobile */}
      <div className="space-y-2 md:hidden">
        {linhas.map((m) => {
          const ed = editavel(m);
          return (
            <Card key={m.id} className={cn("space-y-2 p-3", selecao.has(m.id) && "border-primary")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono font-semibold">{formatPlaca(m.placa)} <span className="font-sans text-xs font-normal text-muted-foreground">{m.empresa_apelido}</span></p>
                  <p className="text-xs text-muted-foreground">{m.cliente_fantasia} · {formatPeriodo(m.periodo_inicio, m.periodo_fim)}</p>
                </div>
                <div className="flex items-center gap-2"><StatusBadge status={m.status_exibicao} /><Checkbox aria-label="Selecionar" checked={selecao.has(m.id)} onCheckedChange={() => alternar(m.id)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="space-y-1"><span className="text-xs text-muted-foreground">Dias</span>
                  <InputNumero className="h-9" value={valor(m, "dias")} disabled={!podeEditar || m.status !== "a_faturar"} onChange={(v) => editar(m, "dias", v ?? 0)} /></label>
                <div className="space-y-1"><span className="text-xs text-muted-foreground">Valor</span><p className="pt-2 font-semibold"><Moeda valor={calc(m).valorFinal} /></p></div>
                <label className="space-y-1"><span className="text-xs text-muted-foreground">Acréscimos</span><InputMoeda className="h-9" permitirVazio={false} disabled={!ed} value={valor(m, "acrescimos")} onChange={(v) => editar(m, "acrescimos", v ?? 0)} /></label>
                <label className="space-y-1"><span className="text-xs text-muted-foreground">Descontos</span><InputMoeda className="h-9" permitirVazio={false} disabled={!ed} value={valor(m, "descontos")} onChange={(v) => editar(m, "descontos", v ?? 0)} /></label>
                <label className="space-y-1"><span className="text-xs text-muted-foreground">NF</span><Input className="h-9" disabled={!ed} value={valor(m, "numero_nf") ?? ""} onChange={(e) => editar(m, "numero_nf", e.target.value || null)} /></label>
                <label className="space-y-1"><span className="text-xs text-muted-foreground">Emissão</span><Input className="h-9" type="date" disabled={!ed} value={valor(m, "data_emissao") ?? ""} onChange={(e) => editar(m, "data_emissao", e.target.value || null)} /></label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Vencimento: {formatData(valor(m, "data_vencimento"))}</p>
                <Button size="xs" variant="outline" onClick={() => setDetalhe(m)}><Eye /> Abrir</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {total > tamanho && (
        <div className="flex justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => url.set({ pagina: String(pagina - 1) })}>Anterior</Button>
          <span className="self-center">Página {pagina} de {Math.ceil(total / tamanho)}</span>
          <Button variant="outline" size="sm" disabled={pagina * tamanho >= total} onClick={() => url.set({ pagina: String(pagina + 1) })}>Próxima</Button>
        </div>
      )}

      <DialogoDetalhe medicao={detalhe} baseDias={baseDias} onOpenChange={(v) => !v && setDetalhe(null)} />
      <DialogoGerar aberto={gerarAberto} onOpenChange={setGerarAberto} competenciaInicial={competencia === "todas" ? competenciaPadrao : competencia}
        onGerado={(comp) => { url.set({ comp, status: null }); router.refresh(); }} />
      <DialogoFaturar aberto={faturarAberto} onOpenChange={setFaturarAberto} selecionados={selecionados}
        alteracoesPendentes={alterados.length > 0} onFeito={() => router.refresh()} />
      <Confirmar aberto={cancelarAberto} onOpenChange={setCancelarAberto} titulo={`Cancelar ${selecionados.length} medição(ões)?`} destrutivo rotulo="Cancelar medições"
        descricao="Medições canceladas saem do faturamento e o repasse vinculado (se houver e não pago) também é cancelado."
        onConfirmar={async () => { const r = await rodarAcao(cancelarMedicoes(selecionados.map((s) => s.id))); if (r.ok) router.refresh(); }} />
    </div>
  );
}

const brl = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** PDF individual da medição (boletim para enviar ao cliente). */
async function pdfMedicao(m: LinhaMedicao, baseDias: number) {
  const linha = { descricao: `Locação ${m.veiculo_tipo ? `${m.veiculo_tipo} ` : ""}placa ${formatPlaca(m.placa)}`, ...m };
  const colunas: ColunaExport<typeof linha>[] = [
    { titulo: "Descrição", valor: (l) => l.descricao },
    { titulo: "Período", valor: (l) => formatPeriodo(l.periodo_inicio, l.periodo_fim) },
    { titulo: "Dias", valor: (l) => l.dias, tipo: "numero" },
    { titulo: "Valor mensal", valor: (l) => l.valor_mensal, tipo: "moeda" },
    { titulo: "Valor base", valor: (l) => l.valor_base, tipo: "moeda" },
    { titulo: "Acréscimos", valor: (l) => l.acrescimos, tipo: "moeda" },
    { titulo: "Descontos", valor: (l) => l.descontos, tipo: "moeda" },
    { titulo: "Total", valor: (l) => l.valor_final, tipo: "moeda" },
  ];
  const resumo: [string, string][] = [
    ["Empresa", m.empresa_apelido],
    ["Cliente", m.cliente_nome && m.cliente_nome !== m.cliente_fantasia ? `${m.cliente_fantasia} (${m.cliente_nome})` : m.cliente_fantasia],
    ...(m.obra_nome ? [["Obra", m.obra_nome] as [string, string]] : []),
    ...(m.contrato_numero != null ? [["Contrato", String(m.contrato_numero)] as [string, string]] : []),
    ["Placa", formatPlaca(m.placa)],
    ["Competência", formatCompetencia(m.competencia.slice(0, 7), true)],
    ["Período", `${formatPeriodo(m.periodo_inicio, m.periodo_fim)} (${m.dias} dias)`],
    ["NF", m.numero_nf ?? "—"],
    ["Emissão / vencimento", `${formatData(m.data_emissao)} / ${formatData(m.data_vencimento)}`],
  ];
  await exportarPDF(`medicao_${m.placa}_${m.competencia.slice(0, 7)}`, "Boletim de medição", colunas, [linha], {
    resumo,
    totais: ["Total da medição", "", "", "", "", "", "", m.valor_final],
    rodape: [
      `Cálculo: (valor mensal ÷ ${baseDias}) × ${m.dias} dias = ${brl(m.valor_base)}; + acréscimos ${brl(m.acrescimos)} − descontos ${brl(m.descontos)} = ${brl(m.valor_final)}.`,
      ...(m.observacoes ? [`Observações: ${m.observacoes}`] : []),
      "", "", "",
      "______________________________________          ______________________________________",
      "Oliveira Locações                                                         De acordo — cliente",
    ],
  });
}

function DialogoDetalhe({ medicao: m, baseDias, onOpenChange }: { medicao: LinhaMedicao | null; baseDias: number; onOpenChange: (v: boolean) => void }) {
  const [gerando, setGerando] = React.useState(false);
  const item = (rotulo: string, valor: React.ReactNode) => (
    <div className="space-y-0.5"><p className="text-xs text-muted-foreground">{rotulo}</p><div className="text-sm font-medium">{valor ?? "—"}</div></div>
  );
  return (
    <Dialog open={!!m} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        {m && <>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Medição <span className="font-mono">{formatPlaca(m.placa)}</span> <StatusBadge status={m.status_exibicao} />
              {m.final && <Badge variant="neutro">Final</Badge>}
            </DialogTitle>
            <DialogDescription>{m.empresa_apelido} · {m.cliente_fantasia}{m.obra_nome ? ` · ${m.obra_nome}` : ""} · {formatCompetencia(m.competencia.slice(0, 7), true)}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {item("Cliente", m.cliente_nome ?? m.cliente_fantasia)}
            {item("Obra", m.obra_nome)}
            {item("Contrato", <Link className="underline" href={`/contratos/${m.contrato_id}`}>{m.contrato_numero ?? "Abrir contrato"}</Link>)}
            {item("Período", `${formatPeriodo(m.periodo_inicio, m.periodo_fim)} (${m.dias} dias)`)}
            {item("Veículo", `${formatPlaca(m.placa)}${m.veiculo_tipo ? ` · ${m.veiculo_tipo}` : ""}${m.proprietario === "locador" ? " · sublocado" : ""}`)}
            {item("Prazo de pagamento", `${m.prazo_pagamento_dias} dias`)}
          </div>
          <div className="rounded-md border">
            <Table>
              <TableBody>
                <TableRow><TableCell>Valor mensal</TableCell><TableCell className="text-right"><Moeda valor={m.valor_mensal} /></TableCell></TableRow>
                <TableRow><TableCell>Valor base (mensal ÷ {baseDias} × {m.dias} dias)</TableCell><TableCell className="text-right"><Moeda valor={m.valor_base} /></TableCell></TableRow>
                <TableRow><TableCell>Acréscimos</TableCell><TableCell className="text-right"><Moeda valor={m.acrescimos} /></TableCell></TableRow>
                <TableRow><TableCell>Descontos</TableCell><TableCell className="text-right">− <Moeda valor={m.descontos} /></TableCell></TableRow>
              </TableBody>
              <TableFooter><TableRow><TableCell>Total da medição</TableCell><TableCell className="text-right"><Moeda valor={m.valor_final} /></TableCell></TableRow></TableFooter>
            </Table>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {item("NF", m.numero_nf)}
            {item("Emissão", formatData(m.data_emissao))}
            {item("Vencimento", formatData(m.data_vencimento))}
            {item("Recebido", <Moeda valor={m.valor_recebido} />)}
            {item("Saldo a receber", <Moeda valor={m.saldo} />)}
            {m.repasse_liquido != null && item("Repasse líquido / margem", <><Moeda valor={m.repasse_liquido} /> / <Moeda valor={m.margem} /></>)}
          </div>
          {m.observacoes && <div className="rounded-md bg-muted p-3 text-sm"><p className="text-xs text-muted-foreground">Observações</p>{m.observacoes}</div>}
          <p className="text-xs text-muted-foreground">Valores salvos. Edições não salvas na grade não aparecem aqui nem no PDF.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            <Button disabled={gerando} onClick={async () => { setGerando(true); try { await pdfMedicao(m, baseDias); } finally { setGerando(false); } }}>
              {gerando ? <Loader2 className="animate-spin" /> : <FileDown />} Gerar PDF
            </Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  );
}

function DialogoGerar({ aberto, onOpenChange, competenciaInicial, onGerado }: {
  aberto: boolean; onOpenChange: (v: boolean) => void; competenciaInicial: string; onGerado: (comp: string) => void;
}) {
  const [comp, setComp] = React.useState(competenciaInicial);
  const [previa, setPrevia] = React.useState<LinhaPrevia[] | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  React.useEffect(() => { if (aberto) { setComp(competenciaInicial); setPrevia(null); } }, [aberto, competenciaInicial]);

  const carregar = async () => {
    setCarregando(true);
    const r = await previaMedicoes(comp);
    setCarregando(false);
    if (r.ok) setPrevia(r.dados);
    else toast.error(r.erro);
  };
  const confirmar = async () => {
    setCarregando(true);
    const r = await gerarMedicoes(comp);
    setCarregando(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`${r.dados.geradas} medição(ões) gerada(s) em ${formatCompetencia(comp)}`);
    onOpenChange(false);
    onGerado(comp);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho="xl">
        <DialogHeader>
          <DialogTitle>Gerar medições do período</DialogTitle>
          <DialogDescription>
            Cria medições “a faturar” para todos os contratos vigentes que ainda não têm medição no período. Corte dia 01: 01 ao fim do mês; corte dia 21: 21 do mês anterior a 20 do mês escolhido.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="gerar-comp">Competência</Label>
            <Input id="gerar-comp" type="month" className="w-44" value={comp} onChange={(e) => { setComp(e.target.value); setPrevia(null); }} />
          </div>
          <Button variant="outline" onClick={carregar} disabled={carregando || !comp}>{carregando && !previa ? <Loader2 className="animate-spin" /> : <CalendarPlus />} Ver prévia</Button>
        </div>
        {previa && (
          previa.length === 0 ? (
            <p className="rounded-md bg-muted p-4 text-sm">Nenhuma medição a gerar em {formatCompetencia(comp)} — todos os contratos vigentes já têm medição neste período.</p>
          ) : (
            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Placa</TableHead><TableHead>Empresa</TableHead><TableHead>Cliente / obra</TableHead><TableHead>Período</TableHead>
                  <TableHead className="text-right">Dias</TableHead><TableHead className="text-right">Mensal</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Repasse bruto</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {previa.map((l) => (
                    <TableRow key={l.contrato_id}>
                      <TableCell className="font-mono font-semibold">{formatPlaca(l.placa)}</TableCell>
                      <TableCell>{l.empresa}</TableCell>
                      <TableCell>{l.cliente}{l.obra && <span className="text-xs text-muted-foreground"> · {l.obra}</span>}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatPeriodo(l.periodo_inicio, l.periodo_fim)}</TableCell>
                      <TableCell className={cn("num text-right", l.dias !== 30 && "font-semibold text-status-alerta")}>{l.dias}</TableCell>
                      <TableCell className="text-right"><Moeda valor={l.valor_mensal} /></TableCell>
                      <TableCell className="text-right font-semibold"><Moeda valor={l.valor_final} /></TableCell>
                      <TableCell className="text-right"><Moeda valor={l.valor_repasse_bruto} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter><TableRow>
                  <TableCell colSpan={6}>{previa.length} medições</TableCell>
                  <TableCell className="text-right"><Moeda valor={somar(previa.map((l) => l.valor_final))} /></TableCell>
                  <TableCell className="text-right"><Moeda valor={somar(previa.map((l) => l.valor_repasse_bruto ?? 0))} /></TableCell>
                </TableRow></TableFooter>
              </Table>
            </div>
          )
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!previa?.length || carregando} onClick={confirmar}>{carregando && previa ? <Loader2 className="animate-spin" /> : <Wand2 />} Gerar {previa?.length ?? ""} medições</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoFaturar({ aberto, onOpenChange, selecionados, alteracoesPendentes, onFeito }: {
  aberto: boolean; onOpenChange: (v: boolean) => void; selecionados: LinhaMedicao[]; alteracoesPendentes: boolean; onFeito: () => void;
}) {
  const [emissao, setEmissao] = React.useState(hojeSP());
  const aFaturar = selecionados.filter((s) => s.status === "a_faturar");
  const semNF = aFaturar.filter((s) => !s.numero_nf).length;
  return (
    <Confirmar aberto={aberto} onOpenChange={onOpenChange} titulo={`Faturar ${aFaturar.length} medição(ões)`} rotulo="Marcar como faturado"
      descricao={<div className="space-y-2">
        <p>As medições sem data de emissão receberão a data abaixo; o vencimento é calculado pelo prazo de cada contrato.</p>
        {alteracoesPendentes && <p className="font-semibold text-status-alerta">Há alterações não salvas na grade — salve antes de faturar.</p>}
        {semNF > 0 && <p className="text-status-alerta">{semNF} sem número de NF.</p>}
        {aFaturar.length < selecionados.length && <p>{selecionados.length - aFaturar.length} já faturada(s) serão ignoradas.</p>}
      </div>}
      onConfirmar={async () => {
        const r = await faturarMedicoes(aFaturar.map((s) => s.id), emissao);
        if (!r.ok) { toast.error(r.erro); throw new Error(r.erro); }
        toast.success(`${r.dados.faturadas} medição(ões) faturada(s)`);
        onFeito();
      }}>
      <div className="space-y-1.5">
        <Label htmlFor="emissao-padrao">Data de emissão padrão</Label>
        <Input id="emissao-padrao" type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
      </div>
    </Confirmar>
  );
}
