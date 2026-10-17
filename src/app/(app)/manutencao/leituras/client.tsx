"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gauge, Loader2, Save, Search } from "lucide-react";
import { Card, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cabecalho, StatusBadge } from "@/components/app/comuns";
import { InputNumero } from "@/components/app/campos";
import { formatData, formatHoras, formatKm, formatPlaca, hojeSP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { lancarLeituras } from "../actions";

type V = { id: string; placa: string; tipo: string; modelo: string | null; km_atual: number; horimetro_atual: number; status: string; ultima: string | null };

/** Lançamento rápido, mobile-first: um campo por placa. */
export function LeiturasCliente({ veiculos, filtroInicial, podeEditar }: { veiculos: V[]; filtroInicial: string; podeEditar: boolean }) {
  const router = useRouter();
  const [data, setData] = React.useState(hojeSP());
  const [filtro, setFiltro] = React.useState(filtroInicial);
  const [valores, setValores] = React.useState<Record<string, { km?: number | null; horimetro?: number | null }>>({});
  const [salvando, setSalvando] = React.useState(false);

  const usaHorimetro = (v: V) => v.horimetro_atual > 0 || ["guindaste", "trator", "munck"].includes(v.tipo);
  const lista = veiculos.filter((v) => !filtro || v.placa.includes(filtro.toUpperCase().replace(/[^A-Z0-9]/g, "")) || (v.modelo ?? "").toLowerCase().includes(filtro.toLowerCase()));
  const preenchidos = Object.entries(valores).filter(([, x]) => x.km != null || x.horimetro != null);

  const salvar = async () => {
    if (!preenchidos.length) return;
    setSalvando(true);
    const r = await lancarLeituras(preenchidos.map(([veiculo_id, x]) => ({ veiculo_id, data, km: x.km ?? null, horimetro: x.horimetro ?? null })));
    setSalvando(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`${r.dados.lancadas} leitura(s) lançada(s)`);
    r.dados.avisos.forEach((a) => toast.warning(a));
    setValores({});
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24">
      <Cabecalho titulo="Leituras" descricao="Lançamento rápido de km e horímetro. Atualiza o veículo e as preventivas." />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label htmlFor="leit-data">Data</Label><Input id="leit-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-11" /></div>
        <div className="space-y-1"><Label htmlFor="leit-filtro">Placa</Label>
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="leit-filtro" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-11 pl-9 uppercase" placeholder="Filtrar" /></div>
        </div>
      </div>
      <div className="space-y-2">
        {lista.map((v) => {
          const x = valores[v.id] ?? {};
          const kmBaixo = x.km != null && x.km < v.km_atual;
          const hBaixo = x.horimetro != null && x.horimetro < v.horimetro_atual;
          return (
            <Card key={v.id} className={cn("p-3", (x.km != null || x.horimetro != null) && "border-primary")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div><span className="font-mono text-lg font-bold">{formatPlaca(v.placa)}</span> <span className="text-xs text-muted-foreground">{v.modelo}</span></div>
                <StatusBadge status={v.status} />
              </div>
              <div className={cn("grid gap-2", usaHorimetro(v) ? "grid-cols-2" : "grid-cols-1")}>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Km (atual {formatKm(v.km_atual)})</span>
                  <InputNumero className={cn("h-12 text-lg", kmBaixo && "border-status-alerta")} aria-label={`Km ${v.placa}`} disabled={!podeEditar}
                    value={x.km ?? null} onChange={(n) => setValores((s) => ({ ...s, [v.id]: { ...s[v.id], km: n } }))} />
                </label>
                {usaHorimetro(v) && (
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Horímetro ({formatHoras(v.horimetro_atual)})</span>
                    <InputNumero casas={1} className={cn("h-12 text-lg", hBaixo && "border-status-alerta")} aria-label={`Horímetro ${v.placa}`} disabled={!podeEditar}
                      value={x.horimetro ?? null} onChange={(n) => setValores((s) => ({ ...s, [v.id]: { ...s[v.id], horimetro: n } }))} />
                  </label>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Última leitura: {formatData(v.ultima)}{(kmBaixo || hBaixo) && <span className="text-status-alerta"> · valor menor que o atual</span>}</p>
            </Card>
          );
        })}
      </div>
      {podeEditar && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur lg:pl-60">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm"><Gauge className="h-4 w-4" /> {preenchidos.length} preenchida(s)</span>
            <Button size="lg" disabled={!preenchidos.length || salvando} onClick={salvar}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar leituras</Button>
          </div>
        </div>
      )}
    </div>
  );
}
