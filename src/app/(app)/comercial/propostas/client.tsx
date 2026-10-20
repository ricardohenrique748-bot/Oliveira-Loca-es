"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileDown, FileText } from "lucide-react";
import { CrudSimples } from "@/components/app/crud";
import { Confirmar, Moeda, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { Badge } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import type { Opcao } from "@/components/ui/select";
import { propostaSchema, STATUS_PROPOSTA, type PropostaForm, type StatusProposta } from "@/lib/schemas/comercial";
import { formatBRL, formatData, formatPlaca, hojeSP } from "@/lib/format";
import { exportarPDF } from "@/lib/exportar";
import type { OpcoesContrato } from "../../contratos/dados";
import { excluirProposta, gerarContratoDaProposta, salvarProposta } from "./actions";

export type LinhaProposta = {
  id: string; numero: string | null; empresa_id: string; cliente_id: string; obra_id: string | null; veiculo_id: string | null;
  equipamento: string | null; tipo_cobranca: "mensal" | "diaria"; valor: number; dia_corte_inicio: number; prazo_pagamento_dias: number;
  data_inicio_prevista: string | null; periodo_minimo: string | null; validade: string | null; condicoes: string | null; observacoes: string | null;
  status: StatusProposta; motivo_recusa: string | null; contrato_id: string | null; created_at: string;
  empresa: string; empresa_razao: string; empresa_cnpj: string | null;
  cliente: string; cliente_razao: string; cliente_cnpj: string | null; obra: string | null; placa: string | null; modelo: string | null;
};

const ROTULO_STATUS_VEICULO: Record<string, string> = { locado: "locado", manutencao: "em manutenção", parado: "parado" };

/** "Placa · modelo" ou a descrição livre do equipamento. */
const descricaoItem = (r: LinhaProposta) =>
  [r.placa ? `${formatPlaca(r.placa)}${r.modelo ? ` · ${r.modelo}` : ""}` : null, r.equipamento].filter(Boolean).join(" — ");

const vencida = (r: LinhaProposta) => !!r.validade && r.validade < hojeSP() && (r.status === "rascunho" || r.status === "enviada");

function camposProposta(opcoes: OpcoesContrato, empresas: Opcao[]): Campo<PropostaForm>[] {
  const diaria = (v: PropostaForm) => v.tipo_cobranca === "diaria";
  const veiculos = (v: PropostaForm) => opcoes.veiculos
    .filter((x) => !v.empresa_id || x.empresa_id === v.empresa_id)
    .map((x) => ({ ...x, label: x.label + (ROTULO_STATUS_VEICULO[x.status] ? ` — ${ROTULO_STATUS_VEICULO[x.status]}` : "") }));
  return [
    { nome: "tipo_cobranca", rotulo: "Tipo de cobrança", tipo: "select", col: 2, opcoes: [{ value: "mensal", label: "Mensal" }, { value: "diaria", label: "Diária" }] },
    { nome: "empresa_id", rotulo: "Empresa emissora", tipo: "select", opcoes: empresas, obrigatorio: true, col: 2 },
    { nome: "status", rotulo: "Situação", tipo: "select", col: 2, opcoes: (["rascunho", "enviada", "aprovada", "recusada"] as const).map((s) => ({ value: s, label: STATUS_PROPOSTA[s] })) },
    { nome: "cliente_id", rotulo: "Cliente", tipo: "select", opcoes: opcoes.clientes, obrigatorio: true, col: 3 },
    { nome: "obra_id", rotulo: "Obra", tipo: "select", vazio: "—", opcoes: (v) => opcoes.obras.filter((o) => o.cliente_id === v.cliente_id), col: 3 },
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", vazio: "— definir depois", opcoes: veiculos, col: 3, ajuda: "Obrigatório só para gerar o contrato" },
    { nome: "equipamento", rotulo: "Equipamento / descrição", col: 3, placeholder: "Ex.: Caminhão munck 15t com operador" },
    { nome: "valor", rotulo: "Valor mensal", tipo: "moeda", obrigatorio: true, col: 2, visivel: (v) => !diaria(v) },
    { nome: "valor", rotulo: "Valor da diária", tipo: "moeda", obrigatorio: true, col: 2, visivel: diaria },
    { nome: "data_inicio_prevista", rotulo: "Início previsto", tipo: "data", col: 2 },
    { nome: "validade", rotulo: "Validade da proposta", tipo: "data", col: 2 },
    { nome: "dia_corte_inicio", rotulo: "Período de medição", tipo: "select", col: 2, visivel: (v) => !diaria(v), opcoes: [{ value: "1", label: "Dia 01 ao fim do mês" }, { value: "21", label: "Dia 21 ao dia 20" }] },
    { nome: "prazo_pagamento_dias", rotulo: "Prazo de pagamento (dias)", tipo: "numero", col: 2 },
    { nome: "periodo_minimo", rotulo: "Período mínimo", col: 2, placeholder: "Ex.: 3 meses" },
    { nome: "motivo_recusa", rotulo: "Motivo da recusa", col: 6, visivel: (v) => v.status === "recusada", placeholder: "Preço, prazo, fechou com concorrente…" },
    { nome: "condicoes", rotulo: "Condições comerciais (saem no PDF)", tipo: "textarea", col: 6, placeholder: "Combustível, operador, mobilização, seguro…" },
    { nome: "observacoes", rotulo: "Observações internas", tipo: "textarea", col: 6 },
  ];
}

async function pdfProposta(r: LinhaProposta) {
  const diaria = r.tipo_cobranca === "diaria";
  await exportarPDF(`proposta_${(r.numero ?? "").replace(/\W+/g, "-")}`, `Proposta comercial ${r.numero ?? ""}`, [
    { titulo: "Descrição", valor: (l: LinhaProposta) => descricaoItem(l), largura: 40 },
    { titulo: "Cobrança", valor: () => (diaria ? "Diária" : "Mensal") },
    { titulo: diaria ? "Valor por dia" : "Valor mensal", valor: (l: LinhaProposta) => l.valor, tipo: "moeda" },
    { titulo: "Período mínimo", valor: (l: LinhaProposta) => l.periodo_minimo ?? "—" },
    { titulo: "Início previsto", valor: (l: LinhaProposta) => l.data_inicio_prevista, tipo: "data" },
  ], [r], {
    subtitulo: `${r.empresa_razao}${r.empresa_cnpj ? ` — CNPJ ${r.empresa_cnpj}` : ""}`,
    resumo: [
      ["Cliente", r.cliente_razao && r.cliente_razao !== r.cliente ? `${r.cliente} (${r.cliente_razao})` : r.cliente],
      ...(r.cliente_cnpj ? [["CNPJ", r.cliente_cnpj] as [string, string]] : []),
      ...(r.obra ? [["Obra", r.obra] as [string, string]] : []),
      ["Data", formatData(r.created_at.slice(0, 10))],
      ["Validade", r.validade ? formatData(r.validade) : "—"],
    ],
    rodape: [
      diaria
        ? `Cobrança por diária: ${formatBRL(r.valor)} × dias trabalhados, medidos mensalmente.`
        : `Cobrança mensal de ${formatBRL(r.valor)}, medição ${r.dia_corte_inicio === 1 ? "do dia 01 ao fim do mês" : "do dia 21 ao dia 20"}, proporcional aos dias no primeiro e no último mês.`,
      `Pagamento em ${r.prazo_pagamento_dias} dias após a emissão da nota fiscal.`,
      ...(r.condicoes ? r.condicoes.split(/\r?\n/).filter(Boolean) : []),
    ],
  });
}

export function PropostasCliente({ linhas, total, pagina, tamanho, opcoes, empresas, empresaPadrao, podeEditar, veContratos, novo }: {
  linhas: LinhaProposta[]; total: number; pagina: number; tamanho: number; opcoes: OpcoesContrato; empresas: Opcao[];
  empresaPadrao: string | null; podeEditar: boolean; veContratos: boolean; novo: boolean;
}) {
  const router = useRouter();
  const [convertendo, setConvertendo] = React.useState<LinhaProposta | null>(null);

  const colunas = React.useMemo<ColumnDef<LinhaProposta, unknown>[]>(() => [
    { accessorKey: "numero", header: "Proposta", meta: { tituloMobile: true }, cell: ({ row: { original: r } }) => (
      <div><span className="font-mono font-semibold">{r.numero}</span><p className="text-xs text-muted-foreground">{formatData(r.created_at.slice(0, 10))} · {r.empresa}</p></div>
    ) },
    { id: "cliente", header: "Cliente / obra", cell: ({ row: { original: r } }) => <div><p>{r.cliente}</p>{r.obra && <p className="text-xs text-muted-foreground">{r.obra}</p>}</div> },
    { id: "item", header: "Veículo / equipamento", cell: ({ row: { original: r } }) => <span className="text-sm">{descricaoItem(r) || "—"}</span> },
    { accessorKey: "valor", header: "Valor", meta: { direita: true, ordem: "valor" }, cell: ({ row: { original: r } }) => (
      <span><Moeda valor={r.valor} />{r.tipo_cobranca === "diaria" && <span className="text-xs text-muted-foreground">/dia</span>}</span>
    ) },
    { accessorKey: "validade", header: "Validade", meta: { ordem: "validade" }, cell: ({ row: { original: r } }) => (
      <span>{r.validade ? formatData(r.validade) : "—"}{vencida(r) && <Badge variant="critico" className="ml-2">Vencida</Badge>}</span>
    ) },
    { accessorKey: "status", header: "Situação", meta: { ordem: "status" }, cell: ({ row: { original: r } }) => (
      <div><StatusBadge status={r.status} />{r.status === "recusada" && r.motivo_recusa && <p className="text-xs text-muted-foreground">{r.motivo_recusa}</p>}</div>
    ) },
  ], []);

  return (
    <>
      <CrudSimples<LinhaProposta, PropostaForm>
        titulo="Propostas" entidade="proposta" tamanhoForm="lg" abrirNovo={novo}
        descricao={<>Orçamentos de locação. Aprovada a proposta, use <strong>Gerar contrato</strong>. Cliente novo? <Link className="underline" href="/cadastros/clientes">Cadastre em Clientes</Link>.</>}
        linhas={linhas} total={total} pagina={pagina} tamanho={tamanho} colunas={colunas}
        campos={camposProposta(opcoes, empresas)} schema={propostaSchema as never}
        busca="Buscar nº ou equipamento…"
        filtros={<>
          <FiltroSelectUrl param="status" rotulo="Situação" vazio="Em aberto" opcoes={[
            ...(Object.keys(STATUS_PROPOSTA) as StatusProposta[]).map((s) => ({ value: s, label: STATUS_PROPOSTA[s] })),
            { value: "todas", label: "Todas" },
          ]} />
          <FiltroSelectUrl param="cliente" rotulo="Cliente" opcoes={opcoes.clientes} />
        </>}
        novo={{ tipo_cobranca: "mensal", empresa_id: empresaPadrao ?? empresas[0]?.value, cliente_id: undefined, obra_id: null, veiculo_id: null, equipamento: null,
          valor: undefined, dia_corte_inicio: "1" as never, prazo_pagamento_dias: 30, data_inicio_prevista: null, periodo_minimo: null,
          validade: null, condicoes: null, observacoes: null, status: "rascunho", motivo_recusa: null }}
        paraForm={(r) => ({
          tipo_cobranca: r.tipo_cobranca, empresa_id: r.empresa_id, cliente_id: r.cliente_id, obra_id: r.obra_id, veiculo_id: r.veiculo_id, equipamento: r.equipamento,
          valor: r.valor, dia_corte_inicio: String(r.dia_corte_inicio) as never, prazo_pagamento_dias: r.prazo_pagamento_dias,
          data_inicio_prevista: r.data_inicio_prevista, periodo_minimo: r.periodo_minimo, validade: r.validade, condicoes: r.condicoes,
          observacoes: r.observacoes, status: r.status as PropostaForm["status"], motivo_recusa: r.motivo_recusa,
        })}
        salvar={salvarProposta} excluir={excluirProposta} podeEditar={podeEditar}
        acoesLinha={(r) => (
          <>
            <Button variant="ghost" size="xs" onClick={() => pdfProposta(r)} aria-label={`PDF da proposta ${r.numero}`}><FileDown /> PDF</Button>
            {podeEditar && r.status === "aprovada" && <Button size="xs" onClick={() => setConvertendo(r)}><FileText /> Gerar contrato</Button>}
            {r.status === "convertida" && r.contrato_id && veContratos && (
              <Button variant="outline" size="xs" asChild><Link href={`/contratos/${r.contrato_id}`}>Ver contrato</Link></Button>
            )}
          </>
        )}
        exportar={{ nome: "propostas", colunas: [
          { titulo: "Proposta", valor: (r) => r.numero }, { titulo: "Data", valor: (r) => r.created_at.slice(0, 10), tipo: "data" },
          { titulo: "Empresa", valor: (r) => r.empresa }, { titulo: "Cliente", valor: (r) => r.cliente, largura: 24 }, { titulo: "Obra", valor: (r) => r.obra, largura: 20 },
          { titulo: "Veículo / equipamento", valor: (r) => descricaoItem(r), largura: 30 },
          { titulo: "Cobrança", valor: (r) => (r.tipo_cobranca === "diaria" ? "Diária" : "Mensal") }, { titulo: "Valor", valor: (r) => r.valor, tipo: "moeda" },
          { titulo: "Validade", valor: (r) => r.validade, tipo: "data" }, { titulo: "Situação", valor: (r) => STATUS_PROPOSTA[r.status] },
          { titulo: "Motivo recusa", valor: (r) => r.motivo_recusa, largura: 24 },
        ] }}
      />
      <Confirmar aberto={!!convertendo} onOpenChange={(v) => !v && setConvertendo(null)} titulo="Gerar contrato" rotulo="Gerar contrato"
        descricao={convertendo && (
          <div className="space-y-2">
            <p>Proposta <strong className="font-mono">{convertendo.numero}</strong> — {convertendo.cliente}{convertendo.obra ? ` / ${convertendo.obra}` : ""}.</p>
            {convertendo.veiculo_id
              ? <p>Será criado um contrato <strong>ativo</strong> ({convertendo.tipo_cobranca === "diaria" ? "diária" : "mensal"} de {formatBRL(convertendo.valor)}) para <strong className="font-mono">{formatPlaca(convertendo.placa)}</strong>, com início em {formatData(convertendo.data_inicio_prevista ?? hojeSP())}. O repasse ao locador (se sublocado) é definido depois no contrato.</p>
              : <p className="text-status-critico">Edite a proposta e escolha o veículo antes de gerar o contrato.</p>}
          </div>
        )}
        onConfirmar={async () => {
          if (!convertendo) return;
          const r = await rodarAcao(gerarContratoDaProposta(convertendo.id));
          if (r.ok) {
            setConvertendo(null);
            if (veContratos && r.dados) router.push(`/contratos/${r.dados.contratoId}`);
            else router.refresh();
          }
        }} />
    </>
  );
}
