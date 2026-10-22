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
import { CLIENTE_NOVO, MODALIDADE_PROPOSTA, MODELO_PROPOSTA, propostaFormSchema, STATUS_PROPOSTA, type ModalidadeProposta, type ModeloProposta, type PropostaForm, type StatusProposta } from "@/lib/schemas/comercial";
import { formatBRL, formatData, formatPlaca, hojeSP } from "@/lib/format";
import { baixarPropostaPDF } from "@/lib/documentos/baixar";
import { JORNADA_PADRAO } from "@/lib/documentos/proposta";
import type { OpcoesContrato } from "../../contratos/dados";
import { excluirProposta, gerarContratoDaProposta, salvarProposta } from "./actions";

export type LinhaProposta = {
  id: string; numero: string | null; empresa_id: string; cliente_id: string; obra_id: string | null; veiculo_id: string | null;
  equipamento: string | null; modalidade: ModalidadeProposta; tipo_cobranca: "mensal" | "diaria"; valor: number; dia_corte_inicio: number; prazo_pagamento_dias: number;
  data_inicio_prevista: string | null; periodo_minimo: string | null; validade: string | null; condicoes: string | null; observacoes: string | null;
  modelo_documento: ModeloProposta; contato_cliente: string | null; local_operacao: string | null; quantidade: number; franquia: string | null; km_livre: string | null;
  jornada: string | null; valor_mobilizacao: number | null; valor_desmobilizacao: number | null; multa_rescisao_pct: number;
  status: StatusProposta; motivo_recusa: string | null; contrato_id: string | null; created_at: string;
  empresa: string; empresa_razao: string; empresa_cnpj: string | null;
  cliente: string; cliente_razao: string; cliente_cnpj: string | null; obra: string | null; placa: string | null; modelo: string | null;
};

const ROTULO_STATUS_VEICULO: Record<string, string> = { locado: "locado", manutencao: "em manutenção", parado: "parado" };

/** "Placa · modelo" ou a descrição livre do equipamento. */
const descricaoItem = (r: LinhaProposta) =>
  [r.placa ? `${formatPlaca(r.placa)}${r.modelo ? ` · ${r.modelo}` : ""}` : null, r.equipamento].filter(Boolean).join(" — ");

/** gerar o contrato já vale como aceite (sem passar por "aprovada") */
const PODE_VIRAR_CONTRATO: StatusProposta[] = ["rascunho", "enviada", "aprovada"];

const vencida = (r: LinhaProposta) => !!r.validade && r.validade < hojeSP() && (r.status === "rascunho" || r.status === "enviada");

function camposProposta(opcoes: OpcoesContrato, empresas: Opcao[]): Campo<PropostaForm>[] {
  const diaria = (v: PropostaForm) => v.tipo_cobranca === "diaria";
  // todos os veículos: ao escolher um, empresa, modalidade e modelo do PDF seguem o cadastro dele (ajustesProposta)
  const veiculos = opcoes.veiculos.map((x) => ({ ...x, label: x.label + (ROTULO_STATUS_VEICULO[x.status] ? ` — ${ROTULO_STATUS_VEICULO[x.status]}` : "") }));
  const guindaste = (v: PropostaForm) => v.modelo_documento !== "caminhao";
  const clienteNovo = (v: PropostaForm) => v.cliente_id === CLIENTE_NOVO;
  return [
    // essencial
    { nome: "cliente_id", rotulo: "Cliente", tipo: "select", opcoes: [{ value: CLIENTE_NOVO, label: "+ Cliente sem cadastro (digitar nome)" }, ...opcoes.clientes], obrigatorio: true, col: 4 },
    { nome: "data_inicio_prevista", rotulo: "Início previsto", tipo: "data", col: 2 },
    { nome: "cliente_novo", rotulo: "Nome do cliente", obrigatorio: true, col: 6, visivel: clienteNovo, placeholder: "Ex.: Construtora Alfa Ltda" },
    { nome: "cliente_novo_endereco", rotulo: "Endereço", col: 4, visivel: clienteNovo, placeholder: "Rua, número, bairro, cidade" },
    { nome: "cliente_novo_telefone", rotulo: "Telefone", tipo: "telefone", col: 2, visivel: clienteNovo,
      ajuda: "Ao salvar, o cliente é cadastrado com estes dados — complete o CNPJ depois em Clientes." },
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", vazio: "— definir depois", opcoes: veiculos, col: 6 },
    { nome: "equipamento", rotulo: "Equipamento", col: 6, placeholder: "Sem veículo definido? Descreva: Ex.: Guindaste 40t", visivel: (v) => !v.veiculo_id },
    { nome: "tipo_cobranca", rotulo: "Cobrança", tipo: "select", col: 3, opcoes: [{ value: "mensal", label: "Mensal" }, { value: "diaria", label: "Diária" }] },
    { nome: "valor", rotulo: "Valor mensal", tipo: "moeda", obrigatorio: true, col: 3, visivel: (v) => !diaria(v) },
    { nome: "valor", rotulo: "Valor da diária", tipo: "moeda", obrigatorio: true, col: 3, visivel: diaria },

    // mais opções
    { nome: "obra_id", rotulo: "Obra", tipo: "select", vazio: "—", opcoes: (v) => opcoes.obras.filter((o) => o.cliente_id === v.cliente_id), col: 3, visivel: (v) => !clienteNovo(v), avancado: true },
    { nome: "status", rotulo: "Situação", tipo: "select", col: 3, avancado: true, opcoes: (["rascunho", "enviada", "aprovada", "recusada"] as const).map((s) => ({ value: s, label: STATUS_PROPOSTA[s] })) },
    { nome: "motivo_recusa", rotulo: "Motivo da recusa", col: 6, visivel: (v) => v.status === "recusada", placeholder: "Preço, prazo, fechou com concorrente…", avancado: true },
    { nome: "dia_corte_inicio", rotulo: "Período de medição", tipo: "select", col: 2, visivel: (v) => !diaria(v), avancado: true, opcoes: [{ value: "1", label: "Dia 01 ao fim do mês" }, { value: "21", label: "Dia 21 ao dia 20" }] },
    { nome: "prazo_pagamento_dias", rotulo: "Pagamento (dias)", tipo: "numero", col: 2, avancado: true },
    { nome: "validade", rotulo: "Validade da proposta", tipo: "data", col: 2, avancado: true },
    { nome: "modalidade", rotulo: "Modalidade", tipo: "select", col: 2, avancado: true, desabilitado: (v) => !!v.veiculo_id, ajuda: "Segue o veículo",
      opcoes: [{ value: "com_motorista", label: "Com motorista" }, { value: "sem_motorista", label: "Sem motorista" }] },
    { nome: "modelo_documento", rotulo: "Modelo do PDF", tipo: "select", col: 2, avancado: true,
      opcoes: (Object.keys(MODELO_PROPOSTA) as ModeloProposta[]).map((m) => ({ value: m, label: MODELO_PROPOSTA[m] })) },
    { nome: "empresa_id", rotulo: "Empresa emissora", tipo: "select", opcoes: empresas, obrigatorio: true, col: 2, avancado: true },
    { nome: "contato_cliente", rotulo: "A/C (contato no cliente)", col: 3, placeholder: "Ex.: Otávio — compras", avancado: true },
    { nome: "local_operacao", rotulo: "Local da operação", col: 3, placeholder: "Se vazio, usa a obra", avancado: true },
    { nome: "quantidade", rotulo: "Quantidade", tipo: "numero", col: 2, ajuda: "Diárias ou equipamentos", avancado: true },
    { nome: "franquia", rotulo: "Franquia", col: 2, placeholder: "Ex.: 220 horas/mês", avancado: true },
    { nome: "km_livre", rotulo: "Km livre", col: 2, placeholder: "Ex.: 3 mil km/mês", avancado: true },
    { nome: "periodo_minimo", rotulo: "Prazo / período mínimo", col: 2, placeholder: "Ex.: 7 meses", avancado: true },
    { nome: "multa_rescisao_pct", rotulo: "Multa por quebra (%)", tipo: "decimal", col: 2, avancado: true },
    { nome: "jornada", rotulo: "Jornada garantida", col: 2, visivel: guindaste, placeholder: JORNADA_PADRAO, avancado: true },
    { nome: "valor_mobilizacao", rotulo: "Mobilização", tipo: "moeda", col: 3, visivel: guindaste, avancado: true },
    { nome: "valor_desmobilizacao", rotulo: "Desmobilização", tipo: "moeda", col: 3, visivel: guindaste, avancado: true },
    { nome: "condicoes", rotulo: "Condições adicionais", tipo: "textarea", col: 6, ajuda: "Uma por linha. As condições padrão do modelo já saem no PDF.", placeholder: "Ex.: Seguro de carga por conta da contratante", avancado: true },
    { nome: "observacoes", rotulo: "Observações internas", tipo: "textarea", col: 6, avancado: true },
  ];
}

/** veículo escolhido define empresa, modalidade (sublocado = sem motorista) e modelo do PDF; sem veículo, a modalidade define o modelo */
function ajustesProposta(opcoes: OpcoesContrato) {
  const modelo = (m: ModalidadeProposta) => (m === "sem_motorista" ? "caminhao" : "guindaste");
  return (campo: string, v: PropostaForm) => {
    if (campo === "veiculo_id") {
      const x = opcoes.veiculos.find((o) => o.value === v.veiculo_id);
      if (!x) return;
      const modalidade: ModalidadeProposta = x.proprietario === "locador" ? "sem_motorista" : "com_motorista";
      return { empresa_id: x.empresa_id, modalidade, modelo_documento: modelo(modalidade) };
    }
    if (campo === "modalidade" && v.modalidade) return { modelo_documento: modelo(v.modalidade) };
  };
}

/** quadro abaixo do formulário: o que vai para o contrato quando a proposta for aprovada */
function ResumoContrato({ v, opcoes }: { v: PropostaForm; opcoes: OpcoesContrato }) {
  const diaria = v.tipo_cobranca === "diaria";
  const cliente = v.cliente_id === CLIENTE_NOVO ? v.cliente_novo : opcoes.clientes.find((c) => c.value === v.cliente_id)?.label;
  const obra = opcoes.obras.find((o) => o.value === v.obra_id)?.label;
  const veiculo = opcoes.veiculos.find((x) => x.value === v.veiculo_id)?.label;
  const valor = typeof v.valor === "number" && v.valor > 0 ? v.valor : null;
  const itens: [string, React.ReactNode][] = [
    ["Cliente", cliente ? `${cliente}${obra ? ` · ${obra}` : ""}` : <span className="text-muted-foreground">—</span>],
    ["Veículo", veiculo ?? <span className="text-status-alerta">definir para gerar o contrato</span>],
    [diaria ? "Diária" : "Mensal", valor ? formatBRL(valor) : <span className="text-muted-foreground">—</span>],
    ["Início", v.data_inicio_prevista ? formatData(v.data_inicio_prevista) : "na geração do contrato"],
    ["Medição", diaria ? "valor × dias" : String(v.dia_corte_inicio) === "21" ? "21 → 20" : "01 → fim do mês"],
    ["Pagamento", `${v.prazo_pagamento_dias ?? "—"} dias`],
  ];
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vai para o contrato</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {itens.map(([k, val]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{val}</dd></div>)}
      </dl>
    </div>
  );
}

export function PropostasCliente({ linhas, total, pagina, tamanho, opcoes, empresas, empresaPadrao, podeEditar, veContratos, novo }: {
  linhas: LinhaProposta[]; total: number; pagina: number; tamanho: number; opcoes: OpcoesContrato; empresas: Opcao[];
  empresaPadrao: string | null; podeEditar: boolean; veContratos: boolean; novo: boolean;
}) {
  const router = useRouter();
  const [convertendo, setConvertendo] = React.useState<LinhaProposta | null>(null);
  const ajustes = React.useMemo(() => ajustesProposta(opcoes), [opcoes]);

  const colunas = React.useMemo<ColumnDef<LinhaProposta, unknown>[]>(() => [
    { accessorKey: "numero", header: "Proposta", meta: { tituloMobile: true }, cell: ({ row: { original: r } }) => (
      <div><span className="font-mono font-semibold">{r.numero}</span><p className="text-xs text-muted-foreground">{formatData(r.created_at.slice(0, 10))} · {r.empresa}</p></div>
    ) },
    { id: "cliente", header: "Cliente / obra", cell: ({ row: { original: r } }) => <div><p>{r.cliente}</p>{r.obra && <p className="text-xs text-muted-foreground">{r.obra}</p>}</div> },
    { id: "item", header: "Veículo / equipamento", cell: ({ row: { original: r } }) => (
      <div><span className="text-sm">{descricaoItem(r) || "—"}</span>
        <p><Badge variant={r.modalidade === "com_motorista" ? "info" : "neutro"}>{MODALIDADE_PROPOSTA[r.modalidade]}</Badge></p></div>
    ) },
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
        rotuloAvancado="Mais opções (obra, pagamento, detalhes do PDF)" extraForm={(v) => <ResumoContrato v={v} opcoes={opcoes} />}
        aoAlterar={ajustes}
        descricao={<>Orçamentos de locação. Fechou com o cliente? Use <strong>Gerar contrato</strong> na linha da proposta. Cliente novo? Escolha <strong>+ Cliente sem cadastro</strong> e digite o nome.</>}
        linhas={linhas} total={total} pagina={pagina} tamanho={tamanho} colunas={colunas}
        campos={camposProposta(opcoes, empresas)} schema={propostaFormSchema as never}
        busca="Buscar nº ou equipamento…"
        filtros={<>
          <FiltroSelectUrl param="status" rotulo="Situação" vazio="Em aberto" opcoes={[
            ...(Object.keys(STATUS_PROPOSTA) as StatusProposta[]).map((s) => ({ value: s, label: STATUS_PROPOSTA[s] })),
            { value: "todas", label: "Todas" },
          ]} />
          <FiltroSelectUrl param="cliente" rotulo="Cliente" opcoes={opcoes.clientes} />
        </>}
        novo={{ modelo_documento: "guindaste", contato_cliente: null, local_operacao: null, quantidade: 1, franquia: null, km_livre: null, jornada: null,
          valor_mobilizacao: null, valor_desmobilizacao: null, multa_rescisao_pct: 10, tipo_cobranca: "mensal", modalidade: "com_motorista", empresa_id: empresaPadrao ?? empresas[0]?.value, cliente_id: undefined, cliente_novo: null, cliente_novo_endereco: null, cliente_novo_telefone: null, obra_id: null, veiculo_id: null, equipamento: null,
          valor: undefined, dia_corte_inicio: "1" as never, prazo_pagamento_dias: 30, data_inicio_prevista: null, periodo_minimo: null,
          validade: null, condicoes: null, observacoes: null, status: "rascunho", motivo_recusa: null }}
        paraForm={(r) => ({
          modelo_documento: r.modelo_documento, contato_cliente: r.contato_cliente, local_operacao: r.local_operacao, quantidade: r.quantidade, franquia: r.franquia,
          km_livre: r.km_livre, jornada: r.jornada, valor_mobilizacao: r.valor_mobilizacao, valor_desmobilizacao: r.valor_desmobilizacao,
          multa_rescisao_pct: r.multa_rescisao_pct, tipo_cobranca: r.tipo_cobranca, modalidade: r.modalidade, empresa_id: r.empresa_id, cliente_id: r.cliente_id, cliente_novo: null, cliente_novo_endereco: null, cliente_novo_telefone: null, obra_id: r.obra_id, veiculo_id: r.veiculo_id, equipamento: r.equipamento,
          valor: r.valor, dia_corte_inicio: String(r.dia_corte_inicio) as never, prazo_pagamento_dias: r.prazo_pagamento_dias,
          data_inicio_prevista: r.data_inicio_prevista, periodo_minimo: r.periodo_minimo, validade: r.validade, condicoes: r.condicoes,
          observacoes: r.observacoes, status: r.status as PropostaForm["status"], motivo_recusa: r.motivo_recusa,
        })}
        salvar={salvarProposta} excluir={excluirProposta} podeEditar={podeEditar}
        acoesLinha={(r) => (
          <>
            <Button variant="ghost" size="xs" onClick={() => baixarPropostaPDF(r.id)} aria-label={`PDF da proposta ${r.numero}`}><FileDown /> PDF</Button>
            {podeEditar && PODE_VIRAR_CONTRATO.includes(r.status) && <Button size="xs" onClick={() => setConvertendo(r)}><FileText /> Gerar contrato</Button>}
            {r.status === "convertida" && r.contrato_id && veContratos && (
              <Button variant="outline" size="xs" asChild><Link href={`/contratos/${r.contrato_id}`}>Ver contrato</Link></Button>
            )}
          </>
        )}
        exportar={{ nome: "propostas", colunas: [
          { titulo: "Proposta", valor: (r) => r.numero }, { titulo: "Data", valor: (r) => r.created_at.slice(0, 10), tipo: "data" },
          { titulo: "Empresa", valor: (r) => r.empresa }, { titulo: "Cliente", valor: (r) => r.cliente, largura: 24 }, { titulo: "Obra", valor: (r) => r.obra, largura: 20 },
          { titulo: "Veículo / equipamento", valor: (r) => descricaoItem(r), largura: 30 },
          { titulo: "Modalidade", valor: (r) => MODALIDADE_PROPOSTA[r.modalidade] },
          { titulo: "Cobrança", valor: (r) => (r.tipo_cobranca === "diaria" ? "Diária" : "Mensal") }, { titulo: "Valor", valor: (r) => r.valor, tipo: "moeda" },
          { titulo: "Validade", valor: (r) => r.validade, tipo: "data" }, { titulo: "Situação", valor: (r) => STATUS_PROPOSTA[r.status] },
          { titulo: "Motivo recusa", valor: (r) => r.motivo_recusa, largura: 24 },
        ] }}
      />
      <Confirmar aberto={!!convertendo} onOpenChange={(v) => !v && setConvertendo(null)} titulo="Gerar contrato" rotulo="Gerar contrato"
        desabilitado={!convertendo?.veiculo_id}
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
