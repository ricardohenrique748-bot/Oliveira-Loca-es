"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Loader2, Wallet } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, Checkbox, Label, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/basicos";
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
import { pagarRepasse } from "./actions";

export type Repasse = {
  id: string; medicao_id: string; locador_id: string; locador_nome: string; empresa_id: string; empresa_apelido: string; veiculo_id: string; placa: string;
  valor_repasse_mensal: number; valor_bruto: number; valor_abatimentos: number; valor_liquido: number; data_prevista: string | null; data_pagamento: string | null;
  adiantado: boolean; aprovado_por: string | null; comprovante_url: string | null; status: string; periodo_inicio: string; periodo_fim: string; dias: number;
  numero_nf: string | null; medicao_valor: number; medicao_status: string; medicao_vencimento: string | null; competencia: string; cliente_nome: string; seria_adiantado: boolean;
};
export type Abatimento = { id: string; repasse_id: string; conta_pagar_id: string | null; ordem_servico_id: string | null; descricao: string; valor: number; vencimento: string | null; os_numero: number | null };
export type Locador = { id: string; nome: string; cpf_cnpj: string | null; telefone: string | null; chave_pix: string | null; tipo_chave_pix: keyof typeof ROTULOS.tipoChavePix | null; banco: string | null; nome_titular_pix: string | null };

const STATUS_MEDICAO: Record<string, string> = { a_faturar: "A faturar", faturado: "Faturado (aguardando cliente)", recebido_parcial: "Recebido parcial", recebido: "Cliente pagou", cancelado: "Cancelado" };

export function RepassesCliente({ repasses, abatimentos, locadores, podeEditar }: { repasses: Repasse[]; abatimentos: Abatimento[]; locadores: Locador[]; podeEditar: boolean }) {
  const router = useRouter();
  const [pagando, setPagando] = React.useState<Repasse | null>(null);
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set());

  const grupos = React.useMemo(() => {
    const m = new Map<string, Repasse[]>();
    for (const r of repasses) m.set(r.locador_id, [...(m.get(r.locador_id) ?? []), r]);
    return [...m.entries()].map(([id, rs]) => ({ locador: locadores.find((l) => l.id === id) ?? ({ id, nome: rs[0].locador_nome } as Locador), repasses: rs }));
  }, [repasses, locadores]);
  const abatDe = (id: string) => abatimentos.filter((a) => a.repasse_id === id);

  const pendentes = repasses.filter((r) => r.status === "previsto" || r.status === "liberado");
  const liberados = repasses.filter((r) => r.status === "liberado");

  const extrato = async (loc: Locador, rs: Repasse[]) => {
    const linhas = rs.flatMap((r) => [
      { tipo: "repasse", r, a: null as Abatimento | null },
      ...abatDe(r.id).map((a) => ({ tipo: "abat", r, a })),
    ]);
    const ini = rs.reduce((m, r) => (r.periodo_inicio < m ? r.periodo_inicio : m), rs[0].periodo_inicio);
    const fim = rs.reduce((m, r) => (r.periodo_fim > m ? r.periodo_fim : m), rs[0].periodo_fim);
    await exportarPDF(`extrato_${loc.nome}`, `Extrato do locador — ${loc.nome}`, [
      { titulo: "Placa", valor: (l) => (l.tipo === "repasse" ? formatPlaca(l.r.placa) : "") },
      { titulo: "Cliente / descrição", valor: (l) => (l.tipo === "repasse" ? `${l.r.cliente_nome} · ${l.r.empresa_apelido}` : `   (−) ${l.a!.descricao}`) },
      { titulo: "Período", valor: (l) => (l.tipo === "repasse" ? formatPeriodo(l.r.periodo_inicio, l.r.periodo_fim) : formatData(l.a!.vencimento)) },
      { titulo: "Dias", valor: (l) => (l.tipo === "repasse" ? l.r.dias : null), tipo: "numero" },
      { titulo: "Bruto", valor: (l) => (l.tipo === "repasse" ? l.r.valor_bruto : null), tipo: "moeda" },
      { titulo: "Abatimento", valor: (l) => (l.tipo === "abat" ? l.a!.valor : null), tipo: "moeda" },
      { titulo: "Líquido", valor: (l) => (l.tipo === "repasse" ? l.r.valor_liquido : null), tipo: "moeda" },
      { titulo: "Situação", valor: (l) => (l.tipo === "repasse" ? (l.r.status === "pago" ? `Pago ${formatData(l.r.data_pagamento)}` : l.r.status) : "") },
    ], linhas, {
      subtitulo: `Período: ${formatData(ini)} a ${formatData(fim)}`,
      resumo: [
        ["Locador", `${loc.nome}${loc.cpf_cnpj ? ` — ${loc.cpf_cnpj}` : ""}`],
        ["PIX", loc.chave_pix ? `${loc.tipo_chave_pix ? ROTULOS.tipoChavePix[loc.tipo_chave_pix] + ": " : ""}${loc.chave_pix}${loc.nome_titular_pix ? ` (${loc.nome_titular_pix})` : ""}${loc.banco ? ` — ${loc.banco}` : ""}` : "—"],
        ["Total bruto", formatBRL(somar(rs.map((r) => r.valor_bruto)))],
        ["Abatimentos", formatBRL(somar(rs.map((r) => r.valor_abatimentos)))],
        ["Total líquido", formatBRL(somar(rs.map((r) => r.valor_liquido)))],
      ],
      totais: ["Total", "", "", "", somar(rs.map((r) => r.valor_bruto)), somar(rs.map((r) => r.valor_abatimentos)), somar(rs.map((r) => r.valor_liquido)), ""],
      rodape: ["Valores proporcionais aos dias medidos (base 30). Abatimentos referentes a despesas do veículo marcadas “descontar do locador”."],
    });
  };

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Repasses a locadores"
        descricao="Repasse = (mensal ÷ 30) × dias − despesas “descontar do locador”. Líquido nunca fica negativo: o saldo passa para o próximo repasse." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard titulo="Pendentes (líquido)" valor={<Moeda valor={somar(pendentes.map((r) => r.valor_liquido))} />} sub={`${pendentes.length} repasses`} icone={Wallet} />
        <KpiCard titulo="Liberados p/ pagar" valor={<Moeda valor={somar(liberados.map((r) => r.valor_liquido))} />} sub={`${liberados.length} — cliente já pagou`} tom={liberados.length ? "ok" : undefined} />
        <KpiCard titulo="Aguardando cliente" valor={<Moeda valor={somar(pendentes.filter((r) => r.seria_adiantado).map((r) => r.valor_liquido))} />} sub="pagar agora = adiantado" tom="alerta" />
        <KpiCard titulo="Abatimentos" valor={<Moeda valor={somar(repasses.map((r) => r.valor_abatimentos))} />} sub="multas, pneus, manutenção" />
      </div>

      <BarraFiltros>
        <FiltroSelectUrl param="status" rotulo="Situação" vazio="Pendentes" opcoes={[{ value: "liberado", label: "Liberados" }, { value: "previsto", label: "Previstos" }, { value: "pago", label: "Pagos" }, { value: "todos", label: "Todos" }]} />
        <FiltroDataUrl param="comp" rotulo="Competência" tipo="month" />
        <FiltroSelectUrl param="locador" rotulo="Locador" opcoes={locadores.map((l) => ({ value: l.id, label: l.nome }))} />
      </BarraFiltros>

      {grupos.length === 0 && <Vazio icone={Wallet} titulo="Nenhum repasse" descricao="Repasses são criados automaticamente nas medições de veículos sublocados." />}

      {grupos.map(({ locador: l, repasses: rs }) => (
        <Card key={l.id}>
          <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-display text-xl font-semibold tracking-tight">{l.nome}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {l.chave_pix ? (
                  <>
                    <span>PIX {l.tipo_chave_pix ? ROTULOS.tipoChavePix[l.tipo_chave_pix] : ""}: <strong className="break-all text-foreground">{l.chave_pix}</strong></span>
                    <BotaoCopiar texto={l.chave_pix} rotulo="Copiar chave" />
                    {l.nome_titular_pix && <span>· {l.nome_titular_pix}</span>}
                    {l.banco && <span>· {l.banco}</span>}
                  </>
                ) : <span>Sem chave PIX cadastrada — <Link className="underline" href="/cadastros/locadores">cadastrar</Link></span>}
                {l.telefone && <span>· {maskTelefone(l.telefone)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-sm">
                <p className="text-xs text-muted-foreground">Líquido</p>
                <Moeda valor={somar(rs.map((r) => r.valor_liquido))} className="text-lg font-bold" />
              </div>
              <Button variant="outline" size="sm" onClick={() => extrato(l, rs)}><FileText /> Extrato PDF</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>Placa / cliente</TableHead><TableHead>Período</TableHead><TableHead className="text-right">Dias</TableHead>
                <TableHead className="text-right">Bruto</TableHead><TableHead className="text-right">Abatimentos</TableHead><TableHead className="text-right">Líquido</TableHead>
                <TableHead>Cliente pagou?</TableHead><TableHead>Status</TableHead><TableHead className="text-right"><span className="sr-only">Ações</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rs.map((r) => {
                  const abs = abatDe(r.id);
                  const aberto = abertos.has(r.id);
                  return (
                    <React.Fragment key={r.id}>
                      <TableRow className={cn(r.adiantado && "bg-red-50 dark:bg-red-950/40", r.status === "liberado" && "bg-green-50/60 dark:bg-green-950/20")}>
                        <TableCell>
                          <span className="font-mono font-semibold">{formatPlaca(r.placa)}</span> <span className="text-xs text-muted-foreground">{r.empresa_apelido}</span>
                          <p className="text-xs text-muted-foreground">{r.cliente_nome}{r.numero_nf ? ` · NF ${r.numero_nf}` : ""}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatPeriodo(r.periodo_inicio, r.periodo_fim)}</TableCell>
                        <TableCell className="num text-right">{r.dias}</TableCell>
                        <TableCell className="text-right"><Moeda valor={r.valor_bruto} /></TableCell>
                        <TableCell className="text-right">
                          {abs.length ? (
                            <button type="button" className="inline-flex items-center gap-1 hover:underline" aria-expanded={aberto}
                              onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>
                              {aberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              <Moeda valor={-r.valor_abatimentos} className="text-status-critico" />
                            </button>
                          ) : <Moeda valor={0} className="text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="text-right font-semibold"><Moeda valor={r.valor_liquido} /></TableCell>
                        <TableCell>
                          <Badge variant={r.medicao_status === "recebido" ? "ok" : r.medicao_status === "recebido_parcial" ? "alerta" : "neutro"}>{STATUS_MEDICAO[r.medicao_status] ?? r.medicao_status}</Badge>
                          {r.medicao_vencimento && r.medicao_status !== "recebido" && <p className="text-xs text-muted-foreground">venc. {formatData(r.medicao_vencimento)}</p>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                          {r.adiantado && <Badge variant="critico" className="ml-1"><AlertTriangle className="h-3 w-3" /> Adiantado</Badge>}
                          {r.status === "pago" && <p className="text-xs text-muted-foreground">{formatData(r.data_pagamento)}</p>}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.comprovante_url && <LinkAnexo referencia={r.comprovante_url} rotulo="Comprovante" />}
                          {podeEditar && (r.status === "previsto" || r.status === "liberado") && (
                            <Button size="xs" variant={r.seria_adiantado ? "outline" : "default"} className={cn(r.seria_adiantado && "border-status-critico text-status-critico")} onClick={() => setPagando(r)}>
                              {r.seria_adiantado && <AlertTriangle />} Pagar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {aberto && abs.map((a) => (
                        <TableRow key={a.id} className="bg-muted/30 text-sm hover:bg-muted/30">
                          <TableCell colSpan={4} className="pl-8 text-muted-foreground">
                            (−) {a.descricao} {a.vencimento && <span className="text-xs">· {formatData(a.vencimento)}</span>}
                          </TableCell>
                          <TableCell className="text-right"><Moeda valor={-a.valor} className="text-status-critico" /></TableCell>
                          <TableCell colSpan={4} className="text-xs">
                            {a.os_numero && <Link className="mr-3 underline" href={`/manutencao/ordens/${a.ordem_servico_id}`}>OS #{a.os_numero}</Link>}
                            {a.conta_pagar_id && <Link className="underline" href={`/pagar?id=${a.conta_pagar_id}`}>Conta a pagar</Link>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
              <TableFooter><TableRow>
                <TableCell colSpan={3}>{rs.length} repasse(s)</TableCell>
                <TableCell className="text-right"><Moeda valor={somar(rs.map((r) => r.valor_bruto))} /></TableCell>
                <TableCell className="text-right"><Moeda valor={-somar(rs.map((r) => r.valor_abatimentos))} /></TableCell>
                <TableCell className="text-right"><Moeda valor={somar(rs.map((r) => r.valor_liquido))} /></TableCell>
                <TableCell colSpan={3} />
              </TableRow></TableFooter>
            </Table>
          </CardContent>
        </Card>
      ))}

      <DialogoPagar repasse={pagando} onOpenChange={(v) => !v && setPagando(null)} onFeito={() => router.refresh()} />
    </div>
  );
}

function DialogoPagar({ repasse: r, onOpenChange, onFeito }: { repasse: Repasse | null; onOpenChange: (v: boolean) => void; onFeito: () => void }) {
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
