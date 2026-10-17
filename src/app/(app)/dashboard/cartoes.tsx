// Blocos visuais do dashboard: painéis pretos, cartões de destaque, mini gráficos e lista "Hoje".
import type * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CalendarClock, Info, type LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ItemHoje } from "./dados";

/** Painel preto com brilho amarelo (mesmo visual dos cartões de destaque); os gráficos dentro dele usam as cores da logo. */
export function Painel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn(SUPERFICIE_DESTAQUE, "painel-escuro p-5 sm:p-6", className)}>
      <BrilhoDestaque />
      {children}
    </section>
  );
}

export function TituloPainel({ titulo, descricao, acao }: { titulo: string; descricao?: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xs font-semibold uppercase leading-tight tracking-wider text-primary">{titulo}</h2>
        {descricao && <p className="mt-1 text-xs text-white/60">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

/** Botão redondo com seta, no canto dos cartões clicáveis. */
export function Seta({ href, rotulo, pequena }: { href: string; rotulo: string; pequena?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={rotulo}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full transition-colors", pequena ? "h-7 w-7" : "h-9 w-9",
        "bg-white/10 text-white hover:bg-primary hover:text-primary-foreground",
      )}
    >
      <ArrowUpRight className={pequena ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
    </Link>
  );
}

export function Variacao({ valor, escuro }: { valor: number; escuro?: boolean }) {
  const sobe = valor >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
      escuro ? "bg-primary text-primary-foreground"
        : sobe ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300",
    )}>
      {sobe ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
      {sobe ? "+" : "-"}{Math.abs(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

const TOM_ICONE = {
  alerta: "bg-amber-500/15 text-amber-400",
  critico: "bg-red-500/15 text-red-400",
  neutro: "bg-primary/15 text-primary",
} as const;

const ICONE_HOJE: Record<ItemHoje["severidade"], LucideIcon> = { critico: AlertTriangle, alerta: CalendarClock, info: Info };

export function ListaHoje({ itens }: { itens: ItemHoje[] }) {
  if (itens.length === 0) return <p className="py-10 text-center text-sm text-white/60">Nada pendente para hoje. ✔</p>;
  return (
    <ul className="-mx-2 max-h-[22rem] space-y-1 overflow-y-auto pr-1">
      {itens.map((i, n) => {
        const Icone = ICONE_HOJE[i.severidade];
        return (
          <li key={n}>
            <Link href={i.href} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/5">
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TOM_ICONE[i.severidade === "info" ? "neutro" : i.severidade])}>
                <Icone className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.titulo}</p>
                <p className="truncate text-xs text-white/60">{i.tipo} · {i.detalhe}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {i.valor !== undefined && <span className="num text-sm font-semibold">{formatBRL(i.valor)}</span>}
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70 group-hover:bg-primary group-hover:text-primary-foreground">{i.acao}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Superfície dos cartões de destaque: preto com brilho amarelo, como a logo. */
export const SUPERFICIE_DESTAQUE = "relative isolate flex h-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-[#1f1f1f] via-brand-black to-black p-6 text-white shadow-2xl shadow-black/30 ring-1 ring-primary/25";

export function BrilhoDestaque({ critico }: { critico?: boolean }) {
  return (
    <>
      <div aria-hidden className={cn("pointer-events-none absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full blur-3xl", critico ? "bg-red-500/20" : "bg-primary/25")} />
      <div aria-hidden className={cn("pointer-events-none absolute -bottom-16 -left-10 -z-10 h-64 w-64 rounded-full blur-3xl", critico ? "bg-red-500/5" : "bg-primary/10")} />
    </>
  );
}

/** Versão compacta do cartão "Faturado no mês": rótulo, valor grande, apoio e um mini gráfico embaixo. */
export function CartaoDestaque({ titulo, valor, sub, href, icone: Icone, critico, children }: {
  titulo: string;
  valor: React.ReactNode;
  sub?: React.ReactNode;
  href: string;
  icone: LucideIcon;
  /** vermelho em vez de amarelo (ex.: vencido com valor) */
  critico?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn(SUPERFICIE_DESTAQUE, "p-4", critico && "ring-red-500/30")}>
      <BrilhoDestaque critico={critico} />
      <div className="relative flex items-center gap-2">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", critico ? "bg-red-500/15 text-red-400" : "bg-primary/15 text-primary")}>
          <Icone className="h-4 w-4" aria-hidden />
        </span>
        <p className={cn("line-clamp-2 min-w-0 flex-1 text-[11px] font-semibold uppercase leading-tight tracking-wider", critico ? "text-red-400" : "text-primary")}>{titulo}</p>
        <Seta href={href} rotulo={`Abrir ${titulo}`} pequena />
      </div>
      <p className="num relative mt-2.5 truncate text-xl font-black tracking-tight">{valor}</p>
      {sub && <p className="relative truncate text-[11px] text-white/60">{sub}</p>}
      {children && <div className="relative mt-auto pt-3">{children}</div>}
    </section>
  );
}

/** Barra única dividida em partes proporcionais, com legenda. */
export function BarraSegmentada({ partes, formatar = String }: {
  partes: { rotulo: string; valor: number; cor: string }[];
  formatar?: (v: number) => string;
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/10">
        {total > 0 && partes.filter((p) => p.valor > 0).map((p) => (
          <div key={p.rotulo} className="h-full rounded-full" style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} title={`${p.rotulo}: ${formatar(p.valor)}`} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
        {partes.map((p) => (
          <li key={p.rotulo} className="flex items-center gap-1.5 text-[10px] text-white/60">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.cor }} aria-hidden />
            {p.rotulo} <span className="num font-semibold text-white">{formatar(p.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mini barras verticais (sem eixo) com rótulo curto embaixo de cada uma. */
export function BarrasMini({ barras, formatar = String, compacto }: {
  barras: { rotulo: string; valor: number; cor: string; titulo?: string }[];
  formatar?: (v: number) => string;
  /** muitas barras (ex.: 12 meses): menos espaço entre elas */
  compacto?: boolean;
}) {
  const max = Math.max(1, ...barras.map((b) => b.valor));
  return (
    <div className={cn("flex h-12 items-end", compacto ? "gap-1" : "gap-2")}>
      {barras.map((b) => (
        <div key={b.titulo ?? b.rotulo} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${b.titulo ?? b.rotulo}: ${formatar(b.valor)}`}>
          <div className="w-full max-w-8 rounded-sm" style={{ height: `${Math.max(8, (b.valor / max) * 100)}%`, background: b.valor ? b.cor : "rgba(255,255,255,.12)" }} />
          <span className="text-[9px] leading-none text-white/50">{b.rotulo}</span>
        </div>
      ))}
    </div>
  );
}
