// Sem "use client": usado tanto por Server Components (dashboard, manutenção) quanto por Client Components,
// e recebe o ícone (componente) como prop — o que não pode atravessar a fronteira servidor → cliente.
import type * as React from "react";
import Link from "next/link";
import { type LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/basicos";
import { cn } from "@/lib/utils";

export function KpiCard({ titulo, valor, icone: Icone, href, variacao, sub, destaque, tom }: {
  titulo: string;
  valor: React.ReactNode;
  icone?: LucideIcon;
  href?: string;
  /** variação percentual vs período anterior */
  variacao?: number | null;
  sub?: React.ReactNode;
  destaque?: boolean;
  tom?: "ok" | "alerta" | "critico";
}) {
  const conteudo = (
    <Card className={cn("h-full p-5 transition-colors sm:p-6", href && "hover:border-foreground/20", destaque && "border-brand-yellow bg-brand-yellow/5")}>
      <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {tom && <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", tom === "critico" && "bg-status-critico", tom === "alerta" && "bg-status-alerta", tom === "ok" && "bg-status-ok")} />}
        <span className="truncate">{titulo}</span>
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="num min-w-0 truncate text-xl font-semibold sm:text-[26px] sm:leading-tight">{valor}</p>
        {Icone && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/80">
            <Icone className="h-[18px] w-[18px]" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {variacao !== undefined && variacao !== null && (
          <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium", variacao >= 0 ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300")}>
            {variacao >= 0 ? "+" : "-"}{Math.abs(variacao).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            {variacao >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          </span>
        )}
        {sub}
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25">{conteudo}</Link> : conteudo;
}
