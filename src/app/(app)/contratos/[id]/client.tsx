"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { LogOut, Pencil, Plus } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import type { Opcao } from "@/components/ui/select";
import { Cabecalho, Moeda, StatusBadge } from "@/components/app/comuns";
import { KpiCard } from "@/components/app/kpi";
import { DataTable } from "@/components/app/data-table";
import { FormularioDialog } from "@/components/app/formulario";
import { contratoSchema } from "@/lib/schemas/operacao";
import { formatData, formatPeriodo, formatPlaca } from "@/lib/format";
import { salvarContrato } from "../actions";
import { camposContrato, DialogoDesmobilizar, valoresContrato, type ContratoFormTela, type LinhaContrato } from "../client";
import type { OpcoesContrato } from "../dados";
import { DialogoLancarMedicao } from "../../medicoes/lancar";

type Medicao = {
  id: string; periodo_inicio: string; periodo_fim: string; dias: number; valor_final: number; acrescimos: number; descontos: number;
  numero_nf: string | null; data_emissao: string | null; data_vencimento: string | null; status_exibicao: string; valor_recebido: number;
  repasse_liquido: number | null; margem: number; final: boolean;
};

const colunas: ColumnDef<Medicao, unknown>[] = [
  { id: "periodo", header: "Período", meta: { tituloMobile: true }, cell: ({ row: { original: m } }) => <span>{formatPeriodo(m.periodo_inicio, m.periodo_fim)}{m.final && <Badge variant="neutro" className="ml-2">Final</Badge>}</span> },
  { accessorKey: "dias", header: "Dias", meta: { direita: true } },
  { accessorKey: "numero_nf", header: "NF" },
  { accessorKey: "data_emissao", header: "Emissão", cell: ({ getValue }) => formatData(getValue() as string | null) },
  { accessorKey: "data_vencimento", header: "Vencimento", cell: ({ getValue }) => formatData(getValue() as string | null) },
  { accessorKey: "valor_final", header: "Valor", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "valor_recebido", header: "Recebido", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "repasse_liquido", header: "Repasse", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number | null} /> },
  { accessorKey: "margem", header: "Margem", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} sinal /> },
  { accessorKey: "status_exibicao", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
];

export function DetalheContrato({ contrato: c, medicoes, opcoes, empresas, podeEditar, podeLancar, baseDias }: {
  contrato: LinhaContrato; medicoes: Medicao[]; opcoes: OpcoesContrato; empresas: Opcao[]; podeEditar: boolean; podeLancar: boolean; baseDias: number;
}) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [lancar, setLancar] = React.useState(false);
  const [desmob, setDesmob] = React.useState(false);
  const faturado = medicoes.filter((m) => m.status_exibicao !== "cancelado").reduce((s, m) => s + m.valor_final, 0);
  const margem = medicoes.filter((m) => m.status_exibicao !== "cancelado").reduce((s, m) => s + m.margem, 0);
  const aReceber = medicoes.filter((m) => ["faturado", "recebido_parcial", "vencido"].includes(m.status_exibicao)).reduce((s, m) => s + m.valor_final - m.valor_recebido, 0);

  return (
    <div className="space-y-4">
      <Cabecalho voltar={{ href: "/contratos", rotulo: "Contratos" }}
        titulo={`${formatPlaca(c.placa)} · ${c.cliente}`}
        descricao={<span>{c.numero ? `Contrato ${c.numero} · ` : ""}{c.empresa}{c.obra ? ` · ${c.obra}` : ""}</span>}
        acoes={<>
          <StatusBadge status={c.status} className="text-sm" />
          {podeEditar && <Button variant="outline" size="sm" onClick={() => setEditando(true)}><Pencil /> Editar</Button>}
          {podeEditar && c.status === "ativo" && <Button variant="outline" size="sm" onClick={() => setDesmob(true)}><LogOut /> Desmobilizar</Button>}
          {podeLancar && c.status !== "suspenso" && <Button size="sm" onClick={() => setLancar(true)}><Plus /> Lançar medição</Button>}
        </>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard titulo={c.tipo_cobranca === "diaria" ? "Valor da diária" : "Valor mensal"} valor={<Moeda valor={c.valor_mensal} />} sub={c.valor_repasse_mensal != null ? <>Repasse <Moeda valor={c.valor_repasse_mensal} /></> : "Frota própria"} />
        <KpiCard titulo="Total medido" valor={<Moeda valor={faturado} />} sub={`${medicoes.length} medições`} />
        <KpiCard titulo="Margem acumulada" valor={<Moeda valor={margem} sinal />} />
        <KpiCard titulo="A receber" valor={<Moeda valor={aReceber} />} tom={aReceber > 0 ? "alerta" : undefined} />
      </div>

      <Card>
        <CardHeader><CardTitle>Condições</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Período de medição</dt><dd>{c.tipo_cobranca === "diaria" ? "Diária (valor × dias)" : c.dia_corte_inicio === 1 ? "Dia 01 ao fim do mês" : "Dia 21 ao dia 20"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Prazo de pagamento</dt><dd>{c.prazo_pagamento_dias} dias</dd></div>
            <div><dt className="text-xs text-muted-foreground">Início</dt><dd>{formatData(c.data_inicio)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{c.data_desmobilizacao ? "Desmobilização" : "Término previsto"}</dt><dd>{formatData(c.data_desmobilizacao ?? c.data_fim)}</dd></div>
            <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-muted-foreground">Veículo</dt>
              <dd><Link className="underline" href={`/cadastros/veiculos/${c.veiculo_id}`}>{formatPlaca(c.placa)} {c.modelo}</Link>{c.proprietario === "locador" ? " (sublocado · sem motorista)" : " (frota própria · com motorista)"}</dd></div>
            {c.observacoes && <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-muted-foreground">Observações</dt><dd className="whitespace-pre-wrap">{c.observacoes}</dd></div>}
          </dl>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-xl">Histórico de medições</h2>
        <DataTable colunas={colunas} dados={medicoes} getId={(m) => m.id} aoClicarLinha={() => router.push(`/medicoes?placa=${c.placa}`)}
          exportar={{ nome: `medicoes_${c.placa}`, titulo: `Medições — ${c.placa} · ${c.cliente}`, colunas: [
            { titulo: "Início", valor: (m) => m.periodo_inicio, tipo: "data" }, { titulo: "Fim", valor: (m) => m.periodo_fim, tipo: "data" },
            { titulo: "Dias", valor: (m) => m.dias, tipo: "numero" }, { titulo: "NF", valor: (m) => m.numero_nf },
            { titulo: "Emissão", valor: (m) => m.data_emissao, tipo: "data" }, { titulo: "Vencimento", valor: (m) => m.data_vencimento, tipo: "data" },
            { titulo: "Valor", valor: (m) => m.valor_final, tipo: "moeda" }, { titulo: "Recebido", valor: (m) => m.valor_recebido, tipo: "moeda" },
            { titulo: "Repasse", valor: (m) => m.repasse_liquido, tipo: "moeda" }, { titulo: "Margem", valor: (m) => m.margem, tipo: "moeda" },
            { titulo: "Status", valor: (m) => m.status_exibicao },
          ] }} />
      </div>

      <FormularioDialog<ContratoFormTela> aberto={editando} onOpenChange={setEditando} titulo="Editar contrato" tamanho="lg"
        campos={camposContrato(opcoes, empresas)} schema={contratoSchema as never}
        valores={{ ...valoresContrato(c), dia_corte_inicio: String(c.dia_corte_inicio) as never }}
        onSalvar={(v) => salvarContrato(c.id, v)} onSucesso={() => router.refresh()} />
      <DialogoDesmobilizar contrato={c} aberto={desmob} onOpenChange={setDesmob} />
      <DialogoLancarMedicao aberto={lancar} onOpenChange={setLancar} contratoId={c.id} baseDias={baseDias} onLancado={() => router.refresh()} />
    </div>
  );
}
