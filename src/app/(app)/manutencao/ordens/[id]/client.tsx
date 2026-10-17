"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Camera, CheckCircle2, Hammer, Package, Pencil, Play } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import type { Opcao } from "@/components/ui/select";
import { Cabecalho, Confirmar, Moeda, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { CrudSimples } from "@/components/app/crud";
import { FormularioDialog, type Campo } from "@/components/app/formulario";
import { CampoAnexo, LinkAnexo } from "@/components/app/anexo";
import { editarOSSchema, fecharOSSchema, itemOSSchema, type EditarOSForm, type FecharOSForm, type ItemOSForm } from "@/lib/schemas/manutencao";
import { opcoesDe, ROTULOS } from "@/lib/schemas/cadastros";
import { FORMAS } from "@/lib/schemas/financeiro";
import { addDias, diffDias, hojeSP, somar } from "@/lib/calculos";
import { formatBRL, formatData, formatHoras, formatKm, formatPlaca } from "@/lib/format";
import { anexarFotoOS, editarOS, excluirItemOS, fecharOS, mudarStatusOS, salvarItemOS } from "../../actions";

type OS = {
  id: string; numero: number; veiculo_id: string; tipo: keyof typeof ROTULOS.tipoOS; plano_id: string | null; data_abertura: string; data_fechamento: string | null;
  km: number | null; horimetro: number | null; fornecedor_id: string | null; descricao_problema: string; diagnostico: string | null; custo_total: number;
  horas_parado: number; descontar_locador: boolean; parar_veiculo: boolean; status_veiculo_anterior: string | null; fotos: string[]; status: string;
  placa: string; modelo: string | null; locador: boolean; km_atual: number; horimetro_atual: number; fornecedor: string | null; empresa: string; plano: string | null;
};
type Item = { id: string; ordem_servico_id: string; tipo: "peca" | "servico"; descricao: string; quantidade: number; valor_unitario: number; valor_total: number };
type Conta = { id: string; descricao: string; vencimento: string; valor: number; pago_em: string | null; descontar_locador: boolean } | null;

export function DetalheOS({ os, itens, fornecedores, planos, categorias, contas, contaGerada, podeEditar, abrirFechamento }: {
  os: OS; itens: Item[]; fornecedores: Opcao[]; planos: Opcao[]; categorias: Opcao[]; contas: Opcao[]; contaGerada: Conta; podeEditar: boolean; abrirFechamento: boolean;
}) {
  const router = useRouter();
  const aberta = os.status !== "fechada" && os.status !== "cancelada";
  const editavel = podeEditar && aberta;
  const [editando, setEditando] = React.useState(false);
  const [fechando, setFechando] = React.useState(abrirFechamento && editavel);
  const [cancelando, setCancelando] = React.useState(false);
  const total = somar(itens.map((i) => i.valor_total));
  const horasSugeridas = Math.max(0, diffDias(os.data_abertura, hojeSP())) * 24 || os.horas_parado;

  const colItens: ColumnDef<Item, unknown>[] = [
    { accessorKey: "tipo", header: "Tipo", cell: ({ getValue }) => <Badge variant={getValue() === "peca" ? "secondary" : "info"}>{getValue() === "peca" ? "Peça" : "Serviço"}</Badge> },
    { accessorKey: "descricao", header: "Descrição", meta: { tituloMobile: true } },
    { accessorKey: "quantidade", header: "Qtd", meta: { direita: true }, cell: ({ getValue }) => (getValue() as number).toLocaleString("pt-BR") },
    { accessorKey: "valor_unitario", header: "Unitário", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} /> },
    { accessorKey: "valor_total", header: "Total", meta: { direita: true }, cell: ({ getValue }) => <Moeda valor={getValue() as number} className="font-semibold" /> },
  ];
  const camposItem: Campo<ItemOSForm>[] = [
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: [{ value: "peca", label: "Peça" }, { value: "servico", label: "Serviço" }], col: 2 },
    { nome: "descricao", rotulo: "Descrição", obrigatorio: true, col: 4 },
    { nome: "quantidade", rotulo: "Quantidade", tipo: "decimal", col: 3 },
    { nome: "valor_unitario", rotulo: "Valor unitário", tipo: "moeda", col: 3 },
  ];
  const camposEditar: Campo<EditarOSForm>[] = [
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: opcoesDe(ROTULOS.tipoOS), col: 2 },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: [{ value: "aberta", label: "Aberta" }, { value: "em_execucao", label: "Em execução" }, { value: "aguardando_peca", label: "Aguardando peça" }], col: 2 },
    { nome: "plano_id", rotulo: "Plano", tipo: "select", vazio: "—", opcoes: planos, col: 2, visivel: (v) => v.tipo === "preventiva" },
    { nome: "fornecedor_id", rotulo: "Fornecedor", tipo: "select", vazio: "Oficina própria", opcoes: fornecedores, col: 6 },
    { nome: "descricao_problema", rotulo: "Problema", tipo: "textarea", obrigatorio: true, col: 6 },
    { nome: "diagnostico", rotulo: "Diagnóstico", tipo: "textarea", col: 6 },
    { nome: "km", rotulo: "Km", tipo: "numero", col: 2 },
    { nome: "horimetro", rotulo: "Horímetro", tipo: "decimal", col: 2 },
    { nome: "horas_parado", rotulo: "Horas parado", tipo: "decimal", col: 2 },
    { nome: "descontar_locador", rotulo: "Descontar do locador", tipo: "checkbox", col: 6, visivel: () => os.locador },
  ];
  const camposFechar: Campo<FecharOSForm>[] = [
    { nome: "data_fechamento", rotulo: "Data de fechamento", tipo: "data", col: 2 },
    { nome: "km", rotulo: "Km na saída", tipo: "numero", col: 2 },
    { nome: "horimetro", rotulo: "Horímetro", tipo: "decimal", col: 2 },
    { nome: "horas_parado", rotulo: "Horas parado", tipo: "decimal", col: 2, ajuda: "Usado na disponibilidade e MTTR" },
    { nome: "diagnostico", rotulo: "Diagnóstico / serviço executado", tipo: "textarea", col: 4 },
    { nome: "gerar_conta", rotulo: `Gerar conta a pagar de ${formatBRL(total)} (despesa do veículo ${formatPlaca(os.placa)})`, tipo: "checkbox", col: 6 },
    { nome: "vencimento", rotulo: "Vencimento da conta", tipo: "data", col: 2, visivel: (v) => !!v.gerar_conta },
    { nome: "forma_pagamento", rotulo: "Forma", tipo: "select", opcoes: opcoesDe(FORMAS), col: 2, visivel: (v) => !!v.gerar_conta },
    { nome: "conta_bancaria_id", rotulo: "Conta bancária", tipo: "select", vazio: "—", opcoes: contas, col: 2, visivel: (v) => !!v.gerar_conta },
    { nome: "categoria_id", rotulo: "Categoria", tipo: "select", vazio: os.tipo === "pneu" ? "Pneus" : "Manutenção", opcoes: categorias, col: 3, visivel: (v) => !!v.gerar_conta },
  ];

  const status = async (s: "em_execucao" | "aguardando_peca" | "aberta") => {
    const r = await rodarAcao(mudarStatusOS(os.id, s));
    if (r.ok) router.refresh();
  };

  return (
    <div className="space-y-4">
      <Cabecalho voltar={{ href: "/manutencao/ordens", rotulo: "Ordens de serviço" }}
        titulo={`OS #${os.numero} · ${formatPlaca(os.placa)}`}
        descricao={<span>{ROTULOS.tipoOS[os.tipo]}{os.plano ? ` · ${os.plano}` : ""} · {os.empresa} · aberta em {formatData(os.data_abertura)}{os.data_fechamento ? ` · fechada em ${formatData(os.data_fechamento)}` : ""}</span>}
        acoes={<>
          <StatusBadge status={os.status} className="text-sm" />
          {editavel && <>
            {os.status !== "em_execucao" && <Button size="sm" variant="outline" onClick={() => status("em_execucao")}><Play /> Em execução</Button>}
            {os.status !== "aguardando_peca" && <Button size="sm" variant="outline" onClick={() => status("aguardando_peca")}><Package /> Aguardando peça</Button>}
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}><Pencil /> Editar</Button>
            <Button size="sm" variant="outline" onClick={() => setCancelando(true)}><Ban /> Cancelar</Button>
            <Button size="sm" onClick={() => setFechando(true)}><CheckCircle2 /> Fechar OS</Button>
          </>}
        </>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Problema e diagnóstico</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap">{os.descricao_problema}</p>
            {os.diagnostico && <><p className="text-xs font-semibold uppercase text-muted-foreground">Diagnóstico</p><p className="whitespace-pre-wrap">{os.diagnostico}</p></>}
            <dl className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">Fornecedor</dt><dd>{os.fornecedor ?? "Oficina própria"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Km</dt><dd className="num">{formatKm(os.km)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Horímetro</dt><dd className="num">{formatHoras(os.horimetro)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Horas parado</dt><dd className="num">{formatHoras(os.horas_parado)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Veículo parado</dt><dd>{os.parar_veiculo ? "Sim" : "Não (serviço rápido)"}</dd></div>
              {os.locador && <div><dt className="text-xs text-muted-foreground">Descontar do locador</dt><dd>{os.descontar_locador ? <Badge variant="info">Sim</Badge> : "Não"}</dd></div>}
            </dl>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Custo</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Peças</span><Moeda valor={somar(itens.filter((i) => i.tipo === "peca").map((i) => i.valor_total))} /></div>
              <div className="flex justify-between"><span>Serviços</span><Moeda valor={somar(itens.filter((i) => i.tipo === "servico").map((i) => i.valor_total))} /></div>
              <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><Moeda valor={total} /></div>
              {contaGerada && (
                <div className="rounded-md bg-muted p-2 text-xs">
                  <p className="font-semibold">Conta a pagar gerada</p>
                  <p>{contaGerada.descricao}</p>
                  <p>Venc. {formatData(contaGerada.vencimento)} · {formatBRL(contaGerada.valor)} · {contaGerada.pago_em ? "paga" : "em aberto"}{contaGerada.descontar_locador ? " · descontar do locador" : ""}</p>
                  <Link className="underline" href={`/pagar?id=${contaGerada.id}`}>Abrir conta</Link>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-4 w-4" /> Fotos ({os.fotos.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {os.fotos.map((f, i) => <div key={f}><LinkAnexo referencia={f} rotulo={`Foto ${i + 1}`} /></div>)}
              {podeEditar && <CampoAnexo bucket="fotos" pasta={`os/${os.numero}`} valor={null} aceitar="image/*" rotulo="Adicionar foto"
                onChange={async (ref) => { if (ref) { const r = await rodarAcao(anexarFotoOS(os.id, ref)); if (r.ok) router.refresh(); } }} />}
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-xl"><Hammer className="h-5 w-5" /> Peças e serviços</h2>
        <CrudSimples<Item, ItemOSForm> semCabecalho busca={false} titulo="Itens" entidade="item" linhas={itens} colunas={colItens} campos={camposItem} schema={itemOSSchema as never}
          novo={{ ordem_servico_id: os.id, tipo: "peca", descricao: "", quantidade: 1, valor_unitario: 0 }}
          paraForm={(i) => ({ ordem_servico_id: os.id, tipo: i.tipo, descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario })}
          salvar={salvarItemOS} excluir={(id) => excluirItemOS(id, os.id)} podeEditar={editavel} tamanhoForm="md" />
      </div>

      <FormularioDialog<EditarOSForm> aberto={editando} onOpenChange={setEditando} titulo={`Editar OS #${os.numero}`} tamanho="lg" campos={camposEditar} schema={editarOSSchema as never}
        valores={{ tipo: os.tipo, plano_id: os.plano_id, fornecedor_id: os.fornecedor_id, descricao_problema: os.descricao_problema, diagnostico: os.diagnostico,
          km: os.km, horimetro: os.horimetro, horas_parado: os.horas_parado, descontar_locador: os.descontar_locador, status: os.status as "aberta" }}
        onSalvar={(v) => editarOS(os.id, v)} onSucesso={() => router.refresh()} />

      <FormularioDialog<FecharOSForm> aberto={fechando} onOpenChange={setFechando} titulo={`Fechar OS #${os.numero}`} tamanho="lg"
        descricao={`Soma ${itens.length} item(ns) = ${formatBRL(total)}. ${os.tipo === "preventiva" && os.plano ? `Atualiza o plano “${os.plano}”. ` : ""}Registra leitura e devolve o veículo ao status anterior.`}
        campos={camposFechar} schema={fecharOSSchema as never}
        valores={{ data_fechamento: hojeSP(), km: Math.max(os.km ?? 0, os.km_atual) || null, horimetro: Math.max(os.horimetro ?? 0, os.horimetro_atual) || null,
          horas_parado: os.parar_veiculo ? horasSugeridas : 0, diagnostico: os.diagnostico, gerar_conta: total > 0, vencimento: addDias(hojeSP(), 30),
          forma_pagamento: "boleto", conta_bancaria_id: contas[0]?.value ?? null, categoria_id: null }}
        rotuloSalvar="Fechar OS"
        onSalvar={(v) => fecharOS(os.id, v)} onSucesso={() => router.replace(`/manutencao/ordens/${os.id}`)} />

      <Confirmar aberto={cancelando} onOpenChange={setCancelando} titulo={`Cancelar OS #${os.numero}?`} destrutivo rotulo="Cancelar OS"
        descricao="A OS não gera conta a pagar e o veículo volta ao status anterior."
        onConfirmar={async () => { const r = await rodarAcao(mudarStatusOS(os.id, "cancelada")); if (r.ok) router.refresh(); }} />
    </div>
  );
}
