"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { Label } from "@/components/ui/basicos";
import { cn } from "@/lib/utils";

/** Lê/escreve parâmetros da URL (filtros, paginação). Mudar filtro volta para a página 1. */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendente, iniciar] = useTransition();

  const set = useCallback(
    (mudancas: Record<string, string | null | undefined>, opts: { manterPagina?: boolean } = {}) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(mudancas)) {
        if (v === null || v === undefined || v === "") p.delete(k);
        else p.set(k, v);
      }
      if (!opts.manterPagina && !("pagina" in mudancas)) p.delete("pagina");
      const qs = p.toString();
      iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [sp, pathname, router],
  );

  return { get: (k: string) => sp.get(k), set, pendente, params: sp };
}

export function BuscaUrl({ placeholder = "Buscar…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { get, set } = useUrlParams();
  const [valor, setValor] = useState(get(param) ?? "");
  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    const t = setTimeout(() => set({ [param]: valor.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder={placeholder} className="h-9 pl-9 pr-8" aria-label={placeholder} />
      {valor && (
        <button type="button" onClick={() => setValor("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Limpar busca">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function FiltroSelectUrl({
  param, opcoes, vazio = "Todos", rotulo, className,
}: { param: string; opcoes: Opcao[]; vazio?: string; rotulo: string; className?: string }) {
  const { get, set } = useUrlParams();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label className="text-xs text-muted-foreground">{rotulo}</Label>
      <SelectSimples aria-label={rotulo} className="h-9 min-w-[9rem]" value={get(param)} vazio={vazio} opcoes={opcoes} onChange={(v) => set({ [param]: v })} />
    </div>
  );
}

export function FiltroDataUrl({ param, rotulo, tipo = "date" }: { param: string; rotulo: string; tipo?: "date" | "month" }) {
  const { get, set } = useUrlParams();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`f-${param}`} className="text-xs text-muted-foreground">{rotulo}</Label>
      <Input id={`f-${param}`} type={tipo} className="h-9 w-40" value={get(param) ?? ""} onChange={(e) => set({ [param]: e.target.value || null })} />
    </div>
  );
}

export function BarraFiltros({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-end gap-2 sm:gap-3", className)}>{children}</div>;
}
