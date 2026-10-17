// Sem "use client": usado tanto por Server Components (dashboard, manutenção) quanto por Client Components,
// e recebe o ícone (componente) como prop — o que não pode atravessar a fronteira servidor → cliente.
import type * as React from "react";
import Link from "next/link";
import { type LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const COR_TOM = {
  ok: { texto: "text-green-400", fundo: "bg-green-500/15", ponto: "bg-green-400" },
  alerta: { texto: "text-amber-400", fundo: "bg-amber-500/15", ponto: "bg-amber-400" },
  critico: { texto: "text-red-400", fundo: "bg-red-500/15", ponto: "bg-red-400" },
} as const;

/** Card de indicador no visual da marca: preto com brilho amarelo, rótulo em caixa alta e valor em destaque. */
export function KpiCard({ titulo, valor, icone: Icone, href, variacao, sub, destaque, tom }: {
  titulo: string;
  valor: React.ReactNode;
  icone?: LucideIcon;
  href?: string;
  /** variação percentual vs período anterior */
  variacao?: number | null;
  sub?: React.ReactNode;
  /** selecionado (ex.: filtro ativo) */
  destaque?: boolean;
  tom?: "ok" | "alerta" | "critico";
}) {
  const cor = tom ? COR_TOM[tom] : null;
  const conteudo = (
    <section className={cn(
      "relative isolate flex h-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-[#1f1f1f] via-brand-black to-black p-4 text-left text-white shadow-lg shadow-black/20 ring-1 transition",
      destaque ? "ring-2 ring-primary" : tom === "critico" ? "ring-red-500/30" : "ring-primary/20",
      href && !destaque && "hover:ring-primary/50",
    )}>
      <div aria-hidden className={cn("pointer-events-none absolute -right-12 -top-16 -z-10 h-40 w-40 rounded-full blur-3xl", tom === "critico" ? "bg-red-500/20" : "bg-primary/20")} />
      <div className="flex min-w-0 items-center gap-2">
        {Icone ? (
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", cor ? cn(cor.fundo, cor.texto) : "bg-primary/15 text-primary")}>
            <Icone className="h-4 w-4" aria-hidden />
          </span>
        ) : cor && <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", cor.ponto)} />}
        <p className={cn("line-clamp-2 min-w-0 text-[11px] font-semibold uppercase leading-tight tracking-wider", cor?.texto ?? "text-primary")}>{titulo}</p>
      </div>
      <p className="num mt-2.5 break-words text-xl font-black leading-tight tracking-tight">{valor}</p>
      {(sub || (variacao !== undefined && variacao !== null)) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
          {variacao !== undefined && variacao !== null && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold", variacao >= 0 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400")}>
              {variacao >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {variacao >= 0 ? "+" : "-"}{Math.abs(variacao).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </span>
          )}
          {sub}
        </div>
      )}
    </section>
  );
  return href ? <Link href={href} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">{conteudo}</Link> : conteudo;
}
