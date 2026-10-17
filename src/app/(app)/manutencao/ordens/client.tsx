"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Columns3, List, Plus, Wrench } from "lucide-react";
import { Badge, Card } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import type { Opcao } from "@/components/ui/select";
import { Cabecalho, Moeda, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { DataTable } from "@/components/app/data-table";
import { FormularioDialog, type Campo } from "@/components/app/formulario";
import { BarraFiltros, FiltroSelectUrl, useUrlParams } from "@/components/app/url";
import { abrirOSSchema, type AbrirOSForm } from "@/lib/schemas/manutencao";
import { opcoesDe, ROTULOS } from "@/lib/schemas/cadastros";
import { diffDias, hojeSP } from "@/lib/calculos";
import { formatData, formatHoras, formatPlaca } from "@/lib/format";
import { cn } from "@/lib/utils";
import { abrirOS, mudarStatusOS } from "../actions";

export type LinhaOS = {
  id: string; numero: number; veiculo_id: string; empresa_id: string; tipo: keyof typeof ROTULOS.tipoOS; plano_id: string | null; data_abertura: string;
  data_fechamento: string | null; km: number | null; horimetro: number | null; fornecedor_id: string | null; descricao_problema: string; diagnostico: string | null;
  custo_total: number; horas_parado: number; descontar_locador: boolean; parar_veiculo: boolean; status: string; placa: string; modelo: string | null; fornecedor: string | null;
};
type OpVeiculo = Opcao & { locador: boolean; km: number; horas: number };
type OpPlano = Opcao & { veiculo_id: string };

const COLUNAS_KANBAN = [
  { status: "aberta", titulo: "Abertas" },
  { status: "em_execucao", titulo: "Em execução" },
  { status: "aguardando_peca", titulo: "Aguardando peça" },
  { status: "fechada", titulo: "Fechadas (15 dias)" },
] as const;

export function OrdensCliente({ linhas, veiculos, fornecedores, planos, podeEditar, abrirNovo, veiculoInicial, planoInicial }: {
  linhas: LinhaOS[]; veiculos: OpVeiculo[]; fornecedores: Opcao[]; planos: OpPlano[]; podeEditar: boolean;
  abrirNovo: boolean; veiculoInicial: string | null; planoInicial: string | null;
}) {
  const router = useRouter();
  const url = useUrlParams();
  const visao = url.get("visao") ?? "kanban";
  const [novo, setNovo] = React.useState(abrirNovo);
  const [arrastando, setArrastando] = React.useState<string | null>(null);

  const campos: Campo<AbrirOSForm>[] = [
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", opcoes: veiculos, obrigatorio: true, col: 3 },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: opcoesDe(ROTULOS.tipoOS), col: 3 },
    { nome: "plano_id", rotulo: "Plano preventivo", tipo: "select", vazio: "—", opcoes: (v) => planos.filter((p) => p.veiculo_id === v.veiculo_id), col: 6, visivel: (v) => v.tipo === "preventiva", ajuda: "Ao fechar a OS, a última execução do plano é atualizada" },
    { nome: "data_abertura", rotulo: "Abertura", tipo: "data", col: 2 },
    { nome: "km", rotulo: "Km", tipo: "numero", col: 2, placeholder: "atual do veículo" },
    { nome: "horimetro", rotulo: "Horímetro", tipo: "decimal", col: 2 },
    { nome: "fornecedor_id", rotulo: "Fornecedor / oficina", tipo: "select", vazio: "Oficina própria", opcoes: fornecedores, col: 6 },
    { nome: "descricao_problema", rotulo: "Problema / serviço solicitado", tipo: "textarea", obrigatorio: true, col: 6 },
    { nome: "parar_veiculo", rotulo: "Veículo fica parado (status → manutenção)", tipo: "checkbox", col: 3, ajuda: "Desmarque para serviço rápido" },
    { nome: "descontar_locador", rotulo: "Descontar custo do locador", tipo: "checkbox", col: 3, visivel: (v) => !!veiculos.find((x) => x.value === v.veiculo_id)?.locador },
  ];

  const colunas: ColumnDef<LinhaOS, unknown>[] = [
    { accessorKey: "numero", header: "OS", meta: { tituloMobile: true }, cell: ({ row: { original: o } }) => <span className="font-semibold">#{o.numero} <span className="font-mono">{formatPlaca(o.placa)}</span></span> },
    { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => ROTULOS.tipoOS[row.original.tipo] },
    { accessorKey: "data_abertura", header: "Abertura", cell: ({ getValue }) => formatData(getValue() as string) },
    { accessorKey: "descricao_problema", header: "Problema", meta: { classe: "max-w-sm" }, cell: ({ getValue }) => <span className="line-clamp-2">{getValue() as string}</span> },
    { accessorKey: "fornecedor", header: "Fornecedor" },
    { accessorKey: "horas_parado", header: "Parado", meta: { direita: true }, cell: ({ getValue }) => formatHoras(getValue() as number) },
    { accessorKey: "custo_total", header: "Custo", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
    { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  ];

  const mover = async (id: string, status: string) => {
    const os = linhas.find((l) => l.id === id);
    if (!os || os.status === status) return;
    if (status === "fechada") return router.push(`/manutencao/ordens/${id}?fechar=1`);
    const r = await rodarAcao(mudarStatusOS(id, status as "aberta"));
    if (r.ok) router.refresh();
  };

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Ordens de serviço" descricao="Abrir OS coloca o veículo em manutenção; fechar gera a conta a pagar, atualiza o plano preventivo e o km/horímetro."
        acoes={podeEditar && <Button onClick={() => setNovo(true)}><Plus /> Abrir OS</Button>} />
      <BarraFiltros>
        <FiltroSelectUrl param="tipo" rotulo="Tipo" opcoes={opcoesDe(ROTULOS.tipoOS)} />
        <FiltroSelectUrl param="veiculo" rotulo="Veículo" opcoes={veiculos} />
        {visao === "lista" && <FiltroSelectUrl param="status" rotulo="Status" opcoes={[...COLUNAS_KANBAN.map((c) => ({ value: c.status, label: c.titulo.replace(" (15 dias)", "") })), { value: "cancelada", label: "Canceladas" }]} />}
        <div className="ml-auto flex gap-1">
          <Button variant={visao === "kanban" ? "dark" : "outline"} size="sm" onClick={() => url.set({ visao: null, status: null })}><Columns3 /> Kanban</Button>
          <Button variant={visao === "lista" ? "dark" : "outline"} size="sm" onClick={() => url.set({ visao: "lista" })}><List /> Lista</Button>
        </div>
      </BarraFiltros>

      {visao === "kanban" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUNAS_KANBAN.map((col) => {
            const itens = linhas.filter((l) => l.status === col.status);
            return (
              <section key={col.status} aria-label={col.titulo}
                className={cn("flex min-h-[12rem] flex-col gap-2 rounded-lg bg-muted/60 p-2", arrastando && "outline-dashed outline-2 outline-border")}
                onDragOver={(e) => podeEditar && e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); setArrastando(null); if (id) mover(id, col.status); }}>
                <h2 className="flex items-center justify-between px-1 font-display text-base font-semibold tracking-tight">{col.titulo}<Badge variant="secondary">{itens.length}</Badge></h2>
                {itens.map((o) => {
                  const dias = diffDias(o.data_abertura, hojeSP());
                  return (
                    <Card key={o.id} draggable={podeEditar && o.status !== "fechada"}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); setArrastando(o.id); }} onDragEnd={() => setArrastando(null)}
                      className={cn("cursor-pointer space-y-1.5 p-3 text-sm hover:border-primary", o.status !== "fechada" && dias > 3 && "border-l-4 border-l-status-alerta")}
                      onClick={() => router.push(`/manutencao/ordens/${o.id}`)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">#{o.numero} <span className="font-mono">{formatPlaca(o.placa)}</span></span>
                        <Badge variant={o.tipo === "preventiva" ? "ok" : o.tipo === "corretiva" ? "critico" : "info"}>{ROTULOS.tipoOS[o.tipo]}</Badge>
                      </div>
                      <p className="line-clamp-2 text-muted-foreground">{o.descricao_problema}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{o.fornecedor ?? "Oficina própria"}</span>
                        <span>{o.status === "fechada" ? <Moeda valor={o.custo_total} /> : `${dias} d`}</span>
                      </div>
                      {podeEditar && o.status !== "fechada" && (
                        <div className="flex flex-wrap gap-1 pt-1 md:hidden" onClick={(e) => e.stopPropagation()}>
                          {COLUNAS_KANBAN.filter((c) => c.status !== o.status).map((c) => (
                            <Button key={c.status} size="xs" variant="outline" onClick={() => mover(o.id, c.status)}>→ {c.titulo.replace(" (15 dias)", "")}</Button>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
                {itens.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground"><Wrench className="mx-auto mb-1 h-5 w-5" />Vazio</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <DataTable colunas={colunas} dados={linhas} getId={(o) => o.id} aoClicarLinha={(o) => router.push(`/manutencao/ordens/${o.id}`)}
          exportar={{ nome: "ordens_servico", colunas: [
            { titulo: "OS", valor: (o) => o.numero, tipo: "numero" }, { titulo: "Placa", valor: (o) => o.placa }, { titulo: "Tipo", valor: (o) => ROTULOS.tipoOS[o.tipo] },
            { titulo: "Abertura", valor: (o) => o.data_abertura, tipo: "data" }, { titulo: "Fechamento", valor: (o) => o.data_fechamento, tipo: "data" },
            { titulo: "Problema", valor: (o) => o.descricao_problema, largura: 40 }, { titulo: "Fornecedor", valor: (o) => o.fornecedor, largura: 24 },
            { titulo: "Horas parado", valor: (o) => o.horas_parado, tipo: "numero" }, { titulo: "Custo", valor: (o) => o.custo_total, tipo: "moeda" }, { titulo: "Status", valor: (o) => o.status },
          ] }} />
      )}

      <FormularioDialog<AbrirOSForm> aberto={novo} onOpenChange={setNovo} titulo="Abrir ordem de serviço" tamanho="lg"
        campos={campos} schema={abrirOSSchema as never}
        valores={{ veiculo_id: veiculoInicial ?? undefined, tipo: planoInicial ? "preventiva" : "corretiva", plano_id: planoInicial, data_abertura: hojeSP(), km: null, horimetro: null,
          fornecedor_id: null, descricao_problema: "", descontar_locador: false, parar_veiculo: true }}
        onSalvar={async (v) => {
          const r = await abrirOS(v);
          if (r.ok) router.push(`/manutencao/ordens/${r.dados.id}`);
          return r.ok ? { ok: true, mensagem: `OS #${r.dados.numero} aberta` } : r;
        }} />
      <p className="text-xs text-muted-foreground">Arraste os cartões entre colunas para mudar o status. Soltar em “Fechadas” abre o fechamento da OS. <Link className="underline" href="/manutencao">Painel da frota</Link></p>
    </div>
  );
}
