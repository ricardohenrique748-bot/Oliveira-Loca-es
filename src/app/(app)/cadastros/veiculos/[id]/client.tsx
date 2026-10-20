"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart3, ClipboardList, FileBadge, FileText, Gauge, TriangleAlert, Truck, Wrench } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import type { Opcao } from "@/components/ui/select";
import { Cabecalho, Moeda, Progresso, StatusBadge } from "@/components/app/comuns";
import { KpiCard } from "@/components/app/kpi";
import { DataTable } from "@/components/app/data-table";
import { Formulario } from "@/components/app/formulario";
import { CampoAnexo, LinkAnexo } from "@/components/app/anexo";
import { ROTULOS, veiculoSchema, type VeiculoForm } from "@/lib/schemas/cadastros";
import { formatCompetencia, formatData, formatHoras, formatKm, formatPct, formatPeriodo, formatPlaca } from "@/lib/format";
import { ValidadeBadge } from "@/components/app/validade";
import { salvarVeiculo } from "../../actions";
import { camposVeiculo } from "../campos";
import { atualizarFotoVeiculo } from "./actions";

type Veiculo = {
  id: string; placa: string; renavam: string | null; tipo: VeiculoForm["tipo"]; marca: string | null; modelo: string | null; ano: number | null; proprietario: VeiculoForm["proprietario"];
  locador_id: string | null; locador: string | null; empresa_id: string; empresa: string; km_atual: number; horimetro_atual: number;
  status: VeiculoForm["status"]; foto_url: string | null; observacoes: string | null;
};
type Contrato = { id: string; numero: string | null; status: string; valor_mensal: number; valor_repasse_mensal: number | null; data_inicio: string; data_desmobilizacao: string | null; cliente: string; obra: string | null };
type Medicao = { id: string; periodo_inicio: string; periodo_fim: string; dias: number; valor_final: number; numero_nf: string | null; status_exibicao: string; cliente_fantasia: string; repasse_liquido: number | null; margem: number };
type OS = { id: string; numero: number; tipo: keyof typeof ROTULOS.tipoOS; status: string; data_abertura: string; data_fechamento: string | null; descricao_problema: string; custo_total: number; horas_parado: number; fornecedor: string | null };
type Doc = { id: string; tipo: keyof typeof ROTULOS.tipoDocumento; numero: string | null; validade: string | null; anexo_url: string | null };
type Leitura = { id: string; data: string; km: number | null; horimetro: number | null; origem: string };
type Plano = { plano_id: string; servico: string; status: string; pct: number; criterio: string | null; proxima_km: number | null; proxima_horas: number | null; proxima_data: string | null; restante: number | null };
type Resultado = { mes: string; receita: number; repasse: number; manutencao: number; outras_despesas: number; margem: number; margem_pct: number | null };

const colContratos: ColumnDef<Contrato, unknown>[] = [
  { accessorKey: "cliente", header: "Cliente", meta: { tituloMobile: true } },
  { accessorKey: "obra", header: "Obra" },
  { accessorKey: "numero", header: "Contrato" },
  { accessorKey: "valor_mensal", header: "Mensal", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "valor_repasse_mensal", header: "Repasse", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number | null} /> },
  { id: "periodo", header: "Vigência", cell: ({ row }) => `${formatData(row.original.data_inicio)} → ${row.original.data_desmobilizacao ? formatData(row.original.data_desmobilizacao) : "atual"}` },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
];
const colMedicoes: ColumnDef<Medicao, unknown>[] = [
  { id: "periodo", header: "Período", meta: { tituloMobile: true }, cell: ({ row }) => formatPeriodo(row.original.periodo_inicio, row.original.periodo_fim) },
  { accessorKey: "cliente_fantasia", header: "Cliente" },
  { accessorKey: "dias", header: "Dias", meta: { direita: true } },
  { accessorKey: "numero_nf", header: "NF" },
  { accessorKey: "valor_final", header: "Valor", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "repasse_liquido", header: "Repasse", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number | null} /> },
  { accessorKey: "margem", header: "Margem", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} sinal /> },
  { accessorKey: "status_exibicao", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
];
const colOS: ColumnDef<OS, unknown>[] = [
  { accessorKey: "numero", header: "OS", meta: { tituloMobile: true }, cell: ({ getValue }) => <span className="font-semibold">#{getValue() as number}</span> },
  { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => ROTULOS.tipoOS[row.original.tipo] },
  { accessorKey: "data_abertura", header: "Abertura", cell: ({ getValue }) => formatData(getValue() as string) },
  { accessorKey: "descricao_problema", header: "Problema", meta: { classe: "max-w-xs truncate" } },
  { accessorKey: "fornecedor", header: "Fornecedor" },
  { accessorKey: "horas_parado", header: "Parado", meta: { direita: true }, cell: ({ getValue }) => formatHoras(getValue() as number) },
  { accessorKey: "custo_total", header: "Custo", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
];
const colDocs: ColumnDef<Doc, unknown>[] = [
  { accessorKey: "tipo", header: "Documento", meta: { tituloMobile: true }, cell: ({ row }) => ROTULOS.tipoDocumento[row.original.tipo] },
  { accessorKey: "numero", header: "Número" },
  { accessorKey: "validade", header: "Validade", cell: ({ getValue }) => <ValidadeBadge validade={getValue() as string | null} /> },
  { accessorKey: "anexo_url", header: "Anexo", cell: ({ getValue }) => <LinkAnexo referencia={getValue() as string | null} rotulo="Abrir" /> },
];
type Multa = {
  id: string; data_infracao: string; descricao: string | null; auto_infracao: string | null; valor: number; vencimento: string | null;
  status: string; status_exibicao: string; cliente_nome: string | null; pago_em: string | null;
};
const colMultas: ColumnDef<Multa, unknown>[] = [
  { accessorKey: "data_infracao", header: "Infração", meta: { tituloMobile: true }, cell: ({ getValue }) => formatData(getValue() as string) },
  { accessorKey: "descricao", header: "Descrição", cell: ({ row: { original: m } }) => <span>{m.descricao ?? "—"}{m.auto_infracao && <span className="text-xs text-muted-foreground"> · AIT {m.auto_infracao}</span>}</span> },
  { accessorKey: "cliente_nome", header: "Cliente na data", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "valor", header: "Valor", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "vencimento", header: "Vencimento", cell: ({ row: { original: m } }) =>
    m.status === "pendente" ? <ValidadeBadge validade={m.vencimento} /> : m.status === "paga" ? `Paga em ${formatData(m.pago_em)}` : formatData(m.vencimento) },
  { accessorKey: "status_exibicao", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
];
const colLeituras: ColumnDef<Leitura, unknown>[] = [
  { accessorKey: "data", header: "Data", meta: { tituloMobile: true }, cell: ({ getValue }) => formatData(getValue() as string) },
  { accessorKey: "km", header: "Km", meta: { direita: true }, cell: ({ getValue }) => formatKm(getValue() as number | null) },
  { accessorKey: "horimetro", header: "Horímetro", meta: { direita: true }, cell: ({ getValue }) => formatHoras(getValue() as number | null) },
  { accessorKey: "origem", header: "Origem", cell: ({ getValue }) => <Badge variant="outline">{getValue() as string}</Badge> },
];
const colResultado: ColumnDef<Resultado, unknown>[] = [
  { accessorKey: "mes", header: "Mês", meta: { tituloMobile: true }, cell: ({ getValue }) => formatCompetencia(getValue() as string) },
  { accessorKey: "receita", header: "Receita", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "repasse", header: "Repasse", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "manutencao", header: "Manutenção", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "outras_despesas", header: "Outras despesas", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
  { accessorKey: "margem", header: "Margem", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} sinal className="font-semibold" /> },
  { accessorKey: "margem_pct", header: "%", meta: { direita: true }, cell: ({ getValue }) => formatPct(getValue() as number | null) },
];

export function FichaVeiculo({ veiculo: v, empresas, locadores, contratos, medicoes, ordens, documentos, multas, leituras, planos, resultado, permissoes }: {
  veiculo: Veiculo; empresas: Opcao[]; locadores: Opcao[]; contratos: Contrato[]; medicoes: Medicao[]; ordens: OS[]; documentos: Doc[]; multas: Multa[];
  leituras: Leitura[]; planos: Plano[]; resultado: Resultado[];
  permissoes: { editar: boolean; contratos: boolean; medicoes: boolean; resultado: boolean };
}) {
  const router = useRouter();
  const total = resultado.reduce((a, r) => ({ receita: a.receita + r.receita, margem: a.margem + r.margem, custo: a.custo + r.manutencao + r.outras_despesas }), { receita: 0, margem: 0, custo: 0 });
  const campos = camposVeiculo(empresas, locadores).map((c) => ({ ...c, desabilitado: !permissoes.editar }));

  return (
    <div>
      <Cabecalho voltar={{ href: "/cadastros/veiculos", rotulo: "Veículos" }}
        titulo={formatPlaca(v.placa)}
        descricao={<span>{ROTULOS.tipoVeiculo[v.tipo]} · {[v.marca, v.modelo, v.ano].filter(Boolean).join(" ")} · {v.empresa}
          {v.proprietario === "locador" && <> · <Badge variant="info">Locador: {v.locador}</Badge></>}</span>}
        acoes={<>
          <StatusBadge status={v.status} className="text-sm" />
          <Button asChild variant="outline" size="sm"><Link href={`/manutencao/ordens?novo=1&veiculo=${v.id}`}><Wrench /> Abrir OS</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/manutencao/leituras?placa=${v.placa}`}><Gauge /> Leitura</Link></Button>
        </>} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard titulo="Km atual" valor={formatKm(v.km_atual)} />
        <KpiCard titulo="Horímetro" valor={formatHoras(v.horimetro_atual)} />
        {permissoes.resultado && <KpiCard titulo="Receita (24 meses)" valor={<Moeda valor={total.receita} />} />}
        {permissoes.resultado && <KpiCard titulo="Margem (24 meses)" valor={<Moeda valor={total.margem} sinal />} sub={total.receita ? formatPct((total.margem / total.receita) * 100) : undefined} />}
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados"><Truck /> Dados</TabsTrigger>
          {permissoes.contratos && <TabsTrigger value="contratos"><FileText /> Contratos ({contratos.length})</TabsTrigger>}
          {permissoes.medicoes && <TabsTrigger value="medicoes"><ClipboardList /> Medições</TabsTrigger>}
          <TabsTrigger value="os"><Wrench /> OS ({ordens.length})</TabsTrigger>
          <TabsTrigger value="documentos"><FileBadge /> Documentos ({documentos.length})</TabsTrigger>
          <TabsTrigger value="multas"><TriangleAlert /> Multas ({multas.filter((m) => m.status === "pendente").length})</TabsTrigger>
          <TabsTrigger value="leituras"><Gauge /> Leituras</TabsTrigger>
          {permissoes.resultado && <TabsTrigger value="resultado"><BarChart3 /> Resultado</TabsTrigger>}
        </TabsList>

        <TabsContent value="dados" className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2"><CardContent className="pt-5">
            <Formulario<VeiculoForm> campos={campos} schema={veiculoSchema as never}
              valores={{ placa: v.placa, renavam: v.renavam, tipo: v.tipo, marca: v.marca, modelo: v.modelo, ano: v.ano, proprietario: v.proprietario, locador_id: v.locador_id, empresa_id: v.empresa_id, km_atual: v.km_atual, horimetro_atual: v.horimetro_atual, status: v.status, foto_url: v.foto_url, observacoes: v.observacoes }}
              onSalvar={(d) => salvarVeiculo(v.id, d)} onSucesso={() => router.refresh()} />
          </CardContent></Card>
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Foto</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {v.foto_url ? <LinkAnexo referencia={v.foto_url} rotulo="Ver foto" /> : <p className="text-sm text-muted-foreground">Sem foto.</p>}
                {permissoes.editar && (
                  <CampoAnexo bucket="fotos" pasta={`veiculos/${v.placa}`} valor={null} aceitar="image/*" rotulo={v.foto_url ? "Trocar foto" : "Enviar foto"}
                    onChange={async (ref) => { if (ref) { await atualizarFotoVeiculo(v.id, ref); router.refresh(); } }} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Preventivas</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {planos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum plano. <Link className="underline" href="/manutencao/planos">Cadastrar</Link></p>}
                {planos.map((p) => (
                  <div key={p.plano_id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{p.servico}</span><StatusBadge status={p.status} /></div>
                    <Progresso pct={Number(p.pct)} />
                    <p className="text-xs text-muted-foreground">
                      {p.proxima_km != null && `Próx.: ${formatKm(p.proxima_km)} `}{p.proxima_horas != null && `Próx.: ${formatHoras(p.proxima_horas)} `}{p.proxima_data && `até ${formatData(p.proxima_data)}`}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {permissoes.contratos && (
          <TabsContent value="contratos">
            <DataTable colunas={colContratos} dados={contratos} getId={(c) => c.id} aoClicarLinha={(c) => router.push(`/contratos/${c.id}`)} />
          </TabsContent>
        )}
        {permissoes.medicoes && (
          <TabsContent value="medicoes">
            <DataTable colunas={colMedicoes} dados={medicoes} getId={(m) => m.id} aoClicarLinha={() => router.push(`/medicoes?placa=${v.placa}`)} />
          </TabsContent>
        )}
        <TabsContent value="os">
          <DataTable colunas={colOS} dados={ordens} getId={(o) => o.id} aoClicarLinha={(o) => router.push(`/manutencao/ordens/${o.id}`)} />
        </TabsContent>
        <TabsContent value="documentos">
          <DataTable colunas={colDocs} dados={documentos} getId={(d) => d.id} topo={<Button asChild size="sm" variant="outline"><Link href={`/manutencao/documentos?veiculo=${v.id}`}>Gerenciar documentos</Link></Button>} />
        </TabsContent>
        <TabsContent value="multas">
          <DataTable colunas={colMultas} dados={multas} getId={(m) => m.id} topo={<Button asChild size="sm" variant="outline"><Link href={`/manutencao/multas?veiculo=${v.id}`}>Gerenciar multas</Link></Button>} />
        </TabsContent>
        <TabsContent value="leituras">
          <DataTable colunas={colLeituras} dados={leituras} getId={(l) => l.id} />
        </TabsContent>
        {permissoes.resultado && (
          <TabsContent value="resultado">
            <DataTable colunas={colResultado} dados={resultado} getId={(r) => r.mes}
              exportar={{ nome: `resultado_${v.placa}`, titulo: `Resultado financeiro — ${v.placa}`, colunas: [
                { titulo: "Mês", valor: (r) => formatCompetencia(r.mes) }, { titulo: "Receita", valor: (r) => r.receita, tipo: "moeda" },
                { titulo: "Repasse", valor: (r) => r.repasse, tipo: "moeda" }, { titulo: "Manutenção", valor: (r) => r.manutencao, tipo: "moeda" },
                { titulo: "Outras", valor: (r) => r.outras_despesas, tipo: "moeda" }, { titulo: "Margem", valor: (r) => r.margem, tipo: "moeda" },
                { titulo: "Margem %", valor: (r) => r.margem_pct, tipo: "numero" },
              ] }} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
