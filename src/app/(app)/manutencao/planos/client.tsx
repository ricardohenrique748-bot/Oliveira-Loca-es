"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import type { Opcao } from "@/components/ui/select";
import { CrudSimples } from "@/components/app/crud";
import { Progresso, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { planoSchema, type PlanoForm } from "@/lib/schemas/manutencao";
import { formatData, formatHoras, formatKm, formatPlaca, hojeSP } from "@/lib/format";
import { aplicarPlanoModelo, excluirPlano, salvarPlano } from "../actions";

export type LinhaPlano = {
  id: string; veiculo_id: string | null; modelo: string | null; servico: string; intervalo_km: number | null; intervalo_horas: number | null; intervalo_dias: number | null;
  ultima_execucao_data: string | null; ultima_execucao_km: number | null; ultima_execucao_horas: number | null; ativo: boolean; placa: string | null;
  status: "em_dia" | "proxima" | "vencida" | null; pct: number | null; criterio: string | null; proxima_km: number | null; proxima_horas: number | null; proxima_data: string | null; restante: number | null;
};

const intervalo = (p: LinhaPlano) => [p.intervalo_km && formatKm(p.intervalo_km), p.intervalo_horas && formatHoras(p.intervalo_horas), p.intervalo_dias && `${p.intervalo_dias} dias`].filter(Boolean).join(" ou ");

export function PlanosCliente({ linhas, veiculos, modelos, podeEditar, abrirNovo }: {
  linhas: LinhaPlano[]; veiculos: (Opcao & { km: number; horas: number })[]; modelos: string[]; podeEditar: boolean; abrirNovo: boolean;
}) {
  const router = useRouter();
  const colunas: ColumnDef<LinhaPlano, unknown>[] = [
    { id: "alvo", header: "Veículo / modelo", meta: { tituloMobile: true }, cell: ({ row: { original: p } }) => p.placa
      ? <span className="font-mono font-semibold">{formatPlaca(p.placa)}</span>
      : <Badge variant="secondary">Modelo: {p.modelo}</Badge> },
    { accessorKey: "servico", header: "Serviço" },
    { id: "intervalo", header: "Intervalo", cell: ({ row }) => <span className="text-sm">{intervalo(row.original)}</span> },
    { id: "ultima", header: "Última execução", cell: ({ row: { original: p } }) => <span className="text-xs">{formatData(p.ultima_execucao_data)}{p.ultima_execucao_km != null && ` · ${formatKm(p.ultima_execucao_km)}`}{p.ultima_execucao_horas != null && ` · ${formatHoras(p.ultima_execucao_horas)}`}</span> },
    { id: "proxima", header: "Próxima", cell: ({ row: { original: p } }) => p.veiculo_id ? (
      <div className="min-w-[10rem] space-y-1">
        {p.pct != null && <Progresso pct={p.pct} />}
        <span className="text-xs">{p.proxima_km != null && `${formatKm(p.proxima_km)} `}{p.proxima_horas != null && `${formatHoras(p.proxima_horas)} `}{p.proxima_data && formatData(p.proxima_data)}
          {p.restante != null && <span className="text-muted-foreground"> · faltam {Math.round(p.restante).toLocaleString("pt-BR")} {p.criterio === "km" ? "km" : p.criterio === "horas" ? "h" : "dias"}</span>}</span>
      </div>
    ) : <span className="text-xs text-muted-foreground">modelo (aplique aos veículos)</span> },
    { accessorKey: "status", header: "Status", cell: ({ row: { original: p } }) => p.veiculo_id ? <StatusBadge status={p.ativo ? p.status : "encerrado"} /> : null },
  ];
  const campos: Campo<PlanoForm>[] = [
    { nome: "alvo", rotulo: "Aplicar a", tipo: "select", col: 2, opcoes: [{ value: "veiculo", label: "Um veículo" }, { value: "modelo", label: "Modelo (todos)" }] },
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", opcoes: veiculos, col: 4, visivel: (v) => v.alvo === "veiculo" },
    { nome: "modelo", rotulo: "Modelo", tipo: "select", opcoes: modelos.map((m) => ({ value: m, label: m })), col: 4, visivel: (v) => v.alvo === "modelo", ajuda: "Depois use “Aplicar ao modelo” para criar o plano em cada veículo" },
    { nome: "servico", rotulo: "Serviço", obrigatorio: true, col: 6, placeholder: "Troca de óleo do motor" },
    { nome: "intervalo_km", rotulo: "A cada (km)", tipo: "numero", col: 2 },
    { nome: "intervalo_horas", rotulo: "A cada (horas)", tipo: "decimal", col: 2 },
    { nome: "intervalo_dias", rotulo: "A cada (dias)", tipo: "numero", col: 2 },
    { nome: "ultima_execucao_data", rotulo: "Última execução", tipo: "data", col: 2 },
    { nome: "ultima_execucao_km", rotulo: "Km na última", tipo: "numero", col: 2 },
    { nome: "ultima_execucao_horas", rotulo: "Horímetro na última", tipo: "decimal", col: 2 },
    { nome: "ativo", rotulo: "Ativo", tipo: "checkbox", col: 6 },
  ];
  return (
    <CrudSimples<LinhaPlano, PlanoForm>
      titulo="Planos preventivos" entidade="plano" tamanhoForm="lg" abrirNovo={abrirNovo}
      descricao="A próxima preventiva é a que vencer primeiro entre km, horas e dias. Em dia < 90% · Próxima ≥ 90% · Vencida ≥ 100%."
      linhas={linhas} colunas={colunas} campos={campos} schema={planoSchema as never} busca={false}
      filtros={<>
        <FiltroSelectUrl param="status" rotulo="Status" opcoes={[{ value: "vencida", label: "Vencidas" }, { value: "proxima", label: "Próximas" }, { value: "em_dia", label: "Em dia" }]} />
        <FiltroSelectUrl param="veiculo" rotulo="Veículo" opcoes={veiculos} />
      </>}
      novo={{ alvo: "veiculo", veiculo_id: null, modelo: null, servico: "", intervalo_km: null, intervalo_horas: null, intervalo_dias: null, ultima_execucao_data: hojeSP(), ultima_execucao_km: null, ultima_execucao_horas: null, ativo: true }}
      paraForm={(p) => ({ alvo: p.veiculo_id ? "veiculo" : "modelo", veiculo_id: p.veiculo_id, modelo: p.modelo, servico: p.servico, intervalo_km: p.intervalo_km, intervalo_horas: p.intervalo_horas,
        intervalo_dias: p.intervalo_dias, ultima_execucao_data: p.ultima_execucao_data, ultima_execucao_km: p.ultima_execucao_km, ultima_execucao_horas: p.ultima_execucao_horas, ativo: p.ativo })}
      salvar={salvarPlano} excluir={excluirPlano} podeEditar={podeEditar}
      acoesLinha={(p) => podeEditar ? (p.veiculo_id ? (
        (p.status === "vencida" || p.status === "proxima") && (
          <Button asChild size="xs" variant="outline"><Link href={`/manutencao/ordens?novo=1&veiculo=${p.veiculo_id}&plano=${p.id}`}><Wrench /> Abrir OS</Link></Button>
        )
      ) : (
        <Button size="xs" variant="outline" onClick={async () => {
          const r = await rodarAcao(aplicarPlanoModelo(p.id));
          if (r.ok) { router.refresh(); }
        }}><Copy /> Aplicar ao modelo</Button>
      )) : null}
      exportar={{ nome: "planos_preventivos", colunas: [
        { titulo: "Placa/modelo", valor: (p) => p.placa ?? `Modelo ${p.modelo}` }, { titulo: "Serviço", valor: (p) => p.servico, largura: 30 },
        { titulo: "Intervalo", valor: intervalo, largura: 24 }, { titulo: "Última", valor: (p) => p.ultima_execucao_data, tipo: "data" },
        { titulo: "Próx. km", valor: (p) => p.proxima_km, tipo: "numero" }, { titulo: "Próx. horas", valor: (p) => p.proxima_horas, tipo: "numero" },
        { titulo: "Próx. data", valor: (p) => p.proxima_data, tipo: "data" }, { titulo: "% consumido", valor: (p) => (p.pct != null ? Math.round(p.pct * 100) : null), tipo: "numero" },
        { titulo: "Status", valor: (p) => p.status },
      ] }}
    />
  );
}
