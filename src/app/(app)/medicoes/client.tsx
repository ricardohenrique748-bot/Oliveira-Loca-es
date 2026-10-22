"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarPlus, CheckCheck, Eye, FileDown, FileSpreadsheet, FileText, History, Loader2, Plus, Save, Undo2, Wand2 } from "lucide-react";
import { Badge, Card, Checkbox, Label, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import type { Opcao } from "@/components/ui/select";
import { Cabecalho, Confirmar, Moeda, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { InputMoeda, InputNumero } from "@/components/app/campos";
import { BarraFiltros, FiltroSelectUrl, useUrlParams } from "@/components/app/url";
import { baseCobranca, calcularValorMedicao, calcularVencimento, hojeSP, somar, type TipoCobranca } from "@/lib/calculos";
import { formatCompetencia, formatData, formatPeriodo, formatPlaca } from "@/lib/format";
import { exportarPDF, exportarXLSX, type ColunaExport } from "@/lib/exportar";
import { cn } from "@/lib/utils";
import {
  cancelarMedicoes, dadosLembrete, faturarMedicoes, gerarMedicoes, historicoMedicao, previaMedicoes, salvarMedicoes, voltarParaAFaturar,
  type EventoHistorico, type LinhaLembrete, type LinhaPrevia,
} from "./actions";
import { DialogoLancarMedicao } from "./lancar";

export type LinhaMedicao = {
  id: string; contrato_id: string; empresa_id: string; empresa_apelido: string; periodo_inicio: string; periodo_fim: string; competencia: string;
  dias: number; valor_mensal: number; valor_base: number; acrescimos: number; descontos: number; valor_final: number; numero_nf: string | null;
  data_emissao: string | null; data_vencimento: string | null; status: string; status_exibicao: string; observacoes: string | null; final: boolean;
  cliente_id: string; cliente_fantasia: string; obra_nome: string | null; placa: string; proprietario: string; prazo_pagamento_dias: number;
  dia_corte_inicio: number; valor_recebido: number; repasse_liquido: number | null; margem: number;
  contrato_numero: string | number | null; cliente_nome: string | null; veiculo_tipo: string | null; saldo: number;
  tipo_cobranca: TipoCobranca | null;
};

type Editavel = Pick<LinhaMedicao, "dias" | "valor_mensal" | "acrescimos" | "descontos" | "numero_nf" | "data_emissao" | "data_vencimento" | "observacoes">;
const COLS = ["dias", "valor_mensal", "acrescimos", "descontos", "numero_nf", "data_emissao", "data_vencimento", "observacoes"] as const;

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

export function MedicoesCliente({ linhas, total, pagina, tamanho, competencia, competenciaPadrao, clientes, contratos, placas, baseDias, podeEditar }: {
  linhas: LinhaMedicao[]; total: number; pagina: number; tamanho: number; competencia: string; competenciaPadrao: string;
  clientes: Opcao[]; contratos: Opcao[]; placas: Opcao[]; baseDias: number; podeEditar: boolean;
}) {
  const router = useRouter();
  const url = useUrlParams();
  const [edicoes, setEdicoes] = React.useState<Record<string, Partial<Editavel>>>({});
  const [selecao, setSelecao] = React.useState<Set<string>>(new Set());
  const [salvando, setSalvando] = React.useState(false);
  const [gerarAberto, setGerarAberto] = React.useState(false);
  // faturas no diálogo de faturar: as selecionadas ou a da linha clicada
  const [faturando, setFaturando] = React.useState<LinhaMedicao[] | null>(null);
  const [cancelarAberto, setCancelarAberto] = React.useState(false);
  const [detalhe, setDetalhe] = React.useState<LinhaMedicao | null>(null);
  const [lancarAberto, setLancarAberto] = React.useState(false);
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
    valorMensal: valor(m, "valor_mensal"), dias: valor(m, "dias"), acrescimos: valor(m, "acrescimos"), descontos: valor(m, "descontos"), baseDias: baseCobranca(m.tipo_cobranca, baseDias),
  });
  const alterados = Object.keys(edicoes).filter((id) => {
    const m = linhas.find((l) => l.id === id);
    return m && COLS.some((k) => k in edicoes[id] && edicoes[id][k] !== m[k]);
  });

  const salvar = React.useCallback(async (): Promise<boolean> => {
    if (!alterados.length) return true;
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
    return r.ok;
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
    const titulo = `Lembrete de faturamento — ${competencia === "todas" ? "pendentes" : competencia === "historico" ? "histórico" : formatCompetencia(competencia, true)}`;
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
      <Cabecalho titulo="Faturamento"
        descricao={<>Faturas de cada contrato: digite o valor, a NF e a emissão e marque como faturado. Vencimento = emissão + prazo do contrato. <kbd className="rounded border px-1 text-xs">Ctrl+S</kbd> salva · <kbd className="rounded border px-1 text-xs">Enter</kbd> desce na coluna.</>}
        acoes={podeEditar && <>
          <Button variant="outline" onClick={() => setLancarAberto(true)}><Plus /> Lançar fatura</Button>
          <Button onClick={() => setGerarAberto(true)}><Wand2 /> Gerar faturas do período</Button>
        </>} />

      <BarraFiltros>
        <div className="flex flex-col gap-1">
          <Label htmlFor="comp" className="text-xs text-muted-foreground">Competência (mês de fim do período)</Label>
          <div className="flex gap-1">
            <Input id="comp" type="month" className="h-9 w-40" value={competencia === "todas" || competencia === "historico" ? "" : competencia}
              onChange={(e) => url.set({ comp: e.target.value || "todas" })} />
            <Button variant={competencia === "todas" ? "default" : "outline"} size="sm" onClick={() => url.set({ comp: competencia === "todas" ? competenciaPadrao : "todas", pagina: null })}>
              Todas pendentes
            </Button>
            <Button variant={competencia === "historico" ? "default" : "outline"} size="sm" onClick={() => url.set({ comp: competencia === "historico" ? competenciaPadrao : "historico", pagina: null })}>
              <History /> Histórico completo
            </Button>
          </div>
        </div>
        <FiltroSelectUrl param="status" rotulo="Status" opcoes={STATUS_OPCOES} />
        <FiltroSelectUrl param="cliente" rotulo="Cliente" opcoes={clientes} />
        <FiltroSelectUrl param="placa" rotulo="Placa" opcoes={placas} vazio="Todas" />
      </BarraFiltros>

      <div className="flex flex-wrap items-center gap-2">
        {selecionados.length > 0 && podeEditar && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary bg-accent px-3 py-1.5 text-sm">
            <span className="font-medium">{selecionados.length} selecionada(s)</span>
            <Button size="xs" onClick={() => setFaturando(selecionados)}><CheckCheck /> Marcar como faturado</Button>
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

      {/* grade desktop: largura fixa por coluna, cabe na tela sem rolagem horizontal */}
      <Card className={cn("hidden overflow-hidden md:block", url.pendente && "opacity-60")}>
        <Table ref={tabela} onKeyDown={navegar} className="table-fixed text-xs [&_td]:px-1.5 [&_td]:py-1.5 [&_th]:h-10 [&_th]:px-1.5 [&_th]:text-xs">
          <colgroup>
            <col className="w-[3%]" /><col className="w-[22%]" /><col className="w-[10%]" /><col className="w-[12%]" />
            <col className="w-[8%]" /><col className="w-[10.5%]" /><col className="w-[10.5%]" /><col className="w-[8.5%]" /><col className="w-[12%]" /><col className="w-[3.5%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead><Checkbox aria-label="Selecionar todas" checked={todos ? true : selecao.size ? "indeterminate" : false}
                onCheckedChange={(v) => setSelecao(v ? new Set(linhas.map((l) => l.id)) : new Set())} /></TableHead>
              <TableHead>Contrato / cliente</TableHead>
              <TableHead>Período</TableHead>
              <TableHead className="text-right" title="Valor da fatura (mensal abaixo)">Valor</TableHead>
              <TableHead>NF</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Obs.</TableHead>
              <TableHead><span className="sr-only">Abrir</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow><TableCell colSpan={10} className="h-24 text-center text-sm text-muted-foreground">
                Nenhuma fatura {competencia === "todas" ? "pendente" : competencia === "historico" ? "encontrada" : `em ${formatCompetencia(competencia)}`}. {podeEditar && "Use “Gerar faturas do período”."}
              </TableCell></TableRow>
            )}
            {linhas.map((m, i) => {
              const ed = editavel(m);
              const { valorFinal } = calc(m);
              const mudou = alterados.includes(m.id);
              const campo = "h-8 w-full min-w-0 px-1.5 text-xs";
              const data = cn(campo, "[&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:w-3");
              return (
                <TableRow key={m.id} data-state={selecao.has(m.id) ? "selected" : undefined} className={cn(mudou && "bg-accent/50", m.status_exibicao === "vencido" && "border-l-2 border-l-status-critico")}>
                  <TableCell><Checkbox aria-label={`Selecionar ${m.placa}`} checked={selecao.has(m.id)} onCheckedChange={() => alternar(m.id)} /></TableCell>
                  <TableCell className="cursor-pointer" onClick={() => setDetalhe(m)} title={`${m.empresa_apelido} · ${m.cliente_fantasia}${m.obra_nome ? ` · ${m.obra_nome}` : ""}`}>
                    <div className="flex items-center gap-1">
                      {m.contrato_numero != null && <span className="font-mono text-sm font-semibold hover:underline">{m.contrato_numero}</span>}
                      <span className={cn("font-mono", m.contrato_numero != null ? "text-muted-foreground" : "text-sm font-semibold hover:underline")}>{formatPlaca(m.placa)}</span>
                      {m.proprietario === "locador" && <Badge variant="info" className="px-1.5 py-0 text-[10px]">Sub</Badge>}
                      {m.final && <Badge variant="neutro" className="px-1.5 py-0 text-[10px]">Final</Badge>}
                    </div>
                    <p className="truncate text-muted-foreground">{m.empresa_apelido} · {m.cliente_fantasia}{m.obra_nome ? ` · ${m.obra_nome}` : ""}</p>
                  </TableCell>
                  <TableCell className="leading-tight">{formatData(m.periodo_inicio)}<br /><span className="text-muted-foreground">a {formatData(m.periodo_fim)}</span>
                    {(m.dias !== baseCobranca(m.tipo_cobranca, baseDias) || m.acrescimos > 0 || m.descontos > 0) && m.tipo_cobranca !== "diaria" && (
                      <p className="text-[11px] text-status-alerta" title="Dias, acréscimos e descontos: abra a fatura para ajustar">{m.dias} dias{m.acrescimos > 0 ? " · +acr." : ""}{m.descontos > 0 ? " · −desc." : ""}</p>
                    )}
                    {m.tipo_cobranca === "diaria" && <p className="text-[11px] text-muted-foreground">{m.dias} diárias</p>}
                  </TableCell>
                  <TableCell className="text-right leading-tight">
                    <span className="text-sm font-semibold"><Moeda valor={valorFinal} /></span><br />
                    {ed
                      ? <InputMoeda data-linha={i} data-col="valor_mensal" aria-label={m.tipo_cobranca === "diaria" ? "Valor da diária" : "Valor mensal"} title={m.tipo_cobranca === "diaria" ? "Valor da diária" : "Valor mensal"}
                          className="mt-0.5 h-6 w-28 pl-7 text-right text-[11px]" permitirVazio={false} value={valor(m, "valor_mensal")} onChange={(v) => editar(m, "valor_mensal", v ?? 0)} />
                      : <span className="text-[11px] text-muted-foreground" title="Valor mensal">mensal <Moeda valor={m.valor_mensal} /></span>}
                  </TableCell>
                  <TableCell><Input data-linha={i} data-col="numero_nf" aria-label="Número da NF" className={campo} disabled={!ed} value={valor(m, "numero_nf") ?? ""} onChange={(e) => editar(m, "numero_nf", e.target.value || null)} /></TableCell>
                  <TableCell><Input data-linha={i} data-col="data_emissao" aria-label="Data de emissão" type="date" className={data} disabled={!ed} value={valor(m, "data_emissao") ?? ""} onChange={(e) => editar(m, "data_emissao", e.target.value || null)} /></TableCell>
                  <TableCell><Input data-linha={i} data-col="data_vencimento" aria-label="Vencimento" type="date" className={data} disabled={!ed} value={valor(m, "data_vencimento") ?? ""} onChange={(e) => editar(m, "data_vencimento", e.target.value || null)} /></TableCell>
                  <TableCell>
                    <StatusBadge status={m.status_exibicao} className="whitespace-nowrap px-1.5 text-[11px]" />
                    {podeEditar && m.status === "a_faturar" && (
                      <Button size="xs" className="mt-1 h-6 px-2 text-[11px]" onClick={() => setFaturando([m])} aria-label={`Faturar ${m.contrato_numero ?? m.placa}`}><CheckCheck /> Faturar</Button>
                    )}
                  </TableCell>
                  <TableCell><Input data-linha={i} data-col="observacoes" aria-label="Observações" className={campo} title={valor(m, "observacoes") ?? ""} disabled={!podeEditar || m.status === "cancelado"} value={valor(m, "observacoes") ?? ""} onChange={(e) => editar(m, "observacoes", e.target.value || null)} /></TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Abrir fatura ${m.placa}`} onClick={() => setDetalhe(m)}><Eye /></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {linhas.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>{linhas.length} faturas{total > linhas.length ? ` (de ${total})` : ""}</TableCell>
                <TableCell className="text-right text-sm"><Moeda valor={totalValor} /></TableCell>
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
                  <p className="font-mono font-semibold">{m.contrato_numero != null ? `${m.contrato_numero} · ` : ""}{formatPlaca(m.placa)} <span className="font-sans text-xs font-normal text-muted-foreground">{m.empresa_apelido}</span></p>
                  <p className="text-xs text-muted-foreground">{m.cliente_fantasia} · {formatPeriodo(m.periodo_inicio, m.periodo_fim)}</p>
                </div>
                <div className="flex items-center gap-2"><StatusBadge status={m.status_exibicao} /><Checkbox aria-label="Selecionar" checked={selecao.has(m.id)} onCheckedChange={() => alternar(m.id)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="col-span-2 space-y-1"><span className="text-xs text-muted-foreground">Valor da fatura</span><p className="font-semibold"><Moeda valor={calc(m).valorFinal} /></p></div>
                <label className="col-span-2 space-y-1"><span className="text-xs text-muted-foreground">{m.tipo_cobranca === "diaria" ? "Valor da diária" : "Valor mensal"}</span>
                  <InputMoeda className="h-9" permitirVazio={false} disabled={!ed} value={valor(m, "valor_mensal")} onChange={(v) => editar(m, "valor_mensal", v ?? 0)} /></label>
                <label className="space-y-1"><span className="text-xs text-muted-foreground">NF</span><Input className="h-9" disabled={!ed} value={valor(m, "numero_nf") ?? ""} onChange={(e) => editar(m, "numero_nf", e.target.value || null)} /></label>
                <label className="space-y-1"><span className="text-xs text-muted-foreground">Emissão</span><Input className="h-9" type="date" disabled={!ed} value={valor(m, "data_emissao") ?? ""} onChange={(e) => editar(m, "data_emissao", e.target.value || null)} /></label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Vencimento: {formatData(valor(m, "data_vencimento"))}</p>
                <div className="flex gap-2">
                  {podeEditar && m.status === "a_faturar" && <Button size="xs" onClick={() => setFaturando([m])}><CheckCheck /> Faturar</Button>}
                  <Button size="xs" variant="outline" onClick={() => setDetalhe(m)}><Eye /> Abrir</Button>
                </div>
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

      <DialogoLancarMedicao aberto={lancarAberto} onOpenChange={setLancarAberto} contratos={contratos} baseDias={baseDias}
        onLancado={(comp) => { url.set({ comp, status: null }); router.refresh(); }} />
      <DialogoDetalhe medicao={detalhe} baseDias={baseDias} podeEditar={podeEditar} onOpenChange={(v) => !v && setDetalhe(null)}
        onSalvo={() => { setDetalhe(null); router.refresh(); }} />
      <DialogoGerar aberto={gerarAberto} onOpenChange={setGerarAberto} competenciaInicial={competencia === "todas" || competencia === "historico" ? competenciaPadrao : competencia}
        onGerado={(comp) => { url.set({ comp, status: null }); router.refresh(); }} />
      <DialogoFaturar aberto={!!faturando} onOpenChange={(v) => !v && setFaturando(null)} selecionados={faturando ?? []}
        alteracoesPendentes={alterados.length > 0} salvarAntes={salvar} valorDe={(m) => calc(m).valorFinal} onFeito={() => router.refresh()} />
      <Confirmar aberto={cancelarAberto} onOpenChange={setCancelarAberto} titulo={`Cancelar ${selecionados.length} fatura(s)?`} destrutivo rotulo="Cancelar faturas"
        descricao="Faturas canceladas saem do faturamento e o repasse vinculado (se houver e não pago) também é cancelado."
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
      `Cálculo: ${m.tipo_cobranca === "diaria" ? `diária ${brl(m.valor_mensal)}` : `(valor mensal ÷ ${baseDias})`} × ${m.dias} dias = ${brl(m.valor_base)}; + acréscimos ${brl(m.acrescimos)} − descontos ${brl(m.descontos)} = ${brl(m.valor_final)}.`,
      ...(m.observacoes ? [`Observações: ${m.observacoes}`] : []),
      "", "", "",
      "______________________________________          ______________________________________",
      "Oliveira Locações                                                         De acordo — cliente",
    ],
  });
}

const ROTULOS_HISTORICO: Record<string, string> = {
  status: "Status", periodo_inicio: "Início", periodo_fim: "Fim", dias: "Dias", valor_mensal: "Mensal", acrescimos: "Acréscimos",
  descontos: "Descontos", valor_final: "Valor", numero_nf: "NF", data_emissao: "Emissão", data_vencimento: "Vencimento",
  observacoes: "Observações", final: "Medição final",
};
const MOEDA_HISTORICO = new Set(["valor_mensal", "acrescimos", "descontos", "valor_final"]);
const DATA_HISTORICO = new Set(["periodo_inicio", "periodo_fim", "data_emissao", "data_vencimento"]);
const STATUS_ROTULO = Object.fromEntries(STATUS_OPCOES.map((o) => [o.value, o.label]));

function valorHistorico(campo: string, v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (MOEDA_HISTORICO.has(campo)) return brl(Number(v));
  if (DATA_HISTORICO.has(campo)) return formatData(String(v));
  if (campo === "status") return STATUS_ROTULO[String(v)] ?? String(v);
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

/** Linha do tempo da medição (quem mudou o quê e quando). */
function HistoricoMedicao({ id }: { id: string }) {
  const [eventos, setEventos] = React.useState<EventoHistorico[] | null>(null);
  React.useEffect(() => {
    let vivo = true;
    setEventos(null);
    historicoMedicao(id).then((r) => { if (vivo) setEventos(r.ok ? r.dados : []); });
    return () => { vivo = false; };
  }, [id]);
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4" /> Histórico de alterações</p>
      {eventos === null ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Carregando…</p>
        : eventos.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum registro de alteração disponível (o histórico é visível apenas para administradores).</p>
        : (
          <ol className="max-h-60 space-y-2 overflow-y-auto border-l pl-4">
            {[...eventos].reverse().map((e, i) => (
              <li key={i} className="text-xs">
                <p className="font-medium">
                  {new Date(e.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {e.acao === "INSERT" ? "Criada" : e.acao === "DELETE" ? "Excluída" : "Alterada"}
                  {e.usuario && <span className="font-normal text-muted-foreground"> por {e.usuario}</span>}
                </p>
                {e.acao === "UPDATE" && (
                  <ul className="text-muted-foreground">
                    {e.mudancas.map(([k, a, d]) => <li key={k}>{ROTULOS_HISTORICO[k] ?? k}: {valorHistorico(k, a)} → <span className="text-foreground">{valorHistorico(k, d)}</span></li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

function DialogoDetalhe({ medicao: m, baseDias, podeEditar, onOpenChange, onSalvo }: {
  medicao: LinhaMedicao | null; baseDias: number; podeEditar: boolean; onOpenChange: (v: boolean) => void; onSalvo: () => void;
}) {
  const [gerando, setGerando] = React.useState(false);
  // dias, acréscimos e descontos saíram da grade: ajustam-se aqui
  const [ajuste, setAjuste] = React.useState({ dias: 0, acrescimos: 0, descontos: 0 });
  const [salvando, setSalvando] = React.useState(false);
  React.useEffect(() => { if (m) setAjuste({ dias: m.dias, acrescimos: m.acrescimos, descontos: m.descontos }); }, [m]);
  const ed = !!m && podeEditar && (m.status === "a_faturar" || m.status === "faturado");
  const mudou = !!m && (ajuste.dias !== m.dias || ajuste.acrescimos !== m.acrescimos || ajuste.descontos !== m.descontos);
  const total = m ? calcularValorMedicao({ valorMensal: m.valor_mensal, ...ajuste, baseDias: baseCobranca(m.tipo_cobranca, baseDias) }).valorFinal : 0;
  const salvarAjuste = async () => {
    if (!m) return;
    setSalvando(true);
    const r = await rodarAcao(salvarMedicoes([{ id: m.id, ...(ajuste.dias !== m.dias ? { dias: ajuste.dias } : {}), acrescimos: ajuste.acrescimos, descontos: ajuste.descontos }]));
    setSalvando(false);
    if (r.ok) onSalvo();
  };
  const item = (rotulo: string, valor: React.ReactNode) => (
    <div className="space-y-0.5"><p className="text-xs text-muted-foreground">{rotulo}</p><div className="text-sm font-medium">{valor ?? "—"}</div></div>
  );
  return (
    <Dialog open={!!m} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        {m && <>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Fatura <span className="font-mono">{m.contrato_numero ?? formatPlaca(m.placa)}</span> <StatusBadge status={m.status_exibicao} />
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
                <TableRow><TableCell>Dias ({m.tipo_cobranca === "diaria" ? "diária" : `mensal ÷ ${baseDias}`} × dias)</TableCell><TableCell className="text-right">
                  <InputNumero aria-label="Dias" className="ml-auto h-8 w-20 text-right" value={ajuste.dias} disabled={!ed || m.status !== "a_faturar"}
                    onChange={(v) => setAjuste((a) => ({ ...a, dias: Math.min(31, v ?? 0) }))} />
                </TableCell></TableRow>
                <TableRow><TableCell>Acréscimos</TableCell><TableCell className="text-right">
                  <div className="ml-auto w-36"><InputMoeda aria-label="Acréscimos" className="h-8" permitirVazio={false} disabled={!ed} value={ajuste.acrescimos} onChange={(v) => setAjuste((a) => ({ ...a, acrescimos: v ?? 0 }))} /></div>
                </TableCell></TableRow>
                <TableRow><TableCell>Descontos</TableCell><TableCell className="text-right">
                  <div className="ml-auto w-36"><InputMoeda aria-label="Descontos" className="h-8" permitirVazio={false} disabled={!ed} value={ajuste.descontos} onChange={(v) => setAjuste((a) => ({ ...a, descontos: v ?? 0 }))} /></div>
                </TableCell></TableRow>
              </TableBody>
              <TableFooter><TableRow><TableCell>Total da fatura</TableCell><TableCell className="text-right"><Moeda valor={total} /></TableCell></TableRow></TableFooter>
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
          <HistoricoMedicao id={m.id} />
          <p className="text-xs text-muted-foreground">Valores salvos. Edições não salvas na grade não aparecem aqui nem no PDF.{m.status === "faturado" && " Dias só mudam enquanto a fatura está “a faturar”."}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            {ed && <Button variant="outline" disabled={!mudou || salvando} onClick={salvarAjuste}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar ajustes</Button>}
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
    toast.success(`${r.dados.geradas} fatura(s) gerada(s) em ${formatCompetencia(comp)}`);
    onOpenChange(false);
    onGerado(comp);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho="xl">
        <DialogHeader>
          <DialogTitle>Gerar faturas do período</DialogTitle>
          <DialogDescription>
            Cria faturas “a faturar” para todos os contratos vigentes que ainda não têm fatura no período. Corte dia 01: 01 ao fim do mês; corte dia 21: 21 do mês anterior a 20 do mês escolhido.
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
            <p className="rounded-md bg-muted p-4 text-sm">Nenhuma fatura a gerar em {formatCompetencia(comp)} — todos os contratos vigentes já têm fatura neste período.</p>
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
                  <TableCell colSpan={6}>{previa.length} faturas</TableCell>
                  <TableCell className="text-right"><Moeda valor={somar(previa.map((l) => l.valor_final))} /></TableCell>
                  <TableCell className="text-right"><Moeda valor={somar(previa.map((l) => l.valor_repasse_bruto ?? 0))} /></TableCell>
                </TableRow></TableFooter>
              </Table>
            </div>
          )
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!previa?.length || carregando} onClick={confirmar}>{carregando && previa ? <Loader2 className="animate-spin" /> : <Wand2 />} Gerar {previa?.length ?? ""} faturas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoFaturar({ aberto, onOpenChange, selecionados, alteracoesPendentes, salvarAntes, valorDe, onFeito }: {
  aberto: boolean; onOpenChange: (v: boolean) => void; selecionados: LinhaMedicao[]; alteracoesPendentes: boolean;
  salvarAntes: () => Promise<boolean>; valorDe: (m: LinhaMedicao) => number; onFeito: () => void;
}) {
  const [emissao, setEmissao] = React.useState(hojeSP());
  const aFaturar = selecionados.filter((s) => s.status === "a_faturar");
  const semNF = aFaturar.filter((s) => !s.numero_nf).length;
  const semValor = aFaturar.filter((s) => valorDe(s) <= 0).length;
  return (
    <Confirmar aberto={aberto} onOpenChange={onOpenChange} titulo={`Faturar ${aFaturar.length} fatura(s)`} rotulo="Marcar como faturado"
      descricao={<div className="space-y-2">
        <p>As faturas sem data de emissão receberão a data abaixo; o vencimento é calculado pelo prazo de cada contrato.</p>
        {alteracoesPendentes && <p>O que foi digitado na grade será salvo antes de faturar.</p>}
        {semValor > 0 && <p className="font-semibold text-status-alerta">{semValor === 1 && aFaturar.length === 1 ? "A fatura está" : `${semValor} fatura(s) estão`} com valor R$ 0,00.</p>}
        {semNF > 0 && <p className="text-status-alerta">{semNF} sem número de NF.</p>}
        {aFaturar.length < selecionados.length && <p>{selecionados.length - aFaturar.length} já faturada(s) serão ignoradas.</p>}
      </div>}
      onConfirmar={async () => {
        if (alteracoesPendentes && !(await salvarAntes())) throw new Error("Não foi possível salvar as alterações");
        const r = await faturarMedicoes(aFaturar.map((s) => s.id), emissao);
        if (!r.ok) { toast.error(r.erro); throw new Error(r.erro); }
        toast.success(`${r.dados.faturadas} fatura(s) marcada(s) como faturada(s)`);
        onFeito();
      }}>
      <div className="space-y-1.5">
        <Label htmlFor="emissao-padrao">Data de emissão padrão</Label>
        <Input id="emissao-padrao" type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
      </div>
    </Confirmar>
  );
}
