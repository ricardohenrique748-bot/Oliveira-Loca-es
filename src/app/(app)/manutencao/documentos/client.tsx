"use client";
import type { ColumnDef } from "@tanstack/react-table";
import type { Opcao } from "@/components/ui/select";
import { CrudSimples } from "@/components/app/crud";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { LinkAnexo } from "@/components/app/anexo";
import { documentoSchema, type DocumentoForm } from "@/lib/schemas/manutencao";
import { opcoesDe, ROTULOS } from "@/lib/schemas/cadastros";
import { addMesesClamp } from "@/lib/calculos";
import { formatData, formatPlaca } from "@/lib/format";
import { ValidadeBadge } from "@/components/app/validade";
import { excluirDocumento, salvarDocumento } from "../actions";

export type LinhaDoc = {
  id: string; veiculo_id: string; placa: string; tipo: DocumentoForm["tipo"]; numero: string | null;
  data_emissao: string | null; validade: string | null; anexo_url: string | null; observacoes: string | null;
};

const colPlaca: ColumnDef<LinhaDoc, unknown> = { accessorKey: "placa", header: "Placa", meta: { tituloMobile: true }, cell: ({ getValue }) => <span className="whitespace-nowrap font-mono font-semibold">{formatPlaca(getValue() as string)}</span> };
const colunasDoc: ColumnDef<LinhaDoc, unknown>[] = [
  { accessorKey: "tipo", header: "Documento", cell: ({ row }) => ROTULOS.tipoDocumento[row.original.tipo] },
  { accessorKey: "numero", header: "Número" },
  { accessorKey: "data_emissao", header: "Emissão", cell: ({ getValue }) => (getValue() ? <span className="whitespace-nowrap">{formatData(getValue() as string)}</span> : "—") },
  { accessorKey: "validade", header: "Vencimento", cell: ({ getValue }) => <ValidadeBadge validade={getValue() as string | null} /> },
  { accessorKey: "anexo_url", header: "Anexo", cell: ({ getValue }) => <LinkAnexo referencia={getValue() as string | null} rotulo="Abrir" /> },
  { accessorKey: "observacoes", header: "Observações", meta: { ocultarMobile: true } },
];
const colunas = [colPlaca, ...colunasDoc];
// na ficha do veículo a placa já é a da página
const colunasVeiculo: ColumnDef<LinhaDoc, unknown>[] = [{ ...colunasDoc[0], meta: { tituloMobile: true } }, ...colunasDoc.slice(1)];

/** Laudos valem 12 meses: preenchida a emissão, sugere o vencimento (se ainda vazio). */
const sugerirVencimento = (campo: string, v: DocumentoForm) =>
  campo === "data_emissao" && v.data_emissao && !v.validade ? { validade: addMesesClamp(v.data_emissao, 12) } : undefined;

/** Lista de documentos. Com `veiculoFixo`, fica dentro da ficha do veículo: sem placa, sem filtros. */
export function DocumentosCliente({ linhas, veiculos, veiculoInicial, podeEditar, veiculoFixo }: {
  linhas: LinhaDoc[]; veiculos: Opcao[]; veiculoInicial: string | null; podeEditar: boolean; veiculoFixo?: string;
}) {
  const campos: Campo<DocumentoForm>[] = [
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", opcoes: veiculos, obrigatorio: true, col: 3, visivel: () => !veiculoFixo },
    { nome: "tipo", rotulo: "Documento", tipo: "select", opcoes: opcoesDe(ROTULOS.tipoDocumento), col: veiculoFixo ? 4 : 3 },
    { nome: "numero", rotulo: "Número", col: veiculoFixo ? 2 : 3, placeholder: "ART, apólice…" },
    { nome: "data_emissao", rotulo: "Data de emissão", tipo: "data", col: 3 },
    { nome: "validade", rotulo: "Data de vencimento", tipo: "data", col: 3, ajuda: "Sugerida 12 meses após a emissão" },
    { nome: "anexo_url", rotulo: "Anexo (PDF/foto)", tipo: "anexo", bucket: "anexos", pasta: "documentos", col: 6 },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  ];
  return (
    <CrudSimples<LinhaDoc, DocumentoForm>
      titulo="Documentos dos veículos" entidade="documento" busca={false} semCabecalho={!!veiculoFixo}
      descricao="Documentos e laudos (licenciamento, seguro, ANTT, laudos técnicos). Alertas em 30, 15 e 0 dias do vencimento."
      linhas={linhas} colunas={veiculoFixo ? colunasVeiculo : colunas} campos={campos} schema={documentoSchema as never} aoAlterar={sugerirVencimento}
      filtros={veiculoFixo ? undefined : <>
        <FiltroSelectUrl param="veiculo" rotulo="Veículo" opcoes={veiculos} />
        <FiltroSelectUrl param="tipo" rotulo="Documento" opcoes={opcoesDe(ROTULOS.tipoDocumento)} />
        <FiltroSelectUrl param="prazo" rotulo="Vencimento" opcoes={[{ value: "0", label: "Vencidos" }, { value: "15", label: "Até 15 dias" }, { value: "30", label: "Até 30 dias" }]} />
      </>}
      novo={{ veiculo_id: veiculoFixo ?? veiculoInicial ?? undefined, tipo: veiculoFixo ? "laudo_viabilidade" : "licenciamento", numero: null, data_emissao: null, validade: null, anexo_url: null, observacoes: null }}
      paraForm={(d) => ({ veiculo_id: d.veiculo_id, tipo: d.tipo, numero: d.numero, data_emissao: d.data_emissao, validade: d.validade, anexo_url: d.anexo_url, observacoes: d.observacoes })}
      salvar={salvarDocumento} excluir={excluirDocumento} podeEditar={podeEditar}
      exportar={{ nome: "documentos_veiculos", colunas: [
        { titulo: "Placa", valor: (d) => d.placa }, { titulo: "Documento", valor: (d) => ROTULOS.tipoDocumento[d.tipo], largura: 30 }, { titulo: "Número", valor: (d) => d.numero },
        { titulo: "Emissão", valor: (d) => d.data_emissao, tipo: "data" }, { titulo: "Vencimento", valor: (d) => d.validade, tipo: "data" }, { titulo: "Observações", valor: (d) => d.observacoes, largura: 30 },
      ] }}
    />
  );
}
