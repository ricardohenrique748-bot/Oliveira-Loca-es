"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/basicos";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Moeda, StatusBadge } from "@/components/app/comuns";
import { LinkAnexo } from "@/components/app/anexo";
import { createClient } from "@/lib/supabase/client";
import { formatData, formatPlaca } from "@/lib/format";
import type { LinhaMulta } from "./client";

type Alteracao = { id: number; acao: string; criado_em: string; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null };

/** campos que interessam no histórico (o resto é técnico) */
const CAMPOS: Record<string, string> = {
  valor: "Valor", vencimento: "Vencimento", status: "Status", pago_em: "Pago em", responsavel: "Quem paga", descricao: "Descrição",
  orgao: "Órgão", codigo: "Código", auto_infracao: "Auto", data_infracao: "Data da infração", observacoes: "Observações", anexo_url: "Anexo",
};
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Painel com todos os dados da multa e o histórico de alterações (auditoria: visível para administradores). */
export function DetalheMulta({ multa, onOpenChange }: { multa: LinhaMulta | null; onOpenChange: (v: boolean) => void }) {
  const [historico, setHistorico] = React.useState<Alteracao[] | null>(null);

  React.useEffect(() => {
    if (!multa) return;
    let vivo = true;
    setHistorico(null);
    createClient().from("auditoria").select("id, acao, criado_em, antes, depois").eq("tabela", "multas").eq("registro_id", multa.id)
      .order("criado_em", { ascending: false }).limit(30)
      .then(({ data }) => { if (vivo) setHistorico((data ?? []) as Alteracao[]); });
    return () => { vivo = false; };
  }, [multa]);

  const item = (rotulo: string, valor: React.ReactNode) => (
    <div><p className="text-xs text-muted-foreground">{rotulo}</p><div className="text-sm">{valor ?? "—"}</div></div>
  );
  const m = multa;

  return (
    <Dialog open={!!m} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        {m && <>
          <DialogHeader>
            <DialogTitle>Multa · <span className="font-mono">{formatPlaca(m.placa)}</span></DialogTitle>
            <DialogDescription>{m.descricao ?? "Infração"}{m.auto_infracao ? ` · AIT ${m.auto_infracao}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {item("Data da infração", formatData(m.data_infracao))}
            {item("Valor", <Moeda valor={m.valor} />)}
            {item("Vencimento", m.vencimento ? formatData(m.vencimento) : <Badge variant="alerta">Vencimento não informado</Badge>)}
            {item("Situação", <StatusBadge status={m.status_exibicao} />)}
            {item("Órgão autuador", m.orgao)}
            {item("Código", m.codigo)}
            {item("Pontos", m.pontos)}
            {item("Quem paga", m.responsavel === "cliente" ? "Cliente (cobrar)" : m.responsavel === "locador" ? "Locador (descontar)" : "Empresa")}
            {item("Cliente na data", m.cliente_nome ? `${m.cliente_nome}${m.contrato_numero ? ` · ${m.contrato_numero}` : ""}` : "Sem contrato")}
            {item("Pago em", m.pago_em ? formatData(m.pago_em) : "—")}
            {item("Notificação", <LinkAnexo referencia={m.anexo_url} rotulo="Abrir" />)}
            <div className="col-span-2 sm:col-span-3">{item("Observações", m.observacoes)}</div>
          </div>
          <p className="text-xs text-muted-foreground">Para alterar vencimento, valor ou situação, use <strong>Editar</strong> no menu “⋯” da multa. O pagamento só é marcado por quem tem permissão.</p>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Histórico de alterações</p>
            {!historico ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
              : !historico.length ? <p className="text-sm text-muted-foreground">Sem alterações visíveis (o histórico completo é exibido para administradores).</p> : (
              <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">
                {historico.map((h) => {
                  const mudou = Object.keys(CAMPOS).filter((c) => JSON.stringify(h.antes?.[c] ?? null) !== JSON.stringify(h.depois?.[c] ?? null));
                  return (
                    <li key={h.id} className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">{dataHora(h.criado_em)} · {h.acao === "INSERT" ? "Cadastro" : h.acao === "DELETE" ? "Exclusão" : "Alteração"}</p>
                      {h.acao === "UPDATE" && (mudou.length ? mudou.map((c) => (
                        <p key={c}>{CAMPOS[c]}: <span className="text-muted-foreground line-through">{String(h.antes?.[c] ?? "—")}</span> → {String(h.depois?.[c] ?? "—")}</p>
                      )) : <p className="text-muted-foreground">Verificação ou ajuste interno</p>)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
