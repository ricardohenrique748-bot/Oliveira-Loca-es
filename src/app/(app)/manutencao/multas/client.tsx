"use client";
import type { ColumnDef } from "@tanstack/react-table";
import type { Opcao } from "@/components/ui/select";
import { Card } from "@/components/ui/basicos";
import { CrudSimples } from "@/components/app/crud";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { LinkAnexo } from "@/components/app/anexo";
import { Moeda, StatusBadge } from "@/components/app/comuns";
import { ValidadeBadge } from "@/components/app/validade";
import { multaSchema, type MultaForm } from "@/lib/schemas/manutencao";
import { somar } from "@/lib/calculos";
import { formatData, formatPlaca } from "@/lib/format";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { excluirMulta, salvarMulta } from "../actions";
import { DetalheMulta } from "./detalhe";
import * as React from "react";

export type LinhaMulta = {
  id: string; veiculo_id: string; placa: string; renavam: string | null; empresa_apelido: string; contrato_id: string | null; contrato_numero: string | null;
  cliente_nome: string | null; auto_infracao: string | null; data_infracao: string; orgao: string | null; descricao: string | null; codigo: string | null;
  pontos: number | null; valor: number; vencimento: string | null; status: MultaForm["status"]; status_exibicao: string;
  responsavel: MultaForm["responsavel"]; pago_em: string | null; anexo_url: string | null; observacoes: string | null;
};

const STATUS: Opcao[] = [
  { value: "pendente", label: "Pendente (a pagar)" }, { value: "vencida", label: "Vencida" }, { value: "recurso", label: "Em recurso" },
  { value: "paga", label: "Paga" }, { value: "cancelada", label: "Cancelada" },
];
const STATUS_FORM = STATUS.filter((s) => s.value !== "vencida").map((s) => (s.value === "pendente" ? { ...s, label: "Pendente" } : s));
const RESPONSAVEL: Opcao[] = [{ value: "empresa", label: "Empresa" }, { value: "cliente", label: "Cliente (cobrar)" }, { value: "locador", label: "Locador (descontar)" }];
const ROTULO_RESP = Object.fromEntries(RESPONSAVEL.map((r) => [r.value, r.label]));

const colunas: ColumnDef<LinhaMulta, unknown>[] = [
  { accessorKey: "placa", header: "Placa", meta: { tituloMobile: true }, cell: ({ getValue }) => <span className="font-mono font-semibold">{formatPlaca(getValue() as string)}</span> },
  { accessorKey: "data_infracao", header: "Infração", cell: ({ getValue }) => formatData(getValue() as string) },
  { id: "descricao", header: "Descrição", cell: ({ row: { original: m } }) => (
    <div className="max-w-[18rem]">
      <p className="truncate">{m.descricao ?? "—"}</p>
      <p className="truncate text-xs text-muted-foreground">{[m.auto_infracao && `AIT ${m.auto_infracao}`, m.orgao, m.pontos != null && `${m.pontos} pts`].filter(Boolean).join(" · ")}</p>
    </div>
  ) },
  { id: "cliente", header: "Cliente na data", meta: { ocultarMobile: true }, cell: ({ row: { original: m } }) => m.cliente_nome
    ? <span>{m.cliente_nome}{m.contrato_numero && <span className="text-xs text-muted-foreground"> · {m.contrato_numero}</span>}</span>
    : <span className="text-muted-foreground">Sem contrato</span> },
  { accessorKey: "valor", header: "Valor", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "vencimento", header: "Vencimento", cell: ({ row: { original: m } }) =>
    // sem data: não estima nem avisa; o usuário preenche ao abrir a multa
    m.status === "pendente" && !m.vencimento ? <Badge variant="alerta">Vencimento não informado</Badge>
      : m.status === "pendente" ? <ValidadeBadge validade={m.vencimento} /> : m.status === "paga" ? <span className="text-xs">Paga em {formatData(m.pago_em)}</span> : formatData(m.vencimento) },
  { accessorKey: "responsavel", header: "Quem paga", meta: { ocultarMobile: true }, cell: ({ getValue }) => ROTULO_RESP[getValue() as string] },
  { accessorKey: "status_exibicao", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: "anexo_url", header: "Anexo", meta: { ocultarMobile: true }, cell: ({ getValue }) => <LinkAnexo referencia={getValue() as string | null} rotulo="Abrir" /> },
];

export function MultasCliente({ linhas, veiculos, veiculoInicial, abrirNovo, podeEditar }: { linhas: LinhaMulta[]; veiculos: Opcao[]; veiculoInicial: string | null; abrirNovo?: boolean; podeEditar: boolean }) {
  const [detalhe, setDetalhe] = React.useState<LinhaMulta | null>(null);
  const campos: Campo<MultaForm>[] = [
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", opcoes: veiculos, obrigatorio: true, col: 2 },
    { nome: "data_infracao", rotulo: "Data da infração", tipo: "data", obrigatorio: true, col: 2 },
    { nome: "auto_infracao", rotulo: "Nº do auto (AIT)", col: 2 },
    { nome: "descricao", rotulo: "Descrição da infração", col: 4, placeholder: "Ex.: Excesso de velocidade até 20%" },
    { nome: "codigo", rotulo: "Código", col: 2 },
    { nome: "orgao", rotulo: "Órgão autuador", col: 2, placeholder: "Ex.: DER-SP, PRF" },
    { nome: "pontos", rotulo: "Pontos", tipo: "numero", col: 2 },
    { nome: "valor", rotulo: "Valor", tipo: "moeda", obrigatorio: true, col: 2 },
    { nome: "vencimento", rotulo: "Vencimento", tipo: "data", col: 2 },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: STATUS_FORM, col: 2 },
    { nome: "pago_em", rotulo: "Pago em", tipo: "data", col: 2, visivel: (v) => v.status === "paga" },
    { nome: "responsavel", rotulo: "Quem paga", tipo: "select", opcoes: RESPONSAVEL, col: 2, ajuda: "O cliente do contrato na data é ligado automaticamente" },
    { nome: "anexo_url", rotulo: "Notificação (PDF/foto)", tipo: "anexo", bucket: "anexos", pasta: "multas", col: 6 },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  ];
  const abertas = linhas.filter((m) => m.status === "pendente");
  const vencidas = linhas.filter((m) => m.status_exibicao === "vencida");
  return (
    <div className="space-y-4">
      <CrudSimples<LinhaMulta, MultaForm>
        titulo="Multas" entidade="multa" feminino abrirNovo={abrirNovo} busca={false} tamanhoForm="lg"
        descricao="Infrações por veículo. Consulte no portal da SENATRAN / DETRAN e lance aqui; alertas a partir de 10 dias do vencimento."
        acoesLinha={(m) => <Button variant="ghost" size="icon-sm" aria-label="Detalhes da multa" title="Detalhes" onClick={() => setDetalhe(m)}><Eye /></Button>}
        linhas={linhas} colunas={colunas} campos={campos} schema={multaSchema as never}
        filtros={<>
          <FiltroSelectUrl param="veiculo" rotulo="Veículo" opcoes={veiculos} />
          <FiltroSelectUrl param="status" rotulo="Status" opcoes={STATUS} />
          <FiltroSelectUrl param="responsavel" rotulo="Quem paga" opcoes={RESPONSAVEL} />
        </>}
        novo={{ veiculo_id: veiculoInicial ?? undefined, auto_infracao: null, data_infracao: undefined, orgao: null, descricao: null, codigo: null, pontos: null,
          valor: undefined, vencimento: null, status: "pendente", responsavel: "empresa", pago_em: null, anexo_url: null, observacoes: null }}
        paraForm={(m) => ({ veiculo_id: m.veiculo_id, auto_infracao: m.auto_infracao, data_infracao: m.data_infracao, orgao: m.orgao, descricao: m.descricao, codigo: m.codigo,
          pontos: m.pontos, valor: m.valor, vencimento: m.vencimento, status: m.status, responsavel: m.responsavel, pago_em: m.pago_em, anexo_url: m.anexo_url, observacoes: m.observacoes })}
        salvar={salvarMulta} excluir={excluirMulta} podeEditar={podeEditar}
        exportar={{ nome: "multas", colunas: [
          { titulo: "Placa", valor: (m) => m.placa }, { titulo: "RENAVAM", valor: (m) => m.renavam }, { titulo: "Data infração", valor: (m) => m.data_infracao, tipo: "data" },
          { titulo: "AIT", valor: (m) => m.auto_infracao }, { titulo: "Descrição", valor: (m) => m.descricao, largura: 30 }, { titulo: "Órgão", valor: (m) => m.orgao },
          { titulo: "Pontos", valor: (m) => m.pontos, tipo: "numero" }, { titulo: "Valor", valor: (m) => m.valor, tipo: "moeda" },
          { titulo: "Vencimento", valor: (m) => m.vencimento, tipo: "data" }, { titulo: "Cliente na data", valor: (m) => m.cliente_nome, largura: 20 },
          { titulo: "Quem paga", valor: (m) => ROTULO_RESP[m.responsavel] }, { titulo: "Status", valor: (m) => STATUS.find((s) => s.value === m.status_exibicao)?.label ?? m.status_exibicao },
          { titulo: "Pago em", valor: (m) => m.pago_em, tipo: "data" },
        ] }}
      />
      <DetalheMulta multa={detalhe} onOpenChange={(v) => !v && setDetalhe(null)} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-3"><p className="text-xs text-muted-foreground">A pagar</p><p className="text-lg font-semibold"><Moeda valor={somar(abertas.map((m) => m.valor))} /></p><p className="text-xs text-muted-foreground">{abertas.length} multa(s)</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Vencidas</p><p className="text-lg font-semibold text-status-critico"><Moeda valor={somar(vencidas.map((m) => m.valor))} /></p><p className="text-xs text-muted-foreground">{vencidas.length} multa(s)</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">A cobrar de clientes</p><p className="text-lg font-semibold"><Moeda valor={somar(abertas.filter((m) => m.responsavel === "cliente").map((m) => m.valor))} /></p></Card>
      </div>
    </div>
  );
}
