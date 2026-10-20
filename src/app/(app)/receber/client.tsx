"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { HandCoins, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { IconeEmail, IconeWhatsApp } from "@/components/app/icones";
import { Badge, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { Cabecalho, Confirmar, Moeda, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { KpiCard } from "@/components/app/kpi";
import { DataTable } from "@/components/app/data-table";
import { BarraFiltros, BuscaUrl, FiltroSelectUrl, useUrlParams } from "@/components/app/url";
import { InputMoeda } from "@/components/app/campos";
import { CampoAnexo, LinkAnexo } from "@/components/app/anexo";
import { formatBRL, formatData, formatPeriodo, formatPlaca, hojeSP, linkEmail, linkWhatsApp, preencherTemplate } from "@/lib/format";
import { somar } from "@/lib/calculos";
import { baixarEmLote, buscarFaturasAbertas, estornarRecebimento, listarRecebimentos, registrarRecebimento } from "./actions";

export type LinhaReceber = {
  id: string; empresa_id: string; empresa_apelido: string; cliente_id: string; cliente_fantasia: string; obra_id: string | null; obra_nome: string | null;
  placa: string; periodo_inicio: string; periodo_fim: string; numero_nf: string | null; data_emissao: string | null; data_vencimento: string | null;
  valor_final: number; valor_recebido: number; saldo: number; status: string; status_exibicao: string; dias_atraso: number | null; data_ultimo_recebimento: string | null;
};
export type ContatoCobranca = { cliente_id: string; obra_id: string | null; nome: string; email: string | null; whatsapp: string | null };
type Conta = Opcao & { empresa_id: string };

const FAIXAS = [
  { chave: "a_vencer", rotulo: "A vencer", tom: undefined },
  { chave: "1-30", rotulo: "1–30 dias", tom: "alerta" as const },
  { chave: "31-60", rotulo: "31–60 dias", tom: "alerta" as const },
  { chave: "61-90", rotulo: "61–90 dias", tom: "critico" as const },
  { chave: "90+", rotulo: "+90 dias", tom: "critico" as const },
];

export function ReceberCliente({ linhas, total, pagina, tamanho, aging, clientes, contas, contatos, templates, podeEditar }: {
  linhas: LinhaReceber[]; total: number; pagina: number; tamanho: number; aging: Record<string, number>; clientes: Opcao[];
  contas: Conta[]; contatos: ContatoCobranca[]; templates: { email: string; whatsapp: string }; podeEditar: boolean;
}) {
  const router = useRouter();
  const url = useUrlParams();
  const [baixando, setBaixando] = React.useState<LinhaReceber | null>(null);
  const [lote, setLote] = React.useState<LinhaReceber[] | null>(null);
  const [lancando, setLancando] = React.useState(false);

  const contatosDe = React.useCallback((m: LinhaReceber) =>
    contatos.filter((c) => c.cliente_id === m.cliente_id && (!c.obra_id || c.obra_id === m.obra_id)), [contatos]);

  const mensagem = React.useCallback((m: LinhaReceber, tpl: string, contato: string) => preencherTemplate(tpl, {
    contato, nf: m.numero_nf ?? "", placa: formatPlaca(m.placa), periodo: formatPeriodo(m.periodo_inicio, m.periodo_fim),
    valor: formatBRL(m.saldo), vencimento: formatData(m.data_vencimento), empresa: m.empresa_apelido === "TDTS" ? "TDTS & Oliveira Locações" : "Oliveira & Oliveira Locações",
  }), []);

  const colunas = React.useMemo<ColumnDef<LinhaReceber, unknown>[]>(() => [
    { id: "placa", header: "Placa / cliente", meta: { tituloMobile: true }, cell: ({ row: { original: m } }) => (
      <div className="max-w-[13rem]" title={`${m.cliente_fantasia}${m.obra_nome ? ` · ${m.obra_nome}` : ""}`}>
        <span className="font-mono font-semibold">{formatPlaca(m.placa)}</span> <span className="text-xs text-muted-foreground">{m.empresa_apelido}</span>
        <p className="truncate text-xs text-muted-foreground">{m.cliente_fantasia}</p>
        {m.obra_nome && <p className="truncate text-xs text-muted-foreground">{m.obra_nome}</p>}
      </div>
    ) },
    { accessorKey: "numero_nf", header: "NF", cell: ({ getValue }) => <span className="num">{(getValue() as string) ?? "—"}</span> },
    { id: "periodo", header: "Período", cell: ({ row: { original: m } }) => (
      <span className="whitespace-nowrap text-xs leading-tight">{formatData(m.periodo_inicio)}<br /><span className="text-muted-foreground">a {formatData(m.periodo_fim)}</span></span>
    ) },
    { accessorKey: "data_vencimento", header: "Vencimento", meta: { ordem: "data_vencimento" }, cell: ({ row: { original: m } }) => (
      <div className="whitespace-nowrap leading-tight">
        {formatData(m.data_vencimento)}{m.status_exibicao === "vencido" && m.dias_atraso ? <Badge variant="critico" className="ml-1 px-1.5 py-0 text-[11px]">{m.dias_atraso} d</Badge> : null}
        <p className="text-[11px] text-muted-foreground">emissão {formatData(m.data_emissao)}</p>
      </div>
    ) },
    { accessorKey: "valor_final", header: "Valor", meta: { direita: true, ordem: "valor_final" }, cell: ({ row: { original: m } }) => (
      <div className="whitespace-nowrap leading-tight">
        <Moeda valor={m.valor_final} />
        {m.valor_recebido > 0 && <p className="text-[11px] text-status-ok">recebido <Moeda valor={m.valor_recebido} /></p>}
      </div>
    ), footer: () => (
      <div className="leading-tight"><Moeda valor={somar(linhas.map((l) => l.valor_final))} />
        <p className="text-[11px] font-normal text-muted-foreground">recebido <Moeda valor={somar(linhas.map((l) => l.valor_recebido))} /></p></div>
    ) },
    { accessorKey: "saldo", header: "Saldo", meta: { direita: true, ordem: "saldo" }, cell: ({ getValue }) => <Moeda valor={getValue() as number} className="whitespace-nowrap font-semibold" />, footer: () => <Moeda valor={somar(linhas.map((l) => l.saldo))} /> },
    { accessorKey: "status_exibicao", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} className="whitespace-nowrap" /> },
    { id: "acoes", header: () => <span className="sr-only">Ações</span>, meta: { classe: "text-right" }, cell: ({ row: { original: m } }) => {
      const cs = contatosDe(m);
      const comEmail = cs.find((c) => c.email);
      const comZap = cs.find((c) => c.whatsapp);
      const mail = comEmail && linkEmail(cs.filter((c) => c.email).map((c) => c.email).join(","), `Fatura ${m.numero_nf ?? ""} — ${formatPlaca(m.placa)}`, mensagem(m, templates.email, comEmail.nome));
      const zap = comZap && linkWhatsApp(comZap.whatsapp, mensagem(m, templates.whatsapp, comZap.nome));
      return (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {mail ? <Button asChild variant="ghost" size="icon-sm" aria-label="Enviar cobrança por e-mail" title={`E-mail para ${comEmail!.nome}`}><a href={mail}><IconeEmail /></a></Button>
            : <Button variant="ghost" size="icon-sm" disabled aria-label="Sem e-mail de faturamento" title="Cliente sem contato de faturamento com e-mail"><IconeEmail className="grayscale" /></Button>}
          {zap ? <Button asChild variant="ghost" size="icon-sm" aria-label="Enviar cobrança por WhatsApp" title={`WhatsApp ${comZap!.nome}`}><a href={zap} target="_blank" rel="noopener"><IconeWhatsApp /></a></Button>
            : <Button variant="ghost" size="icon-sm" disabled aria-label="Sem WhatsApp" title="Cliente sem contato de faturamento com WhatsApp"><IconeWhatsApp className="grayscale" /></Button>}
          {podeEditar && m.status !== "recebido" && <Button size="xs" onClick={() => setBaixando(m)}><HandCoins /> Baixar</Button>}
          {m.status === "recebido" && <Button size="xs" variant="outline" onClick={() => setBaixando(m)}>Ver</Button>}
        </div>
      );
    } },
  ], [linhas, contatosDe, mensagem, templates, podeEditar]);

  const totalAberto = Object.values(aging).reduce((a, b) => a + b, 0);
  const faixaAtual = url.get("faixa");

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Contas a receber" descricao="Medições faturadas. Baixa total ou parcial; o status da medição e a liberação do repasse são atualizados automaticamente."
        acoes={podeEditar && <Button onClick={() => setLancando(true)}><Plus /> Lançar recebimento</Button>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard titulo="Total em aberto" valor={<Moeda valor={totalAberto} />} destaque={!faixaAtual} href="/receber" />
        {FAIXAS.map((f) => (
          <button key={f.chave} type="button" className="text-left" onClick={() => url.set({ faixa: faixaAtual === f.chave ? null : f.chave, status: null })}>
            <KpiCard titulo={f.rotulo} valor={<Moeda valor={aging[f.chave] ?? 0} />} tom={(aging[f.chave] ?? 0) > 0 ? f.tom : undefined} destaque={faixaAtual === f.chave} />
          </button>
        ))}
      </div>

      <BarraFiltros>
        <FiltroSelectUrl param="status" rotulo="Situação" vazio="Em aberto" opcoes={[
          { value: "a_vencer", label: "A vencer" }, { value: "vencido", label: "Vencidas" }, { value: "recebido_parcial", label: "Recebidas parcial" },
          { value: "recebido", label: "Recebidas" }, { value: "todos", label: "Todas" },
        ]} />
        <FiltroSelectUrl param="cliente" rotulo="Cliente" opcoes={clientes} />
        <BuscaUrl placeholder="Placa ou NF…" />
      </BarraFiltros>

      <DataTable colunas={colunas} dados={linhas} getId={(m) => m.id} total={total} pagina={pagina} tamanho={tamanho} rodape compacta
        selecionavel={podeEditar}
        classeLinha={(m) => (m.status_exibicao === "vencido" ? "border-l-2 border-l-status-critico" : undefined)}
        acoesLote={(sel) => <Button size="xs" onClick={() => setLote(sel)}><HandCoins /> Baixa total em lote</Button>}
        exportar={{ nome: "contas_a_receber", titulo: "Contas a receber", colunas: [
          { titulo: "Empresa", valor: (m) => m.empresa_apelido }, { titulo: "Cliente", valor: (m) => m.cliente_fantasia, largura: 20 },
          { titulo: "Obra", valor: (m) => m.obra_nome, largura: 20 }, { titulo: "Placa", valor: (m) => m.placa }, { titulo: "NF", valor: (m) => m.numero_nf },
          { titulo: "Emissão", valor: (m) => m.data_emissao, tipo: "data" }, { titulo: "Vencimento", valor: (m) => m.data_vencimento, tipo: "data" },
          { titulo: "Dias atraso", valor: (m) => (m.status_exibicao === "vencido" ? m.dias_atraso : null), tipo: "numero" },
          { titulo: "Valor", valor: (m) => m.valor_final, tipo: "moeda" }, { titulo: "Recebido", valor: (m) => m.valor_recebido, tipo: "moeda" },
          { titulo: "Saldo", valor: (m) => m.saldo, tipo: "moeda" }, { titulo: "Status", valor: (m) => m.status_exibicao },
        ] }} />

      <DialogoBaixa medicao={baixando} contas={contas} podeEditar={podeEditar} onOpenChange={(v) => !v && setBaixando(null)} onFeito={() => router.refresh()} />
      <DialogoLancar aberto={lancando} onOpenChange={setLancando} onEscolher={(m) => { setLancando(false); setBaixando(m); }} />
      <DialogoLote lote={lote} contas={contas} onOpenChange={(v) => !v && setLote(null)} onFeito={() => router.refresh()} />
      <p className="text-xs text-muted-foreground">Cobrança usa os contatos marcados “recebe fatura” do cliente/obra e os templates em <Link href="/configuracoes" className="underline">Configurações</Link>.</p>
    </div>
  );
}

/** Passo 1 do lançamento: escolher a fatura em aberto; o passo 2 é o diálogo de baixa. */
function DialogoLancar({ aberto, onOpenChange, onEscolher }: { aberto: boolean; onOpenChange: (v: boolean) => void; onEscolher: (m: LinhaReceber) => void }) {
  const [busca, setBusca] = React.useState("");
  const [faturas, setFaturas] = React.useState<LinhaReceber[] | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setFaturas(null);
    const t = setTimeout(async () => {
      const r = await buscarFaturasAbertas(busca);
      if (!ativo) return;
      if (r.ok) setFaturas(r.dados);
      else { toast.error(r.erro); setFaturas([]); }
    }, busca ? 300 : 0);
    return () => { ativo = false; clearTimeout(t); };
  }, [aberto, busca]);

  React.useEffect(() => { if (!aberto) setBusca(""); }, [aberto]);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        <DialogHeader>
          <DialogTitle>Lançar recebimento</DialogTitle>
          <DialogDescription>Escolha a fatura em aberto que foi paga. Em seguida você informa data, valor e conta.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por placa, NF ou cliente…" aria-label="Buscar fatura" className="pl-9" />
        </div>
        <div className="max-h-[50vh] min-h-40 overflow-y-auto">
          {faturas === null ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando faturas…</p>
          ) : faturas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{busca ? "Nenhuma fatura em aberto encontrada." : "Não há faturas em aberto."}</p>
          ) : (
            <ul className="space-y-1">
              {faturas.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => onEscolher(m)}
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm"><span className="font-mono font-semibold">{formatPlaca(m.placa)}</span> · NF {m.numero_nf ?? "—"} <span className="text-xs text-muted-foreground">{m.empresa_apelido}</span></p>
                      <p className="truncate text-xs text-muted-foreground">{m.cliente_fantasia}{m.obra_nome ? ` · ${m.obra_nome}` : ""} · venc. {formatData(m.data_vencimento)}</p>
                    </div>
                    {m.status_exibicao === "vencido" && <Badge variant="critico">{m.dias_atraso} d</Badge>}
                    <div className="text-right">
                      <Moeda valor={m.saldo} className="text-sm font-semibold" />
                      {m.valor_recebido > 0 && <p className="text-[11px] text-muted-foreground">de {formatBRL(m.valor_final)}</p>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Recebimento = { id: string; data: string; valor: number; comprovante_url: string | null; observacoes: string | null; conta: string | null };

function DialogoBaixa({ medicao: m, contas, podeEditar, onOpenChange, onFeito }: {
  medicao: LinhaReceber | null; contas: Conta[]; podeEditar: boolean; onOpenChange: (v: boolean) => void; onFeito: () => void;
}) {
  const [data, setData] = React.useState(hojeSP());
  const [valor, setValor] = React.useState<number | null>(null);
  const [conta, setConta] = React.useState<string | null>(null);
  const [comprovante, setComprovante] = React.useState<string | null>(null);
  const [obs, setObs] = React.useState<string>("");
  const [historico, setHistorico] = React.useState<Recebimento[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  const [estornar, setEstornar] = React.useState<Recebimento | null>(null);
  const contasEmpresa = contas.filter((c) => !m || c.empresa_id === m.empresa_id);

  React.useEffect(() => {
    if (!m) return;
    setData(hojeSP()); setValor(m.saldo); setConta(contasEmpresa[0]?.value ?? null); setComprovante(null); setObs("");
    listarRecebimentos(m.id).then((r) => r.ok && setHistorico(r.dados));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);

  const salvar = async () => {
    if (!m || !valor) return;
    setSalvando(true);
    const r = await rodarAcao(registrarRecebimento({ medicao_id: m.id, data, valor, conta_bancaria_id: conta, comprovante_url: comprovante, observacoes: obs || null }));
    setSalvando(false);
    if (r.ok) { onOpenChange(false); onFeito(); }
  };

  return (
    <Dialog open={!!m} onOpenChange={onOpenChange}>
      <DialogContent tamanho="md">
        <DialogHeader>
          <DialogTitle>Baixa de recebimento</DialogTitle>
          <DialogDescription>{m && <>{formatPlaca(m.placa)} · {m.cliente_fantasia} · NF {m.numero_nf ?? "—"} · venc. {formatData(m.data_vencimento)}</>}</DialogDescription>
        </DialogHeader>
        {m && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Valor</p><Moeda valor={m.valor_final} /></div>
              <div><p className="text-xs text-muted-foreground">Recebido</p><Moeda valor={m.valor_recebido} /></div>
              <div><p className="text-xs text-muted-foreground">Saldo</p><Moeda valor={m.saldo} className="font-bold" /></div>
            </div>
            {historico.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Conta</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Comprovante</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {historico.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatData(r.data)}</TableCell><TableCell>{r.conta ?? "—"}</TableCell>
                      <TableCell className="text-right"><Moeda valor={r.valor} /></TableCell>
                      <TableCell><LinkAnexo referencia={r.comprovante_url} rotulo="Abrir" /></TableCell>
                      <TableCell>{podeEditar && <Button variant="ghost" size="icon-sm" aria-label="Estornar" onClick={() => setEstornar(r)}><Trash2 /></Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {podeEditar && m.saldo > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="rec-data">Data</Label><Input id="rec-data" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="rec-valor">Valor recebido</Label><InputMoeda id="rec-valor" value={valor} onChange={setValor} />
                  {valor !== null && valor < m.saldo && <p className="text-xs text-status-alerta">Baixa parcial — saldo restante {formatBRL(m.saldo - valor)}</p>}</div>
                <div className="col-span-2 space-y-1.5"><Label>Conta bancária</Label><SelectSimples value={conta} onChange={setConta} opcoes={contasEmpresa} vazio="—" /></div>
                <div className="col-span-2 space-y-1.5"><Label>Comprovante</Label><CampoAnexo bucket="comprovantes" pasta="recebimentos" valor={comprovante} onChange={setComprovante} /></div>
                <div className="col-span-2 space-y-1.5"><Label htmlFor="rec-obs">Observações</Label><Textarea id="rec-obs" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {podeEditar && m && m.saldo > 0 && <Button disabled={salvando || !valor} onClick={salvar}><HandCoins /> Registrar recebimento</Button>}
        </DialogFooter>
        <Confirmar aberto={!!estornar} onOpenChange={(v) => !v && setEstornar(null)} titulo="Estornar recebimento?" destrutivo rotulo="Estornar"
          descricao={estornar && `${formatData(estornar.data)} · ${formatBRL(estornar.valor)}. O status da medição será recalculado.`}
          onConfirmar={async () => {
            if (!estornar) return;
            const r = await rodarAcao(estornarRecebimento(estornar.id));
            if (r.ok) { onOpenChange(false); onFeito(); }
          }} />
      </DialogContent>
    </Dialog>
  );
}

function DialogoLote({ lote, contas, onOpenChange, onFeito }: { lote: LinhaReceber[] | null; contas: Conta[]; onOpenChange: (v: boolean) => void; onFeito: () => void }) {
  const [data, setData] = React.useState(hojeSP());
  const [conta, setConta] = React.useState<string | null>(null);
  const abertas = (lote ?? []).filter((m) => m.saldo > 0 && m.status !== "recebido");
  const empresas = new Set(abertas.map((m) => m.empresa_id));
  const opcoes = contas.filter((c) => empresas.size === 1 && empresas.has(c.empresa_id));
  return (
    <Confirmar aberto={!!lote} onOpenChange={onOpenChange} titulo={`Baixa total de ${abertas.length} fatura(s)`} rotulo="Baixar"
      descricao={<>Total: <strong>{formatBRL(somar(abertas.map((m) => m.saldo)))}</strong>. Cada fatura recebe o saldo em aberto na data informada.</>}
      onConfirmar={async () => {
        const r = await baixarEmLote(abertas.map((m) => m.id), data, conta);
        if (!r.ok) { toast.error(r.erro); throw new Error(r.erro); }
        toast.success(`${r.dados.baixadas} fatura(s) baixada(s)`);
        onFeito();
      }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="lote-data">Data</Label><Input id="lote-data" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Conta</Label><SelectSimples value={conta} onChange={setConta} opcoes={opcoes} vazio={empresas.size > 1 ? "Várias empresas" : "—"} /></div>
      </div>
    </Confirmar>
  );
}
