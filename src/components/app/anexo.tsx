"use client";
import * as React from "react";
import { Loader2, Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Bucket = "comprovantes" | "anexos" | "fotos";

/** Referência salva no banco: "bucket/caminho/arquivo.pdf" */
function separar(ref: string): { bucket: string; caminho: string } {
  const i = ref.indexOf("/");
  return { bucket: ref.slice(0, i), caminho: ref.slice(i + 1) };
}

/** Um campo pode guardar vários anexos, um por linha. */
export function separarAnexos(valor: string | null | undefined): string[] {
  return (valor ?? "").split("\n").map((r) => r.trim()).filter(Boolean);
}

export async function enviarArquivo(bucket: Bucket, arquivo: File, pasta = ""): Promise<string> {
  const supabase = createClient();
  const limpo = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
  const d = new Date();
  const caminho = `${pasta ? pasta + "/" : ""}${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID().slice(0, 8)}-${limpo}`;
  const { error } = await supabase.storage.from(bucket).upload(caminho, arquivo, { upsert: false, contentType: arquivo.type });
  if (error) throw error;
  return `${bucket}/${caminho}`;
}

export async function abrirArquivo(ref: string) {
  const supabase = createClient();
  const { bucket, caminho } = separar(ref);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, 300);
  if (error || !data) return toast.error("Não foi possível abrir o arquivo");
  window.open(data.signedUrl, "_blank", "noopener");
}

export function LinkAnexo({ referencia, rotulo }: { referencia: string | null | undefined; rotulo?: string }) {
  const refs = separarAnexos(referencia);
  if (refs.length === 0) return null;
  if (refs.length > 1) {
    return (
      <span className="flex flex-col gap-0.5">
        {refs.map((r, i) => <LinkAnexo key={r} referencia={r} rotulo={rotulo && `${rotulo} ${i + 1}`} />)}
      </span>
    );
  }
  const ref = refs[0];
  const nome = ref.split("/").pop()?.replace(/^[0-9a-f]{8}-/, "") ?? "arquivo";
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); abrirArquivo(ref); }}
      className="inline-flex max-w-full items-center gap-1 text-sm text-foreground underline-offset-2 hover:underline">
      <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{rotulo ?? nome}</span>
    </button>
  );
}

/** Com `multiplo`, aceita vários arquivos (o valor junta as referências, uma por linha). */
export function CampoAnexo({ bucket, pasta, valor, onChange, aceitar = "image/*,application/pdf", rotulo = "Anexar arquivo", className, multiplo = false }: {
  bucket: Bucket; pasta?: string; valor: string | null | undefined; onChange: (ref: string | null) => void; aceitar?: string; rotulo?: string; className?: string; multiplo?: boolean;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = React.useState(false);
  const refs = separarAnexos(valor);
  const definir = (lista: string[]) => onChange(lista.length ? lista.join("\n") : null);
  return (
    <div className={cn(multiplo ? "flex flex-col items-start gap-1" : "flex flex-wrap items-center gap-2", className)}>
      <input ref={input} type="file" accept={aceitar} multiple={multiplo} className="hidden"
        onChange={async (e) => {
          const arquivos = Array.from(e.target.files ?? []);
          if (arquivos.length === 0) return;
          if (arquivos.some((f) => f.size > 10 * 1024 * 1024)) { e.target.value = ""; return toast.error("Arquivo maior que 10 MB"); }
          setEnviando(true);
          try {
            const novos: string[] = [];
            for (const f of arquivos) novos.push(await enviarArquivo(bucket, f, pasta));
            definir(multiplo ? [...refs, ...novos] : novos);
            toast.success(novos.length > 1 ? `${novos.length} arquivos anexados` : "Arquivo anexado");
          } catch (err) {
            toast.error("Falha no upload: " + (err as Error).message);
          } finally {
            setEnviando(false);
            e.target.value = "";
          }
        }} />
      {refs.map((r) => (
        <div key={r} className="flex max-w-full items-center gap-2">
          <LinkAnexo referencia={r} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover anexo" onClick={() => definir(refs.filter((x) => x !== r))}><X /></Button>
        </div>
      ))}
      {(multiplo || refs.length === 0) && (
        <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={() => input.current?.click()}>
          {enviando ? <Loader2 className="animate-spin" /> : <Upload />} {refs.length ? "Anexar mais" : rotulo}
        </Button>
      )}
    </div>
  );
}
