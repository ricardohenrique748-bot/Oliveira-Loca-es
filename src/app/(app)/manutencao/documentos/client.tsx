"use client";
import type { ColumnDef } from "@tanstack/react-table";
import type { Opcao } from "@/components/ui/select";
import { CrudSimples } from "@/components/app/crud";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { LinkAnexo } from "@/components/app/anexo";
import { documentoSchema, type DocumentoForm } from "@/lib/schemas/manutencao";
import { opcoesDe, ROTULOS } from "@/lib/schemas/cadastros";
import { formatPlaca } from "@/lib/format";
import { ValidadeBadge } from "@/components/app/validade";
import { excluirDocumento, salvarDocumento } from "../actions";

export type LinhaDoc = { id: string; veiculo_id: string; placa: string; tipo: DocumentoForm["tipo"]; numero: string | null; validade: string | null; anexo_url: string | null; observacoes: string | null };

const colunas: ColumnDef<LinhaDoc, unknown>[] = [
  { accessorKey: "placa", header: "Placa", meta: { tituloMobile: true }, cell: ({ getValue }) => <span className="font-mono font-semibold">{formatPlaca(getValue() as string)}</span> },
  { accessorKey: "tipo", header: "Documento", cell: ({ row }) => ROTULOS.tipoDocumento[row.original.tipo] },
  { accessorKey: "numero", header: "Número" },
  { accessorKey: "validade", header: "Validade", cell: ({ getValue }) => <ValidadeBadge validade={getValue() as string | null} /> },
  { accessorKey: "anexo_url", header: "Anexo", cell: ({ getValue }) => <LinkAnexo referencia={getValue() as string | null} rotulo="Abrir" /> },
  { accessorKey: "observacoes", header: "Observações", meta: { ocultarMobile: true } },
];

export function DocumentosCliente({ linhas, veiculos, veiculoInicial, podeEditar }: { linhas: LinhaDoc[]; veiculos: Opcao[]; veiculoInicial: string | null; podeEditar: boolean }) {
  const campos: Campo<DocumentoForm>[] = [
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", opcoes: veiculos, obrigatorio: true, col: 3 },
    { nome: "tipo", rotulo: "Documento", tipo: "select", opcoes: opcoesDe(ROTULOS.tipoDocumento), col: 3 },
    { nome: "numero", rotulo: "Número", col: 3 },
    { nome: "validade", rotulo: "Validade", tipo: "data", col: 3 },
    { nome: "anexo_url", rotulo: "Anexo (PDF/foto)", tipo: "anexo", bucket: "anexos", pasta: "documentos", col: 6 },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  ];
  return (
    <CrudSimples<LinhaDoc, DocumentoForm>
      titulo="Documentos dos veículos" entidade="documento" busca={false}
      descricao="Licenciamento, seguro, tacógrafo, inspeção de içamento, ANTT. Alertas em 30, 15 e 0 dias do vencimento."
      linhas={linhas} colunas={colunas} campos={campos} schema={documentoSchema as never}
      filtros={<>
        <FiltroSelectUrl param="veiculo" rotulo="Veículo" opcoes={veiculos} />
        <FiltroSelectUrl param="tipo" rotulo="Documento" opcoes={opcoesDe(ROTULOS.tipoDocumento)} />
        <FiltroSelectUrl param="prazo" rotulo="Vencimento" opcoes={[{ value: "0", label: "Vencidos" }, { value: "15", label: "Até 15 dias" }, { value: "30", label: "Até 30 dias" }]} />
      </>}
      novo={{ veiculo_id: veiculoInicial ?? undefined, tipo: "licenciamento", numero: null, validade: null, anexo_url: null, observacoes: null }}
      paraForm={(d) => ({ veiculo_id: d.veiculo_id, tipo: d.tipo, numero: d.numero, validade: d.validade, anexo_url: d.anexo_url, observacoes: d.observacoes })}
      salvar={salvarDocumento} excluir={excluirDocumento} podeEditar={podeEditar}
      exportar={{ nome: "documentos_veiculos", colunas: [
        { titulo: "Placa", valor: (d) => d.placa }, { titulo: "Documento", valor: (d) => ROTULOS.tipoDocumento[d.tipo] }, { titulo: "Número", valor: (d) => d.numero },
        { titulo: "Validade", valor: (d) => d.validade, tipo: "data" }, { titulo: "Observações", valor: (d) => d.observacoes, largura: 30 },
      ] }}
    />
  );
}
