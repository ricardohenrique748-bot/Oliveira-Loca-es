"use client";
import * as React from "react";
import { FileText, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { Checkbox, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Moeda } from "@/components/app/comuns";
import { InputMoeda } from "@/components/app/campos";
import { somar } from "@/lib/calculos";
import { formatData, formatPeriodo, formatPlaca } from "@/lib/format";
import { baixarReciboDescontosPDF, baixarReciboRepassePDF, type ItemRecibo } from "@/lib/documentos/baixar";

type RepasseRecibo = { id: string; placa: string; periodo_inicio: string; periodo_fim: string; valor_liquido: number };
type Tipo = "acrescimos" | "descontos";

/**
 * Recibo do repasse para o locador assinar. Começa com o repasse clicado; os outros da mesma placa
 * na lista podem entrar no mesmo recibo. Acréscimos e descontos digitados aqui só saem no PDF
 * (o valor do repasse registrado não muda).
 */
export function DialogoReciboRepasse({ repasse, mesmaPlaca, onOpenChange }: {
  repasse: RepasseRecibo | null;
  /** repasses da mesma placa na lista (inclui o clicado) */
  mesmaPlaca: RepasseRecibo[];
  onOpenChange: (v: boolean) => void;
}) {
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const [ajustes, setAjustes] = React.useState<Record<Tipo, ItemRecibo[]>>({ acrescimos: [], descontos: [] });
  const [gerando, setGerando] = React.useState(false);

  React.useEffect(() => {
    if (repasse) { setMarcados(new Set([repasse.id])); setAjustes({ acrescimos: [], descontos: [] }); }
  }, [repasse]);

  const opcoes = [...mesmaPlaca].sort((a, b) => a.periodo_inicio.localeCompare(b.periodo_inicio));
  const escolhidos = opcoes.filter((r) => marcados.has(r.id));
  const marcar = (id: string, sim: boolean) => setMarcados((m) => { const n = new Set(m); if (sim) n.add(id); else n.delete(id); return n; });

  const total = somar([...escolhidos.map((r) => r.valor_liquido), ...ajustes.acrescimos.map((a) => a.valor), ...ajustes.descontos.map((a) => -a.valor)]);
  const incompleto = ajustesIncompletos(ajustes);

  const gerar = async () => {
    setGerando(true);
    await baixarReciboRepassePDF(escolhidos.map((r) => r.id), ajustes);
    setGerando(false);
  };

  return (
    <Dialog open={!!repasse} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        <DialogHeader>
          <DialogTitle>Recibo do repasse · <span className="font-mono">{repasse ? formatPlaca(repasse.placa) : ""}</span></DialogTitle>
          <DialogDescription>Acréscimos e descontos incluídos aqui saem só no recibo; o valor do repasse no sistema não muda.</DialogDescription>
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
          <EditorAjustes ajustes={ajustes} onChange={setAjustes} />
          <div className="flex items-center justify-between rounded-md bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Total do recibo</span>
            <span className="text-lg font-semibold"><Moeda valor={total} /></span>
          </div>
          {total < 0 && <p className="text-sm text-destructive">Os descontos passam do valor do repasse.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!escolhidos.length || incompleto || total < 0 || gerando} onClick={gerar}>
            {gerando ? <Loader2 className="animate-spin" /> : <FileText />} Gerar recibo (PDF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ajustesIncompletos = (a: Record<Tipo, ItemRecibo[]>) => [...a.acrescimos, ...a.descontos].some((x) => !x.descricao.trim() || x.valor <= 0);

/** Acréscimos e descontos digitados na hora: só saem no PDF. */
function EditorAjustes({ ajustes, onChange }: { ajustes: Record<Tipo, ItemRecibo[]>; onChange: (a: Record<Tipo, ItemRecibo[]>) => void }) {
  const editar = (tipo: Tipo, k: number, campos: Partial<ItemRecibo>) =>
    onChange({ ...ajustes, [tipo]: ajustes[tipo].map((it, j) => (j === k ? { ...it, ...campos } : it)) });
  const remover = (tipo: Tipo, k: number) => onChange({ ...ajustes, [tipo]: ajustes[tipo].filter((_, j) => j !== k) });
  const incluir = (tipo: Tipo) => onChange({ ...ajustes, [tipo]: [...ajustes[tipo], { descricao: "", valor: 0 }] });

  const lista = (tipo: Tipo, titulo: string, exemplo: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{titulo}</Label>
        <Button size="xs" variant="outline" onClick={() => incluir(tipo)}>{tipo === "acrescimos" ? <Plus /> : <Minus />} {tipo === "acrescimos" ? "Acréscimo" : "Desconto"}</Button>
      </div>
      {ajustes[tipo].map((it, k) => (
        <div key={k} className="flex items-center gap-2">
          <Input aria-label={`Descrição do ${tipo === "acrescimos" ? "acréscimo" : "desconto"} ${k + 1}`} className="flex-1" value={it.descricao} maxLength={200}
            placeholder={exemplo} onChange={(e) => editar(tipo, k, { descricao: e.target.value })} />
          <InputMoeda aria-label="Valor" className="w-36" permitirVazio={false} value={it.valor} onChange={(v) => editar(tipo, k, { valor: v ?? 0 })} />
          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Remover" onClick={() => remover(tipo, k)}><Trash2 /></Button>
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
