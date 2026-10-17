"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatNumeroBR, maskCpfCnpj, maskTelefone, normalizarPlaca } from "@/lib/format";
import { cn } from "@/lib/utils";

type InputBase = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">;

/** Moeda estilo caixa eletrônico: digitar 123456 → 1.234,56. Valor numérico (ou null). */
export const InputMoeda = React.forwardRef<HTMLInputElement, InputBase & {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  permitirVazio?: boolean;
}>(({ value, onChange, permitirVazio = true, className, ...props }, ref) => {
  const texto = value === null || value === undefined ? "" : formatNumeroBR(value);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input ref={ref} inputMode="numeric" autoComplete="off" className={cn("num pl-9 text-right", className)} value={texto}
        onChange={(e) => {
          const dig = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          if (!dig) return onChange(permitirVazio ? null : 0);
          onChange(Number(dig) / 100);
        }}
        onFocus={(e) => e.target.select()}
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
