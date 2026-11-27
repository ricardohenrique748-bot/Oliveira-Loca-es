"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, FileSignature, FileText, Loader2, Plus, Receipt, Search, Wallet } from "lucide-react";
import { DialogoDetalhe, type LinhaMedicao } from "../medicoes/client";
import { carregarFatura } from "../medicoes/carregar-fatura";
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
import { InputMoeda } from "@/components/app/campos";
import { alterarValorRepasse, buscarRepassesPendentes, definirDescontosRepasse, despesasParaPagar, pagarRepasse, type DespesaPlaca } from "./actions";
import { DialogoReciboDescontos, DialogoReciboRepasse } from "./recibo";

export type Repasse = {
  id: string; medicao_id: string; locador_id: string; locador_nome: string; empresa_id: string; empresa_apelido: string; veiculo_id: string; placa: string;
  valor_repasse_mensal: number; valor_bruto: number; valor_abatimentos: number; valor_liquido: number; data_prevista: string | null; data_pagamento: string | null;
  adiantado: boolean; aprovado_por: string | null; comprovante_url: string | null; status: string; periodo_inicio: string; periodo_fim: string; dias: number; dias_placa?: number | null;
  numero_nf: string | null; medicao_valor: number; medicao_status: string; medicao_vencimento: string | null; competencia: string; cliente_nome: string; seria_adiantado: boolean;
  obra_nome: string | null; medicao_emissao: string | null; contrato_numero: string | null;
  responsavel_nome: string | null; responsavel_whatsapp: string | null; responsavel_email: string | null;
};
export type Abatimento = { id: string; repasse_id: string; conta_pagar_id: string | null; ordem_servico_id: string | null; descricao: string; valor: number; vencimento: string | null; os_numero: number | null };
/** Despesa "descontar do locador" que ainda não foi abatida: espera o próximo repasse da placa (que nasce com a fatura). */
export type DescontoPendente = {
  id: string; placa: string | null; veiculo_id: string | null; descricao: string | null; fornecedor_nome: string | null; vencimento: string | null;
  valor: number; valor_locador: number | null; valor_abatido: number; saldo: number; empresa_apelido: string; locador_id: string | null;
};
export type Locador = { id: string; nome: string; cpf_cnpj: string | null; telefone: string | null; chave_pix: string | null; tipo_chave_pix: keyof typeof ROTULOS.tipoChavePix | null; banco: string | null; nome_titular_pix: string | null };

const SEM_DESCONTOS: DescontoPendente[] = [];

/** despesa da placa no bloco "Despesas da placa": quanto está em cada fatura aberta e quanto ainda espera */
type DespesaDaPlaca = { id: string; descricao: string; vencimento: string | null; fornecedor: string | null; porRepasse: Record<string, number>; pendente: number };

/** "2026-08-21" → "21/08" (como na planilha; o ano está no filtro de competência) */
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** situação da medição em uma palavra, para a coluna Status da tabela */
const SITUACAO_CLIENTE: Record<string, string> = { a_faturar: "a faturar", faturado: "aguard. cliente", recebido_parcial: "receb. parcial", recebido: "cliente pagou", cancelado: "cancelado" };
const STATUS_MEDICAO: Record<string, string> = { a_faturar: "A faturar", faturado: "Faturado (aguardando cliente)", recebido_parcial: "Recebido parcial", recebido: "Cliente pagou", cancelado: "Cancelado" };

export function RepassesCliente({ repasses, abatimentos, locadores, placas, descontosPendentes = [], acrescimos = [], podeEditar, podeEditarFatura = false, baseDias = 30 }: {
  /** acréscimos gravados no recibo de cada repasse (saem no extrato) */ acrescimos?: { repasse_id: string; descricao: string; valor: number }[];
  repasses: Repasse[]; abatimentos: Abatimento[]; locadores: Locador[]; placas: string[]; descontosPendentes?: DescontoPendente[]; podeEditar: boolean; podeEditarFatura?: boolean; baseDias?: number;
}) {
  const [abrindoFatura, setAbrindoFatura] = React.useState<string | null>(null);
  const [fatura, setFatura] = React.useState<LinhaMedicao | null>(null);
  /** abre a janela da fatura (medição) deste repasse — a mesma do Faturamento */
  const verFatura = async (r: Repasse) => {
    setAbrindoFatura(r.id);
    try {
      const f = await carregarFatura(r.medicao_id);
      if (f) setFatura(f); else toast.error("Fatura não encontrada");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível abrir a fatura"); }
    finally { setAbrindoFatura(null); }
  };
  const router = useRouter();
  const [pagando, setPagando] = React.useState<Repasse | null>(null);
  const [lancando, setLancando] = React.useState(false);
  // recibo do repasse para o locador assinar (acréscimos/descontos ficam salvos no repasse)
  const [recibo, setRecibo] = React.useState<Repasse | null>(null);
  const [reciboDescontos, setReciboDescontos] = React.useState<{ placa: string | null; ds: DescontoPendente[] } | null>(null);
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set());
  // placas com repasse aberto na lista: as despesas pendentes delas aparecem dentro do repasse, desmarcadas
  const placasAbertas = React.useMemo(() => new Set(repasses.filter((r) => r.status === "previsto" || r.status === "liberado").map((r) => r.veiculo_id)), [repasses]);
  // descontos sem repasse: uma linha por placa na própria tabela, "aguardando fatura"
  const aguardando = React.useMemo(() => {
    const m = new Map<string, DescontoPendente[]>();
    for (const d of descontosPendentes) {
      if (d.veiculo_id && placasAbertas.has(d.veiculo_id)) continue; const k = d.veiculo_id ?? d.placa ?? d.id; m.set(k, [...(m.get(k) ?? []), d]); }
    return [...m.entries()].map(([k, ds]) => ({ k, placa: ds[0].placa, empresa: ds[0].empresa_apelido, locador_id: ds[0].locador_id, ds, total: somar(ds.map((d) => d.saldo)) }))
      .sort((a, b) => (a.placa ?? "").localeCompare(b.placa ?? ""));
  }, [descontosPendentes, placasAbertas]);

  const locadorDe = (id: string, nome: string) => locadores.find((l) => l.id === id) ?? ({ id, nome } as Locador);
  const abatDe = (id: string) => abatimentos.filter((a) => a.repasse_id === id);
  const aberta = (r: Repasse) => r.status === "previsto" || r.status === "liberado";
  /** faturas agrupadas por placa: as despesas da placa aparecem uma vez só, depois da última fatura dela */
  const ordenados = React.useMemo(() => [...repasses].sort((a, b) =>
    a.locador_nome.localeCompare(b.locador_nome) || a.placa.localeCompare(b.placa) || a.periodo_inicio.localeCompare(b.periodo_inicio)), [repasses]);
  /** todas as despesas "descontar do locador" da placa juntas: onde estão hoje (repasse aberto) e o que ainda espera */
  const despesasDaPlaca = (veiculoId: string): DespesaDaPlaca[] => {
    const abertasIds = new Set(repasses.filter((r) => r.veiculo_id === veiculoId && aberta(r)).map((r) => r.id));
    const m = new Map<string, DespesaDaPlaca>();
    for (const a of abatimentos) {
      if (!a.conta_pagar_id || !abertasIds.has(a.repasse_id)) continue;
      const d = m.get(a.conta_pagar_id) ?? { id: a.conta_pagar_id, descricao: a.descricao, vencimento: a.vencimento, fornecedor: null, porRepasse: {}, pendente: 0 };
      d.porRepasse[a.repasse_id] = (d.porRepasse[a.repasse_id] ?? 0) + a.valor;
      m.set(d.id, d);
    }
    for (const x of descontosPendentes) {
      if (x.veiculo_id !== veiculoId) continue;
      const d = m.get(x.id) ?? { id: x.id, descricao: x.descricao ?? "Despesa", vencimento: x.vencimento, fornecedor: null, porRepasse: {}, pendente: 0 };
      d.pendente += x.saldo;
      d.fornecedor = x.fornecedor_nome;
      m.set(x.id, d);
    }
    return [...m.values()].sort((a, b) => (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999") || a.descricao.localeCompare(b.descricao));
  };
  /** despesas escolhidas no bloco da placa para o "Pagar" (a tela de pagamento abre com elas marcadas) */
  const [selecaoPagar, setSelecaoPagar] = React.useState<string[] | null>(null);

  const pendentes = repasses.filter((r) => r.status === "previsto" || r.status === "liberado");
  const liberados = repasses.filter((r) => r.status === "liberado");

  /**
   * PDF enviado ao locador: valor do repasse (mensal ÷ 30 × dias), despesas descontadas e líquido.
   * Faturas em cima (uma por linha) e TODAS as despesas descontadas juntas embaixo, por data — sem separar por fatura.
   */
  const extrato = async (loc: Locador, rs: Repasse[], abatsSimulados?: Abatimento[], ficaParaDepois = 0) => {
    type L = { tipo: "repasse" | "secao" | "abat" | "secaoAcr" | "acr"; r: Repasse; a: Abatimento | null };
    // acréscimos do recibo (somam ao repasse do período)
    const acrs = rs.flatMap((r) => acrescimos.filter((x) => x.repasse_id === r.id)
      .map((x): L => ({ tipo: "acr", r, a: { id: `acr-${r.id}-${x.descricao}`, repasse_id: r.id, conta_pagar_id: null, ordem_servico_id: null, descricao: x.descricao, valor: x.valor, vencimento: null, os_numero: null } })));
    const totalAcr = somar(acrs.map((l) => l.a!.valor));
    // simulados: a fatura escolhida no bloco da placa com as despesas marcadas (antes de pagar)
    const abatsDe = (id: string) => (abatsSimulados ? abatsSimulados.filter((a) => a.repasse_id === id) : abatDe(id));
    const descontos = rs.flatMap((r) => abatsDe(r.id).map((a): L => ({ tipo: "abat", r, a })))
      .sort((x, y) => (x.a!.vencimento ?? "9999").localeCompare(y.a!.vencimento ?? "9999") || x.a!.descricao.localeCompare(y.a!.descricao));
    const linhas: L[] = [
      ...rs.map((r): L => ({ tipo: "repasse", r, a: null })),
      ...(acrs.length ? [{ tipo: "secaoAcr", r: rs[0], a: null } as L, ...acrs] : []),
      ...(descontos.length ? [{ tipo: "secao", r: rs[0], a: null } as L, ...descontos] : []),
    ];
    const ini = rs.reduce((m, r) => (r.periodo_inicio < m ? r.periodo_inicio : m), rs[0].periodo_inicio);
    const fim = rs.reduce((m, r) => (r.periodo_fim > m ? r.periodo_fim : m), rs[0].periodo_fim);
    await exportarPDF(`extrato_${loc.nome}`, `Extrato do locador — ${loc.nome}`, [
      { titulo: "Placa", valor: (l) => (l.tipo === "secao" || l.tipo === "secaoAcr" ? "" : formatPlaca(l.r.placa)) },
      { titulo: "Cliente / descrição", valor: (l) => (l.tipo === "repasse" ? `${l.r.cliente_nome} · ${l.r.empresa_apelido}` : l.tipo === "secao" ? (rs.length > 1 ? "DESPESAS DESCONTADAS (todas as faturas)" : "DESPESAS DESCONTADAS") : l.tipo === "secaoAcr" ? "ACRÉSCIMOS" : l.tipo === "acr" ? `(+) ${l.a!.descricao}` : `(-) ${l.a!.descricao}`) },
      { titulo: "Período / data", valor: (l) => (l.tipo === "repasse" ? formatPeriodo(l.r.periodo_inicio, l.r.periodo_fim) : l.tipo === "abat" ? formatData(l.a!.vencimento) : "") },
      { titulo: "Dias", valor: (l) => (l.tipo === "repasse" ? l.r.dias_placa ?? l.r.dias : null), tipo: "numero" },
      // repasse do período = bruto (+ acréscimos do recibo): é o que o locador tem a receber antes das despesas
      // período: mensal ÷ 30 × dias; os acréscimos vêm em linhas próprias
      { titulo: "Repasse", valor: (l) => (l.tipo === "repasse" ? l.r.valor_bruto : l.tipo === "acr" ? l.a!.valor : null), tipo: "moeda" },
      { titulo: "Abatimento", valor: (l) => (l.tipo === "abat" ? l.a!.valor : null), tipo: "moeda" },
      { titulo: "Líquido", valor: (l) => (l.tipo === "repasse" ? l.r.valor_liquido : null), tipo: "moeda" },
      { titulo: "Situação", valor: (l) => (l.tipo === "repasse" ? (l.r.status === "pago" ? `Pago ${formatData(l.r.data_pagamento)}` : l.r.status) : "") },
    ], linhas, {
      subtitulo: `Período: ${formatData(ini)} a ${formatData(fim)}`,
      resumo: [
        ["Locador", `${loc.nome}${loc.cpf_cnpj ? ` — ${loc.cpf_cnpj}` : ""}`],
        ["PIX", loc.chave_pix ? `${loc.tipo_chave_pix ? ROTULOS.tipoChavePix[loc.tipo_chave_pix] + ": " : ""}${loc.chave_pix}${loc.nome_titular_pix ? ` (${loc.nome_titular_pix})` : ""}${loc.banco ? ` — ${loc.banco}` : ""}` : "—"],
        ["Repasse do período", formatBRL(somar(rs.map((r) => r.valor_bruto)))],
        ...(totalAcr > 0 ? [["Acréscimos", formatBRL(totalAcr)] as [string, string]] : []),
        ["Abatimentos", formatBRL(somar(rs.map((r) => r.valor_abatimentos)))],
        ["Total líquido", formatBRL(somar(rs.map((r) => r.valor_liquido)))],
        ...(ficaParaDepois > 0 ? [["Fica para o próximo repasse", `${formatBRL(ficaParaDepois)} (despesas que não couberam nesta fatura)`] as [string, string]] : []),
        ...(somar(rs.map((r) => r.valor_liquido)) < 0 ? [["Saldo do locador", `${loc.nome} deve ${formatBRL(-somar(rs.map((r) => r.valor_liquido)))} (despesas maiores que o repasse)`] as [string, string]] : []),
      ],
      totais: ["Total", "", "", "", somar(rs.map((r) => r.valor_bruto)) + totalAcr, somar(rs.map((r) => r.valor_abatimentos)), somar(rs.map((r) => r.valor_liquido)), ""],
      rodape: ["Valores proporcionais aos dias medidos (base 30). Abatimentos referentes a despesas do veículo marcadas “descontar do locador”.",
        ...(ficaParaDepois > 0 ? ["O desconto em cada fatura vai até o valor dela (o líquido não fica negativo); o que não coube é descontado no próximo repasse da placa."] : [])],
    });
  };

  /** extrato só da fatura escolhida no bloco da placa, com as despesas marcadas (como ficará ao pagar) */
  const r2 = (v: number) => Math.round(v * 100) / 100;
  /** quanto ainda cabe de despesas nesta fatura: bruto (+ acréscimos) − descontos da própria fatura/recibo */
  /** extrato só da fatura escolhida no bloco da placa, com as despesas marcadas (como ficará ao pagar) */
  const extratoSelecao = (f: Repasse, ids: string[]) => {
    const daFatura = abatDe(f.id).filter((a) => !a.conta_pagar_id); // descontos da fatura/recibo saem primeiro
    const sim: Abatimento[] = [...daFatura];
    for (const d of despesasDaPlaca(f.veiculo_id).filter((x) => ids.includes(x.id))) {
      sim.push({ id: `sim-${d.id}`, repasse_id: f.id, conta_pagar_id: d.id, ordem_servico_id: null, descricao: d.descricao,
        valor: r2(somar(Object.values(d.porRepasse)) + d.pendente), vencimento: d.vencimento, os_numero: null });
    }
    const total = r2(somar(sim.map((a) => a.valor)));
    // o líquido pode ficar negativo: é o saldo que o locador fica devendo
    void extrato(locadorDe(f.locador_id, f.locador_nome),
      [{ ...f, valor_abatimentos: total, valor_liquido: r2(f.valor_liquido + f.valor_abatimentos - total) }], sim);
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

      {repasses.length === 0 && !aguardando.length && <Vazio icone={Wallet} titulo="Nenhum repasse" descricao="Repasses são criados automaticamente nas medições de veículos sublocados." />}

      {/* uma linha por caminhão, ordenada por parceiro, como na planilha "Valor Repasse" */}
      {(repasses.length > 0 || aguardando.length > 0) && (
        <Card>
          <CardContent className="p-0 sm:p-0">
            {/* 8 colunas: período+NF e contrato+responsável juntos, para caber na tela sem cortar */}
            <Table className="tabela-cartoes text-sm [&_td]:px-2.5 [&_th]:px-2.5 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4">
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>Parceiro</TableHead><TableHead>Contrato</TableHead><TableHead>Placa</TableHead>
                <TableHead>Período / NF</TableHead>
                <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Repasse</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right"><span className="sr-only">Ações</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ordenados.map((r, i) => {
                  const abs = abatDe(r.id).filter((a) => !aberta(r) || !a.conta_pagar_id);
                  const ultimoDaPlaca = ordenados[i + 1]?.veiculo_id !== r.veiculo_id;
                  const aberto = abertos.has(r.id);
                  const alternar = () => setAbertos((x) => { const n = new Set(x); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; });
                  return (
                    <React.Fragment key={r.id}>
                      <TableRow className={cn(r.adiantado && "bg-red-50 dark:bg-red-950/40", r.status === "liberado" && "bg-green-50/60 dark:bg-green-950/20")}>
                        <TableCell data-rotulo="Parceiro" className="font-medium">{r.locador_nome}</TableCell>
                        <TableCell data-rotulo="Contrato" className="max-w-52">
                          <p>{r.cliente_nome}</p>{r.obra_nome && <p className="text-xs text-muted-foreground">{r.obra_nome}</p>}
                          {r.responsavel_nome && <p className="truncate text-xs text-muted-foreground" title={[r.responsavel_nome, r.responsavel_whatsapp ? maskTelefone(r.responsavel_whatsapp) : r.responsavel_email].filter(Boolean).join(" · ")}>
                            Resp.: {r.responsavel_nome}{r.responsavel_whatsapp && ` · ${maskTelefone(r.responsavel_whatsapp)}`}</p>}
                        </TableCell>
                        <TableCell data-rotulo="Placa" className="whitespace-nowrap"><span className="font-mono font-semibold">{formatPlaca(r.placa)}</span><p className="text-xs text-muted-foreground">{r.empresa_apelido}</p></TableCell>
                        <TableCell data-rotulo="Período / NF" className="whitespace-nowrap text-xs" title={formatPeriodo(r.periodo_inicio, r.periodo_fim)}>{diaMes(r.periodo_inicio)} a {diaMes(r.periodo_fim)} <span className="text-muted-foreground">· {r.dias_placa ?? r.dias} dias</span>
                          <p className="text-muted-foreground">{r.medicao_emissao ? `fat. ${diaMes(r.medicao_emissao)}` : "a faturar"}{r.numero_nf && <span className="font-medium text-foreground"> · NF {r.numero_nf}</span>}</p>
                          <button type="button" onClick={() => void verFatura(r)} disabled={abrindoFatura === r.id} title="Abrir a fatura deste repasse"
                            className="mt-0.5 inline-flex items-center gap-1 text-primary-ink underline decoration-dotted underline-offset-2 hover:decoration-solid disabled:opacity-60">
                            {abrindoFatura === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Receipt className="h-3 w-3" />} Ver fatura
                          </button>
                          {r.medicao_vencimento && <p className="text-muted-foreground">venc. {diaMes(r.medicao_vencimento)}</p>}
                        </TableCell>
                        <TableCell data-rotulo="Valor da fatura" className="text-right"><Moeda valor={r.medicao_valor} /></TableCell>
                        <TableCell data-rotulo="Repasse" className="text-right">
                          {/* em destaque o repasse do período (antes das despesas); o líquido sai embaixo */}
                          <Moeda valor={Math.round((r.valor_liquido + r.valor_abatimentos) * 100) / 100} className="font-semibold" />
                          {/* fatura avulsa sem valor de repasse digitado: nasce zerada (SQL 0091) */}
                          {!r.valor_bruto && (r.status === "previsto" || r.status === "liberado") && (
                            <p><Badge variant="alerta" className="whitespace-nowrap"><AlertTriangle className="h-3 w-3" /> Definir valor</Badge></p>
                          )}
                          {podeEditar && (r.status === "previsto" || r.status === "liberado") && (
                            <ValorMensalRepasse repasse={r} onSalvo={() => router.refresh()} />
                          )}
                          {/* o repasse do período: mensal ÷ 30 × dias (o que o locador recebe antes das despesas) */}
                          <p className="whitespace-nowrap text-[11px] text-muted-foreground" title="Valor mensal ÷ 30 × dias da placa na fatura">{r.dias_placa ?? r.dias} dias = {formatBRL(r.valor_bruto)}</p>
                          {acrescimos.filter((x) => x.repasse_id === r.id).map((x, k) => (
                            <p key={k} className="whitespace-nowrap text-[11px] text-muted-foreground" title="Acréscimo lançado no recibo deste repasse">+ {x.descricao} {formatBRL(x.valor)}</p>
                          ))}
                          {abs.length > 0 ? (
                            <button type="button" onClick={alternar} aria-expanded={aberto} className="flex w-full items-center justify-end gap-0.5 whitespace-nowrap text-xs text-muted-foreground hover:underline">
                              {aberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} despesas {formatBRL(r.valor_abatimentos)}
                            </button>
                          ) : r.valor_abatimentos > 0 && <p className="whitespace-nowrap text-xs text-muted-foreground" title="Despesas da placa descontadas nesta fatura (veja o bloco da placa)">despesas {formatBRL(r.valor_abatimentos)}</p>}
                          {r.valor_abatimentos > 0 && <p className="whitespace-nowrap text-xs font-medium" title="Repasse do período menos as despesas: o que vai ser pago">líquido {formatBRL(r.valor_liquido)}</p>}
                        </TableCell>
                        <TableCell data-rotulo="Status">
                          <StatusBadge status={r.status} />
                          {r.adiantado && <Badge variant="critico" className="ml-1"><AlertTriangle className="h-3 w-3" /> Adiantado</Badge>}
                          <p className="whitespace-nowrap text-xs text-muted-foreground">{r.status === "pago" ? formatData(r.data_pagamento) : SITUACAO_CLIENTE[r.medicao_status] ?? r.medicao_status}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          {/* ícones em cima e "Pagar" embaixo: a coluna fica estreita e a tabela cabe na tela; no celular, lado a lado */}
                          <div className="flex items-center gap-2 md:flex-col md:items-end md:gap-1">
                          <div className="flex items-center justify-end whitespace-nowrap">
                          <Button variant="ghost" size="icon-sm" title="Extrato desta fatura (PDF)" aria-label={`Extrato PDF da fatura ${formatPlaca(r.placa)} ${formatPeriodo(r.periodo_inicio, r.periodo_fim)}`}
                            onClick={() => extrato(locadorDe(r.locador_id, r.locador_nome), [r])}><FileText /></Button>
                          <Button variant="ghost" size="icon-sm" title="Recibo do repasse (PDF)" aria-label={`Recibo do repasse ${formatPlaca(r.placa)}`}
                            onClick={() => setRecibo(r)}><FileSignature /></Button>
                          {r.comprovante_url && <LinkAnexo referencia={r.comprovante_url} rotulo="Comprovante" />}
                          </div>
                          {podeEditar && (r.status === "previsto" || r.status === "liberado") && (
                            <Button size="xs" variant={r.seria_adiantado ? "outline" : "default"} className={cn(r.seria_adiantado && "border-status-critico text-status-critico")} onClick={() => { setSelecaoPagar(null); setPagando(r); }}>
                              {r.seria_adiantado && <AlertTriangle />} Pagar
                            </Button>
                          )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {aberto && abs.map((a) => (
                        <TableRow key={a.id} className="bg-muted/30 text-xs hover:bg-muted/30">
                          <TableCell colSpan={5} className="pl-8 text-muted-foreground">
                            (−) {a.descricao}{a.vencimento && ` · ${formatData(a.vencimento)}`}
                            {a.os_numero && <Link className="ml-3 underline" href={`/manutencao/ordens/${a.ordem_servico_id}`}>OS #{a.os_numero}</Link>}
                            {a.conta_pagar_id && <Link className="ml-3 underline" href={`/pagar?id=${a.conta_pagar_id}`}>Conta a pagar</Link>}
                          </TableCell>
                          <TableCell className="text-right"><Moeda valor={-a.valor} className="text-status-critico" /></TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      ))}
                      {ultimoDaPlaca && <BlocoDespesasPlaca placa={r.placa} veiculoId={r.veiculo_id} despesas={despesasDaPlaca(r.veiculo_id)}
                        faturas={ordenados.filter((x) => x.veiculo_id === r.veiculo_id && aberta(x))} podeEditar={podeEditar}
                        onPagar={(f, ids) => { setSelecaoPagar(ids); setPagando(f); }} onExtrato={extratoSelecao}
                        onDefinir={async (f, ids) => { const res = await definirDescontosRepasse(f.id, ids); if (!res.ok) { toast.error(res.erro); return false; } router.refresh(); return true; }}
                        aberto={!abertos.has(`placa-${r.veiculo_id}`)} onAlternar={() => setAbertos((x) => { const n = new Set(x); const k = `placa-${r.veiculo_id}`; if (n.has(k)) n.delete(k); else n.add(k); return n; })} />}
                    </React.Fragment>
                  );
                })}
                {aguardando.map((g) => {
                  const aberto = abertos.has(g.k);
                  const alternar = () => setAbertos((x) => { const n = new Set(x); if (n.has(g.k)) n.delete(g.k); else n.add(g.k); return n; });
                  return (
                    <React.Fragment key={`aguardando-${g.k}`}>
                      <TableRow className="text-muted-foreground">
                        <TableCell className="font-medium text-foreground">{locadores.find((l) => l.id === g.locador_id)?.nome ?? "—"}</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell className="whitespace-nowrap"><span className="font-mono font-semibold text-foreground">{g.placa ? formatPlaca(g.placa) : "—"}</span><p className="text-xs">{g.empresa}</p></TableCell>
                        <TableCell className="whitespace-nowrap text-xs">sem fatura</TableCell>
                        <TableCell className="text-right">—</TableCell>
                        <TableCell className="text-right">
                          <button type="button" onClick={alternar} aria-expanded={aberto} className="flex w-full items-center justify-end gap-0.5 whitespace-nowrap text-xs text-status-critico hover:underline">
                            {aberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} −{formatBRL(g.total)}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="alerta">Aguardando fatura</Badge>
                          <p className="text-xs">desconta no repasse</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon-sm" title="Recibo dos descontos (PDF)" aria-label={`Recibo dos descontos ${g.placa ? formatPlaca(g.placa) : ""}`}
                            onClick={() => setReciboDescontos(g)}><FileSignature /></Button>
                        </TableCell>
                      </TableRow>
                      {aberto && g.ds.map((d) => (
                        <TableRow key={d.id} className="bg-muted/30 text-xs hover:bg-muted/30">
                          <TableCell colSpan={5} className="pl-8 text-muted-foreground">
                            (−) {d.descricao ?? "Despesa"}{d.fornecedor_nome && ` · ${d.fornecedor_nome}`}{d.vencimento && ` · ${formatData(d.vencimento)}`}
                            <Link className="ml-3 underline" href={`/pagar?id=${d.id}`}>Conta a pagar</Link>
                          </TableCell>
                          <TableCell className="text-right"><Moeda valor={-d.saldo} className="text-status-critico" /></TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
              <TableFooter><TableRow>
                <TableCell colSpan={4}>{repasses.length} {repasses.length === 1 ? "repasse" : "repasses"} · {new Set(repasses.map((r) => r.locador_id)).size} parceiro(s)
                  {aguardando.length > 0 && <span className="text-xs text-muted-foreground"> · {aguardando.length} placa(s) aguardando fatura (−{formatBRL(somar(aguardando.map((g) => g.total)))})</span>}</TableCell>
                <TableCell className="text-right"><Moeda valor={somar(repasses.map((r) => r.medicao_valor))} /></TableCell>
                <TableCell className="text-right"><Moeda valor={somar(repasses.map((r) => r.valor_liquido))} /></TableCell>
                <TableCell colSpan={2}>
                  <span className="text-xs text-muted-foreground">Margem </span>
                  <Moeda valor={somar(repasses.map((r) => r.medicao_valor)) - somar(repasses.map((r) => r.valor_bruto))} sinal />
                </TableCell>
              </TableRow></TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      <DialogoReciboRepasse onExtrato={(ids) => { const rs = repasses.filter((x) => ids.includes(x.id)); if (rs.length) void extrato(locadorDe(rs[0].locador_id, rs[0].locador_nome), rs); }}
        repasse={recibo ? repasses.find((x) => x.id === recibo.id) ?? recibo : null} doParceiro={recibo ? repasses.filter((x) => x.locador_id === recibo.locador_id && x.status !== "cancelado"
          // da placa clicada, todos (até os pagos, para reemitir); das outras placas, só os que ainda vão ser pagos
          && (x.veiculo_id === recibo.veiculo_id || x.status !== "pago")) : []}
        podeEditar={podeEditar} onOpenChange={(v) => !v && setRecibo(null)} onSalvo={() => router.refresh()} />
      <DialogoReciboDescontos placa={reciboDescontos?.placa ?? null} descontos={reciboDescontos?.ds ?? SEM_DESCONTOS} onOpenChange={(v) => !v && setReciboDescontos(null)} />
      <DialogoDetalhe medicao={fatura} baseDias={baseDias} podeEditar={podeEditarFatura} onOpenChange={(v) => !v && setFatura(null)}
        onSalvo={() => { setFatura(null); router.refresh(); }} />
      <DialogoLancar aberto={lancando} onOpenChange={setLancando} onEscolher={(r) => { setLancando(false); setSelecaoPagar(null); setPagando(r); }} />
      <DialogoPagar repasse={pagando} selecaoInicial={selecaoPagar} locador={pagando ? locadorDe(pagando.locador_id, pagando.locador_nome) : null} onOpenChange={(v) => !v && setPagando(null)} onFeito={() => router.refresh()} />
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
                      <p className="truncate text-xs text-muted-foreground">{r.cliente_nome} · {formatPeriodo(r.periodo_inicio, r.periodo_fim)} · {r.dias_placa ?? r.dias} dias</p>
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

/** valor mensal do repasse, salvo ao sair do campo ou com Enter */
function ValorMensalRepasse({ repasse: r, onSalvo }: { repasse: Repasse; onSalvo: () => void }) {
  const [valor, setValor] = React.useState<number | null>(r.valor_repasse_mensal);
  const [salvando, setSalvando] = React.useState(false);
  React.useEffect(() => setValor(r.valor_repasse_mensal), [r.valor_repasse_mensal]);

  const salvar = async () => {
    if (valor === null || valor === r.valor_repasse_mensal || salvando) return;
    setSalvando(true);
    const res = await alterarValorRepasse(r.id, valor);
    setSalvando(false);
    if (res.ok) { toast.success(res.mensagem); onSalvo(); } else { toast.error(res.erro); setValor(r.valor_repasse_mensal); }
  };

  return (
    <InputMoeda aria-label={`Valor mensal do repasse ${formatPlaca(r.placa)}`} title="Valor mensal do repasse (proporcional aos dias medidos)"
      className="mt-0.5 h-6 w-28 pl-7 text-right text-[11px]" permitirVazio={false} disabled={salvando}
      value={valor} onChange={setValor} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

/**
 * Pagar um repasse escolhendo os descontos: em cima os repasses abertos da placa (as faturas/contratos) para escolher
 * qual pagar; embaixo TODAS as despesas "descontar do locador" da placa juntas, para marcar as que saem deste pagamento.
 */
function DialogoPagar({ repasse: inicial, selecaoInicial, locador: l, onOpenChange, onFeito }: {
  repasse: Repasse | null; /** despesas já escolhidas no bloco da placa (null = as que estão no repasse hoje) */ selecaoInicial?: string[] | null;
  locador: Locador | null; onOpenChange: (v: boolean) => void; onFeito: () => void;
}) {
  // a seleção vinda da tabela vale só na primeira carga deste repasse
  const usarSelecao = React.useRef(false);
  React.useEffect(() => { usarSelecao.current = !!selecaoInicial; }, [inicial?.id, selecaoInicial]);
  const [data, setData] = React.useState(hojeSP());
  const [comprovante, setComprovante] = React.useState<string | null>(null);
  const [confirmo, setConfirmo] = React.useState(false);
  const [salvando, setSalvando] = React.useState<"descontos" | "pagar" | null>(null);
  const [info, setInfo] = React.useState<{ repasses: Repasse[]; despesas: DespesaPlaca[]; outrosDescontos: Record<string, number> } | null>(null);
  const [erroInfo, setErroInfo] = React.useState<string | null>(null);
  const [alvoId, setAlvoId] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<Set<string>>(new Set());

  const carregar = React.useCallback(async (id: string) => {
    const res = await despesasParaPagar(id);
    if (res.ok) { setInfo(res.dados); setErroInfo(null); } else { setInfo(null); setErroInfo(res.erro); }
  }, []);

  React.useEffect(() => {
    setData(hojeSP()); setComprovante(null); setConfirmo(false); setInfo(null); setErroInfo(null);
    setAlvoId(inicial?.id ?? null);
    if (inicial) void carregar(inicial.id);
  }, [inicial?.id, carregar]);

  const r = info?.repasses.find((x) => x.id === alvoId) ?? inicial;
  /** o que está neste repasse hoje */
  const atuais = React.useMemo(() => new Set((info?.despesas ?? []).filter((d) => alvoId && (d.porRepasse[alvoId] ?? 0) > 0).map((d) => d.id)), [info, alvoId]);
  React.useEffect(() => {
    if (usarSelecao.current && info && alvoId === inicial?.id) {
      usarSelecao.current = false;
      const existem = new Set(info.despesas.map((d) => d.id));
      setSel(new Set((selecaoInicial ?? []).filter((id) => existem.has(id))));
    } else setSel(new Set(atuais));
    setConfirmo(false);
  }, [atuais]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudou = sel.size !== atuais.size || [...sel].some((id) => !atuais.has(id));
  // prévia: bruto (+ acréscimos) − descontos da fatura/recibo − despesas marcadas; nunca negativo
  const base = r ? r.valor_liquido + r.valor_abatimentos : 0;
  const outros = r ? info?.outrosDescontos[r.id] ?? 0 : 0;
  const marcado = somar((info?.despesas ?? []).filter((d) => sel.has(d.id)).map((d) => d.saldo));
  const disponivel = Math.max(0, Math.round((base - outros) * 100) / 100);
  const descontoDespesas = Math.min(marcado, disponivel);
  const liquido = Math.round((disponivel - descontoDespesas) * 100) / 100;
  const sobra = Math.round((marcado - descontoDespesas) * 100) / 100;
  const periodoDe = (id: string) => { const x = info?.repasses.find((y) => y.id === id); return x ? `${diaMes(x.periodo_inicio)} a ${diaMes(x.periodo_fim)}` : "outro repasse"; };

  /** grava a escolha de descontos; devolve false se falhou */
  const gravarDescontos = async () => {
    if (!r || !mudou) return true;
    const res = await definirDescontosRepasse(r.id, [...sel]);
    if (!res.ok) { toast.error(res.erro); return false; }
    await carregar(r.id);
    return true;
  };

  const salvarDescontos = async () => {
    setSalvando("descontos");
    const ok = await gravarDescontos();
    setSalvando(null);
    if (ok) { toast.success("Descontos deste repasse salvos"); onFeito(); }
  };

  const pagar = async () => {
    if (!r) return;
    setSalvando("pagar");
    if (!(await gravarDescontos())) return setSalvando(null);
    const res = await pagarRepasse({ repasse_id: r.id, data, comprovante_url: comprovante, confirmar_adiantado: confirmo });
    setSalvando(null);
    if (res.ok) {
      toast.success(res.dados.adiantado ? "Repasse pago (adiantado — registrado com sua aprovação)" : "Repasse pago");
      onOpenChange(false);
      onFeito();
    } else if (res.codigo === "CONFIRMACAO_ADIANTAMENTO") {
      toast.warning("O cliente ainda não pagou esta medição. Confirme o adiantamento para continuar.");
    } else toast.error(res.erro);
  };

  const alternar = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });
  const despesas = info?.despesas ?? [];

  return (
    <Dialog open={!!inicial} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        <DialogHeader>
          <DialogTitle>Pagar repasse</DialogTitle>
          <DialogDescription>{r && <>{r.locador_nome} · {formatPlaca(r.placa)} · escolha a fatura que vai pagar e as despesas que saem dela</>}</DialogDescription>
        </DialogHeader>
        {r && (
          <div className="space-y-4">
            {/* 1. qual repasse (fatura/contrato) */}
            <div className="space-y-1.5">
              <Label>Repasse que vai pagar</Label>
              {!info && !erroInfo && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
              <div className="space-y-1">
                {(info?.repasses ?? [r]).map((x) => (
                  <label key={x.id} className={cn("flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm", x.id === r.id ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                    <input type="radio" name="repasse-alvo" className="accent-primary" checked={x.id === r.id} disabled={!!salvando} onChange={() => setAlvoId(x.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate"><span className="font-medium">{x.cliente_nome}</span>{x.contrato_numero && <span className="text-muted-foreground"> · {x.contrato_numero}</span>}{x.numero_nf && <span className="text-muted-foreground"> · NF {x.numero_nf}</span>}</p>
                      <p className="text-xs text-muted-foreground">{formatPeriodo(x.periodo_inicio, x.periodo_fim)} · {x.dias_placa ?? x.dias} dias</p>
                    </div>
                    {x.status === "liberado" ? <Badge variant="ok">Cliente pagou</Badge> : <Badge variant="alerta">Aguardando cliente</Badge>}
                    <div className="text-right"><Moeda valor={x.valor_liquido} className="font-semibold" /><p className="text-[11px] text-muted-foreground">bruto {formatBRL(x.valor_bruto)}</p></div>
                  </label>
                ))}
              </div>
            </div>

            {/* 2. todas as despesas da placa juntas */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Despesas a descontar do locador</Label>
                {despesas.length > 0 && (
                  <div className="flex gap-1">
                    <Button type="button" size="xs" variant="ghost" disabled={!!salvando} onClick={() => setSel(new Set(despesas.map((d) => d.id)))}>Marcar todas</Button>
                    <Button type="button" size="xs" variant="ghost" disabled={!!salvando} onClick={() => setSel(new Set())}>Desmarcar</Button>
                  </div>
                )}
              </div>
              {erroInfo && <p className="text-sm text-destructive">{erroInfo}</p>}
              {info && despesas.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhuma despesa pendente para descontar desta placa.</p>}
              {despesas.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  {despesas.map((d) => {
                    const emOutro = Object.entries(d.porRepasse).filter(([id, v]) => id !== r.id && v > 0).map(([id]) => id);
                    return (
                      <label key={d.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40">
                        <Checkbox checked={sel.has(d.id)} disabled={!!salvando} onCheckedChange={(v) => alternar(d.id, !!v)} aria-label={`Descontar ${d.descricao ?? "despesa"} neste repasse`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{d.descricao ?? "Despesa"}{d.parcela_total && d.parcela_total > 1 ? <span className="text-muted-foreground"> · {d.parcela_num}/{d.parcela_total}</span> : null}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[d.fornecedor_nome, d.vencimento && `vence ${formatData(d.vencimento)}`].filter(Boolean).join(" · ")}
                            {emOutro.length > 0 && !sel.has(d.id) && <span> · hoje no repasse {emOutro.map(periodoDe).join(", ")}</span>}
                            {emOutro.length > 0 && sel.has(d.id) && <span className="text-status-alerta"> · sai do repasse {emOutro.map(periodoDe).join(", ")}</span>}
                          </p>
                        </div>
                        <Moeda valor={-d.saldo} className={sel.has(d.id) ? "text-status-critico" : "text-muted-foreground"} />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. prévia do valor */}
            <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Bruto{outros > 0 ? " − desc. fatura/recibo" : ""}</p><Moeda valor={disponivel} /></div>
              <div><p className="text-xs text-muted-foreground">Despesas marcadas</p><Moeda valor={-descontoDespesas} /></div>
              <div><p className="text-xs text-muted-foreground">Líquido a pagar</p><Moeda valor={liquido} className="font-bold" /></div>
              {sobra > 0 && <p className="col-span-3 text-xs text-status-alerta">As despesas marcadas passam do valor do repasse: {formatBRL(sobra)} fica para o próximo repasse da placa.</p>}
              {mudou && <p className="col-span-3 text-xs text-muted-foreground">A escolha das despesas é gravada ao pagar (ou em “Salvar descontos”).</p>}
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="pag-data">Data do pagamento</Label><Input id="pag-data" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Comprovante</Label><CampoAnexo bucket="comprovantes" pasta="repasses" valor={comprovante} onChange={setComprovante} /></div>
            </div>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {mudou && <Button variant="outline" onClick={salvarDescontos} disabled={!!salvando}>{salvando === "descontos" && <Loader2 className="animate-spin" />} Salvar descontos</Button>}
          <Button onClick={pagar} disabled={!!salvando || !info || (!!r?.seria_adiantado && !confirmo)} variant={r?.seria_adiantado ? "destructive" : "default"}>
            {salvando === "pagar" ? <Loader2 className="animate-spin" /> : <Wallet />} {r?.seria_adiantado ? "Pagar adiantado" : `Registrar pagamento${info ? ` de ${formatBRL(liquido)}` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Todas as despesas "descontar do locador" da placa juntas (não por fatura), logo depois das faturas dela.
 * Marque as despesas, escolha a fatura e clique em Pagar: a tela de pagamento abre com elas.
 */
function BlocoDespesasPlaca({ placa, despesas, faturas, podeEditar, onPagar, onExtrato, onDefinir, aberto, onAlternar }: {
  placa: string; veiculoId: string; despesas: DespesaDaPlaca[]; faturas: Repasse[]; podeEditar: boolean;
  onPagar: (fatura: Repasse, contas: string[]) => void; onExtrato: (fatura: Repasse, contas: string[]) => void;
  /** grava a escolha no repasse (assim a lista, o recibo e o extrato usam as mesmas despesas) */
  onDefinir: (fatura: Repasse, contas: string[]) => Promise<boolean>;
  aberto: boolean; onAlternar: () => void;
}) {
  // fatura a pagar: a primeira com o cliente já pago; senão a mais antiga
  const padrao = (faturas.find((f) => f.status === "liberado") ?? faturas[0])?.id ?? null;
  const [faturaId, setFaturaId] = React.useState<string | null>(padrao);
  const fatura = faturas.find((f) => f.id === faturaId) ?? faturas.find((f) => f.id === padrao) ?? null;
  /** onde cada despesa está hoje (a fatura com a maior parte) */
  const ondeEsta = (d: DespesaDaPlaca) => Object.entries(d.porRepasse).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const daFatura = (id: string | null) => new Set(despesas.filter((d) => id && ondeEsta(d) === id).map((d) => d.id));
  const [sel, setSel] = React.useState<Set<string>>(() => daFatura(fatura?.id ?? null));
  // trocou a fatura ou as despesas mudaram no banco (a lista é recriada a cada render: compara pelo conteúdo)
  const chave = `${fatura?.id}|${despesas.map((d) => `${d.id}:${ondeEsta(d)}`).join(",")}`;
  React.useEffect(() => { setSel(daFatura(fatura?.id ?? null)); }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!faturas.length || !despesas.length || !fatura) return null;
  const valorDe = (d: DespesaDaPlaca) => Math.round((somar(Object.values(d.porRepasse)) + d.pendente) * 100) / 100;
  const total = somar(despesas.map(valorDe));
  const marcadas = despesas.filter((d) => sel.has(d.id));
  const rotulo = (r: Repasse) => `${diaMes(r.periodo_inicio)} a ${diaMes(r.periodo_fim)} · ${r.cliente_nome}`;
  // marcar/desmarcar grava logo no repasse (com um respiro de 0,6 s para cliques seguidos virarem uma gravação só)
  const [salvando, setSalvando] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const escolher = (nova: Set<string>) => {
    setSel(nova);
    if (timer.current) clearTimeout(timer.current);
    const alvo = fatura;
    timer.current = setTimeout(async () => {
      setSalvando(true);
      const ok = await onDefinir(alvo, [...nova]);
      setSalvando(false);
      if (!ok) setSel(daFatura(alvo.id)); // não gravou: volta ao que está no banco
    }, 600);
  };
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const alternar = (id: string, v: boolean) => { const n = new Set(sel); if (v) n.add(id); else n.delete(id); escolher(n); };
  return (
    <>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableCell colSpan={8} className="py-2">
          <button type="button" onClick={onAlternar} aria-expanded={aberto} className="flex w-full items-center gap-1.5 text-left text-sm">
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">Despesas da placa <span className="font-mono">{formatPlaca(placa)}</span> ({despesas.length})</span>
            <span className="text-status-critico">−{formatBRL(total)}</span>
            <span className="text-xs text-muted-foreground">· todas juntas — marque as que saem deste repasse (fica salvo: vale para o recibo, o extrato e o pagamento)</span>
          </button>
        </TableCell>
      </TableRow>
      {aberto && despesas.map((d) => {
        const onde = ondeEsta(d);
        const ondeFatura = faturas.find((f) => f.id === onde);
        return (
          <TableRow key={`pd-${d.id}`} className={cn("bg-muted/20 text-xs hover:bg-muted/30", !sel.has(d.id) && "text-muted-foreground")}>
            <TableCell colSpan={5} className="pl-6">
              <label className="flex cursor-pointer items-center gap-2">
                {podeEditar && <Checkbox checked={sel.has(d.id)} onCheckedChange={(v) => alternar(d.id, !!v)} aria-label={`Descontar ${d.descricao}`} />}
                <span>(−) {d.descricao}{d.vencimento && <span className="text-muted-foreground"> · {formatData(d.vencimento)}</span>}
                  {d.fornecedor && <span className="text-muted-foreground"> · {d.fornecedor}</span>}</span>
              </label>
            </TableCell>
            <TableCell className="text-right"><Moeda valor={-valorDe(d)} className={sel.has(d.id) ? "text-status-critico" : undefined} /></TableCell>
            <TableCell colSpan={2} className="text-muted-foreground">
              {ondeFatura ? `hoje em ${diaMes(ondeFatura.periodo_inicio)} a ${diaMes(ondeFatura.periodo_fim)}` : "ainda em nenhuma fatura"}
              <Link className="ml-2 underline" href={`/pagar?id=${d.id}`}>Conta</Link>
            </TableCell>
          </TableRow>
        );
      })}
      {aberto && podeEditar && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={8} className="py-2">
            <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
              {salvando && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> salvando escolha…</span>}
              <Button type="button" size="xs" variant="ghost" disabled={salvando} onClick={() => escolher(new Set(despesas.map((d) => d.id)))}>Marcar todas</Button>
              <Button type="button" size="xs" variant="ghost" disabled={salvando} onClick={() => escolher(new Set())}>Desmarcar</Button>
              <span className="text-muted-foreground">Pagar a fatura</span>
              <select aria-label="Fatura a pagar" value={fatura.id} onChange={(e) => setFaturaId(e.target.value)}
                className="h-8 max-w-72 rounded-md border bg-background px-2 text-xs">
                {faturas.map((f) => <option key={f.id} value={f.id}>{rotulo(f)}{f.status === "liberado" ? " (cliente pagou)" : ""}</option>)}
              </select>
              <span className="text-muted-foreground">com {marcadas.length} despesa(s) <span className="text-status-critico">−{formatBRL(somar(marcadas.map(valorDe)))}</span></span>
              <Button type="button" size="sm" variant="outline" title="Extrato desta fatura com as despesas marcadas" onClick={() => onExtrato(fatura, [...sel])}><FileText /> PDF</Button>
              <Button type="button" size="sm" onClick={() => onPagar(fatura, [...sel])}><Wallet /> Pagar…</Button>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
