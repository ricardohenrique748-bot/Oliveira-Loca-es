"use client";
import * as React from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SelectSimples } from "@/components/ui/select";
import { enviarArquivo, LinkAnexo } from "@/components/app/anexo";
import { LAUDOS, type TipoLaudo } from "@/lib/schemas/manutencao";
import { ROTULOS } from "@/lib/schemas/cadastros";

type Laudos = Partial<Record<TipoLaudo, string | null>>;

const opcoes = LAUDOS.map((t) => ({ value: t, label: ROTULOS.tipoDocumento[t] }));

/** Palavras do nome do arquivo que indicam o laudo (a ordem importa: "plano de manutenção preventiva" é plano, não OS). */
const PISTAS: [TipoLaudo, RegExp][] = [
  ["laudo_viabilidade", /viabilidade/],
  ["laudo_dieletrico", /dieletric/],
  ["apreciacao_riscos_hrn", /hrn|risco|apreciacao/],
  ["laudo_escada", /escada/],
  ["laudo_guarda_corpo", /guarda/],
  ["laudo_opacidade", /opacidade|fumaca/],
  ["checklist_fotografico", /fotogra|registro/],
  ["checklist_detalhado", /detalhad/],
  ["plano_manutencao", /plano.*manut|manut.*plano/],
  ["plano_inspecao", /inspecao|procedimento|operacional/],
  ["os_preventiva", /preventiva|(^|[^a-z])os([^a-z]|$)/],
  ["checklist_detalhado", /checklist|check.list/],
];

function adivinhar(nome: string): TipoLaudo | null {
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return PISTAS.find(([, re]) => re.test(n))?.[0] ?? null;
}

/**
 * "Todos os laudos": um botão só para escolher vários PDFs. Cada arquivo vai para o laudo reconhecido pelo nome
 * (ou o próximo livre) e o tipo pode ser trocado na lista.
 */
export function ImportarLaudos({ value, onChange }: { value: Laudos | null | undefined; onChange: (v: Laudos) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = React.useState(false);
  const atual: Laudos = value ?? {};
  const anexados = LAUDOS.filter((t) => atual[t]);

  async function importar(arquivos: File[]) {
    if (arquivos.some((f) => f.size > 10 * 1024 * 1024)) return toast.error("Arquivo maior que 10 MB");
    setEnviando(true);
    const novo: Laudos = { ...atual };
    const livre = () => LAUDOS.find((t) => !novo[t]);
    let ignorados = 0;
    try {
      // reconhecidos primeiro, para os sem pista não ocuparem o lugar deles
      const ordenados = [...arquivos].sort((a, b) => Number(!adivinhar(a.name)) - Number(!adivinhar(b.name)));
      for (const f of ordenados) {
        const palpite = adivinhar(f.name);
        const tipo = palpite && !novo[palpite] ? palpite : livre();
        if (!tipo) { ignorados++; continue; }
        novo[tipo] = await enviarArquivo("anexos", f, "documentos");
      }
      onChange(novo);
      const enviados = arquivos.length - ignorados;
      toast.success(`${enviados} ${enviados === 1 ? "arquivo importado" : "arquivos importados"} — confira o tipo de cada um`);
      if (ignorados) toast.warning(`${ignorados} ${ignorados === 1 ? "arquivo ficou" : "arquivos ficaram"} de fora: todos os laudos já têm anexo`);
    } catch (err) {
      onChange(novo);
      toast.error("Falha no upload: " + (err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  /** Trocar o tipo para um já usado troca os dois de lugar. */
  function trocarTipo(de: TipoLaudo, para: TipoLaudo) {
    if (de === para) return;
    onChange({ ...atual, [para]: atual[de], [de]: atual[para] ?? null });
  }

  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="application/pdf,image/*" multiple className="hidden"
        onChange={(e) => { const a = Array.from(e.target.files ?? []); e.target.value = ""; if (a.length) importar(a); }} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={() => input.current?.click()}>
          {enviando ? <Loader2 className="animate-spin" /> : <Upload />} {anexados.length ? "Importar mais PDFs" : "Importar PDFs"}
        </Button>
        <span className="text-xs text-muted-foreground">{anexados.length} de {LAUDOS.length} laudos anexados · selecione todos os arquivos de uma vez</span>
      </div>
      {anexados.length > 0 && (
        <ul className="divide-y rounded-md border">
          {anexados.map((t) => (
            <li key={t} className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><LinkAnexo referencia={atual[t]} /></div>
              <SelectSimples value={t} onChange={(v) => v && trocarTipo(t, v as TipoLaudo)} opcoes={opcoes} aria-label="Tipo do laudo" className="sm:w-72" />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover anexo" onClick={() => onChange({ ...atual, [t]: null })}><X /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
