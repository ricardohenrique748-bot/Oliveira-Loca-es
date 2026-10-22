"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatNumeroBR, maskCpfCnpj, maskTelefone, normalizarPlaca, parseBRL } from "@/lib/format";
import { arred2 } from "@/lib/calculos/dinheiro";
import { cn } from "@/lib/utils";

type InputBase = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">;

/**
 * Moeda em reais: digitar 400 → 400,00; centavos depois da vírgula (1234,5 → 1.234,50). Valor numérico (ou null).
 * Enquanto edita, o texto fica como foi digitado (sem reformatar a cada tecla, o cursor não pula); formata ao sair.
 */
export const InputMoeda = React.forwardRef<HTMLInputElement, InputBase & {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  permitirVazio?: boolean;
}>(({ value, onChange, permitirVazio = true, className, onBlur, ...props }, ref) => {
  const [editando, setEditando] = React.useState<string | null>(null);
  const texto = editando ?? (value === null || value === undefined ? "" : formatNumeroBR(value));
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input ref={ref} inputMode="decimal" autoComplete="off" className={cn("num pl-9 text-right", className)} value={texto}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, "");
          setEditando(t);
          const n = parseBRL(t);
          onChange(n === null ? (permitirVazio ? null : 0) : arred2(n));
        }}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => { setEditando(null); onBlur?.(e); }}
        {...props} />
    </div>
  );
});
InputMoeda.displayName = "InputMoeda";

function InputMascara({ mascara, value, onChange, ...props }: InputBase & {
  mascara: (s: string) => string; value: string | null | undefined; onChange: (v: string | null) => void;
}) {
  return <Input value={value ?? ""} onChange={(e) => onChange(e.target.value ? mascara(e.target.value) : null)} {...props} />;
}

export function InputCpfCnpj(props: InputBase & { value: string | null | undefined; onChange: (v: string | null) => void }) {
  return <InputMascara mascara={maskCpfCnpj} inputMode="numeric" placeholder="000.000.000-00 ou 00.000.000/0000-00" {...props} />;
}

export function InputTelefone(props: InputBase & { value: string | null | undefined; onChange: (v: string | null) => void }) {
  return <InputMascara mascara={maskTelefone} inputMode="tel" placeholder="(17) 99999-9999" {...props} />;
}

/** Placa Mercosul (ABC1D23) ou antiga (ABC1234), sempre maiúscula e sem hífen */
export function InputPlaca(props: InputBase & { value: string | null | undefined; onChange: (v: string | null) => void }) {
  return <InputMascara mascara={normalizarPlaca} placeholder="ABC1D23" className="font-mono uppercase tracking-wider" maxLength={8} {...props} />;
}

export function InputNumero({ value, onChange, casas = 0, ...props }: InputBase & {
  value: number | null | undefined; onChange: (v: number | null) => void; casas?: number;
}) {
  const [texto, setTexto] = React.useState(value == null ? "" : String(value).replace(".", ","));
  React.useEffect(() => {
    const atual = texto === "" ? null : Number(texto.replace(/\./g, "").replace(",", "."));
    if (atual !== value) setTexto(value == null ? "" : String(value).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input inputMode={casas ? "decimal" : "numeric"} className="num" value={texto} {...props}
      onChange={(e) => {
        const t = e.target.value.replace(casas ? /[^\d,]/g : /\D/g, "");
        setTexto(t);
        const n = t === "" ? null : Number(t.replace(",", "."));
        onChange(n === null || Number.isNaN(n) ? null : n);
      }} />
  );
}
