"use client";
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger ref={ref}
      className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-foreground/15 bg-foreground/[0.04] px-3 py-2 text-sm transition-all hover:border-foreground/25 placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive [&>span]:line-clamp-1 [&>span]:text-left", className)}
      {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  ),
);
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(
  ({ className, children, position = "popper", ...props }, ref) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content ref={ref} position={position}
        className={cn(
          "relative z-50 max-h-80 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          position === "popper" && "w-full min-w-[var(--radix-select-trigger-width)] data-[side=bottom]:translate-y-1",
          className,
        )}
        {...props}>
        <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1"><ChevronUp className="h-4 w-4" /></SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1"><ChevronDown className="h-4 w-4" /></SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
);
SelectContent.displayName = "SelectContent";

export const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item ref={ref}
      className={cn("relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)}
      {...props}>
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  ),
);
SelectItem.displayName = "SelectItem";

/** Valor especial para "nenhum/todos" (Radix não aceita value="") */
export const VAZIO = "__vazio__";
/** Valor especial da opção "+ Novo…" (não vira valor do campo) */
const NOVO = "__novo__";

export interface Opcao {
  value: string;
  label: string;
}

/** a partir de quantas opções a lista ganha a busca */
const MIN_BUSCA = 8;
/** compara sem acento, maiúscula, traço ou espaço ("kif1264" acha "KIF-1264") */
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s.\-/]/g, "").toLowerCase();

/** Select simples controlado por string (com opção vazia opcional); listas longas têm busca (lupa) no topo. */
export function SelectSimples({
  value, onChange, opcoes, placeholder = "Selecione…", vazio, className, disabled, id, "aria-invalid": invalido, "aria-label": ariaLabel, novo,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  opcoes: Opcao[];
  placeholder?: string;
  /** rótulo da opção vazia (ex.: "Todas"); omitido = sem opção vazia */
  vazio?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  /** opção no topo da lista para cadastrar um item novo (ex.: "+ Nova categoria") */
  novo?: { rotulo: string; onNovo: () => void };
}) {
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const campoBusca = React.useRef<HTMLInputElement>(null);
  const comBusca = opcoes.length >= MIN_BUSCA;
  const termo = normalizar(busca);
  // a opção selecionada fica sempre na lista (o Radix precisa dela para mostrar o valor no campo)
  const filtradas = termo ? opcoes.filter((o) => o.value === value || normalizar(o.label).includes(termo)) : opcoes;
  const nenhuma = !!termo && !filtradas.some((o) => o.value !== value);

  React.useEffect(() => {
    if (!aberto || !comBusca) return;
    const t = setTimeout(() => campoBusca.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [aberto, comBusca]);

  return (
    <Select value={value || (vazio ? VAZIO : undefined)} disabled={disabled} open={aberto}
      onOpenChange={(v) => { setAberto(v); if (!v) setBusca(""); }}
      onValueChange={(v) => (v === NOVO ? novo?.onNovo() : onChange(v === VAZIO ? null : v))}>
      <SelectTrigger id={id} className={className} aria-invalid={invalido} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        onKeyDownCapture={(e) => {
          // digitar com o foco num item (ex.: mouse em cima) também vai para a busca, não para o "pular para a letra" do Radix
          if (!comBusca || e.target === campoBusca.current) return;
          if (e.key.length === 1 || e.key === "Backspace") {
            e.preventDefault(); e.stopPropagation();
            setBusca((b) => (e.key === "Backspace" ? b.slice(0, -1) : b + e.key));
            campoBusca.current?.focus();
          }
        }}>
        {comBusca && (
          <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 border-b bg-popover p-1.5">
            <div className="flex items-center gap-2 rounded-md bg-foreground/[0.06] px-2">
              <Search className="h-4 w-4 shrink-0 opacity-60" />
              <input ref={campoBusca} value={busca} placeholder="Pesquisar…" aria-label="Pesquisar na lista"
                className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  // setas e Enter navegam/escolhem na lista; o resto fica na busca
                  if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape" || e.key === "Tab") return;
                  if (e.key === "Enter") { e.preventDefault(); const [primeira] = filtradas; if (primeira && termo) { onChange(primeira.value); setAberto(false); setBusca(""); } return; }
                  e.stopPropagation();
                }} />
            </div>
          </div>
        )}
        {novo && <SelectItem value={NOVO} className="font-medium text-primary">+ {novo.rotulo}</SelectItem>}
        {vazio && !termo && <SelectItem value={VAZIO}>{vazio}</SelectItem>}
        {filtradas.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
        {nenhuma && <p className="px-2 py-1.5 text-sm text-muted-foreground">Nada encontrado</p>}
      </SelectContent>
    </Select>
  );
}
