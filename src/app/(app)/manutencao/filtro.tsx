"use client";
import { FiltroSelectUrl } from "@/components/app/url";
import { opcoesDe, ROTULOS } from "@/lib/schemas/cadastros";

export function FiltroFrota() {
  return (
    <div className="flex gap-2">
      <FiltroSelectUrl param="status" rotulo="Status" opcoes={[
        { value: "locado", label: "Locados" }, { value: "disponivel", label: "Disponíveis" }, { value: "manutencao", label: "Manutenção" }, { value: "parado", label: "Parados" },
      ]} />
      <FiltroSelectUrl param="tipo" rotulo="Tipo" opcoes={opcoesDe(ROTULOS.tipoVeiculo)} />
    </div>
  );
}
