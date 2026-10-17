"use client";
import { Badge } from "@/components/ui/basicos";
import { diffDias, hojeSP } from "@/lib/calculos";
import { formatData } from "@/lib/format";

/** Validade com cor: vencido (vermelho), ≤ 15 dias (âmbar), ≤ 30 dias (azul), ok (verde). */
export function ValidadeBadge({ validade }: { validade: string | null }) {
  if (!validade) return <span className="text-muted-foreground">—</span>;
  const d = diffDias(hojeSP(), validade);
  const v = d < 0 ? "critico" : d <= 15 ? "alerta" : d <= 30 ? "info" : "ok";
  return <Badge variant={v}>{formatData(validade)}{d < 0 ? " · vencido" : d === 0 ? " · hoje" : d <= 30 ? ` · ${d} d` : ""}</Badge>;
}
