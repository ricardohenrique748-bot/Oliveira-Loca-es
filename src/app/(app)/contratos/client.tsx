"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarPlus, FileDown, LogOut } from "lucide-react";
import { CrudSimples } from "@/components/app/crud";
import { Confirmar, Moeda, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { Badge, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Opcao } from "@/components/ui/select";
import { contratoFormSchema, type ContratoForm } from "@/lib/schemas/operacao";
import { cobrancaAvulsa, type TipoCobranca } from "@/lib/calculos";
import { CLIENTE_NOVO } from "@/lib/schemas/cadastros";
import { formatBRL, formatData, formatPlaca, hojeSP } from "@/lib/format";
import { baixarContratoPDF } from "@/lib/documentos/baixar";
import { desmobilizarContrato, excluirContrato, renovarContrato, salvarContrato } from "./actions";
import type { OpcoesContrato } from "./dados";

export type LinhaContrato = {
  id: string; numero: string | null; empresa_id: string; cliente_id: string; obra_id: string | null; veiculo_id: string;
  tipo_cobranca: TipoCobranca; valor_mensal: number; valor_repasse_mensal: number | null; dia_corte_inicio: number; prazo_pagamento_dias: number;
  data_inicio: string; data_fim: string | null; data_desmobilizacao: string | null; status: "ativo" | "encerrado" | "suspenso"; observacoes: string | null; anexo_url: string | null;
  empresa: string; cliente: string; obra: string | null; placa: string; modelo: string | null; proprietario: "proprio" | "locador";
};

/** Campo "sublocado" só existe na tela (filtra os veículos); o schema o descarta ao salvar. */
export type ContratoFormTela = ContratoForm & { sublocado?: "sim" | "nao" };

export function camposContrato(opcoes: OpcoesContrato, empresas: Opcao[]): Campo<ContratoFormTela>[] {
  const locador = (v: ContratoFormTela) => v.sublocado === "sim" || opcoes.veiculos.find((x) => x.value === v.veiculo_id)?.proprietario === "locador";
  // diária / hora: só cliente, veículo, valor e data — o resto fica no padrão
  const diaria = (v: ContratoFormTela) => v.tipo_cobranca === "diaria";
  const hora = (v: ContratoFormTela) => v.tipo_cobranca === "hora";
  const avulsa = (v: ContratoFormTela) => cobrancaAvulsa(v.tipo_cobranca);
  const mensal = (v: ContratoFormTela) => !avulsa(v);
  const clienteNovo = (v: ContratoFormTela) => v.cliente_id === CLIENTE_NOVO;
  return [
    { nome: "anexo_url", rotulo: "Contrato do cliente (PDF)", tipo: "anexo", bucket: "anexos", pasta: "contratos", col: 6,
      ajuda: "Recebeu o contrato assinado pelo cliente? Anexe aqui: fica salvo no sistema para abrir quando precisar." },
    { nome: "tipo_cobranca", rotulo: "Tipo de cobrança", tipo: "select", col: 2, opcoes: [{ value: "mensal", label: "Mensal" }, { value: "diaria", label: "Diária" }, { value: "hora", label: "Por hora" }] },
    { nome: "empresa_id", rotulo: "Empresa emissora", tipo: "select", opcoes: empresas, obrigatorio: true, col: 2 },
    { nome: "numero", rotulo: "Nº do contrato", col: 2, visivel: mensal, placeholder: "Automático", ajuda: "Deixe vazio para gerar (ex.: OL-012/26)" },
    { nome: "status", rotulo: "Status", tipo: "select", visivel: mensal, opcoes: [{ value: "ativo", label: "Ativo" }, { value: "suspenso", label: "Suspenso" }, { value: "encerrado", label: "Encerrado" }], col: 2 },
    { nome: "cliente_id", rotulo: "Cliente", tipo: "select", opcoes: [{ value: CLIENTE_NOVO, label: "+ Cliente sem cadastro (digitar nome)" }, ...opcoes.clientes], obrigatorio: true, col: 3 },
    { nome: "cliente_novo", rotulo: "Nome do cliente", obrigatorio: true, col: 3, visivel: clienteNovo, placeholder: "Ex.: Construtora Alfa Ltda" },
    { nome: "cliente_novo_endereco", rotulo: "Endereço", col: 4, visivel: clienteNovo, placeholder: "Rua, número, bairro, cidade" },
    { nome: "cliente_novo_telefone", rotulo: "Telefone", tipo: "telefone", col: 2, visivel: clienteNovo,
      ajuda: "Ao salvar, o cliente é cadastrado com estes dados — complete o CNPJ depois em Clientes." },
    { nome: "obra_id", rotulo: "Obra", tipo: "select", visivel: (v) => mensal(v) && !clienteNovo(v), vazio: "—", opcoes: (v) => opcoes.obras.filter((o) => o.cliente_id === v.cliente_id), col: 3 },
    { nome: "sublocado", rotulo: "Sublocado?", tipo: "select", col: 2, opcoes: [{ value: "nao", label: "Não — frota própria (com motorista)" }, { value: "sim", label: "Sim — locador (sem motorista)" }] },
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", obrigatorio: true, col: 4, opcoes: (v) => opcoes.veiculos.filter((x) =>
      (!v.empresa_id || x.empresa_id === v.empresa_id) && (!v.sublocado || (x.proprietario === "locador") === (v.sublocado === "sim"))) },
    { nome: "valor_mensal", rotulo: "Valor mensal (cliente)", tipo: "moeda", obrigatorio: true, col: 3, visivel: mensal },
    { nome: "valor_mensal", rotulo: "Valor da diária (cliente)", tipo: "moeda", obrigatorio: true, col: 3, visivel: diaria, ajuda: "Diária = 10 horas (ex.: hora R$ 180 → diária R$ 1.800). Hora extra: hora + 10%" },
    { nome: "valor_mensal", rotulo: "Valor da hora (cliente)", tipo: "moeda", obrigatorio: true, col: 3, visivel: hora, ajuda: "Fatura = horas trabalhadas × valor da hora" },
    { nome: "valor_repasse_mensal", rotulo: "Repasse mensal (locador)", tipo: "moeda", col: 3, visivel: (v) => mensal(v) && locador(v), ajuda: "Valor fixo mensal pago ao dono do veículo" },
    { nome: "valor_repasse_mensal", rotulo: "Repasse por dia (locador)", tipo: "moeda", col: 3, visivel: (v) => diaria(v) && locador(v), ajuda: "Valor por dia pago ao dono do veículo" },
    { nome: "valor_repasse_mensal", rotulo: "Repasse por hora (locador)", tipo: "moeda", col: 3, visivel: (v) => hora(v) && locador(v), ajuda: "Valor por hora pago ao dono do veículo" },
    { nome: "dia_corte_inicio", rotulo: "Período de medição", tipo: "select", col: 2, visivel: mensal, opcoes: [{ value: "1", label: "Dia 01 ao fim do mês" }, { value: "21", label: "Dia 21 ao dia 20" }] },
    { nome: "prazo_pagamento_dias", rotulo: "Prazo de pagamento (dias)", tipo: "numero", col: 2, visivel: mensal },
    { nome: "data_inicio", rotulo: "Início (mobilização)", tipo: "data", obrigatorio: true, col: 2, visivel: mensal },
    { nome: "data_inicio", rotulo: "Data de início", tipo: "data", obrigatorio: true, col: 3, visivel: avulsa },
    { nome: "data_fim", rotulo: "Término previsto", tipo: "data", col: 2, visivel: mensal },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  ];
}

export function valoresContrato(c: LinhaContrato): ContratoFormTela {
  return {
    sublocado: c.proprietario === "locador" ? "sim" : "nao", tipo_cobranca: c.tipo_cobranca, empresa_id: c.empresa_id, cliente_id: c.cliente_id, cliente_novo: null, cliente_novo_endereco: null, cliente_novo_telefone: null, obra_id: c.obra_id, veiculo_id: c.veiculo_id, numero: c.numero,
    valor_mensal: c.valor_mensal, valor_repasse_mensal: c.valor_repasse_mensal, dia_corte_inicio: c.dia_corte_inicio as never,
    prazo_pagamento_dias: c.prazo_pagamento_dias, data_inicio: c.data_inicio, data_fim: c.data_fim, status: c.status, observacoes: c.observacoes, anexo_url: c.anexo_url,
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
          {cobrancaAvulsa(contrato.tipo_cobranca)
            ? <p>O contrato será encerrado e o veículo volta para <strong>disponível</strong>. As faturas já lançadas continuam no faturamento.</p>
            : <p>Será gerada a <strong>medição final proporcional</strong> até a data informada, o contrato será encerrado e o veículo volta para <strong>disponível</strong>.</p>}
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

/** dia seguinte (AAAA-MM-DD) */
function diaSeguinte(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Diária / hora vale um dia: para o cliente ficar mais um dia, renova — nova fatura do dia. */
export function DialogoRenovar({ contrato, aberto, onOpenChange }: { contrato: LinhaContrato | null; aberto: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const ultimo = contrato ? contrato.data_fim ?? contrato.data_inicio : hojeSP();
  const [data, setData] = React.useState(diaSeguinte(ultimo));
  React.useEffect(() => { if (aberto) setData(diaSeguinte(ultimo)); }, [aberto, ultimo]);
  return (
    <Confirmar aberto={aberto} onOpenChange={onOpenChange} titulo="Renovar contrato" rotulo="Renovar"
      descricao={contrato && (
        <div className="space-y-2">
          <p>Veículo <strong className="font-mono">{formatPlaca(contrato.placa)}</strong> — {contrato.cliente}. Último dia do contrato: <strong>{formatData(ultimo)}</strong>.</p>
          {contrato.tipo_cobranca === "hora"
            ? <p>Será lançada no faturamento a fatura do dia escolhido, a <strong>{formatBRL(contrato.valor_mensal)} por hora</strong>. As horas trabalhadas são digitadas na fatura.</p>
            : <p>Será lançada no faturamento <strong>1 diária de {formatBRL(contrato.valor_mensal)}</strong> para o dia escolhido.</p>}
        </div>
      )}
      onConfirmar={async () => {
        if (!contrato) return;
        const r = await rodarAcao(renovarContrato({ contrato_id: contrato.id, data }));
        if (r.ok) router.refresh();
      }}>
      <div className="space-y-1.5">
        <Label htmlFor="data-renovacao">Dia da renovação</Label>
        <Input id="data-renovacao" type="date" value={data} min={diaSeguinte(ultimo)} onChange={(e) => setData(e.target.value)} />
      </div>
    </Confirmar>
  );
}

export function ContratosCliente({ linhas, total, pagina, tamanho, opcoes, empresas, empresaPadrao, podeEditar, novo }: {
  linhas: LinhaContrato[]; total: number; pagina: number; tamanho: number; opcoes: OpcoesContrato; empresas: Opcao[];
  empresaPadrao: string | null; podeEditar: boolean; novo: boolean;
}) {
  const [desmob, setDesmob] = React.useState<LinhaContrato | null>(null);
  const [renovar, setRenovar] = React.useState<LinhaContrato | null>(null);

  const colunas = React.useMemo<ColumnDef<LinhaContrato, unknown>[]>(() => [
    { accessorKey: "placa", header: "Placa", meta: { tituloMobile: true }, cell: ({ row: { original: c } }) => (
      <div className="whitespace-nowrap"><span className="font-mono font-semibold tracking-wider">{formatPlaca(c.placa)}</span>
        {c.proprietario === "locador" && <Badge variant="info" className="ml-2">Sublocado</Badge>}
        <p className="text-xs text-muted-foreground">{[c.modelo, c.empresa].filter(Boolean).join(" · ")}</p></div>
    ) },
    { id: "cliente", header: "Cliente / obra", cell: ({ row: { original: c } }) => <div><p>{c.cliente}</p>{c.obra && <p className="text-xs text-muted-foreground">{c.obra}</p>}</div> },
    // repasse e margem só fazem sentido no sublocado (frota própria = 100%)
    { accessorKey: "valor_mensal", header: "Valor", meta: { direita: true, ordem: "valor_mensal" }, cell: ({ row: { original: c } }) => {
      const m = c.valor_mensal - (c.valor_repasse_mensal ?? 0);
      return (
        <div className="whitespace-nowrap">
          <Moeda valor={c.valor_mensal} />{c.tipo_cobranca !== "mensal" && <span className="text-xs text-muted-foreground">{c.tipo_cobranca === "hora" ? "/h" : "/dia"}</span>}
          {c.valor_repasse_mensal != null && (
            <p className="text-xs text-muted-foreground">repasse <Moeda valor={c.valor_repasse_mensal} /> · margem {Math.round((m / c.valor_mensal) * 100)}%</p>
          )}
        </div>
      );
    } },
    { accessorKey: "data_inicio", header: "Início", meta: { ordem: "data_inicio" }, cell: ({ row: { original: c } }) => (
      <div className="whitespace-nowrap">{formatData(c.data_inicio)}
        <p className="text-xs text-muted-foreground">
          {c.data_desmobilizacao ? `desmob. ${formatData(c.data_desmobilizacao)}` : c.tipo_cobranca === "diaria" ? "diária" : c.tipo_cobranca === "hora" ? "por hora" : c.dia_corte_inicio === 1 ? "medição 01 → fim" : "medição 21 → 20"}
        </p></div>
    ) },
    { accessorKey: "status", header: "Status", meta: { ordem: "status" }, cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  ], []);

  return (
    <>
      <CrudSimples<LinhaContrato, ContratoFormTela>
        titulo="Contratos" entidade="contrato" tamanhoForm="lg" abrirNovo={novo}
        descricao="Locação de cada placa para um cliente/obra. A margem prevista é o valor mensal menos o repasse ao locador."
        linhas={linhas} total={total} pagina={pagina} tamanho={tamanho} colunas={colunas}
        campos={camposContrato(opcoes, empresas)} schema={contratoFormSchema as never}
        busca="Buscar placa…" hrefLinha={(c) => `/contratos/${c.id}`}
        filtros={<>
          <FiltroSelectUrl param="status" rotulo="Status" vazio="Ativos" opcoes={[{ value: "suspenso", label: "Suspensos" }, { value: "encerrado", label: "Encerrados" }, { value: "todos", label: "Todos" }]} />
          <FiltroSelectUrl param="cliente" rotulo="Cliente" opcoes={opcoes.clientes} />
          <FiltroSelectUrl param="corte" rotulo="Período" opcoes={[{ value: "1", label: "01 → fim" }, { value: "21", label: "21 → 20" }]} />
        </>}
        novo={{ sublocado: "nao", tipo_cobranca: "mensal", empresa_id:empresaPadrao ?? empresas[0]?.value, cliente_id: undefined, cliente_novo: null, cliente_novo_endereco: null, cliente_novo_telefone: null, obra_id: null, veiculo_id: undefined, numero: null, valor_mensal: undefined, valor_repasse_mensal: null, dia_corte_inicio: "1" as never, prazo_pagamento_dias: 30, data_inicio: hojeSP(), data_fim: null, status: "ativo", observacoes: null, anexo_url: null }}
        paraForm={(c) => ({ ...valoresContrato(c), dia_corte_inicio: String(c.dia_corte_inicio) as never })}
        salvar={salvarContrato} excluir={excluirContrato} podeEditar={podeEditar}
        avisoExcluir={(c) => <>O contrato <strong className="font-mono">{c.numero ?? formatPlaca(c.placa)}</strong> ({c.cliente}) será apagado <strong>junto com todas as medições dele</strong>, inclusive recebimentos, boletos e repasses. Esta ação não pode ser desfeita. Se o contrato só terminou, use <strong>Desmobilizar</strong>.</>}
        acoesLinha={(c) => (
          <>
            <Button variant="ghost" size="icon-sm" onClick={() => baixarContratoPDF(c.id)} title="PDF do contrato" aria-label={`PDF do contrato ${c.numero ?? formatPlaca(c.placa)}`}><FileDown /></Button>
            {podeEditar && c.status === "ativo" && cobrancaAvulsa(c.tipo_cobranca) && (
              <Button variant="ghost" size="icon-sm" onClick={() => setRenovar(c)} title="Renovar (mais um dia)" aria-label={`Renovar ${formatPlaca(c.placa)}`}><CalendarPlus /></Button>
            )}
            {podeEditar && c.status === "ativo" && (
              <Button variant="ghost" size="icon-sm" onClick={() => setDesmob(c)} title="Desmobilizar" aria-label={`Desmobilizar ${formatPlaca(c.placa)}`}><LogOut /></Button>
            )}
          </>
        )}
        exportar={{ nome: "contratos", colunas: [
          { titulo: "Placa", valor: (c) => c.placa }, { titulo: "Contrato", valor: (c) => c.numero }, { titulo: "Empresa", valor: (c) => c.empresa },
          { titulo: "Cliente", valor: (c) => c.cliente, largura: 24 }, { titulo: "Obra", valor: (c) => c.obra, largura: 24 },
          { titulo: "Cobrança", valor: (c) => ({ mensal: "Mensal", diaria: "Diária", hora: "Por hora" })[c.tipo_cobranca] }, { titulo: "Valor (mensal, diária ou hora)", valor: (c) => c.valor_mensal, tipo: "moeda" }, { titulo: "Repasse", valor: (c) => c.valor_repasse_mensal, tipo: "moeda" },
          { titulo: "Margem prevista", valor: (c) => c.valor_mensal - (c.valor_repasse_mensal ?? 0), tipo: "moeda" },
          { titulo: "Corte", valor: (c) => c.dia_corte_inicio }, { titulo: "Prazo (dias)", valor: (c) => c.prazo_pagamento_dias },
          { titulo: "Início", valor: (c) => c.data_inicio, tipo: "data" }, { titulo: "Desmobilização", valor: (c) => c.data_desmobilizacao, tipo: "data" },
          { titulo: "Status", valor: (c) => c.status },
        ] }}
      />
      <DialogoDesmobilizar contrato={desmob} aberto={!!desmob} onOpenChange={(v) => !v && setDesmob(null)} />
      <DialogoRenovar contrato={renovar} aberto={!!renovar} onOpenChange={(v) => !v && setRenovar(null)} />
      <p className="mt-3 text-xs text-muted-foreground">Dica: as medições são geradas em <Link className="underline" href="/medicoes">Faturamento → Gerar medições do período</Link>.</p>
    </>
  );
}
