"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { LogOut } from "lucide-react";
import { CrudSimples } from "@/components/app/crud";
import { Confirmar, Moeda, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { Badge, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Opcao } from "@/components/ui/select";
import { contratoSchema, type ContratoForm } from "@/lib/schemas/operacao";
import { formatData, formatPlaca, hojeSP } from "@/lib/format";
import { desmobilizarContrato, salvarContrato } from "./actions";
import type { OpcoesContrato } from "./dados";

export type LinhaContrato = {
  id: string; numero: string | null; empresa_id: string; cliente_id: string; obra_id: string | null; veiculo_id: string;
  valor_mensal: number; valor_repasse_mensal: number | null; dia_corte_inicio: number; prazo_pagamento_dias: number;
  data_inicio: string; data_fim: string | null; data_desmobilizacao: string | null; status: "ativo" | "encerrado" | "suspenso"; observacoes: string | null;
  empresa: string; cliente: string; obra: string | null; placa: string; modelo: string | null; proprietario: "proprio" | "locador";
};

export function camposContrato(opcoes: OpcoesContrato, empresas: Opcao[]): Campo<ContratoForm>[] {
  const locador = (v: ContratoForm) => opcoes.veiculos.find((x) => x.value === v.veiculo_id)?.proprietario === "locador";
  return [
    { nome: "empresa_id", rotulo: "Empresa emissora", tipo: "select", opcoes: empresas, obrigatorio: true, col: 2 },
    { nome: "numero", rotulo: "Nº do contrato", col: 2 },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: [{ value: "ativo", label: "Ativo" }, { value: "suspenso", label: "Suspenso" }, { value: "encerrado", label: "Encerrado" }], col: 2 },
    { nome: "cliente_id", rotulo: "Cliente", tipo: "select", opcoes: opcoes.clientes, obrigatorio: true, col: 3 },
    { nome: "obra_id", rotulo: "Obra", tipo: "select", vazio: "—", opcoes: (v) => opcoes.obras.filter((o) => o.cliente_id === v.cliente_id), col: 3 },
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", opcoes: (v) => opcoes.veiculos.filter((x) => !v.empresa_id || x.empresa_id === v.empresa_id), obrigatorio: true, col: 6 },
    { nome: "valor_mensal", rotulo: "Valor mensal (cliente)", tipo: "moeda", obrigatorio: true, col: 3 },
    { nome: "valor_repasse_mensal", rotulo: "Repasse mensal (locador)", tipo: "moeda", col: 3, visivel: locador, ajuda: "Valor fixo mensal pago ao dono do veículo" },
    { nome: "dia_corte_inicio", rotulo: "Período de medição", tipo: "select", col: 2, opcoes: [{ value: "1", label: "Dia 01 ao fim do mês" }, { value: "21", label: "Dia 21 ao dia 20" }] },
    { nome: "prazo_pagamento_dias", rotulo: "Prazo de pagamento (dias)", tipo: "numero", col: 2 },
    { nome: "data_inicio", rotulo: "Início (mobilização)", tipo: "data", obrigatorio: true, col: 2 },
    { nome: "data_fim", rotulo: "Término previsto", tipo: "data", col: 2 },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  ];
}

export function valoresContrato(c: LinhaContrato): ContratoForm {
  return {
    empresa_id: c.empresa_id, cliente_id: c.cliente_id, obra_id: c.obra_id, veiculo_id: c.veiculo_id, numero: c.numero,
    valor_mensal: c.valor_mensal, valor_repasse_mensal: c.valor_repasse_mensal, dia_corte_inicio: c.dia_corte_inicio as never,
    prazo_pagamento_dias: c.prazo_pagamento_dias, data_inicio: c.data_inicio, data_fim: c.data_fim, status: c.status, observacoes: c.observacoes,
  };
}

export function DialogoDesmobilizar({ contrato, aberto, onOpenChange }: { contrato: LinhaContrato | null; aberto: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [data, setData] = React.useState(hojeSP());
  return (
    <Confirmar aberto={aberto} onOpenChange={onOpenChange} titulo="Desmobilizar contrato" rotulo="Desmobilizar"
      descricao={contrato && (
        <div className="space-y-2">
          <p>Veículo <strong className="font-mono">{formatPlaca(contrato.placa)}</strong> — {contrato.cliente}{contrato.obra ? ` / ${contrato.obra}` : ""}.</p>
          <p>Será gerada a <strong>medição final proporcional</strong> até a data informada, o contrato será encerrado e o veículo volta para <strong>disponível</strong>.</p>
        </div>
      )}
      onConfirmar={async () => {
        if (!contrato) return;
        const r = await rodarAcao(desmobilizarContrato({ contrato_id: contrato.id, data }));
        if (r.ok) router.refresh();
      }}>
      <div className="space-y-1.5">
        <Label htmlFor="data-desmob">Data da desmobilização</Label>
        <Input id="data-desmob" type="date" value={data} min={contrato?.data_inicio} onChange={(e) => setData(e.target.value)} />
      </div>
    </Confirmar>
  );
}

export function ContratosCliente({ linhas, total, pagina, tamanho, opcoes, empresas, empresaPadrao, podeEditar, novo }: {
  linhas: LinhaContrato[]; total: number; pagina: number; tamanho: number; opcoes: OpcoesContrato; empresas: Opcao[];
  empresaPadrao: string | null; podeEditar: boolean; novo: boolean;
}) {
  const [desmob, setDesmob] = React.useState<LinhaContrato | null>(null);

  const colunas = React.useMemo<ColumnDef<LinhaContrato, unknown>[]>(() => [
    { accessorKey: "placa", header: "Placa", meta: { tituloMobile: true }, cell: ({ row: { original: c } }) => (
      <div><span className="font-mono font-semibold tracking-wider">{formatPlaca(c.placa)}</span>
        {c.proprietario === "locador" && <Badge variant="info" className="ml-2">Sublocado</Badge>}
        <p className="text-xs text-muted-foreground">{c.modelo}</p></div>
    ) },
    { id: "cliente", header: "Cliente / obra", cell: ({ row: { original: c } }) => <div><p>{c.cliente}</p>{c.obra && <p className="text-xs text-muted-foreground">{c.obra}</p>}</div> },
    { accessorKey: "empresa", header: "Empresa" },
    { accessorKey: "valor_mensal", header: "Valor mensal", meta: { direita: true, ordem: "valor_mensal" }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
    { accessorKey: "valor_repasse_mensal", header: "Repasse", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number | null} /> },
    { id: "margem", header: "Margem prevista", meta: { direita: true }, cell: ({ row: { original: c } }) => {
      const m = c.valor_mensal - (c.valor_repasse_mensal ?? 0);
      return <span><Moeda valor={m} sinal /> <span className="text-xs text-muted-foreground">{Math.round((m / c.valor_mensal) * 100)}%</span></span>;
    } },
    { id: "corte", header: "Período", cell: ({ row }) => (row.original.dia_corte_inicio === 1 ? "01 → fim" : "21 → 20") },
    { accessorKey: "data_inicio", header: "Início", meta: { ordem: "data_inicio" }, cell: ({ row: { original: c } }) => (
      <span>{formatData(c.data_inicio)}{c.data_desmobilizacao && <span className="block text-xs text-muted-foreground">desmob. {formatData(c.data_desmobilizacao)}</span>}</span>
    ) },
    { accessorKey: "status", header: "Status", meta: { ordem: "status" }, cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  ], []);

  return (
    <>
      <CrudSimples<LinhaContrato, ContratoForm>
        titulo="Contratos" entidade="contrato" tamanhoForm="lg" abrirNovo={novo}
        descricao="Locação de cada placa para um cliente/obra. A margem prevista é o valor mensal menos o repasse ao locador."
        linhas={linhas} total={total} pagina={pagina} tamanho={tamanho} colunas={colunas}
        campos={camposContrato(opcoes, empresas)} schema={contratoSchema as never}
        busca="Buscar placa…" hrefLinha={(c) => `/contratos/${c.id}`}
        filtros={<>
          <FiltroSelectUrl param="status" rotulo="Status" vazio="Ativos" opcoes={[{ value: "suspenso", label: "Suspensos" }, { value: "encerrado", label: "Encerrados" }, { value: "todos", label: "Todos" }]} />
          <FiltroSelectUrl param="cliente" rotulo="Cliente" opcoes={opcoes.clientes} />
          <FiltroSelectUrl param="corte" rotulo="Período" opcoes={[{ value: "1", label: "01 → fim" }, { value: "21", label: "21 → 20" }]} />
        </>}
        novo={{ empresa_id: empresaPadrao ?? empresas[0]?.value, cliente_id: undefined, obra_id: null, veiculo_id: undefined, numero: null, valor_mensal: undefined, valor_repasse_mensal: null, dia_corte_inicio: "1" as never, prazo_pagamento_dias: 30, data_inicio: hojeSP(), data_fim: null, status: "ativo", observacoes: null }}
        paraForm={(c) => ({ ...valoresContrato(c), dia_corte_inicio: String(c.dia_corte_inicio) as never })}
        salvar={salvarContrato} podeEditar={podeEditar}
        acoesLinha={(c) => podeEditar && c.status === "ativo" ? (
          <Button variant="outline" size="xs" onClick={() => setDesmob(c)}><LogOut /> Desmobilizar</Button>
        ) : null}
        exportar={{ nome: "contratos", colunas: [
          { titulo: "Placa", valor: (c) => c.placa }, { titulo: "Contrato", valor: (c) => c.numero }, { titulo: "Empresa", valor: (c) => c.empresa },
          { titulo: "Cliente", valor: (c) => c.cliente, largura: 24 }, { titulo: "Obra", valor: (c) => c.obra, largura: 24 },
          { titulo: "Valor mensal", valor: (c) => c.valor_mensal, tipo: "moeda" }, { titulo: "Repasse", valor: (c) => c.valor_repasse_mensal, tipo: "moeda" },
          { titulo: "Margem prevista", valor: (c) => c.valor_mensal - (c.valor_repasse_mensal ?? 0), tipo: "moeda" },
          { titulo: "Corte", valor: (c) => c.dia_corte_inicio }, { titulo: "Prazo (dias)", valor: (c) => c.prazo_pagamento_dias },
          { titulo: "Início", valor: (c) => c.data_inicio, tipo: "data" }, { titulo: "Desmobilização", valor: (c) => c.data_desmobilizacao, tipo: "data" },
          { titulo: "Status", valor: (c) => c.status },
        ] }}
      />
      <DialogoDesmobilizar contrato={desmob} aberto={!!desmob} onOpenChange={(v) => !v && setDesmob(null)} />
      <p className="mt-3 text-xs text-muted-foreground">Dica: as medições são geradas em <Link className="underline" href="/medicoes">Medições → Gerar medições do período</Link>.</p>
    </>
  );
}
