"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/basicos";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { BarraFiltros, BuscaUrl, FiltroSelectUrl, useUrlParams } from "@/components/app/url";
import { definirEmpresa } from "@/components/layout/actions";

/** Filtros globais: Empresa · Período · Cliente · Placa (uma linha, acima dos gráficos). */
export function FiltrosDashboard({ empresas, empresaId, mes, clientes }: { empresas: Opcao[]; empresaId: string | null; mes: string; clientes: Opcao[] }) {
  const url = useUrlParams();
  const router = useRouter();
  const [, iniciar] = useTransition();
  return (
    <BarraFiltros>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Empresa</Label>
        <SelectSimples aria-label="Empresa" className="h-9 w-40" value={empresaId} vazio="Todas" opcoes={empresas}
          onChange={(v) => iniciar(async () => { await definirEmpresa(v); router.refresh(); })} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dash-mes" className="text-xs text-muted-foreground">Período</Label>
        <Input id="dash-mes" type="month" className="h-9 w-40" value={mes} onChange={(e) => url.set({ mes: e.target.value || null })} />
      </div>
      <FiltroSelectUrl param="cliente" rotulo="Cliente" opcoes={clientes} />
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Placa</Label>
        <BuscaUrl param="placa" placeholder="Placa…" className="sm:w-36" />
      </div>
    </BarraFiltros>
  );
}
