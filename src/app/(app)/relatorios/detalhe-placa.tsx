"use client";
import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge, Table, TableBody, TableCell, TableRow } from "@/components/ui/basicos";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Moeda } from "@/components/app/comuns";
import { createClient } from "@/lib/supabase/client";
import { somar } from "@/lib/calculos";
import { formatData, formatPeriodo, formatPlaca } from "@/lib/format";
import type { ItemAvulsoSalvo } from "@/lib/schemas/operacao";

type Lancamento = { data: string; descricao: string; detalhe?: string | null; valor: number; href?: string; fora?: string };
type Grupo = { titulo: string; sinal: 1 | -1; linhas: Lancamento[] };
/** linha de medicoes_v (as colunas da view vêm como anuláveis nos tipos gerados) */
type FaturaV = { periodo_inicio: string; periodo_fim: string; valor_final: number; valor_base?: number; cliente_fantasia: string | null;
  descricao?: string | null; numero_nf: string | null; contrato_numero?: string | null; itens: ItemAvulsoSalvo[] | null };

/**
 * Lançamentos de uma placa no período do DRE: as mesmas regras de vw_margem_placa_mes
 * (receita pelo fim do período da fatura, repasse pela fatura, OS fechadas, contas a pagar do veículo por vencimento).
 */
async function carregar(veiculoId: string, placa: string, ini: string, fim: string, empresaId: string | null): Promise<Grupo[]> {
  const supabase = createClient();
  const emp = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) => (empresaId ? q.eq("empresa_id", empresaId) : q);
  const [med, avulsas, rep, os, cp] = await Promise.all([
    emp(supabase.from("medicoes_v").select("id, periodo_inicio, periodo_fim, valor_final, cliente_fantasia, descricao, numero_nf, contrato_numero, itens")
      .eq("veiculo_id", veiculoId).gte("periodo_fim", ini).lte("periodo_fim", fim).neq("status", "cancelado")),
    // fatura avulsa com itens de placas diferentes: o veículo está só nos itens
    emp(supabase.from("medicoes_v").select("id, periodo_inicio, periodo_fim, valor_final, valor_base, cliente_fantasia, numero_nf, itens")
      .is("contrato_id", null).is("veiculo_id", null).gte("periodo_fim", ini).lte("periodo_fim", fim).neq("status", "cancelado")),
    emp(supabase.from("repasses_v").select("id, periodo_inicio, periodo_fim, valor_bruto, locador_nome, status")
      .eq("veiculo_id", veiculoId).gte("periodo_fim", ini).lte("periodo_fim", fim).neq("status", "cancelado")),
    emp(supabase.from("ordens_servico").select("id, numero, data_fechamento, descricao_problema, custo_total, descontar_locador, fornecedores(nome)")
      .eq("veiculo_id", veiculoId).eq("status", "fechada").gte("data_fechamento", ini).lte("data_fechamento", fim)),
    emp(supabase.from("contas_pagar_v").select("id, vencimento, descricao, categoria_nome, fornecedor_nome, valor, pago_em, descontar_locador")
      .eq("veiculo_id", veiculoId).eq("tipo", "veiculo").is("ordem_servico_id", null).gte("vencimento", ini).lte("vencimento", fim)),
  ]);
  for (const r of [med, avulsas, rep, os, cp]) if (r.error) throw new Error(r.error.message);

  // vários itens: cada item da placa leva o seu subtotal, ajustado por acréscimos/descontos da fatura (igual à view)
  const daPlaca = (m: FaturaV, base: number) => {
    const itens = (m.itens ?? []).filter((i) => i.veiculo_id === veiculoId);
    return somar(itens.map((i) => Math.round(i.quantidade * i.valor_unitario * (base ? m.valor_final / base : 0) * 100) / 100));
  };
  const nf = (n: string | null) => (n ? ` · NF ${n}` : "");
  const fatura = (periodoFim: string) => `/medicoes?comp=${periodoFim.slice(0, 7)}&placa=${encodeURIComponent(placa)}`;
  const receitas: Lancamento[] = [
    ...((med.data ?? []) as unknown as FaturaV[]).map((m) => {
      const itens = m.itens ?? [];
      const base = somar(itens.map((i) => Math.round(i.quantidade * i.valor_unitario * 100) / 100));
      return { data: m.periodo_fim, descricao: m.cliente_fantasia ?? "—", href: fatura(m.periodo_fim),
        detalhe: `${formatPeriodo(m.periodo_inicio, m.periodo_fim)}${m.contrato_numero ? ` · contrato ${m.contrato_numero}` : m.descricao ? ` · ${m.descricao}` : ""}${nf(m.numero_nf)}`,
        valor: itens.length ? daPlaca(m, base) : m.valor_final };
    }),
    ...((avulsas.data ?? []) as unknown as FaturaV[]).filter((m) => (m.itens ?? []).some((i) => i.veiculo_id === veiculoId)).map((m) => ({
      data: m.periodo_fim, descricao: m.cliente_fantasia ?? "—", href: fatura(m.periodo_fim),
      detalhe: `${formatPeriodo(m.periodo_inicio, m.periodo_fim)} · ${(m.itens ?? []).filter((i) => i.veiculo_id === veiculoId).map((i) => i.descricao).join("; ")}${nf(m.numero_nf)}`,
      valor: daPlaca(m, m.valor_base ?? 0),
    })),
  ];

  return [
    { titulo: "Receita", sinal: 1, linhas: receitas },
    { titulo: "Repasse ao locador", sinal: -1, linhas: (rep.data ?? []).map((r) => ({
      data: r.periodo_fim ?? "", descricao: r.locador_nome ?? "Locador", detalhe: r.periodo_inicio && r.periodo_fim ? formatPeriodo(r.periodo_inicio, r.periodo_fim) : null,
      valor: r.valor_bruto ?? 0, href: "/repasses" })) },
    { titulo: "Manutenção (OS fechadas)", sinal: -1, linhas: (os.data ?? []).map((o) => ({
      data: o.data_fechamento!, descricao: `OS ${o.numero}${o.descricao_problema ? ` · ${o.descricao_problema}` : ""}`, detalhe: o.fornecedores?.nome ?? "Própria",
      valor: o.custo_total, href: `/manutencao/ordens/${o.id}`, fora: o.descontar_locador ? "Descontada do locador" : undefined })) },
    { titulo: "Outras despesas (contas a pagar)", sinal: -1, linhas: (cp.data ?? []).map((c) => ({
      data: c.vencimento!, descricao: c.descricao ?? c.categoria_nome ?? "Despesa", detalhe: [c.categoria_nome, c.fornecedor_nome, c.pago_em ? `pago em ${formatData(c.pago_em)}` : "em aberto"].filter(Boolean).join(" · "),
      valor: c.valor ?? 0, href: `/pagar?veiculo_id=${veiculoId}`, fora: c.descontar_locador ? "Descontada do locador" : undefined })) },
  ].map((g) => ({ ...g, linhas: g.linhas.sort((a, b) => a.data.localeCompare(b.data)) })) as Grupo[];
}

/** Ao clicar na placa do DRE: tudo o que foi lançado para ela no período. */
export function DetalhePlaca({ placa, onOpenChange, ini, fim, empresaId, periodo }: {
  placa: { veiculoId: string; placa: string } | null; onOpenChange: (v: boolean) => void;
  ini: string; fim: string; empresaId: string | null; periodo: string;
}) {
  const [grupos, setGrupos] = React.useState<Grupo[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!placa) return;
    let vivo = true;
    setGrupos(null); setErro(null);
    carregar(placa.veiculoId, placa.placa, ini, fim, empresaId).then((g) => vivo && setGrupos(g)).catch((e) => vivo && setErro(String(e.message ?? e)));
    return () => { vivo = false; };
  }, [placa, ini, fim, empresaId]);

  const total = (g: Grupo) => somar(g.linhas.filter((l) => !l.fora).map((l) => l.valor));
  const margem = grupos ? somar(grupos.map((g) => g.sinal * total(g))) : 0;

  return (
    <Dialog open={!!placa} onOpenChange={onOpenChange}>
      <DialogContent tamanho="xl">
        <DialogHeader>
          <DialogTitle>Lançamentos da placa <span className="font-mono">{placa ? formatPlaca(placa.placa) : ""}</span></DialogTitle>
          <DialogDescription>{periodo} · receitas, repasses, manutenções e contas a pagar que compõem o DRE da placa.</DialogDescription>
        </DialogHeader>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {!grupos && !erro && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
        {grupos && (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto">
            {grupos.map((g) => (
              <div key={g.titulo} className="space-y-1">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{g.titulo} <span className="font-normal text-muted-foreground">({g.linhas.length})</span></span>
                  <Moeda valor={g.sinal * total(g)} sinal />
                </div>
                {g.linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nada lançado no período.</p> : (
                  <div className="rounded-md border">
                    <Table>
                      <TableBody>
                        {g.linhas.map((l, k) => (
                          <TableRow key={k} className={l.fora ? "opacity-60" : undefined}>
                            <TableCell className="w-28 whitespace-nowrap text-sm">{formatData(l.data)}</TableCell>
                            <TableCell>
                              {l.href ? <Link href={l.href} className="hover:underline">{l.descricao}</Link> : l.descricao}
                              {l.fora && <Badge variant="info" className="ml-2">{l.fora} · não entra</Badge>}
                              {l.detalhe && <span className="block text-xs text-muted-foreground">{l.detalhe}</span>}
                            </TableCell>
                            <TableCell className="text-right"><Moeda valor={l.valor} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between rounded-md bg-muted p-3 text-sm">
              <span className="text-muted-foreground">Margem = receita − repasse − manutenção − outras despesas</span>
              <span className="text-lg font-semibold"><Moeda valor={margem} sinal /></span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
