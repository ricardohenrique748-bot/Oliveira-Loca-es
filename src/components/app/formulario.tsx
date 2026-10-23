"use client";
import * as React from "react";
import { useForm, Controller, type FieldValues, type DefaultValues, type Path, type Control, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType, ZodTypeDef } from "zod";
import { Check, ChevronDown, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox, Label } from "@/components/ui/basicos";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { consultarCnpj, type DadosCnpj } from "@/lib/cnpj";
import { validarCNPJ } from "@/lib/format";
import { InputCpfCnpj, InputMoeda, InputNumero, InputPlaca, InputTelefone } from "./campos";
import { CampoAnexo, type Bucket } from "./anexo";

export type TipoCampo =
  | "texto" | "email" | "textarea" | "moeda" | "numero" | "decimal" | "data" | "hora" | "mes" | "select" | "checkbox"
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
  /** tipo "cpf_cnpj": ao completar um CNPJ válido, consulta a Receita e preenche os campos vazios com o retorno */
  autoCnpj?: (d: DadosCnpj) => Partial<Record<Path<V>, unknown>>;
  /** fica na seção recolhida "Mais detalhes" (abre sozinha se tiver erro) */
  avancado?: boolean;
  /** tipo "select": opção "+ rótulo" que cadastra um item pelo nome e já o seleciona */
  criar?: { rotulo: string; salvar: (nome: string, valores: V) => Promise<{ ok: true; dados: { id: string } } | { ok: false; erro: string }> };
}

const COL: Record<number, string> = {
  1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4", 5: "sm:col-span-5", 6: "sm:col-span-6",
};

/** CNPJ com consulta automática: dispara uma vez por CNPJ completo e válido. */
function CampoCnpj<V extends FieldValues>({ campo, comum, value, onChange, form }: {
  campo: Campo<V>; comum: Record<string, unknown>; value: string | null; onChange: (v: string | null) => void; form?: UseFormReturn<V>;
}) {
  const [consultando, setConsultando] = React.useState(false);
  const ultimo = React.useRef<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abort.current?.abort(), []);

  const consultar = async (cnpj: string) => {
    if (!campo.autoCnpj || !form) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setConsultando(true);
    try {
      const d = await consultarCnpj(cnpj, ctl.signal);
      if (!d) return void toast.info("CNPJ não encontrado na Receita Federal");
      let n = 0;
      for (const [k, v] of Object.entries(campo.autoCnpj(d)) as [Path<V>, unknown][]) {
        const atual = form.getValues(k);
        if (v == null || v === "" || (atual != null && atual !== "")) continue;
        form.setValue(k, v as never, { shouldDirty: true, shouldValidate: true });
        n++;
      }
      if (d.situacao && d.situacao.toUpperCase() !== "ATIVA") toast.warning(`Situação na Receita: ${d.situacao}`);
      toast.success(n ? `${d.razao_social}: ${n} campo(s) preenchido(s) pela Receita` : `${d.razao_social} — campos já preenchidos foram mantidos`);
    } catch (e) {
      if (!ctl.signal.aborted) toast.error("Não foi possível consultar o CNPJ agora. Preencha manualmente.");
    } finally {
      if (abort.current === ctl) setConsultando(false);
    }
  };

  return (
    <div className="relative">
      <InputCpfCnpj {...comum} value={value} onChange={(v) => {
        onChange(v);
        const dig = (v ?? "").replace(/\D/g, "");
        if (dig.length === 14 && validarCNPJ(dig) && dig !== ultimo.current) { ultimo.current = dig; consultar(dig); }
      }} />
      {consultando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Consultando CNPJ" />}
    </div>
  );
}

/** Select com "+ Novo…": troca por um campo de nome, cadastra e seleciona o item criado. */
function SelectComCriar<V extends FieldValues>({ campo, comum, value, onChange, opcoes, valores }: {
  campo: Campo<V>; comum: Record<string, unknown>; value: string | null; onChange: (v: string | null) => void; opcoes: Opcao[]; valores: V;
}) {
  const [nome, setNome] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [criadas, setCriadas] = React.useState<Opcao[]>([]);
  const lista = [...opcoes, ...criadas.filter((c) => !opcoes.some((o) => o.value === c.value))];

  const salvar = async () => {
    const n = nome?.trim();
    if (!n || !campo.criar) return;
    setSalvando(true);
    try {
      const r = await campo.criar.salvar(n, valores);
      if (!r.ok) return void toast.error(r.erro);
      setCriadas((cs) => [...cs, { value: r.dados.id, label: n }]);
      onChange(r.dados.id);
      setNome(null);
      toast.success(`"${n}" cadastrada`);
    } finally {
      setSalvando(false);
    }
  };

  if (nome === null) {
    return <SelectSimples {...comum} value={value} onChange={onChange} opcoes={lista} vazio={campo.vazio} placeholder={campo.placeholder}
      novo={campo.criar && { rotulo: campo.criar.rotulo, onNovo: () => setNome("") }} />;
  }
  return (
    <div className="flex gap-1">
      <Input autoFocus placeholder={campo.criar?.rotulo} value={nome} disabled={salvando} onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); salvar(); }
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setNome(null); }
        }} />
      <Button type="button" size="icon" aria-label="Salvar" disabled={salvando || !nome.trim()} onClick={salvar}>{salvando ? <Loader2 className="animate-spin" /> : <Check />}</Button>
      <Button type="button" variant="ghost" size="icon" aria-label="Cancelar" disabled={salvando} onClick={() => setNome(null)}><X /></Button>
    </div>
  );
}

export function CampoControlado<V extends FieldValues>({ campo, control, valores, erro, form }: {
  campo: Campo<V>; control: Control<V>; valores: V; erro?: string; form?: UseFormReturn<V>;
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
            case "hora":
              return <Input {...comum} type="time" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />;
            case "mes":
              return <Input {...comum} type="month" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />;
            case "select":
              if (campo.criar) return <SelectComCriar campo={campo} comum={comum} value={field.value} onChange={field.onChange} valores={valores}
                opcoes={(typeof campo.opcoes === "function" ? campo.opcoes(valores) : campo.opcoes) ?? []} />;
              return <SelectSimples {...comum} value={field.value} onChange={field.onChange} opcoes={(typeof campo.opcoes === "function" ? campo.opcoes(valores) : campo.opcoes) ?? []} vazio={campo.vazio} placeholder={campo.placeholder} />;
            case "checkbox":
              return (
                <>
                  <Checkbox {...comum} checked={!!field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                  <Label htmlFor={id} className="cursor-pointer">{campo.rotulo}</Label>
                </>
              );
            case "cpf_cnpj":
              return campo.autoCnpj
                ? <CampoCnpj campo={campo} comum={comum} value={field.value} onChange={field.onChange} form={form} />
                : <InputCpfCnpj {...comum} value={field.value} onChange={field.onChange} />;
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
  /** título da seção recolhida dos campos `avancado` */
  rotuloAvancado?: string;
  /** ao mudar um campo, devolve outros valores a ajustar (ex.: modalidade → modelo do PDF) */
  aoAlterar?: (campo: string, valores: V) => Partial<Record<Path<V>, unknown>> | void;
}

export function Formulario<V extends FieldValues>({ campos, schema, valores, onSalvar, onSucesso, rotuloSalvar = "Salvar", extra, rodape, rotuloAvancado = "Mais detalhes", aoAlterar }: FormularioProps<V>) {
  const form = useForm<V>({ resolver: zodResolver(schema as never), defaultValues: valores });
  const atuais = form.watch();
  const [salvando, setSalvando] = React.useState(false);
  const [mostrarAvancado, setMostrarAvancado] = React.useState(false);

  React.useEffect(() => {
    if (!aoAlterar) return;
    const sub = form.watch((v, { name, type }) => {
      if (!name || type !== "change") return;
      for (const [k, val] of Object.entries(aoAlterar(name, v as V) ?? {}) as [Path<V>, unknown][]) {
        if (form.getValues(k) !== val) form.setValue(k, val as never, { shouldDirty: true });
      }
    });
    return () => sub.unsubscribe();
  }, [form, aoAlterar]);

  const erros = form.formState.errors as Record<string, { message?: string }>;
  const visiveis = campos.filter((c) => !c.visivel || c.visivel(atuais));
  const principais = visiveis.filter((c) => !c.avancado);
  const avancados = visiveis.filter((c) => c.avancado);
  const erroAvancado = avancados.some((c) => erros[String(c.nome)]);
  React.useEffect(() => { if (erroAvancado) setMostrarAvancado(true); }, [erroAvancado]);
  const grade = (cs: Campo<V>[]) => (
    <div className="grid grid-cols-6 gap-3">
      {cs.map((c) => (
        <CampoControlado key={String(c.nome)} campo={c} control={form.control} valores={atuais} form={form} erro={erros[String(c.nome)]?.message} />
      ))}
    </div>
  );

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
      {grade(principais)}
      {avancados.length > 0 && (
        <div className="rounded-md border">
          <button type="button" onClick={() => setMostrarAvancado((v) => !v)} aria-expanded={mostrarAvancado}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50">
            {rotuloAvancado}
            <ChevronDown className={cn("size-4 shrink-0 transition-transform", mostrarAvancado && "rotate-180")} />
          </button>
          {mostrarAvancado && <div className="border-t p-3">{grade(avancados)}</div>}
        </div>
      )}
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
