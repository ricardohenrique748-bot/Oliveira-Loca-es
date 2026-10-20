"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Loader2, Plus, Search, Wallet } from "lucide-react";
import { Badge, Card, CardContent, Checkbox, Label, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { BotaoCopiar, Cabecalho, Moeda, StatusBadge, Vazio } from "@/components/app/comuns";
import { KpiCard } from "@/components/app/kpi";
import { BarraFiltros, FiltroDataUrl, FiltroSelectUrl } from "@/components/app/url";
import { CampoAnexo, LinkAnexo } from "@/components/app/anexo";
import { formatBRL, formatData, formatPeriodo, formatPlaca, hojeSP, maskTelefone } from "@/lib/format";
import { somar } from "@/lib/calculos";
import { exportarPDF } from "@/lib/exportar";
import { ROTULOS } from "@/lib/schemas/cadastros";
import { cn } from "@/lib/utils";
import { buscarRepassesPendentes, pagarRepasse } from "./actions";

export type Repasse = {
  id: string; medicao_id: string; locador_id: string; locador_nome: string; empresa_id: string; empresa_apelido: string; veiculo_id: string; placa: string;
  valor_repasse_mensal: number; valor_bruto: number; valor_abatimentos: number; valor_liquido: number; data_prevista: string | null; data_pagamento: string | null;
  adiantado: boolean; aprovado_por: string | null; comprovante_url: string | null; status: string; periodo_inicio: string; periodo_fim: string; dias: number;
  numero_nf: string | null; medicao_valor: number; medicao_status: string; medicao_vencimento: string | null; competencia: string; cliente_nome: string; seria_adiantado: boolean;
  obra_nome: string | null; medicao_emissao: string | null; contrato_numero: string | null;
  responsavel_nome: string | null; responsavel_whatsapp: string | null; responsavel_email: string | null;
};
export type Abatimento = { id: string; repasse_id: string; conta_pagar_id: string | null; ordem_servico_id: string | null; descricao: string; valor: number; vencimento: string | null; os_numero: number | null };
export type Locador = { id: string; nome: string; cpf_cnpj: string | null; telefone: string | null; chave_pix: string | null; tipo_chave_pix: keyof typeof ROTULOS.tipoChavePix | null; banco: string | null; nome_titular_pix: string | null };

/** "2026-08-21" → "21/08" (como na planilha; o ano está no filtro de competência) */
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** situação da medição em uma palavra, para a coluna Status da tabela */
const SITUACAO_CLIENTE: Record<string, string> = { a_faturar: "a faturar", faturado: "aguard. cliente", recebido_parcial: "receb. parcial", recebido: "cliente pagou", cancelado: "cancelado" };
const STATUS_MEDICAO: Record<string, string> = { a_faturar: "A faturar", faturado: "Faturado (aguardando cliente)", recebido_parcial: "Recebido parcial", recebido: "Cliente pagou", cancelado: "Cancelado" };

export function RepassesCliente({ repasses, abatimentos, locadores, placas, podeEditar }: { repasses: Repasse[]; abatimentos: Abatimento[]; locadores: Locador[]; placas: string[]; podeEditar: boolean }) {
  const router = useRouter();
  const [pagando, setPagando] = React.useState<Repasse | null>(null);
  const [lancando, setLancando] = React.useState(false);
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set());

  const locadorDe = (id: string, nome: string) => locadores.find((l) => l.id === id) ?? ({ id, nome } as Locador);
  const abatDe = (id: string) => abatimentos.filter((a) => a.repasse_id === id);

  const pendentes = repasses.filter((r) => r.status === "previsto" || r.status === "liberado");
  const liberados = repasses.filter((r) => r.status === "liberado");

  /** PDF enviado ao locador: só abatimentos e líquido (o bruto fica na tela, uso interno) */
  const extrato = async (loc: Locador, rs: Repasse[]) => {
    const linhas = rs.flatMap((r) => [
      { tipo: "repasse", r, a: null as Abatimento | null },
      ...abatDe(r.id).map((a) => ({ tipo: "abat", r, a })),
    ]);
    const ini = rs.reduce((m, r) => (r.periodo_inicio < m ? r.periodo_inicio : m), rs[0].periodo_inicio);
    const fim = rs.reduce((m, r) => (r.periodo_fim > m ? r.periodo_fim : m), rs[0].periodo_fim);
    await exportarPDF(`extrato_${loc.nome}`, `Extrato do locador — ${loc.nome}`, [
      { titulo: "Placa", valor: (l) => (l.tipo === "repasse" ? formatPlaca(l.r.placa) : "") },
      { titulo: "Cliente / descrição", valor: (l) => (l.tipo === "repasse" ? `${l.r.cliente_nome} · ${l.r.empresa_apelido}` : `   (-) ${l.a!.descricao}`) },
      { titulo: "Período", valor: (l) => (l.tipo === "repasse" ? formatPeriodo(l.r.periodo_inicio, l.r.periodo_fim) : formatData(l.a!.vencimento)) },
      { titulo: "Dias", valor: (l) => (l.tipo === "repasse" ? l.r.dias : null), tipo: "numero" },
      { titulo: "Abatimento", valor: (l) => (l.tipo === "abat" ? l.a!.valor : null), tipo: "moeda" },
      { titulo: "Líquido", valor: (l) => (l.tipo === "repasse" ? l.r.valor_liquido : null), tipo: "moeda" },
      { titulo: "Situação", valor: (l) => (l.tipo === "repasse" ? (l.r.status === "pago" ? `Pago ${formatData(l.r.data_pagamento)}` : l.r.status) : "") },
    ], linhas, {
      subtitulo: `Período: ${formatData(ini)} a ${formatData(fim)}`,
      resumo: [
        ["Locador", `${loc.nome}${loc.cpf_cnpj ? ` — ${loc.cpf_cnpj}` : ""}`],
        ["PIX", loc.chave_pix ? `${loc.tipo_chave_pix ? ROTULOS.tipoChavePix[loc.tipo_chave_pix] + ": " : ""}${loc.chave_pix}${loc.nome_titular_pix ? ` (${loc.nome_titular_pix})` : ""}${loc.banco ? ` — ${loc.banco}` : ""}` : "—"],
        ["Abatimentos", formatBRL(somar(rs.map((r) => r.valor_abatimentos)))],
        ["Total líquido", formatBRL(somar(rs.map((r) => r.valor_liquido)))],
      ],
      totais: ["Total", "", "", "", somar(rs.map((r) => r.valor_abatimentos)), somar(rs.map((r) => r.valor_liquido)), ""],
      rodape: ["Valores proporcionais aos dias medidos (base 30). Abatimentos referentes a despesas do veículo marcadas “descontar do locador”."],
    });
  };

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Repasses a locadores"
        descricao="Repasse = (mensal ÷ 30) × dias − despesas “descontar do locador”. Líquido nunca fica negativo: o saldo passa para o próximo repasse."
        acoes={podeEditar && <Button onClick={() => setLancando(true)}><Plus /> Lançar pagamento</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard titulo="Pendentes (líquido)" valor={<Moeda valor={somar(pendentes.map((r) => r.valor_liquido))} />} sub={`${pendentes.length} repasses`} icone={Wallet} />
        <KpiCard titulo="Liberados p/ pagar" valor={<Moeda valor={somar(liberados.map((r) => r.valor_liquido))} />} sub={`${liberados.length} — cliente já pagou`} tom={liberados.length ? "ok" : undefined} />
        <KpiCard titulo="Aguardando cliente" valor={<Moeda valor={somar(pendentes.filter((r) => r.seria_adiantado).map((r) => r.valor_liquido))} />} sub="pagar agora = adiantado" tom="alerta" />
        <KpiCard titulo="Abatimentos" valor={<Moeda valor={somar(repasses.map((r) => r.valor_abatimentos))} />} sub="multas, pneus, manutenção" />
      </div>

      <BarraFiltros>
        <FiltroSelectUrl param="placa" rotulo="Placa" opcoes={placas.map((p) => ({ value: p, label: formatPlaca(p) }))} />
        <FiltroSelectUrl param="status" rotulo="Situação" vazio="Pendentes" opcoes={[{ value: "liberado", label: "Liberados" }, { value: "previsto", label: "Previstos" }, { value: "pago", label: "Pagos" }, { value: "todos", label: "Todos" }]} />
        <FiltroDataUrl param="comp" rotulo="Competência" tipo="month" />
        <FiltroSelectUrl param="locador" rotulo="Parceiro" opcoes={locadores.map((l) => ({ value: l.id, label: l.nome }))} />
      </BarraFiltros>

      {repasses.length === 0 && <Vazio icone={Wallet} titulo="Nenhum repasse" descricao="Repasses são criados automaticamente nas medições de veículos sublocados." />}

      {/* uma linha por caminhão, ordenada por parceiro, como na planilha "Valor Repasse" */}
      {repasses.length > 0 && (
        <Card>
          <CardContent className="p-0 sm:p-0">
            {/* células mais estreitas: 10 colunas precisam caber em 1280px */}
            <Table className="text-sm [&_td]:px-2.5 [&_th]:px-2.5 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4">
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>Parceiro</TableHead><TableHead>Contrato</TableHead><TableHead>Placa</TableHead>
                <TableHead>Período</TableHead><TableHead>Faturado / NF</TableHead>
                <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Repasse</TableHead>
                <TableHead>Responsável</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right"><span className="sr-only">Ações</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {repasses.map((r) => {
                  const abs = abatDe(r.id);
                  const aberto = abertos.has(r.id);
                  const alternar = () => setAbertos((x) => { const n = new Set(x); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; });
                  return (
                    <React.Fragment key={r.id}>
                      <TableRow className={cn(r.adiantado && "bg-red-50 dark:bg-red-950/40", r.status === "liberado" && "bg-green-50/60 dark:bg-green-950/20")}>
                        <TableCell className="font-medium">{r.locador_nome}</TableCell>
                        <TableCell><p>{r.cliente_nome}</p>{r.obra_nome && <p className="text-xs text-muted-foreground">{r.obra_nome}</p>}</TableCell>
                        <TableCell className="whitespace-nowrap"><span className="font-mono font-semibold">{formatPlaca(r.placa)}</span><p className="text-xs text-muted-foreground">{r.empresa_apelido}</p></TableCell>
                        <TableCell className="whitespace-nowrap text-xs" title={formatPeriodo(r.periodo_inicio, r.periodo_fim)}>{diaMes(r.periodo_inicio)} a {diaMes(r.periodo_fim)}<p className="text-muted-foreground">{r.dias} dias</p></TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {r.medicao_emissao ? diaMes(r.medicao_emissao) : <span className="text-muted-foreground">a faturar</span>}{r.numero_nf && <span className="font-medium"> · NF {r.numero_nf}</span>}
                          {r.medicao_vencimento && <p className="text-muted-foreground">venc. {diaMes(r.medicao_vencimento)}</p>}
                        </TableCell>
                        <TableCell className="text-right"><Moeda valor={r.medicao_valor} /></TableCell>
                        <TableCell className="text-right">
                          <Moeda valor={r.valor_liquido} className="font-semibold" />
                          {abs.length > 0 && (
                            <button type="button" onClick={alternar} aria-expanded={aberto} className="flex w-full items-center justify-end gap-0.5 whitespace-nowrap text-xs text-status-critico hover:underline">
                              {aberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} −{formatBRL(r.valor_abatimentos)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="max-w-44 text-xs">
                          {r.responsavel_nome ? <p className="truncate" title={r.responsavel_nome}>{r.responsavel_nome}</p> : <span className="text-muted-foreground">—</span>}
                          {(r.responsavel_whatsapp || (r.responsavel_email && r.responsavel_email !== r.responsavel_nome)) && (
                            <p className="truncate text-muted-foreground" title={r.responsavel_email ?? undefined}>{r.responsavel_whatsapp ? maskTelefone(r.responsavel_whatsapp) : r.responsavel_email}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                          {r.adiantado && <Badge variant="critico" className="ml-1"><AlertTriangle className="h-3 w-3" /> Adiantado</Badge>}
                          <p className="whitespace-nowrap text-xs text-muted-foreground">{r.status === "pago" ? formatData(r.data_pagamento) : SITUACAO_CLIENTE[r.medicao_status] ?? r.medicao_status}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Button variant="ghost" size="icon-sm" title={`Extrato de ${r.locador_nome}`} aria-label={`Extrato PDF de ${r.locador_nome}`}
                            onClick={() => extrato(locadorDe(r.locador_id, r.locador_nome), repasses.filter((x) => x.locador_id === r.locador_id))}><FileText /></Button>
                          {r.comprovante_url && <LinkAnexo referencia={r.comprovante_url} rotulo="Comprovante" />}
                          {podeEditar && (r.status === "previsto" || r.status === "liberado") && (
                            <Button size="xs" variant={r.seria_adiantado ? "outline" : "default"} className={cn(r.seria_adiantado && "border-status-critico text-status-critico")} onClick={() => setPagando(r)}>
                              {r.seria_adiantado && <AlertTriangle />} Pagar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {aberto && abs.map((a) => (
                        <TableRow key={a.id} className="bg-muted/30 text-xs hover:bg-muted/30">
                          <TableCell colSpan={6} className="pl-8 text-muted-foreground">
                            (−) {a.descricao}{a.vencimento && ` · ${formatData(a.vencimento)}`}
                            {a.os_numero && <Link className="ml-3 underline" href={`/manutencao/ordens/${a.ordem_servico_id}`}>OS #{a.os_numero}</Link>}
                            {a.conta_pagar_id && <Link className="ml-3 underline" href={`/pagar?id=${a.conta_pagar_id}`}>Conta a pagar</Link>}
                          </TableCell>
                          <TableCell className="text-right"><Moeda valor={-a.valor} className="text-status-critico" /></TableCell>
                          <TableCell colSpan={3} />
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
              <TableFooter><TableRow>
                <TableCell colSpan={5}>{repasses.length} {repasses.length === 1 ? "repasse" : "repasses"} · {new Set(repasses.map((r) => r.locador_id)).size} parceiro(s)</TableCell>
                <TableCell className="text-right"><Moeda valor={somar(repasses.map((r) => r.medicao_valor))} /></TableCell>
                <TableCell className="text-right"><Moeda valor={somar(repasses.map((r) => r.valor_liquido))} /></TableCell>
                <TableCell colSpan={3}>
                  <span className="text-xs text-muted-foreground">Margem </span>
                  <Moeda valor={somar(repasses.map((r) => r.medicao_valor)) - somar(repasses.map((r) => r.valor_bruto))} sinal />
                </TableCell>
              </TableRow></TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      <DialogoLancar aberto={lancando} onOpenChange={setLancando} onEscolher={(r) => { setLancando(false); setPagando(r); }} />
      <DialogoPagar repasse={pagando} locador={pagando ? locadorDe(pagando.locador_id, pagando.locador_nome) : null} onOpenChange={(v) => !v && setPagando(null)} onFeito={() => router.refresh()} />
    </div>
  );
}

/** Passo 1 do lançamento: escolher o repasse pendente; o passo 2 é o diálogo de pagamento. */
function DialogoLancar({ aberto, onOpenChange, onEscolher }: { aberto: boolean; onOpenChange: (v: boolean) => void; onEscolher: (r: Repasse) => void }) {
  const [busca, setBusca] = React.useState("");
  const [itens, setItens] = React.useState<Repasse[] | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setItens(null);
    const t = setTimeout(async () => {
      const r = await buscarRepassesPendentes(busca);
      if (!ativo) return;
      if (r.ok) setItens(r.dados);
      else { toast.error(r.erro); setItens([]); }
    }, busca ? 300 : 0);
    return () => { ativo = false; clearTimeout(t); };
  }, [aberto, busca]);

  React.useEffect(() => { if (!aberto) setBusca(""); }, [aberto]);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        <DialogHeader>
          <DialogTitle>Lançar pagamento de repasse</DialogTitle>
          <DialogDescription>Escolha o repasse que foi pago ao locador. Em seguida você informa a data e o comprovante.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por locador, placa ou cliente…" aria-label="Buscar repasse" className="pl-9" />
        </div>
        <div className="max-h-[50vh] min-h-40 overflow-y-auto">
          {itens === null ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando repasses…</p>
          ) : itens.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{busca ? "Nenhum repasse pendente encontrado." : "Não há repasses pendentes."}</p>
          ) : (
            <ul className="space-y-1">
              {itens.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onEscolher(r)}
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm"><span className="font-semibold">{r.locador_nome}</span> · <span className="font-mono">{formatPlaca(r.placa)}</span> <span className="text-xs text-muted-foreground">{r.empresa_apelido}</span></p>
                      <p className="truncate text-xs text-muted-foreground">{r.cliente_nome} · {formatPeriodo(r.periodo_inicio, r.periodo_fim)} · {r.dias} dias</p>
                    </div>
                    {r.status === "liberado"
                      ? <Badge variant="ok">Cliente pagou</Badge>
                      : <Badge variant="alerta" title="O cliente ainda não pagou esta medição: pagar agora é adiantamento">Aguardando cliente</Badge>}
                    <div className="text-right">
                      <Moeda valor={r.valor_liquido} className="text-sm font-semibold" />
                      {r.valor_abatimentos > 0 && <p className="text-[11px] text-muted-foreground">bruto {formatBRL(r.valor_bruto)}</p>}
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

function DialogoPagar({ repasse: r, locador: l, onOpenChange, onFeito }: { repasse: Repasse | null; locador: Locador | null; onOpenChange: (v: boolean) => void; onFeito: () => void }) {
  const [data, setData] = React.useState(hojeSP());
  const [comprovante, setComprovante] = React.useState<string | null>(null);
  const [confirmo, setConfirmo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  React.useEffect(() => { setData(hojeSP()); setComprovante(null); setConfirmo(false); }, [r?.id]);

  const pagar = async () => {
    if (!r) return;
    setSalvando(true);
    const res = await pagarRepasse({ repasse_id: r.id, data, comprovante_url: comprovante, confirmar_adiantado: confirmo });
    setSalvando(false);
    if (res.ok) {
      toast.success(res.dados.adiantado ? "Repasse pago (adiantado — registrado com sua aprovação)" : "Repasse pago");
      onOpenChange(false);
      onFeito();
    } else if (res.codigo === "CONFIRMACAO_ADIANTAMENTO") {
      toast.warning("O cliente ainda não pagou esta medição. Confirme o adiantamento para continuar.");
    } else toast.error(res.erro);
  };

  return (
    <Dialog open={!!r} onOpenChange={onOpenChange}>
      <DialogContent tamanho="sm">
        <DialogHeader>
          <DialogTitle>Pagar repasse</DialogTitle>
          <DialogDescription>{r && <>{r.locador_nome} · {formatPlaca(r.placa)} · {formatPeriodo(r.periodo_inicio, r.periodo_fim)}</>}</DialogDescription>
        </DialogHeader>
        {r && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Bruto</p><Moeda valor={r.valor_bruto} /></div>
              <div><p className="text-xs text-muted-foreground">Abatimentos</p><Moeda valor={-r.valor_abatimentos} /></div>
              <div><p className="text-xs text-muted-foreground">Líquido a pagar</p><Moeda valor={r.valor_liquido} className="font-bold" /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
              {l?.chave_pix ? (
                <>
                  <span>PIX {l.tipo_chave_pix ? ROTULOS.tipoChavePix[l.tipo_chave_pix] : ""}: <strong className="break-all">{l.chave_pix}</strong></span>
                  <BotaoCopiar texto={l.chave_pix} rotulo="Copiar chave" />
                  {(l.nome_titular_pix || l.banco) && <span className="w-full text-xs text-muted-foreground">{[l.nome_titular_pix, l.banco].filter(Boolean).join(" · ")}</span>}
                </>
              ) : <span className="text-muted-foreground">Sem chave PIX cadastrada — <Link className="underline" href="/cadastros/locadores">cadastrar</Link></span>}
            </div>
            {r.seria_adiantado && (
              <div role="alert" className="space-y-2 rounded-md border-2 border-status-critico bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
                <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Pagamento adiantado</p>
                <p>O cliente <strong>{r.cliente_nome}</strong> ainda não pagou esta medição ({STATUS_MEDICAO[r.medicao_status] ?? r.medicao_status}{r.medicao_vencimento ? `, vencimento ${formatData(r.medicao_vencimento)}` : ""}). O pagamento ficará registrado como adiantado, com seu usuário como aprovador.</p>
                <label className="flex items-center gap-2 font-medium">
                  <Checkbox checked={confirmo} onCheckedChange={(v) => setConfirmo(!!v)} /> Confirmo o pagamento adiantado
                </label>
              </div>
            )}
            <div className="space-y-1.5"><Label htmlFor="pag-data">Data do pagamento</Label><Input id="pag-data" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Comprovante</Label><CampoAnexo bucket="comprovantes" pasta="repasses" valor={comprovante} onChange={setComprovante} /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={pagar} disabled={salvando || (!!r?.seria_adiantado && !confirmo)} variant={r?.seria_adiantado ? "destructive" : "default"}>
            {salvando ? <Loader2 className="animate-spin" /> : <Wallet />} {r?.seria_adiantado ? "Pagar adiantado" : "Registrar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
