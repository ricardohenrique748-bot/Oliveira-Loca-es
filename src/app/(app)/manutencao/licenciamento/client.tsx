"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Cabecalho } from "@/components/app/comuns";
import { DataTable } from "@/components/app/data-table";
import { FormularioDialog, type Campo } from "@/components/app/formulario";
import { LinkAnexo } from "@/components/app/anexo";
import { addMesesClamp } from "@/lib/calculos";
import { formatData, formatPlaca } from "@/lib/format";
import { ROTULOS } from "@/lib/schemas/cadastros";
import { documentoSchema, type DocumentoForm } from "@/lib/schemas/manutencao";
import { salvarDocumento } from "../actions";

export type LinhaLicenciamento = {
  veiculo_id: string; empresa_apelido: string; placa: string; renavam: string | null; tipo: keyof typeof ROTULOS.tipoVeiculo;
  situacao: "nao_cadastrado" | "sem_vencimento" | "vencido" | "vencendo" | "em_dia"; dias_para_vencer: number | null;
  documento_id: string | null; documento_numero: string | null; data_emissao: string | null; validade: string | null; anexo_url: string | null;
};

const SITUACAO: Record<LinhaLicenciamento["situacao"], { rotulo: string; variante: "ok" | "critico" | "alerta" | "info" | "neutro" }> = {
  em_dia: { rotulo: "Em dia", variante: "ok" },
  vencendo: { rotulo: "Vence em até 30 dias", variante: "alerta" },
  vencido: { rotulo: "Vencido", variante: "critico" },
  sem_vencimento: { rotulo: "Sem data de vencimento", variante: "neutro" },
  nao_cadastrado: { rotulo: "Não cadastrado", variante: "neutro" },
};

const campos: Campo<DocumentoForm>[] = [
  { nome: "data_emissao", rotulo: "Data de emissão", tipo: "data", col: 3 },
  { nome: "validade", rotulo: "Data de vencimento", tipo: "data", obrigatorio: true, col: 3, ajuda: "Sugerida 12 meses após a emissão" },
  { nome: "numero", rotulo: "Número / exercício", col: 6, placeholder: "Ex.: CRLV-e 2026" },
  { nome: "anexo_url", rotulo: "CRLV-e (PDF/foto)", tipo: "anexo", bucket: "anexos", pasta: "documentos", col: 6 },
  { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
];
const sugerirVencimento = (campo: string, v: DocumentoForm) =>
  campo === "data_emissao" && v.data_emissao && !v.validade ? { validade: addMesesClamp(v.data_emissao, 12) } : undefined;

/**
 * Licenciamento por veículo: emissão e vencimento vêm do documento "Licenciamento" cadastrado na ficha do veículo
 * (Cadastros → Veículos → Documentos). Sem documento, o veículo aparece como "Não cadastrado".
 */
export function LicenciamentoCliente({ linhas, podeEditar }: { linhas: LinhaLicenciamento[]; podeEditar: boolean }) {
  const router = useRouter();
  const [cadastrando, setCadastrando] = React.useState<LinhaLicenciamento | null>(null);

  const colunas = React.useMemo<ColumnDef<LinhaLicenciamento, unknown>[]>(() => [
    { accessorKey: "placa", header: "Placa", meta: { tituloMobile: true }, cell: ({ row: { original: l } }) => (
      <span><span className="whitespace-nowrap font-mono font-semibold">{formatPlaca(l.placa)}</span><span className="block text-xs text-muted-foreground">{ROTULOS.tipoVeiculo[l.tipo] ?? l.tipo} · {l.empresa_apelido}</span></span>
    ) },
    { accessorKey: "renavam", header: "RENAVAM", cell: ({ getValue }) => <span className="font-mono text-sm">{(getValue() as string | null) ?? "—"}</span> },
    { accessorKey: "data_emissao", header: "Emissão", cell: ({ getValue }) => (getValue() ? <span className="whitespace-nowrap">{formatData(getValue() as string)}</span> : "—") },
    { accessorKey: "validade", header: "Vencimento", cell: ({ row: { original: l } }) => l.validade
      ? <span className="whitespace-nowrap">{formatData(l.validade)}{l.documento_numero && <span className="block text-xs text-muted-foreground">{l.documento_numero}</span>}</span>
      : "—" },
    { accessorKey: "situacao", header: "Situação", cell: ({ row: { original: l } }) => (
      <span><Badge variant={SITUACAO[l.situacao].variante}>{SITUACAO[l.situacao].rotulo}</Badge>
        {l.situacao === "vencendo" && l.dias_para_vencer != null &&
          <span className="block text-xs text-muted-foreground">{l.dias_para_vencer === 0 ? "vence hoje" : `faltam ${l.dias_para_vencer} dias`}</span>}</span>
    ) },
    { accessorKey: "anexo_url", header: "CRLV-e", cell: ({ getValue }) => <LinkAnexo referencia={getValue() as string | null} rotulo="Abrir" /> },
    { id: "acoes", header: () => <span className="sr-only">Ações</span>, meta: { classe: "text-right" }, cell: ({ row: { original: l } }) =>
      podeEditar && l.situacao !== "em_dia"
        ? <Button size="xs" variant="outline" onClick={() => setCadastrando(l)}><FilePlus2 /> {l.documento_id ? "Renovar" : "Cadastrar"}</Button> : null },
  ], [podeEditar]);

  const conta = (s: LinhaLicenciamento["situacao"][]) => linhas.filter((l) => s.includes(l.situacao)).length;

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Licenciamento" descricao="Emissão e vencimento do documento “Licenciamento” cadastrado em cada veículo (Cadastros → Veículos → Documentos). Alertas a partir de 30 dias do vencimento." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3"><p className="text-xs text-muted-foreground">Veículos</p><p className="text-lg font-semibold">{linhas.length}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Em dia</p><p className="text-lg font-semibold text-status-ok">{conta(["em_dia"])}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Vencidos ou vencendo</p><p className="text-lg font-semibold text-status-critico">{conta(["vencido", "vencendo"])}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Não cadastrados</p><p className="text-lg font-semibold">{conta(["nao_cadastrado", "sem_vencimento"])}</p></Card>
      </div>
      <DataTable colunas={colunas} dados={linhas} getId={(l) => l.veiculo_id}
        aoClicarLinha={(l) => router.push(`/cadastros/veiculos/${l.veiculo_id}`)}
        classeLinha={(l) => (l.situacao === "vencido" ? "border-l-2 border-l-status-critico" : undefined)}
        exportar={{ nome: "licenciamento", titulo: "Licenciamento", colunas: [
          { titulo: "Placa", valor: (l) => l.placa }, { titulo: "RENAVAM", valor: (l) => l.renavam }, { titulo: "Empresa", valor: (l) => l.empresa_apelido },
          { titulo: "Emissão", valor: (l) => l.data_emissao, tipo: "data" }, { titulo: "Vencimento", valor: (l) => l.validade, tipo: "data" },
          { titulo: "Situação", valor: (l) => SITUACAO[l.situacao].rotulo }, { titulo: "Número", valor: (l) => l.documento_numero },
        ] }} />
      <FormularioDialog<DocumentoForm>
        aberto={!!cadastrando} onOpenChange={(v) => !v && setCadastrando(null)}
        titulo={`Licenciamento · ${cadastrando ? formatPlaca(cadastrando.placa) : ""}`}
        descricao="Fica nos documentos do veículo, com os avisos de vencimento."
        campos={campos} schema={documentoSchema as never} aoAlterar={sugerirVencimento}
        valores={{ veiculo_id: cadastrando?.veiculo_id, tipo: "licenciamento", numero: null, data_emissao: null, validade: null, anexo_url: null, observacoes: null }}
        onSalvar={(v) => salvarDocumento(null, v)}
        onSucesso={() => { setCadastrando(null); router.refresh(); }} />
    </div>
  );
}
