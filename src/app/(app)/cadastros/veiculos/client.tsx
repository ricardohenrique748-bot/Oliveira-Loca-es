"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CrudSimples } from "@/components/app/crud";
import { StatusBadge } from "@/components/app/comuns";
import { FiltroSelectUrl } from "@/components/app/url";
import { Badge } from "@/components/ui/basicos";
import type { Opcao } from "@/components/ui/select";
import { opcoesDe, ROTULOS, veiculoSchema, type VeiculoForm } from "@/lib/schemas/cadastros";
import { formatHoras, formatKm, formatPlaca } from "@/lib/format";
import { salvarVeiculo } from "../actions";
import { camposVeiculo, STATUS_VEICULO } from "./campos";

export type LinhaVeiculo = {
  id: string; placa: string; renavam: string | null; chassi: string | null; cor: string | null; tipo: VeiculoForm["tipo"]; marca: string | null; modelo: string | null; ano: number | null;
  proprietario: VeiculoForm["proprietario"]; locador_id: string | null; locador: string | null; empresa_id: string; empresa: string;
  km_atual: number; horimetro_atual: number; status: VeiculoForm["status"]; foto_url: string | null; observacoes: string | null;
};

const colunas: ColumnDef<LinhaVeiculo, unknown>[] = [
  { accessorKey: "placa", header: "Placa", meta: { ordem: "placa", tituloMobile: true }, cell: ({ getValue }) => <span className="whitespace-nowrap font-mono font-semibold tracking-wider">{formatPlaca(getValue() as string)}</span> },
  { accessorKey: "tipo", header: "Tipo", meta: { ordem: "tipo" }, cell: ({ row }) => ROTULOS.tipoVeiculo[row.original.tipo] },
  { id: "modelo", header: "Marca / modelo", meta: { ordem: "modelo" }, cell: ({ row: { original: v } }) => <span>{[v.marca, v.modelo].filter(Boolean).join(" ")}{v.ano ? <span className="text-muted-foreground"> · {v.ano}</span> : null}</span> },
  { accessorKey: "empresa", header: "Empresa" },
  { id: "prop", header: "Propriedade", cell: ({ row: { original: v } }) => v.proprietario === "locador" ? <Badge variant="info">Locador: {v.locador}</Badge> : <Badge variant="secondary">Própria</Badge> },
  { accessorKey: "km_atual", header: "Km", meta: { ordem: "km_atual", direita: true }, cell: ({ getValue }) => <span className="whitespace-nowrap">{formatKm(getValue() as number)}</span> },
  { accessorKey: "horimetro_atual", header: "Horímetro", meta: { direita: true }, cell: ({ getValue }) => (getValue() ? formatHoras(getValue() as number) : "—") },
  { accessorKey: "status", header: "Status", meta: { ordem: "status" }, cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
];

export function VeiculosCliente({ linhas, total, pagina, tamanho, empresas, empresaPadrao, locadores, podeEditar, novo }: {
  linhas: LinhaVeiculo[]; total: number; pagina: number; tamanho: number; empresas: Opcao[]; empresaPadrao: string | null; locadores: Opcao[]; podeEditar: boolean; novo: boolean;
}) {
  return (
    <CrudSimples<LinhaVeiculo, VeiculoForm>
      titulo="Veículos" entidade="veículo" tamanhoForm="lg" abrirNovo={novo}
      descricao="Frota própria e sublocada. Clique para ver a ficha completa (contratos, OS, documentos, resultado)."
      linhas={linhas} total={total} pagina={pagina} tamanho={tamanho} colunas={colunas} campos={camposVeiculo(empresas, locadores)} schema={veiculoSchema as never}
      busca="Buscar placa, marca, modelo…" hrefLinha={(v) => `/cadastros/veiculos/${v.id}`}
      filtros={<>
        <FiltroSelectUrl param="status" rotulo="Status" vazio="Ativos" opcoes={STATUS_VEICULO} />
        <FiltroSelectUrl param="tipo" rotulo="Tipo" opcoes={opcoesDe(ROTULOS.tipoVeiculo)} />
        <FiltroSelectUrl param="proprietario" rotulo="Propriedade" vazio="Todas" opcoes={opcoesDe(ROTULOS.proprietario)} />
      </>}
      novo={{ placa: "", renavam: null, chassi: null, cor: null, tipo: "caminhao", marca: null, modelo: null, ano: null, proprietario: "proprio", locador_id: null, empresa_id: empresaPadrao ?? empresas[0]?.value, km_atual: 0, horimetro_atual: 0, status: "disponivel", foto_url: null, observacoes: null }}
      paraForm={(v) => ({ placa: v.placa, renavam: v.renavam, chassi: v.chassi, cor: v.cor, tipo: v.tipo, marca: v.marca, modelo: v.modelo, ano: v.ano, proprietario: v.proprietario, locador_id: v.locador_id, empresa_id: v.empresa_id, km_atual: v.km_atual, horimetro_atual: v.horimetro_atual, status: v.status, foto_url: v.foto_url, observacoes: v.observacoes })}
      salvar={salvarVeiculo} podeEditar={podeEditar}
      exportar={{ nome: "veiculos", colunas: [
        { titulo: "Placa", valor: (v) => v.placa }, { titulo: "Tipo", valor: (v) => ROTULOS.tipoVeiculo[v.tipo] }, { titulo: "Marca", valor: (v) => v.marca },
        { titulo: "Modelo", valor: (v) => v.modelo, largura: 22 }, { titulo: "Ano", valor: (v) => v.ano, tipo: "numero" }, { titulo: "Empresa", valor: (v) => v.empresa },
        { titulo: "Propriedade", valor: (v) => (v.proprietario === "locador" ? `Locador: ${v.locador}` : "Própria"), largura: 22 },
        { titulo: "Km", valor: (v) => v.km_atual, tipo: "numero" }, { titulo: "Horímetro", valor: (v) => v.horimetro_atual, tipo: "numero" }, { titulo: "Status", valor: (v) => v.status },
      ] }}
    />
  );
}
