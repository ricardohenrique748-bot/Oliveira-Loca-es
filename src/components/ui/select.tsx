"use client";
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
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

/** Select simples controlado por string (com opção vazia opcional). */
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
  return (
    <Select value={value || (vazio ? VAZIO : undefined)} disabled={disabled}
      onValueChange={(v) => (v === NOVO ? novo?.onNovo() : onChange(v === VAZIO ? null : v))}>
      <SelectTrigger id={id} className={className} aria-invalid={invalido} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {novo && <SelectItem value={NOVO} className="font-medium text-primary">+ {novo.rotulo}</SelectItem>}
        {vazio && <SelectItem value={VAZIO}>{vazio}</SelectItem>}
        {opcoes.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
