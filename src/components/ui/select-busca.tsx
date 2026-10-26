"use client";
import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import type { Opcao } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** "Construtora São João" → "construtorasaojoao", "ABC-1D23" → "abc1d23" (busca sem acento, caixa, espaço nem traço) */
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Select com barra de busca, para listas longas (clientes, placas).
 * Mesmas props do SelectSimples; setas ↑ ↓ andam na lista e Enter escolhe.
 */
export function SelectBusca({
  value, onChange, opcoes, placeholder = "Selecione…", vazio, className, disabled, id, "aria-label": ariaLabel, novo, busca = "Buscar…",
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  opcoes: Opcao[];
  placeholder?: string;
  /** rótulo da opção vazia (ex.: "Sem placa"); omitido = sem opção vazia */
  vazio?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  /** opção no topo da lista para cadastrar um item novo (ex.: "+ Novo cliente") */
  novo?: { rotulo: string; onNovo: () => void };
  /** placeholder da barra de busca */
  busca?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [termo, setTermo] = React.useState("");
  const [ativo, setAtivo] = React.useState(0);
  const lista = React.useRef<HTMLDivElement>(null);

  const filtradas = React.useMemo(() => {
    const t = normalizar(termo.trim());
    return t ? opcoes.filter((o) => normalizar(o.label).includes(t)) : opcoes;
  }, [opcoes, termo]);
  // linhas navegáveis: novo (sempre), vazio (só sem busca) e as opções filtradas
  const linhas = React.useMemo(() => [
    ...(novo ? [{ tipo: "novo" as const, value: "", label: `+ ${novo.rotulo}` }] : []),
    ...(vazio && !termo.trim() ? [{ tipo: "vazio" as const, value: "", label: vazio }] : []),
    ...filtradas.map((o) => ({ tipo: "opcao" as const, ...o })),
  ], [novo, vazio, termo, filtradas]);

  React.useEffect(() => { if (!aberto) setTermo(""); }, [aberto]);
  // ao buscar, destaca o primeiro resultado (pula o "+ Novo")
  React.useEffect(() => { setAtivo(novo && termo.trim() && linhas.length > 1 ? 1 : 0); }, [termo, novo, linhas.length]);
  React.useEffect(() => { lista.current?.querySelector(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: "nearest" }); }, [ativo]);

  const escolher = (l: (typeof linhas)[number]) => {
    setAberto(false);
    if (l.tipo === "novo") novo?.onNovo();
    else onChange(l.tipo === "vazio" ? null : l.value);
  };
  const teclar = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((i) => Math.min(linhas.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (linhas[ativo]) escolher(linhas[ativo]); }
  };

  const atual = opcoes.find((o) => o.value === value)?.label ?? (!value && vazio ? vazio : null);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" id={id} aria-label={ariaLabel} role="combobox" aria-expanded={aberto}
          className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-foreground/15 bg-foreground/[0.04] px-3 py-2 text-left text-sm transition-all hover:border-foreground/25 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50", className)}>
          <span className={cn("line-clamp-1", !atual && "text-muted-foreground")}>{atual ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[12rem] p-0" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector("input")?.focus(); }}>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={teclar} placeholder={busca} aria-label={busca}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <div ref={lista} role="listbox" className="max-h-72 overflow-y-auto p-1">
          {linhas.map((l, i) => (
            <div key={`${l.tipo}-${l.value}`} data-indice={i} role="option" aria-selected={l.tipo === "opcao" && l.value === value}
              onMouseEnter={() => setAtivo(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(l)}
              className={cn("relative flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm", i === ativo && "bg-accent text-accent-foreground",
                l.tipo === "novo" && "font-medium text-primary")}>
              {((l.tipo === "opcao" && l.value === value) || (l.tipo === "vazio" && !value)) && <Check className="absolute left-2 h-4 w-4" />}
              {l.label}
            </div>
          ))}
          {!filtradas.length && termo.trim() && <p className="px-2 py-3 text-center text-sm text-muted-foreground">Nada encontrado para “{termo.trim()}”</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
