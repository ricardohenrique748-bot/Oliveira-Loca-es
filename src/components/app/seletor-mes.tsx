"use client";
import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Seletor de mês (valor "AAAA-MM") com calendário: setas para o ano e grade dos 12 meses. */
export function SeletorMes({ id, value, onChange, min, max, className }: {
  id?: string; value: string; onChange: (v: string) => void;
  /** limites opcionais "AAAA-MM": meses fora ficam desabilitados */
  min?: string; max?: string; className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const anoValor = Number(value.slice(0, 4)) || new Date().getFullYear();
  const [ano, setAno] = React.useState(anoValor);
  React.useEffect(() => { if (aberto) setAno(anoValor); }, [aberto, anoValor]);
  const mesValor = Number(value.slice(5, 7));
  const hoje = new Date();
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button id={id} type="button"
          className={cn("flex h-9 w-44 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", className)}>
          <span>{mesValor ? `${MESES_LONGO[mesValor - 1]} de ${anoValor}` : "Selecione…"}</span>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setAno(ano - 1)} aria-label="Ano anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold">{ano}</span>
          <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => setAno(ano + 1)} aria-label="Próximo ano"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MESES.map((m, i) => {
            const v = `${ano}-${String(i + 1).padStart(2, "0")}`;
            const fora = (min && v < min) || (max && v > max);
            return (
              <button key={m} type="button" disabled={!!fora}
                onClick={() => { onChange(v); setAberto(false); }}
                className={cn("rounded-md py-2 text-sm capitalize hover:bg-accent disabled:pointer-events-none disabled:opacity-40",
                  v === value && "bg-primary text-primary-foreground hover:bg-primary",
                  v !== value && v === atual && "border border-primary/50")}>
                {m}
              </button>
            );
          })}
        </div>
        <button type="button" className="mt-2 w-full rounded-md py-1.5 text-xs text-muted-foreground hover:bg-accent"
          onClick={() => { onChange(atual); setAberto(false); }}>Este mês</button>
      </PopoverContent>
    </Popover>
  );
}
