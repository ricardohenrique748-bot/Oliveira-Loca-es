"use client";
import * as React from "react";
import Link from "next/link";
import { Copy, Check, Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge, Card, type BadgeVariant } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { SplitText } from "@/components/ui/motion-split-text";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/overlays";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Cabecalho({ titulo, descricao, acoes, voltar }: {
  titulo: string; descricao?: React.ReactNode; acoes?: React.ReactNode; voltar?: { href: string; rotulo: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {voltar && <Link href={voltar.href} className="text-xs text-muted-foreground hover:text-foreground">← {voltar.rotulo}</Link>}
        <SplitText key={titulo} text={titulo} className="truncate text-2xl font-black uppercase leading-tight tracking-tight sm:text-3xl" />
        {descricao && <div className="mt-1 text-xs font-medium uppercase text-muted-foreground sm:text-sm">{descricao}</div>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function Moeda({ valor, className, sinal }: { valor: number | null | undefined; className?: string; sinal?: boolean }) {
  const v = valor ?? null;
  return (
    <span className={cn("num whitespace-nowrap", sinal && v !== null && v < 0 && "text-status-critico", className)}>
      {formatBRL(v)}
    </span>
  );
}

// ---------- Status ----------
const STATUS: Record<string, { rotulo: string; variante: BadgeVariant }> = {
  // medição
  a_faturar: { rotulo: "A faturar", variante: "alerta" },
  faturado: { rotulo: "Faturado", variante: "info" },
  recebido_parcial: { rotulo: "Recebido parcial", variante: "alerta" },
  recebido: { rotulo: "Recebido", variante: "ok" },
  cancelado: { rotulo: "Cancelado", variante: "neutro" },
  vencido: { rotulo: "Vencido", variante: "critico" },
  // repasse
  previsto: { rotulo: "Previsto", variante: "neutro" },
  liberado: { rotulo: "Liberado", variante: "ok" },
  pago: { rotulo: "Pago", variante: "ok" },
  // conta a pagar
  a_vencer: { rotulo: "A vencer", variante: "info" },
  // proposta
  rascunho: { rotulo: "Rascunho", variante: "neutro" },
  enviada: { rotulo: "Enviada", variante: "info" },
  aprovada: { rotulo: "Aprovada", variante: "ok" },
  recusada: { rotulo: "Recusada", variante: "critico" },
  convertida: { rotulo: "Virou contrato", variante: "ok" },
  // contrato
  ativo: { rotulo: "Ativo", variante: "ok" },
  encerrado: { rotulo: "Encerrado", variante: "neutro" },
  suspenso: { rotulo: "Suspenso", variante: "alerta" },
  // veículo
  disponivel: { rotulo: "Disponível", variante: "info" },
  locado: { rotulo: "Locado", variante: "ok" },
  manutencao: { rotulo: "Manutenção", variante: "alerta" },
  parado: { rotulo: "Parado", variante: "critico" },
  vendido: { rotulo: "Vendido", variante: "neutro" },
  // OS
  aberta: { rotulo: "Aberta", variante: "alerta" },
  em_execucao: { rotulo: "Em execução", variante: "info" },
  aguardando_peca: { rotulo: "Aguardando peça", variante: "critico" },
  fechada: { rotulo: "Fechada", variante: "ok" },
  cancelada: { rotulo: "Cancelada", variante: "neutro" },
  // multa
  pendente: { rotulo: "Pendente", variante: "alerta" },
  recurso: { rotulo: "Em recurso", variante: "info" },
  paga: { rotulo: "Paga", variante: "ok" },
  // preventiva
  em_dia: { rotulo: "Em dia", variante: "ok" },
  proxima: { rotulo: "Próxima", variante: "alerta" },
  vencida: { rotulo: "Vencida", variante: "critico" },
};

export function rotuloStatus(s: string | null | undefined) {
  return s ? (STATUS[s]?.rotulo ?? s) : "—";
}

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const s = STATUS[status] ?? { rotulo: status, variante: "neutro" as BadgeVariant };
  return <Badge variant={s.variante} className={className}>{s.rotulo}</Badge>;
}

// ---------- Confirmação ----------
export function Confirmar({
  aberto, onOpenChange, titulo, descricao, rotulo = "Confirmar", destrutivo, desabilitado, onConfirmar, children,
}: {
  aberto: boolean; onOpenChange: (v: boolean) => void; titulo: string; descricao?: React.ReactNode; rotulo?: string;
  destrutivo?: boolean; desabilitado?: boolean; onConfirmar: () => Promise<void> | void; children?: React.ReactNode;
}) {
  const [carregando, setCarregando] = React.useState(false);
  return (
    <AlertDialog open={aberto} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descricao ? <AlertDialogDescription asChild><div>{descricao}</div></AlertDialogDescription> : <AlertDialogDescription className="sr-only">{titulo}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={carregando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction destrutivo={destrutivo} disabled={carregando || desabilitado}
            onClick={async (e) => {
              e.preventDefault();
              setCarregando(true);
              try { await onConfirmar(); onOpenChange(false); } catch { /* erro já exibido via toast; mantém aberto */ } finally { setCarregando(false); }
            }}>
            {carregando && <Loader2 className="animate-spin" />} {rotulo}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Executa uma server action exibindo toast de sucesso/erro. */
export async function rodarAcao<T>(p: Promise<{ ok: true; dados?: T; mensagem?: string } | { ok: false; erro: string; codigo?: string }>, sucesso?: string) {
  const r = await p;
  if (r.ok) {
    if (sucesso || r.mensagem) toast.success(r.mensagem ?? sucesso);
  } else toast.error(r.erro);
  return r;
}

export function BotaoCopiar({ texto, rotulo = "Copiar", className }: { texto: string; rotulo?: string; className?: string }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <Button type="button" variant="outline" size="xs" className={className}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          toast.success("Copiado!");
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          toast.error("Não foi possível copiar");
        }
      }}>
      {copiado ? <Check /> : <Copy />} {rotulo}
    </Button>
  );
}

export function Vazio({ icone: Icone, titulo, descricao, acao }: { icone?: LucideIcon; titulo: string; descricao?: string; acao?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      {Icone && <Icone className="h-10 w-10 text-muted-foreground" aria-hidden />}
      <p className="font-display text-lg font-semibold tracking-tight">{titulo}</p>
      {descricao && <p className="max-w-md text-sm text-muted-foreground">{descricao}</p>}
      {acao}
    </Card>
  );
}

export function Progresso({ pct, className }: { pct: number; className?: string }) {
  const v = Math.max(0, Math.min(1, pct));
  const cor = pct >= 1 ? "bg-status-critico" : pct >= 0.9 ? "bg-status-alerta" : "bg-status-ok";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
      <div className={cn("h-full rounded-full transition-all", cor)} style={{ width: `${v * 100}%` }} />
    </div>
  );
}
