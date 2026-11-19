"use client";
import * as React from "react";
import { FileText, Loader2, Minus, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { salvarAjustesRepasse } from "./actions";
import { Checkbox, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Moeda } from "@/components/app/comuns";
import { InputMoeda } from "@/components/app/campos";
import { somar } from "@/lib/calculos";
import { formatBRL, formatData, formatPeriodo, formatPlaca } from "@/lib/format";
import { baixarReciboDescontosPDF, baixarReciboRepassePDF, type ItemRecibo } from "@/lib/documentos/baixar";

type RepasseRecibo = { id: string; placa: string; periodo_inicio: string; periodo_fim: string; valor_liquido: number; status: string; valor_bruto?: number; valor_abatimentos?: number };
type Tipo = "acrescimos" | "descontos";
const VAZIO: Record<Tipo, ItemRecibo[]> = { acrescimos: [], descontos: [] };
/** acréscimos − descontos */
const efeito = (a: Record<Tipo, ItemRecibo[]>) => somar([...a.acrescimos.map((x) => x.valor), ...a.descontos.map((x) => -x.valor)]);

/**
 * Recibo do repasse para o locador assinar. Começa com o repasse clicado; os outros da mesma placa
 * na lista podem entrar no mesmo recibo. Acréscimos e descontos digitados aqui ficam gravados no
 * repasse clicado (mudam o líquido a pagar) — salvos ao gerar o PDF ou no botão Salvar.
 */
export function DialogoReciboRepasse({ repasse, mesmaPlaca, podeEditar, onOpenChange, onSalvo, onExtrato }: {
  repasse: RepasseRecibo | null;
  /** repasses da mesma placa na lista (inclui o clicado) */
  mesmaPlaca: RepasseRecibo[];
  podeEditar: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo: () => void;
  /** extrato (PDF) dos repasses marcados — com acréscimos e despesas descontadas */
  onExtrato?: (ids: string[]) => void;
}) {
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const [ajustes, setAjustes] = React.useState<Record<Tipo, ItemRecibo[]>>(VAZIO);
  /** o que está gravado no banco para o repasse clicado */
  const [salvos, setSalvos] = React.useState<Record<Tipo, ItemRecibo[]>>(VAZIO);
  /** efeito (acréscimos − descontos) que o líquido da lista já carrega; muda quando a lista recarrega após salvar */
  const [naLista, setNaLista] = React.useState(0);
  const salvosRef = React.useRef(salvos);
  salvosRef.current = salvos;
  const [carregando, setCarregando] = React.useState(false);
  const [gerando, setGerando] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const editavel = !!repasse && podeEditar && (repasse.status === "previsto" || repasse.status === "liberado");

  const repasseId = repasse?.id;
  React.useEffect(() => {
    if (!repasseId) return;
    setMarcados(new Set([repasseId]));
    setAjustes(VAZIO); setSalvos(VAZIO); setNaLista(0);
    let vivo = true;
    setCarregando(true);
    createClient().from("repasse_ajustes").select("tipo, descricao, valor").eq("repasse_id", repasseId).order("ordem")
      .then(({ data, error }) => {
        if (!vivo) return;
        setCarregando(false);
        if (error) return; // banco sem a tabela (SQL 0083 não rodado): começa vazio
        const lidos = {
          acrescimos: (data ?? []).filter((a) => a.tipo === "acrescimo").map((a) => ({ descricao: a.descricao, valor: Number(a.valor) })),
          descontos: (data ?? []).filter((a) => a.tipo === "desconto").map((a) => ({ descricao: a.descricao, valor: Number(a.valor) })),
        };
        setAjustes(lidos); setSalvos(lidos); setNaLista(efeito(lidos));
      });
    return () => { vivo = false; };
  }, [repasseId]);

  // a lista recarregou com o líquido novo (já com o que foi salvo)
  const liquidoLista = repasse?.valor_liquido;
  const visto = React.useRef<{ id?: string; liquido?: number }>({});
  React.useEffect(() => {
    const antes = visto.current;
    visto.current = { id: repasseId, liquido: liquidoLista };
    // só quando é o mesmo repasse e o valor mudou (troca de repasse é tratada na carga acima)
    if (antes.id === repasseId && antes.liquido !== liquidoLista) setNaLista(efeito(salvosRef.current));
  }, [repasseId, liquidoLista]);

  const opcoes = [...mesmaPlaca].sort((a, b) => a.periodo_inicio.localeCompare(b.periodo_inicio));
  const escolhidos = opcoes.filter((r) => marcados.has(r.id));
  const marcar = (id: string, sim: boolean) => setMarcados((m) => { const n = new Set(m); if (sim) n.add(id); else n.delete(id); return n; });

  // o líquido da lista já tem os ajustes salvos: troca pelos da tela
  // (o banco não deixa o líquido ficar negativo: as despesas só consomem o que há; então aqui também não)
  const doClicado = repasse && marcados.has(repasse.id) ? efeito(ajustes) - naLista : 0;
  const estimadoClicado = repasse && marcados.has(repasse.id) ? somar([repasse.valor_liquido, doClicado]) : 0;
  const total = somar([...escolhidos.filter((r) => r.id !== repasse?.id).map((r) => r.valor_liquido), Math.max(0, estimadoClicado)]);
  const incompleto = ajustesIncompletos(ajustes);
  const mudou = JSON.stringify(ajustes) !== JSON.stringify(salvos);
  const somaDescontos = (a: Record<Tipo, ItemRecibo[]>) => somar(a.descontos.map((x) => x.valor));
  // só barra quando a mudança acrescenta desconto além do que o repasse tem (tirar/reduzir sempre pode)
  const descontoPassa = estimadoClicado < 0 && somaDescontos(ajustes) > somaDescontos(salvos);

  const salvar = async () => {
    if (!repasse) return false;
    setSalvando(true);
    const res = await salvarAjustesRepasse(repasse.id, [
      ...ajustes.acrescimos.map((a) => ({ tipo: "acrescimo", descricao: a.descricao, valor: a.valor })),
      ...ajustes.descontos.map((a) => ({ tipo: "desconto", descricao: a.descricao, valor: a.valor })),
    ]);
    setSalvando(false);
    if (!res.ok) { toast.error(res.erro); return false; }
    toast.success(res.mensagem);
    setSalvos(ajustes);
    onSalvo();
    return true;
  };

  const gerar = async () => {
    if (mudou && !(await salvar())) return;
    setGerando(true);
    await baixarReciboRepassePDF(escolhidos.map((r) => r.id));
    setGerando(false);
  };

  const fechar = async (v: boolean) => {
    if (!v && editavel && mudou) {
      // incompleto ou passando do repasse: não fecha calado, avisa o que falta
      if (incompleto) { toast.error("Preencha descrição e valor de cada acréscimo/desconto (ou remova a linha) antes de fechar"); return; }
      if (descontoPassa) { toast.error("Os descontos passam do valor do repasse"); return; }
      if (!(await salvar())) return;
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={!!repasse} onOpenChange={fechar}>
      <DialogContent tamanho="lg">
        <DialogHeader>
          <DialogTitle>Recibo do repasse · <span className="font-mono">{repasse ? formatPlaca(repasse.placa) : ""}</span></DialogTitle>
          <DialogDescription>
            {editavel
              ? "Acréscimos e descontos incluídos aqui ficam salvos neste repasse e mudam o valor a pagar ao dono."
              : "Repasse pago ou cancelado: os acréscimos e descontos não podem mais ser alterados."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Repasses no recibo</Label>
            <div className="divide-y rounded-md border">
              {opcoes.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox checked={marcados.has(r.id)} onCheckedChange={(v) => marcar(r.id, v === true)} aria-label={`Incluir ${formatPeriodo(r.periodo_inicio, r.periodo_fim)}`} />
                  <span className="flex-1">Repasse · {formatPeriodo(r.periodo_inicio, r.periodo_fim)}</span>
                  <Moeda valor={r.valor_liquido} />
                </label>
              ))}
            </div>
          </div>
          {carregando
            ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando acréscimos e descontos…</p>
            : <EditorAjustes ajustes={ajustes} onChange={setAjustes} editavel={editavel} />}
          <div className="flex items-center justify-between rounded-md bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Total do recibo</span>
            <span className="text-lg font-semibold"><Moeda valor={total} /></span>
          </div>
          {!mudou && escolhidos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              De onde vem: repasse do período {formatBRL(somar(escolhidos.map((x) => x.valor_bruto ?? 0)))}
              {efeito(salvos) > 0 && marcados.has(repasse?.id ?? "") && <> + acréscimos {formatBRL(somar(salvos.acrescimos.map((a) => a.valor)))}</>}
              {" "}− descontos e despesas da placa já descontados {formatBRL(somar(escolhidos.map((x) => x.valor_abatimentos ?? 0)))}.
              {" "}As despesas vêm do bloco “Despesas da placa” (o líquido não fica negativo).
            </p>
          )}
          {descontoPassa && <p className="text-sm text-destructive">Os descontos passam do valor do repasse.</p>}
          {mudou && editavel && <p className="text-xs text-muted-foreground">Alterações ainda não salvas — salvam ao fechar, ao gerar o recibo ou no botão Salvar.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => fechar(false)}>Fechar</Button>
          {editavel && (
            <Button variant="outline" disabled={!mudou || incompleto || descontoPassa || salvando || carregando} onClick={salvar}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          )}
          {onExtrato && (
            <Button variant="outline" disabled={!escolhidos.length || mudou || carregando} title={mudou ? "Salve antes para o extrato sair com os acréscimos e descontos novos" : "Extrato do locador com os repasses marcados"}
              onClick={() => onExtrato(escolhidos.map((x) => x.id))}><FileText /> Extrato (PDF)</Button>
          )}
          <Button disabled={!escolhidos.length || incompleto || descontoPassa || gerando || salvando || carregando} onClick={gerar}>
            {gerando ? <Loader2 className="animate-spin" /> : <FileText />} Gerar recibo (PDF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ajustesIncompletos = (a: Record<Tipo, ItemRecibo[]>) => [...a.acrescimos, ...a.descontos].some((x) => !x.descricao.trim() || x.valor <= 0);

/** Acréscimos e descontos digitados no recibo (no repasse ficam salvos; na placa sem fatura, só saem no PDF). */
function EditorAjustes({ ajustes, onChange, editavel = true }: { ajustes: Record<Tipo, ItemRecibo[]>; onChange: (a: Record<Tipo, ItemRecibo[]>) => void; editavel?: boolean }) {
  const editar = (tipo: Tipo, k: number, campos: Partial<ItemRecibo>) =>
    onChange({ ...ajustes, [tipo]: ajustes[tipo].map((it, j) => (j === k ? { ...it, ...campos } : it)) });
  const remover = (tipo: Tipo, k: number) => onChange({ ...ajustes, [tipo]: ajustes[tipo].filter((_, j) => j !== k) });
  const incluir = (tipo: Tipo) => onChange({ ...ajustes, [tipo]: [...ajustes[tipo], { descricao: "", valor: 0 }] });

  const lista = (tipo: Tipo, titulo: string, exemplo: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{titulo}</Label>
        {editavel && <Button size="xs" variant="outline" onClick={() => incluir(tipo)}>{tipo === "acrescimos" ? <Plus /> : <Minus />} {tipo === "acrescimos" ? "Acréscimo" : "Desconto"}</Button>}
      </div>
      {ajustes[tipo].map((it, k) => (
        <div key={k} className="flex items-center gap-2">
          <Input aria-label={`Descrição do ${tipo === "acrescimos" ? "acréscimo" : "desconto"} ${k + 1}`} className="flex-1" disabled={!editavel} value={it.descricao} maxLength={200}
            placeholder={exemplo} onChange={(e) => editar(tipo, k, { descricao: e.target.value })} />
          <InputMoeda aria-label="Valor" className="w-36" disabled={!editavel} permitirVazio={false} value={it.valor} onChange={(v) => editar(tipo, k, { valor: v ?? 0 })} />
          {editavel && <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Remover" onClick={() => remover(tipo, k)}><Trash2 /></Button>}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {lista("acrescimos", "Acréscimos", "Ex.: frete, adicional combinado…")}
      {lista("descontos", "Descontos", "Ex.: adiantamento, combustível…")}
    </>
  );
}

export type DescontoRecibo = { id: string; descricao: string | null; vencimento: string | null; saldo: number };

/**
 * Recibo da placa que ainda não tem fatura: as despesas "descontar do locador" pendentes
 * (dá para tirar alguma) e acréscimos/descontos digitados, que só saem no PDF.
 */
export function DialogoReciboDescontos({ placa, descontos, onOpenChange }: {
  placa: string | null; descontos: DescontoRecibo[]; onOpenChange: (v: boolean) => void;
}) {
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const [ajustes, setAjustes] = React.useState<Record<Tipo, ItemRecibo[]>>({ acrescimos: [], descontos: [] });
  const [gerando, setGerando] = React.useState(false);
  const aberto = descontos.length > 0;

  React.useEffect(() => {
    if (aberto) { setMarcados(new Set(descontos.map((d) => d.id))); setAjustes({ acrescimos: [], descontos: [] }); }
  }, [aberto, descontos]);

  const escolhidos = descontos.filter((d) => marcados.has(d.id));
  const marcar = (id: string, sim: boolean) => setMarcados((m) => { const n = new Set(m); if (sim) n.add(id); else n.delete(id); return n; });
  const saldo = somar([...ajustes.acrescimos.map((a) => a.valor), ...escolhidos.map((d) => -d.saldo), ...ajustes.descontos.map((a) => -a.valor)]);

  const gerar = async () => {
    setGerando(true);
    await baixarReciboDescontosPDF(escolhidos.map((d) => d.id), ajustes);
    setGerando(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        <DialogHeader>
          <DialogTitle>Recibo dos descontos · <span className="font-mono">{placa ? formatPlaca(placa) : ""}</span></DialogTitle>
          <DialogDescription>Placa ainda sem fatura. Acréscimos e descontos incluídos aqui saem só no recibo; nada muda no sistema.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Despesas no recibo</Label>
            <div className="divide-y rounded-md border">
              {descontos.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox checked={marcados.has(d.id)} onCheckedChange={(v) => marcar(d.id, v === true)} aria-label={`Incluir ${d.descricao ?? "despesa"}`} />
                  <span className="flex-1">{d.descricao ?? "Despesa"}{d.vencimento && <span className="text-muted-foreground"> · {formatData(d.vencimento)}</span>}</span>
                  <Moeda valor={-d.saldo} className="text-status-critico" />
                </label>
              ))}
            </div>
          </div>
          <EditorAjustes ajustes={ajustes} onChange={setAjustes} />
          <div className="flex items-center justify-between rounded-md bg-muted p-3 text-sm">
            <span className="text-muted-foreground">{saldo <= 0 ? "Total a descontar" : "Saldo a favor do locador"}</span>
            <span className="text-lg font-semibold"><Moeda valor={Math.abs(saldo)} /></span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!escolhidos.length || ajustesIncompletos(ajustes) || gerando} onClick={gerar}>
            {gerando ? <Loader2 className="animate-spin" /> : <FileText />} Gerar recibo (PDF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
