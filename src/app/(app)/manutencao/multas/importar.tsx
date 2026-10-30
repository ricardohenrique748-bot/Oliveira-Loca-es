"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Badge, Checkbox } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { InputMoeda } from "@/components/app/campos";
import { enviarArquivo } from "@/components/app/anexo";
import { createClient } from "@/lib/supabase/client";
import { formatData } from "@/lib/format";
import { interpretarMulta, normalizarPlaca, textoDasPaginas, type MultaLida } from "@/lib/multas/ler-pdf";
import type { MultaForm } from "@/lib/schemas/manutencao";
import { salvarMulta } from "../actions";

type Item = {
  chave: string; arquivo: File; lida: MultaLida;
  incluir: boolean; veiculo_id: string | null; auto_infracao: string; valor: number | null; vencimento: string | null; responsavel: MultaForm["responsavel"];
  duplicada: boolean;
};

const RESPONSAVEL: Opcao[] = [{ value: "empresa", label: "Empresa" }, { value: "cliente", label: "Cliente (cobrar)" }, { value: "locador", label: "Locador (descontar)" }];
const limparPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** prazos e dados que não têm campo próprio vão para as observações */
function observacoes(m: MultaLida) {
  return [
    "Importada do PDF (Detalhes da Infração / SENATRAN).",
    m.hora && `Hora: ${m.hora}`,
    m.local && `Local: ${m.local}`,
    m.renainf && `RENAINF: ${m.renainf}`,
    m.notificacao_autuacao && `Notificação de autuação: ${formatData(m.notificacao_autuacao)}`,
    m.limite_defesa && `Limite defesa prévia: ${formatData(m.limite_defesa)}`,
    m.limite_condutor && `Limite identificação do condutor: ${formatData(m.limite_condutor)}`,
    m.notificacao_penalidade && `Notificação de penalidade: ${formatData(m.notificacao_penalidade)}`,
    m.limite_recurso && `Limite recurso: ${formatData(m.limite_recurso)}`,
    m.vencimento_desconto && `Vencimento do desconto: ${formatData(m.vencimento_desconto)}`,
  ].filter(Boolean).join("\n");
}

export function ImportarMultasPDF({ veiculos }: { veiculos: Opcao[] }) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [itens, setItens] = React.useState<Item[]>([]);
  const [falhas, setFalhas] = React.useState<string[]>([]);
  const [lendo, setLendo] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const entrada = React.useRef<HTMLInputElement>(null);

  const porPlaca = React.useMemo(() => new Map(veiculos.map((v) => [limparPlaca(v.label), v.value])), [veiculos]);

  async function ler(arquivos: File[]) {
    const novos: Item[] = [];
    const erros: string[] = [];
    for (const [i, arquivo] of arquivos.entries()) {
      try {
        const paginas = await textoDasPaginas(arquivo, (msg) => setLendo(`${arquivo.name} (${i + 1}/${arquivos.length}) · ${msg}`));
        const lidas = paginas.map(interpretarMulta).filter((m): m is MultaLida => !!m);
        if (!lidas.length) { erros.push(`${arquivo.name}: não parece um "Detalhes da Infração"`); continue; }
        for (const [p, lida] of lidas.entries()) {
          // placa do PDF; se o OCR falhar, a do nome do arquivo (ex.: "ALZ2G88-1.pdf")
          const placa = lida.placa ?? normalizarPlaca(arquivo.name.replace(/\.pdf$/i, "").split(/[-_ (]/)[0]);
          novos.push({
            chave: `${arquivo.name}#${p}#${crypto.randomUUID()}`, arquivo, lida: { ...lida, placa },
            incluir: true, veiculo_id: placa ? porPlaca.get(placa) ?? null : null,
            auto_infracao: lida.auto_infracao ?? "", valor: lida.valor, vencimento: lida.vencimento_desconto, responsavel: "empresa", duplicada: false,
          });
        }
      } catch (e) {
        console.error("[importar multa]", e);
        erros.push(`${arquivo.name}: erro ao ler o PDF`);
      }
    }
    // já cadastradas (o nº do auto é único)
    const autos = [...new Set([...itens, ...novos].map((n) => n.auto_infracao).filter(Boolean))];
    const { data } = autos.length ? await createClient().from("multas").select("auto_infracao").in("auto_infracao", autos) : { data: [] };
    const existentes = new Set((data ?? []).map((m) => m.auto_infracao));
    const vistos = new Set(itens.map((n) => n.auto_infracao).filter(Boolean));
    for (const n of novos) {
      n.duplicada = existentes.has(n.auto_infracao) || (!!n.auto_infracao && vistos.has(n.auto_infracao));
      if (n.duplicada) n.incluir = false;
      if (n.auto_infracao) vistos.add(n.auto_infracao);
    }
    setItens((atual) => [...atual, ...novos]);
    setFalhas((atual) => [...atual, ...erros]);
    setLendo(null);
  }

  const alterar = (chave: string, mudanca: Partial<Item>) => setItens((l) => l.map((x) => (x.chave === chave ? { ...x, ...mudanca } : x)));
  const prontos = (x: Item) => x.incluir && !!x.veiculo_id && !!x.lida.data_infracao && x.valor != null;
  const aImportar = itens.filter(prontos);

  async function importar() {
    setSalvando(true);
    const anexos = new Map<File, string>();
    let ok = 0;
    const erros: string[] = [];
    for (const x of aImportar) {
      try {
        if (!anexos.has(x.arquivo)) anexos.set(x.arquivo, await enviarArquivo("anexos", x.arquivo, "multas"));
        const r = await salvarMulta(null, {
          // veículo, data e valor garantidos por prontos()
          veiculo_id: x.veiculo_id!, auto_infracao: x.auto_infracao || null, data_infracao: x.lida.data_infracao!, orgao: x.lida.orgao,
          descricao: x.lida.descricao, codigo: x.lida.codigo, pontos: x.lida.pontos, valor: x.valor!, vencimento: x.vencimento,
          status: "pendente", responsavel: x.responsavel, pago_em: null, anexo_url: anexos.get(x.arquivo)!, observacoes: observacoes(x.lida),
        } satisfies MultaForm);
        if (r.ok) { ok++; setItens((l) => l.filter((y) => y.chave !== x.chave)); }
        else erros.push(`${x.auto_infracao || x.arquivo.name}: ${r.erro}`);
      } catch (e) {
        erros.push(`${x.auto_infracao || x.arquivo.name}: ${e instanceof Error ? e.message : "erro ao enviar"}`);
      }
    }
    setSalvando(false);
    if (ok) { toast.success(`${ok} multa(s) importada(s)`); router.refresh(); }
    if (erros.length) toast.error(erros.join("\n"));
    else setAberto(false);
  }

  function fechar(v: boolean) {
    if (lendo || salvando) return;
    setAberto(v);
    if (!v) { setItens([]); setFalhas([]); }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}><FileUp /> Importar PDF</Button>
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent tamanho="xl">
          <DialogHeader>
            <DialogTitle>Importar multas do PDF</DialogTitle>
            <DialogDescription>
              PDF do “Detalhes da Infração” (Carteira Digital de Trânsito / SENATRAN). Pode enviar vários de uma vez; confira os dados antes de importar.
            </DialogDescription>
          </DialogHeader>

          <input ref={entrada} type="file" accept="application/pdf,.pdf" multiple className="hidden"
            onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) void ler(f); }} />
          <button type="button" disabled={!!lendo || salvando} onClick={() => entrada.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files].filter((x) => /\.pdf$/i.test(x.name)); if (f.length && !lendo) void ler(f); }}
            className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed p-5 text-sm text-muted-foreground hover:bg-accent/50 disabled:opacity-60">
            {lendo ? <><Loader2 className="h-5 w-5 animate-spin" /><span>{lendo}</span></>
              : <><Upload className="h-5 w-5" /><span>Clique ou arraste os PDFs aqui</span></>}
          </button>

          {falhas.length > 0 && <div className="rounded-md bg-status-critico/10 p-2 text-xs text-status-critico">{falhas.map((f) => <p key={f}>{f}</p>)}</div>}

          {itens.length > 0 && (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {itens.map((x) => (
                <div key={x.chave} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Checkbox className="mt-0.5" checked={x.incluir} onCheckedChange={(v) => alterar(x.chave, { incluir: v === true })} aria-label="Importar esta multa" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{x.lida.descricao ?? "Descrição não lida"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[x.lida.data_infracao && `${formatData(x.lida.data_infracao)}${x.lida.hora ? ` ${x.lida.hora}` : ""}`, x.lida.orgao, x.lida.codigo && `cód. ${x.lida.codigo}`,
                          x.lida.pontos != null && `${x.lida.pontos} pts`, x.arquivo.name].filter(Boolean).join(" · ")}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {x.duplicada && <Badge variant="alerta">Já cadastrada</Badge>}
                        {!x.veiculo_id && <Badge variant="critico">Veículo {x.lida.placa ?? "?"} não encontrado</Badge>}
                        {!x.lida.data_infracao && <Badge variant="critico">Data da infração não lida</Badge>}
                        {x.lida.limite_condutor && <Badge variant="neutro">Indicar condutor até {formatData(x.lida.limite_condutor)}</Badge>}
                        {!x.vencimento && <Badge variant="neutro">Sem vencimento (fase de autuação)</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Veículo</span>
                      <SelectSimples className="h-8" value={x.veiculo_id} opcoes={veiculos} onChange={(v) => alterar(x.chave, { veiculo_id: v })} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Nº do auto (AIT)</span>
                      <Input className="h-8" value={x.auto_infracao} onChange={(e) => alterar(x.chave, { auto_infracao: e.target.value.toUpperCase() })} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Valor</span>
                      <InputMoeda className="h-8" value={x.valor} onChange={(v) => alterar(x.chave, { valor: v })} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Vencimento</span>
                      <Input className="h-8" type="date" value={x.vencimento ?? ""} onChange={(e) => alterar(x.chave, { vencimento: e.target.value || null })} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Quem paga</span>
                      <SelectSimples className="h-8" value={x.responsavel} opcoes={RESPONSAVEL} onChange={(v) => alterar(x.chave, { responsavel: (v ?? "empresa") as Item["responsavel"] })} /></label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => fechar(false)} disabled={!!lendo || salvando}>Cancelar</Button>
            <Button onClick={importar} disabled={!aImportar.length || !!lendo || salvando}>
              {salvando && <Loader2 className="animate-spin" />} Importar {aImportar.length || ""} multa(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
