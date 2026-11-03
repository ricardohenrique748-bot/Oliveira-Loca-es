"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const pad = (n: number) => String(n).padStart(2, "0");
const isoDe = (ano: number, mes: number, dia: number) => `${ano}-${pad(mes)}-${pad(dia)}`;

/** dias entre a e b (inclusive), em ordem */
function intervalo(a: string, b: string): string[] {
  const [i, f] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let d = new Date(`${i}T00:00:00Z`); d.toISOString().slice(0, 10) <= f; d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/**
 * Calendário de um mês para marcar dias soltos (valor: datas "AAAA-MM-DD").
 * Clique liga/desliga o dia; Shift + clique marca todos os dias desde o último clicado.
 */
export function CalendarioDias({ value, onChange, mesInicial, max }: {
  value: string[]; onChange: (datas: string[]) => void;
  /** mês que aparece ao abrir ("AAAA-MM") */
  mesInicial: string;
  /** limite de dias marcados */
  max?: number;
}) {
  const [mes, setMes] = React.useState(mesInicial);
  React.useEffect(() => setMes(mesInicial), [mesInicial]);
  const ultimo = React.useRef<string | null>(null);
  const marcados = React.useMemo(() => new Set(value), [value]);

  const ano = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const vazios = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay();
  const andar = (n: number) => {
    const d = new Date(Date.UTC(ano, m - 1 + n, 1));
    setMes(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };
  const doMes = Array.from({ length: diasNoMes }, (_, i) => isoDe(ano, m, i + 1));
  const marcadosNoMes = doMes.filter((d) => marcados.has(d)).length;

  const aplicar = (novos: Set<string>) => {
    const lista = [...novos].sort();
    onChange(max ? lista.slice(0, max) : lista);
  };
  const clicar = (data: string, shift: boolean) => {
    const novos = new Set(marcados);
    if (shift && ultimo.current) {
      // Shift: marca (ou desmarca, se o último clique desmarcou) todo o trecho
      const ligar = marcados.has(ultimo.current);
      for (const d of intervalo(ultimo.current, data)) if (ligar) novos.add(d); else novos.delete(d);
    } else if (novos.has(data)) novos.delete(data);
    else novos.add(data);
    ultimo.current = data;
    aplicar(novos);
  };
  const mesInteiro = () => {
    const novos = new Set(marcados);
    const todos = marcadosNoMes === diasNoMes;
    for (const d of doMes) if (todos) novos.delete(d); else novos.add(d);
    aplicar(novos);
  };

  return (
    <div className="w-full max-w-xs rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => andar(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold">{MESES_LONGO[m - 1]} de {ano}</span>
        <button type="button" className="rounded p-1 hover:bg-accent" onClick={() => andar(1)} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {SEMANA.map((s, i) => <div key={i} className="py-1 font-medium">{s}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: vazios }, (_, i) => <div key={`v${i}`} />)}
        {doMes.map((data, i) => {
          const on = marcados.has(data);
          const dow = (vazios + i) % 7;
          const cheio = !on && !!max && value.length >= max;
          return (
            <button key={data} type="button" aria-pressed={on} aria-label={`${pad(i + 1)}/${pad(m)}`} disabled={cheio}
              onClick={(e) => clicar(data, e.shiftKey)}
              className={cn("num h-8 rounded text-sm transition-colors disabled:opacity-30",
                on ? "bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                  : cn("hover:bg-accent", (dow === 0 || dow === 6) && "text-muted-foreground"))}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <button type="button" className="text-primary hover:underline" onClick={mesInteiro}>
          {marcadosNoMes === diasNoMes ? "Desmarcar o mês" : "Marcar o mês todo"}
        </button>
        {value.length > 0 && <button type="button" className="text-muted-foreground hover:underline" onClick={() => onChange([])}>Limpar tudo</button>}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Clique para marcar ou desmarcar. Shift + clique marca um trecho.</p>
    </div>
  );
}
