"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { CalendarDays, Check, ChevronLeft, ChevronRight, List, MoreHorizontal, Pencil, Plus, Repeat, Trash2, Undo2, UserMinus } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { Cabecalho, Confirmar, Moeda, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { KpiCard } from "@/components/app/kpi";
import { DataTable } from "@/components/app/data-table";
import { Formulario, type Campo } from "@/components/app/formulario";
import { BarraFiltros, BuscaUrl, FiltroSelectUrl, useUrlParams } from "@/components/app/url";
import { InputMoeda } from "@/components/app/campos";
import { CampoAnexo, LinkAnexo } from "@/components/app/anexo";
import { addCompetencia, addDias, gerarParcelas, hojeSP, somar } from "@/lib/calculos";
import { formatBRL, formatCompetencia, formatData, formatPlaca } from "@/lib/format";
import { contaPagarEdicaoSchema, contaPagarNovaSchema, FORMAS, type ContaPagarEdicaoForm, type ContaPagarNovaForm } from "@/lib/schemas/financeiro";
import { opcoesDe } from "@/lib/schemas/cadastros";
import { cn } from "@/lib/utils";
import { baixarContas, criarContaPagar, editarContaPagar, encerrarRecorrencia, estornarContas, excluirContas } from "./actions";

export type LinhaConta = {
  id: string; empresa_id: string; empresa_apelido: string; fornecedor_id: string | null; fornecedor_nome: string | null; descricao: string;
  categoria_id: string | null; categoria_nome: string | null; tipo: "fixa" | "variavel" | "veiculo"; veiculo_id: string | null; placa: string | null;
  vencimento: string; valor: number; parcela_num: number | null; parcela_total: number | null; grupo_parcela_id: string | null; recorrente: boolean;
  forma_pagamento: keyof typeof FORMAS; conta_bancaria_id: string | null; banco: string | null; conta_apelido: string | null;
  descontar_locador: boolean; repasse_id: string | null; ordem_servico_id: string | null; pago_em: string | null; valor_pago: number | null;
  anexo_url: string | null; observacoes: string | null; status: "pago" | "vencido" | "a_vencer"; valor_abatido: number;
};

type Opcoes = {
  empresas: Opcao[];
  categorias: (Opcao & { tipo: string })[];
  fornecedores: Opcao[];
  veiculos: (Opcao & { locador: boolean; empresa_id: string })[];
  contas: (Opcao & { banco: string; empresa_id: string })[];
};

function camposConta<V extends ContaPagarNovaForm | ContaPagarEdicaoForm>(o: Opcoes, novo: boolean): Campo<V>[] {
  const ehLocador = (v: V) => !!o.veiculos.find((x) => x.value === v.veiculo_id)?.locador;
  const lista: Campo<ContaPagarNovaForm>[] = [
    { nome: "descricao", rotulo: "Descrição", obrigatorio: true, col: 4, placeholder: "Ex.: Silcar Pneus" },
    { nome: "empresa_id", rotulo: "Empresa", tipo: "select", opcoes: o.empresas, obrigatorio: true, col: 2 },
    { nome: "tipo", rotulo: "Lançamento", tipo: "select", opcoes: [{ value: "fixa", label: "Despesa fixa" }, { value: "variavel", label: "Despesa variável" }, { value: "veiculo", label: "Despesa de veículo" }], col: 2 },
    { nome: "veiculo_id", rotulo: "Placa", tipo: "select", vazio: "—", opcoes: (v) => o.veiculos.filter((x) => x.empresa_id === v.empresa_id), col: 2, visivel: (v) => v.tipo === "veiculo", obrigatorio: true },
    { nome: "categoria_id", rotulo: "Categoria", tipo: "select", vazio: "—", opcoes: (v) => o.categorias.filter((c) => c.tipo === v.tipo), col: 2 },
    { nome: "fornecedor_id", rotulo: "Fornecedor", tipo: "select", vazio: "—", opcoes: o.fornecedores, col: 3 },
    { nome: "vencimento", rotulo: novo ? "1º vencimento" : "Vencimento", tipo: "data", obrigatorio: true, col: 3 },
    { nome: "valor", rotulo: "Valor", tipo: "moeda", obrigatorio: true, col: 2 },
    { nome: "forma_pagamento", rotulo: "Forma", tipo: "select", opcoes: opcoesDe(FORMAS), col: 2 },
    { nome: "conta_bancaria_id", rotulo: "Banco / conta", tipo: "select", vazio: "—", opcoes: (v) => o.contas.filter((c) => c.empresa_id === v.empresa_id), col: 2 },
    { nome: "descontar_locador", rotulo: "Descontar do locador (abate no próximo repasse)", tipo: "checkbox", col: 6, visivel: (v) => v.tipo === "veiculo" && ehLocador(v as V) },
  ];
  if (novo) {
    lista.push(
      { nome: "repeticao", rotulo: "Repetição", tipo: "select", col: 2, opcoes: [{ value: "unica", label: "Única" }, { value: "parcelada", label: "Parcelada (n/N)" }, { value: "recorrente", label: "Recorrente (mensal)" }] },
      { nome: "parcelas", rotulo: "Nº de parcelas", tipo: "numero", col: 1, visivel: (v) => v.repeticao === "parcelada" },
      { nome: "parcela_inicial", rotulo: "Começa na", tipo: "numero", col: 1, visivel: (v) => v.repeticao === "parcelada", ajuda: "ex.: 15 de 53" },
      { nome: "modo_valor", rotulo: "O valor é", tipo: "select", col: 2, visivel: (v) => v.repeticao === "parcelada", opcoes: [{ value: "parcela", label: "de cada parcela" }, { value: "total", label: "total (dividir)" }] },
    );
  }
  lista.push(
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  );
  return lista as unknown as Campo<V>[];
}

export function PagarCliente({ linhas, mes, foco, opcoes, empresaPadrao, podeEditar, abrirNovo }: {
  linhas: LinhaConta[]; mes: string; foco: string | null; opcoes: Opcoes; empresaPadrao: string | null; podeEditar: boolean; abrirNovo: boolean;
}) {
  const router = useRouter();
  const url = useUrlParams();
  const visao = url.get("visao") ?? "lista";
  const [novo, setNovo] = React.useState(abrirNovo);
  const [editando, setEditando] = React.useState<LinhaConta | null>(null);
  const [baixa, setBaixa] = React.useState<LinhaConta[] | null>(null);
  const [excluir, setExcluir] = React.useState<LinhaConta | null>(null);
  const [diaSel, setDiaSel] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (foco) { const c = linhas.find((l) => l.id === foco); if (c) setEditando(c); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco]);

  const abertas = linhas.filter((l) => !l.pago_em);
  const hoje = hojeSP();
  const prox7 = abertas.filter((l) => l.vencimento >= hoje && l.vencimento <= addDias(hoje, 7));
  const porBanco = Object.entries(abertas.reduce<Record<string, number>>((acc, l) => {
    const k = l.conta_apelido ?? (l.banco ?? "Sem conta definida");
    acc[k] = (acc[k] ?? 0) + l.valor;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);

  const colunas = React.useMemo<ColumnDef<LinhaConta, unknown>[]>(() => [
    { accessorKey: "vencimento", header: "Vencimento", cell: ({ row: { original: c } }) => <span className={cn(c.status === "vencido" && "font-semibold text-status-critico")}>{formatData(c.vencimento)}</span> },
    { accessorKey: "descricao", header: "Descrição", meta: { tituloMobile: true }, cell: ({ row: { original: c } }) => (
      <div className="min-w-[12rem]">
        <p className="font-medium">{c.descricao}
          {c.recorrente && <Repeat className="ml-1 inline h-3 w-3 text-muted-foreground" aria-label="Recorrente" />}
          {c.ordem_servico_id && <Link href={`/manutencao/ordens/${c.ordem_servico_id}`} onClick={(e: React.MouseEvent) => e.stopPropagation()}><Badge variant="outline" className="ml-1">OS</Badge></Link>}
        </p>
        <p className="text-xs text-muted-foreground">{[c.fornecedor_nome, c.categoria_nome].filter(Boolean).join(" · ")}</p>
      </div>
    ) },
    { accessorKey: "empresa_apelido", header: "Empresa" },
    { id: "placa", header: "Placa", cell: ({ row: { original: c } }) => c.placa ? (
      <span><span className="font-mono">{formatPlaca(c.placa)}</span>{c.descontar_locador && <Badge variant="info" className="ml-1" title="Descontar do locador"><UserMinus className="h-3 w-3" /> Locador</Badge>}</span>
    ) : <span className="text-muted-foreground">Fixa</span> },
    { id: "pagamento", header: "Forma / banco", cell: ({ row: { original: c } }) => <span className="text-sm">{FORMAS[c.forma_pagamento]}<span className="block text-xs text-muted-foreground">{c.conta_apelido ?? c.banco ?? "—"}</span></span> },
    { accessorKey: "valor", header: "Valor", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} className="font-semibold" />, footer: () => <Moeda valor={somar(linhas.map((l) => l.valor))} /> },
    { accessorKey: "status", header: "Status", cell: ({ row: { original: c } }) => (
      <span><StatusBadge status={c.status} />{c.pago_em && <span className="block text-xs text-muted-foreground">{formatData(c.pago_em)}</span>}</span>
    ) },
    { accessorKey: "anexo_url", header: "Anexo", meta: { ocultarMobile: true }, cell: ({ getValue }) => <LinkAnexo referencia={getValue() as string | null} rotulo="Abrir" /> },
    { id: "acoes", header: () => <span className="sr-only">Ações</span>, meta: { classe: "text-right" }, cell: ({ row: { original: c } }) => podeEditar ? (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {!c.pago_em && <Button size="xs" onClick={() => setBaixa([c])}><Check /> Pagar</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Ações"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditando(c)}><Pencil /> Editar</DropdownMenuItem>
            {c.pago_em && <DropdownMenuItem onSelect={async () => { const r = await rodarAcao(estornarContas({ ids: [c.id] })); if (r.ok) router.refresh(); }}><Undo2 /> Estornar pagamento</DropdownMenuItem>}
            {c.recorrente && <DropdownMenuItem onSelect={async () => { const r = await rodarAcao(encerrarRecorrencia(c.id)); if (r.ok) router.refresh(); }}><Repeat /> Encerrar recorrência após esta</DropdownMenuItem>}
            {!c.ordem_servico_id && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setExcluir(c)}><Trash2 /> Excluir</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ) : null },
  ], [linhas, podeEditar, router]);

  const filtradasDia = diaSel ? linhas.filter((l) => l.vencimento === diaSel) : linhas;

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Contas a pagar" descricao="Parcelamentos (n/N), recorrências, baixas e totais por banco para saber quanto deixar em cada conta."
        acoes={podeEditar && <Button onClick={() => setNovo(true)}><Plus /> Nova conta</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard titulo={`A pagar em ${formatCompetencia(mes)}`} valor={<Moeda valor={somar(abertas.map((l) => l.valor))} />} sub={`${abertas.length} contas`} />
        <KpiCard titulo="Vencidas" valor={<Moeda valor={somar(abertas.filter((l) => l.status === "vencido").map((l) => l.valor))} />} tom={abertas.some((l) => l.status === "vencido") ? "critico" : undefined}
          sub={`${abertas.filter((l) => l.status === "vencido").length} contas`} href="/pagar?status=vencido" />
        <KpiCard titulo="Próximos 7 dias" valor={<Moeda valor={somar(prox7.map((l) => l.valor))} />} sub={`${prox7.length} contas`} tom={prox7.length ? "alerta" : undefined} />
        <KpiCard titulo="Pago no mês" valor={<Moeda valor={somar(linhas.filter((l) => l.pago_em).map((l) => l.valor_pago ?? l.valor))} />} tom="ok" />
      </div>

      <BarraFiltros>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Mês</Label>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Mês anterior" onClick={() => url.set({ mes: addCompetencia(mes, -1), id: null })}><ChevronLeft /></Button>
            <Input type="month" className="h-9 w-40" value={mes} onChange={(e) => e.target.value && url.set({ mes: e.target.value, id: null })} aria-label="Mês" />
            <Button variant="outline" size="icon-sm" aria-label="Próximo mês" onClick={() => url.set({ mes: addCompetencia(mes, 1), id: null })}><ChevronRight /></Button>
          </div>
        </div>
        <FiltroSelectUrl param="status" rotulo="Status" opcoes={[{ value: "a_vencer", label: "A vencer" }, { value: "vencido", label: "Vencidas (todas)" }, { value: "pago", label: "Pagas" }]} />
        <FiltroSelectUrl param="tipo" rotulo="Tipo" opcoes={[{ value: "fixa", label: "Fixas" }, { value: "variavel", label: "Variáveis" }, { value: "veiculo", label: "Veículo" }]} />
        <FiltroSelectUrl param="categoria_id" rotulo="Categoria" vazio="Todas" opcoes={opcoes.categorias} />
        <FiltroSelectUrl param="veiculo_id" rotulo="Placa" vazio="Todas" opcoes={opcoes.veiculos} />
        <FiltroSelectUrl param="banco" rotulo="Banco" opcoes={["Bradesco", "Sicredi", "Inter", "Outro"].map((b) => ({ value: b, label: b }))} />
        <FiltroSelectUrl param="forma_pagamento" rotulo="Forma" vazio="Todas" opcoes={opcoesDe(FORMAS)} />
        <FiltroSelectUrl param="descontar" rotulo="Locador" opcoes={[{ value: "1", label: "Descontar do locador" }]} />
        <BuscaUrl placeholder="Descrição, fornecedor…" />
        <div className="ml-auto flex gap-1">
          <Button variant={visao === "lista" ? "dark" : "outline"} size="sm" onClick={() => url.set({ visao: null }, { manterPagina: true })}><List /> Lista</Button>
          <Button variant={visao === "calendario" ? "dark" : "outline"} size="sm" onClick={() => url.set({ visao: "calendario" }, { manterPagina: true })}><CalendarDays /> Calendário</Button>
        </div>
      </BarraFiltros>

      <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-3">
          {visao === "calendario" && <Calendario mes={mes} linhas={linhas} diaSel={diaSel} onDia={(d) => setDiaSel(d === diaSel ? null : d)} />}
          {diaSel && <p className="text-sm">Mostrando <strong>{formatData(diaSel)}</strong> · <button className="underline" onClick={() => setDiaSel(null)}>ver mês todo</button></p>}
          <DataTable colunas={colunas} dados={filtradasDia} getId={(c) => c.id} rodape selecionavel={podeEditar}
            classeLinha={(c) => (c.status === "vencido" ? "border-l-2 border-l-status-critico" : c.pago_em ? "opacity-70" : undefined)}
            aoClicarLinha={podeEditar ? (c) => setEditando(c) : undefined}
            acoesLote={(sel) => (
              <>
                <Button size="xs" onClick={() => setBaixa(sel.filter((s) => !s.pago_em))}><Check /> Baixar {sel.filter((s) => !s.pago_em).length}</Button>
                <span className="text-xs">Total: {formatBRL(somar(sel.map((s) => s.valor)))}</span>
              </>
            )}
            exportar={{ nome: `contas_a_pagar_${mes}`, titulo: `Contas a pagar — ${formatCompetencia(mes, true)}`, colunas: [
              { titulo: "Vencimento", valor: (c) => c.vencimento, tipo: "data" }, { titulo: "Descrição", valor: (c) => c.descricao, largura: 34 },
              { titulo: "Empresa", valor: (c) => c.empresa_apelido }, { titulo: "Fornecedor", valor: (c) => c.fornecedor_nome, largura: 22 },
              { titulo: "Categoria", valor: (c) => c.categoria_nome }, { titulo: "Tipo", valor: (c) => c.tipo }, { titulo: "Placa", valor: (c) => c.placa },
              { titulo: "Forma", valor: (c) => FORMAS[c.forma_pagamento] }, { titulo: "Banco", valor: (c) => c.conta_apelido ?? c.banco },
              { titulo: "Valor", valor: (c) => c.valor, tipo: "moeda" }, { titulo: "Pago em", valor: (c) => c.pago_em, tipo: "data" },
              { titulo: "Descontar locador", valor: (c) => (c.descontar_locador ? "Sim" : "Não") }, { titulo: "Status", valor: (c) => c.status },
            ] }} />
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Em aberto por conta</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {porBanco.length === 0 && <p className="text-muted-foreground">Nada em aberto.</p>}
              {porBanco.map(([b, v]) => <div key={b} className="flex justify-between gap-2"><span className="truncate">{b}</span><Moeda valor={v} className="font-semibold" /></div>)}
            </CardContent>
          </Card>
          <TotaisPorDia linhas={abertas} onDia={setDiaSel} />
        </aside>
      </div>

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent tamanho="lg">
          <DialogHeader><DialogTitle>Nova conta a pagar</DialogTitle><DialogDescription>Parcelada gera N lançamentos “n/N” mensais; recorrente gera os próximos 12 meses (o job mensal mantém sempre 12 à frente).</DialogDescription></DialogHeader>
          {novo && (
            <Formulario<ContaPagarNovaForm> campos={camposConta<ContaPagarNovaForm>(opcoes, true)} schema={contaPagarNovaSchema as never}
              valores={{ empresa_id: empresaPadrao ?? opcoes.empresas[0]?.value, fornecedor_id: null, descricao: "", categoria_id: null, tipo: "fixa", veiculo_id: null,
                vencimento: hojeSP(), valor: undefined, forma_pagamento: "boleto", conta_bancaria_id: null, descontar_locador: false, anexo_url: null, observacoes: null,
                repeticao: "unica", parcelas: null, parcela_inicial: 1, modo_valor: "parcela" }}
              extra={(v) => <PreviaParcelas v={v} />}
              onSalvar={async (v) => { const r = await criarContaPagar(v); return r.ok ? { ok: true, mensagem: `${r.dados.criadas} lançamento(s) criado(s)` } : r; }}
              onSucesso={() => { setNovo(false); router.refresh(); }} />
          )}
        </DialogContent>
      </Dialog>

      <DialogoEditar conta={editando} opcoes={opcoes} onOpenChange={(v) => { if (!v) { setEditando(null); if (foco) url.set({ id: null }); } }} onFeito={() => router.refresh()} />
      <DialogoBaixa contas={baixa} opcoes={opcoes} onOpenChange={(v) => !v && setBaixa(null)} onFeito={() => router.refresh()} />
      <DialogoExcluir conta={excluir} onOpenChange={(v) => !v && setExcluir(null)} onFeito={() => router.refresh()} />
    </div>
  );
}

function PreviaParcelas({ v }: { v: ContaPagarNovaForm }) {
  if (v.repeticao !== "parcelada" || !v.parcelas || v.parcelas < 2 || !v.valor || !v.vencimento) return null;
  try {
    const ps = gerarParcelas({ descricao: v.descricao || "Parcela", valor: v.valor, modo: v.modo_valor, total: v.parcelas, inicio: v.parcela_inicial ?? 1, primeiroVencimento: v.vencimento });
    return (
      <div className="rounded-md bg-muted p-3 text-sm">
        <p className="mb-1 font-medium">{ps.length} lançamentos · total {formatBRL(somar(ps.map((p) => p.valor)))}</p>
        <p className="text-xs text-muted-foreground">
          {ps.slice(0, 3).map((p) => `${p.descricao} — ${formatData(p.vencimento)} — ${formatBRL(p.valor)}`).join(" · ")}
          {ps.length > 3 && ` · … · ${ps.at(-1)!.descricao} — ${formatData(ps.at(-1)!.vencimento)}`}
        </p>
      </div>
    );
  } catch {
    return null;
  }
}

function DialogoEditar({ conta: c, opcoes, onOpenChange, onFeito }: { conta: LinhaConta | null; opcoes: Opcoes; onOpenChange: (v: boolean) => void; onFeito: () => void }) {
  const campos = React.useMemo(() => {
    const cs = camposConta<ContaPagarEdicaoForm>(opcoes, false);
    if (c?.grupo_parcela_id) cs.push({ nome: "escopo", rotulo: "Aplicar alteração em", tipo: "select", col: 6, opcoes: [{ value: "esta", label: "Só esta" }, { value: "seguintes", label: "Esta e as seguintes" }] });
    return cs;
  }, [opcoes, c?.grupo_parcela_id]);
  const [anexo, setAnexo] = React.useState<string | null>(null);
  React.useEffect(() => setAnexo(c?.anexo_url ?? null), [c?.id, c?.anexo_url]);
  return (
    <Dialog open={!!c} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        <DialogHeader>
          <DialogTitle>Editar conta</DialogTitle>
          <DialogDescription>
            {c?.parcela_total ? `Parcela ${c.parcela_num}/${c.parcela_total}` : c?.recorrente ? "Conta recorrente" : "Conta única"}
            {c?.ordem_servico_id && " · gerada por OS"}{c && c.valor_abatido > 0 && ` · ${formatBRL(c.valor_abatido)} já abatido em repasse`}
          </DialogDescription>
        </DialogHeader>
        {c && (
          <>
            <div className="flex items-center gap-2"><Label>Boleto / recibo:</Label><CampoAnexo bucket="anexos" pasta="contas" valor={anexo} onChange={setAnexo} /></div>
            <Formulario<ContaPagarEdicaoForm> campos={campos} schema={contaPagarEdicaoSchema as never}
              valores={{ empresa_id: c.empresa_id, fornecedor_id: c.fornecedor_id, descricao: c.descricao, categoria_id: c.categoria_id, tipo: c.tipo, veiculo_id: c.veiculo_id,
                vencimento: c.vencimento, valor: c.valor, forma_pagamento: c.forma_pagamento, conta_bancaria_id: c.conta_bancaria_id, descontar_locador: c.descontar_locador,
                anexo_url: c.anexo_url, observacoes: c.observacoes, escopo: "esta" }}
              onSalvar={async (v) => { const r = await editarContaPagar(c.id, { ...v, anexo_url: anexo }); return r.ok ? { ok: true, mensagem: `${r.dados.alteradas} lançamento(s) atualizado(s)` } : r; }}
              onSucesso={() => { onOpenChange(false); onFeito(); }} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DialogoBaixa({ contas, opcoes, onOpenChange, onFeito }: { contas: LinhaConta[] | null; opcoes: Opcoes; onOpenChange: (v: boolean) => void; onFeito: () => void }) {
  const [data, setData] = React.useState(hojeSP());
  const [valor, setValor] = React.useState<number | null>(null);
  const [conta, setConta] = React.useState<string | null>(null);
  const [anexo, setAnexo] = React.useState<string | null>(null);
  const unica = contas?.length === 1 ? contas[0] : null;
  React.useEffect(() => {
    setData(hojeSP()); setAnexo(null);
    setValor(unica?.valor ?? null); setConta(unica?.conta_bancaria_id ?? null);
  }, [contas, unica]);
  const empresas = new Set((contas ?? []).map((c) => c.empresa_id));
  return (
    <Confirmar aberto={!!contas} onOpenChange={onOpenChange} titulo={unica ? `Pagar: ${unica.descricao}` : `Baixar ${contas?.length ?? 0} conta(s)`} rotulo="Confirmar pagamento"
      descricao={<>Total: <strong>{formatBRL(somar((contas ?? []).map((c) => c.valor)))}</strong></>}
      onConfirmar={async () => {
        const r = await baixarContas({ ids: (contas ?? []).map((c) => c.id), pago_em: data, valor_pago: unica ? valor : null, conta_bancaria_id: conta, anexo_url: anexo });
        if (!r.ok) { toast.error(r.erro); throw new Error(r.erro); }
        toast.success(`${r.dados.baixadas} conta(s) paga(s)`);
        onFeito();
      }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="bx-data">Data do pagamento</Label><Input id="bx-data" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        {unica && <div className="space-y-1.5"><Label htmlFor="bx-valor">Valor pago</Label><InputMoeda id="bx-valor" value={valor} onChange={setValor} /></div>}
        <div className="col-span-2 space-y-1.5"><Label>Conta (opcional, mantém a da conta se vazio)</Label>
          <SelectSimples value={conta} onChange={setConta} vazio="Manter" opcoes={opcoes.contas.filter((c) => empresas.size === 1 && empresas.has(c.empresa_id))} /></div>
        <div className="col-span-2 space-y-1.5"><Label>Comprovante</Label><CampoAnexo bucket="comprovantes" pasta="pagamentos" valor={anexo} onChange={setAnexo} /></div>
      </div>
    </Confirmar>
  );
}

function DialogoExcluir({ conta: c, onOpenChange, onFeito }: { conta: LinhaConta | null; onOpenChange: (v: boolean) => void; onFeito: () => void }) {
  const [escopo, setEscopo] = React.useState<"esta" | "seguintes">("esta");
  return (
    <Confirmar aberto={!!c} onOpenChange={onOpenChange} titulo="Excluir conta?" destrutivo rotulo="Excluir"
      descricao={c && <>{c.descricao} · {formatData(c.vencimento)} · {formatBRL(c.valor)}</>}
      onConfirmar={async () => {
        if (!c) return;
        const r = await excluirContas(c.id, escopo);
        if (!r.ok) { toast.error(r.erro); throw new Error(r.erro); }
        toast.success(`${r.dados.excluidas} lançamento(s) excluído(s)`);
        onFeito();
      }}>
      {c?.grupo_parcela_id && (
        <SelectSimples value={escopo} onChange={(v) => setEscopo((v as "esta") ?? "esta")}
          opcoes={[{ value: "esta", label: "Só esta" }, { value: "seguintes", label: "Esta e as seguintes (não pagas)" }]} />
      )}
    </Confirmar>
  );
}

function Calendario({ mes, linhas, diaSel, onDia }: { mes: string; linhas: LinhaConta[]; diaSel: string | null; onDia: (d: string) => void }) {
  const [ano, m] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay(); // 0=dom
  const dias = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const hoje = hojeSP();
  const celulas: (string | null)[] = [...Array(primeiro).fill(null), ...Array.from({ length: dias }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <Card className="p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {celulas.map((d, i) => {
          if (!d) return <div key={i} />;
          const doDia = linhas.filter((l) => l.vencimento === d);
          const aberto = somar(doDia.filter((l) => !l.pago_em).map((l) => l.valor));
          const vencido = doDia.some((l) => l.status === "vencido");
          const tudoPago = doDia.length > 0 && doDia.every((l) => l.pago_em);
          return (
            <button key={d} type="button" onClick={() => onDia(d)} aria-pressed={diaSel === d} aria-label={`${formatData(d)}: ${doDia.length} contas`}
              className={cn("flex min-h-[4.5rem] flex-col rounded-md border p-1 text-left text-xs transition-colors hover:border-primary",
                d === hoje && "ring-2 ring-primary", diaSel === d && "bg-accent", vencido && "border-status-critico", tudoPago && "bg-green-50 dark:bg-green-950/30")}>
              <span className="font-semibold">{Number(d.slice(8))}</span>
              {doDia.length > 0 && (
                <>
                  <span className="text-muted-foreground">{doDia.length} conta{doDia.length > 1 ? "s" : ""}</span>
                  {aberto > 0 && <span className={cn("num mt-auto truncate font-semibold", vencido && "text-status-critico")}>{formatBRL(aberto).replace("R$ ", "")}</span>}
                </>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function TotaisPorDia({ linhas, onDia }: { linhas: LinhaConta[]; onDia: (d: string) => void }) {
  const porDia = Object.entries(linhas.reduce<Record<string, Record<string, number>>>((acc, l) => {
    const b = l.conta_apelido ?? l.banco ?? "Sem conta";
    (acc[l.vencimento] ??= {})[b] = (acc[l.vencimento][b] ?? 0) + l.valor;
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Em aberto por dia</CardTitle></CardHeader>
      <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto text-sm">
        {porDia.length === 0 && <p className="text-muted-foreground">Nada em aberto.</p>}
        {porDia.map(([d, bancos]) => (
          <button key={d} type="button" className="block w-full text-left hover:opacity-80" onClick={() => onDia(d)}>
            <div className="flex justify-between font-medium"><span>{formatData(d)}</span><Moeda valor={somar(Object.values(bancos))} /></div>
            {Object.entries(bancos).map(([b, v]) => <div key={b} className="flex justify-between pl-2 text-xs text-muted-foreground"><span>{b}</span><Moeda valor={v} /></div>)}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
