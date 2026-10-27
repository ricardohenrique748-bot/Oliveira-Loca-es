"use client";
import * as React from "react";
import { toast } from "sonner";
import { FileText, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { Label, Table, TableBody, TableCell, TableRow } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Moeda } from "@/components/app/comuns";
import { InputMoeda } from "@/components/app/campos";
import { createClient } from "@/lib/supabase/client";
import { somar } from "@/lib/calculos";
import { formatPeriodo, formatPlaca } from "@/lib/format";
import { baixarReciboRepassePDF, type ItemRecibo } from "@/lib/documentos/baixar";

type Repasse = { id: string; periodo_inicio: string; periodo_fim: string; valor_liquido: number };
type Tipo = "acrescimos" | "descontos";

/**
 * Antes de baixar o recibo do repasse: acréscimos e descontos digitados aqui só saem no PDF
 * (o valor do repasse registrado não muda).
 */
export function DialogoReciboRepasse({ alvo, onOpenChange, ini, fim, empresaId }: {
  alvo: { veiculoId: string; placa: string } | null; onOpenChange: (v: boolean) => void;
  ini: string; fim: string; empresaId: string | null;
}) {
  const [repasses, setRepasses] = React.useState<Repasse[] | null>(null);
  const [ajustes, setAjustes] = React.useState<Record<Tipo, ItemRecibo[]>>({ acrescimos: [], descontos: [] });
  const [gerando, setGerando] = React.useState(false);

  React.useEffect(() => {
    if (!alvo) return;
    let vivo = true;
    setRepasses(null); setAjustes({ acrescimos: [], descontos: [] });
    let q = createClient().from("repasses_v").select("id, periodo_inicio, periodo_fim, valor_liquido")
      .eq("veiculo_id", alvo.veiculoId).gte("periodo_fim", ini).lte("periodo_fim", fim).neq("status", "cancelado");
    if (empresaId) q = q.eq("empresa_id", empresaId);
    q.order("periodo_inicio").then(({ data, error }) => {
      if (!vivo) return;
      if (error) return void toast.error(error.message);
      setRepasses((data ?? []) as Repasse[]);
    });
    return () => { vivo = false; };
  }, [alvo, ini, fim, empresaId]);

  const editar = (tipo: Tipo, k: number, campos: Partial<ItemRecibo>) =>
    setAjustes((a) => ({ ...a, [tipo]: a[tipo].map((it, j) => (j === k ? { ...it, ...campos } : it)) }));
  const remover = (tipo: Tipo, k: number) => setAjustes((a) => ({ ...a, [tipo]: a[tipo].filter((_, j) => j !== k) }));
  const incluir = (tipo: Tipo) => setAjustes((a) => ({ ...a, [tipo]: [...a[tipo], { descricao: "", valor: 0 }] }));

  const base = somar((repasses ?? []).map((r) => r.valor_liquido));
  const total = somar([base, ...ajustes.acrescimos.map((a) => a.valor), ...ajustes.descontos.map((a) => -a.valor)]);
  const incompleto = [...ajustes.acrescimos, ...ajustes.descontos].some((a) => !a.descricao.trim() || a.valor <= 0);

  const gerar = async () => {
    if (!repasses?.length) return;
    setGerando(true);
    await baixarReciboRepassePDF(repasses.map((r) => r.id), ajustes);
    setGerando(false);
  };

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
    <Dialog open={!!alvo} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        <DialogHeader>
          <DialogTitle>Recibo do repasse · <span className="font-mono">{alvo ? formatPlaca(alvo.placa) : ""}</span></DialogTitle>
          <DialogDescription>Acréscimos e descontos incluídos aqui saem só no recibo; o valor do repasse no sistema não muda.</DialogDescription>
        </DialogHeader>
        {!repasses ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          : !repasses.length ? <p className="text-sm text-muted-foreground">Nenhum repasse da placa no período.</p> : (
          <div className="space-y-4">
            <div className="rounded-md border">
              <Table>
                <TableBody>
                  {repasses.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>Repasse · {formatPeriodo(r.periodo_inicio, r.periodo_fim)}</TableCell>
                      <TableCell className="text-right"><Moeda valor={r.valor_liquido} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {lista("acrescimos", "Acréscimos", "Ex.: frete, adicional combinado…")}
            {lista("descontos", "Descontos", "Ex.: adiantamento, combustível…")}
            <div className="flex items-center justify-between rounded-md bg-muted p-3 text-sm">
              <span className="text-muted-foreground">Total do recibo</span>
              <span className="text-lg font-semibold"><Moeda valor={total} /></span>
            </div>
            {total < 0 && <p className="text-sm text-destructive">Os descontos passam do valor do repasse.</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!repasses?.length || incompleto || total < 0 || gerando} onClick={gerar}>
            {gerando ? <Loader2 className="animate-spin" /> : <FileText />} Gerar recibo (PDF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
