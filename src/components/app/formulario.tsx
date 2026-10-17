"use client";
import * as React from "react";
import { useForm, Controller, type FieldValues, type DefaultValues, type Path, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType, ZodTypeDef } from "zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox, Label } from "@/components/ui/basicos";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { InputCpfCnpj, InputMoeda, InputNumero, InputPlaca, InputTelefone } from "./campos";
import { CampoAnexo, type Bucket } from "./anexo";

export type TipoCampo =
  | "texto" | "email" | "textarea" | "moeda" | "numero" | "decimal" | "data" | "mes" | "select" | "checkbox"
  | "cpf_cnpj" | "telefone" | "placa" | "anexo";

export interface Campo<V extends FieldValues> {
  nome: Path<V>;
  rotulo: string;
  tipo?: TipoCampo;
  opcoes?: Opcao[] | ((valores: V) => Opcao[]);
  /** rótulo da opção vazia no select ("Nenhum") */
  vazio?: string;
  placeholder?: string;
  ajuda?: string;
  /** largura na grade de 6 colunas (padrão 3 = metade) */
  col?: 1 | 2 | 3 | 4 | 5 | 6;
  obrigatorio?: boolean;
  visivel?: (valores: V) => boolean;
  desabilitado?: boolean | ((valores: V) => boolean);
  /** tipo "anexo": bucket e pasta no Storage */
  bucket?: Bucket;
  pasta?: string;
}

const COL: Record<number, string> = {
  1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4", 5: "sm:col-span-5", 6: "sm:col-span-6",
};

export function CampoControlado<V extends FieldValues>({ campo, control, valores, erro }: {
  campo: Campo<V>; control: Control<V>; valores: V; erro?: string;
}) {
  const id = `campo-${String(campo.nome)}`;
  const desabilitado = typeof campo.desabilitado === "function" ? campo.desabilitado(valores) : campo.desabilitado;
  const tipo = campo.tipo ?? "texto";
  return (
    <div className={cn("col-span-6 space-y-1.5", COL[campo.col ?? 3], tipo === "checkbox" && "flex items-center gap-2 space-y-0 self-end pb-2")}>
      {tipo !== "checkbox" && (
        <Label htmlFor={id}>
          {campo.rotulo}{campo.obrigatorio && <span className="text-destructive" aria-hidden> *</span>}
        </Label>
      )}
      <Controller
        control={control}
        name={campo.nome}
        render={({ field }) => {
          const comum = { id, disabled: desabilitado, "aria-invalid": !!erro, "aria-describedby": erro ? `${id}-erro` : undefined };
          switch (tipo) {
            case "textarea":
              return <Textarea {...comum} placeholder={campo.placeholder} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />;
            case "moeda":
              return <InputMoeda {...comum} value={field.value} onChange={field.onChange} />;
            case "numero":
            case "decimal":
              return <InputNumero {...comum} casas={tipo === "decimal" ? 2 : 0} value={field.value} onChange={field.onChange} placeholder={campo.placeholder} />;
            case "data":
              return <Input {...comum} type="date" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />;
            case "mes":
              return <Input {...comum} type="month" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />;
            case "select":
              return <SelectSimples {...comum} value={field.value} onChange={field.onChange} opcoes={(typeof campo.opcoes === "function" ? campo.opcoes(valores) : campo.opcoes) ?? []} vazio={campo.vazio} placeholder={campo.placeholder} />;
            case "checkbox":
              return (
                <>
                  <Checkbox {...comum} checked={!!field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                  <Label htmlFor={id} className="cursor-pointer">{campo.rotulo}</Label>
                </>
              );
            case "cpf_cnpj":
              return <InputCpfCnpj {...comum} value={field.value} onChange={field.onChange} />;
            case "telefone":
              return <InputTelefone {...comum} value={field.value} onChange={field.onChange} />;
            case "anexo":
              return <CampoAnexo bucket={campo.bucket ?? "anexos"} pasta={campo.pasta} valor={field.value} onChange={field.onChange} />;
            case "placa":
              return <InputPlaca {...comum} value={field.value} onChange={field.onChange} />;
            default:
              return <Input {...comum} type={tipo === "email" ? "email" : "text"} placeholder={campo.placeholder} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />;
          }
        }}
      />
      {campo.ajuda && !erro && <p className="text-xs text-muted-foreground">{campo.ajuda}</p>}
      {erro && <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}

export type RespostaAcao = { ok: true; mensagem?: string } | { ok: false; erro: string };

export interface FormularioProps<V extends FieldValues> {
  campos: Campo<V>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: ZodType<V, ZodTypeDef, any>;
  valores: DefaultValues<V>;
  onSalvar: (v: V) => Promise<RespostaAcao>;
  onSucesso?: () => void;
  rotuloSalvar?: string;
  /** conteúdo extra abaixo dos campos (ex.: resumo calculado) */
  extra?: (valores: V) => React.ReactNode;
  rodape?: React.ReactNode;
}

export function Formulario<V extends FieldValues>({ campos, schema, valores, onSalvar, onSucesso, rotuloSalvar = "Salvar", extra, rodape }: FormularioProps<V>) {
  const form = useForm<V>({ resolver: zodResolver(schema as never), defaultValues: valores });
  const atuais = form.watch();
  const [salvando, setSalvando] = React.useState(false);

  const enviar = form.handleSubmit(async (v) => {
    setSalvando(true);
    try {
      const r = await onSalvar(v);
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo com sucesso");
        onSucesso?.();
      } else toast.error(r.erro);
    } finally {
      setSalvando(false);
    }
  });

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div className="grid grid-cols-6 gap-3">
        {campos.filter((c) => !c.visivel || c.visivel(atuais)).map((c) => (
          <CampoControlado key={String(c.nome)} campo={c} control={form.control} valores={atuais}
            erro={(form.formState.errors as Record<string, { message?: string }>)[String(c.nome)]?.message} />
        ))}
      </div>
      {extra?.(atuais)}
      <DialogFooter>
        {rodape}
        <Button type="submit" disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} {rotuloSalvar}</Button>
      </DialogFooter>
    </form>
  );
}

export function FormularioDialog<V extends FieldValues>({
  aberto, onOpenChange, titulo, descricao, tamanho = "md", ...props
}: FormularioProps<V> & {
  aberto: boolean; onOpenChange: (v: boolean) => void; titulo: string; descricao?: string; tamanho?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho={tamanho}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao ? <DialogDescription>{descricao}</DialogDescription> : <DialogDescription className="sr-only">{titulo}</DialogDescription>}
        </DialogHeader>
        {aberto && <Formulario {...props} onSucesso={() => { props.onSucesso?.(); onOpenChange(false); }} />}
      </DialogContent>
    </Dialog>
  );
}
