"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, FileText, HardHat, Users } from "lucide-react";
import { IconeEmail, IconeWhatsApp } from "@/components/app/icones";
import { Card, CardContent, Badge } from "@/components/ui/basicos";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Cabecalho, Moeda, StatusBadge } from "@/components/app/comuns";
import { CrudSimples } from "@/components/app/crud";
import { DataTable } from "@/components/app/data-table";
import { Formulario, type Campo } from "@/components/app/formulario";
import { clienteSchema, contatoSchema, obraSchema, type ClienteForm, type ContatoForm, type ObraForm } from "@/lib/schemas/cadastros";
import { formatData, formatPlaca, maskTelefone } from "@/lib/format";
import { cnpjParaCliente } from "@/lib/cnpj";
import { salvarCliente, salvarContato, excluirContato, salvarObra, excluirObra } from "../../actions";

type Cliente = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; email: string | null; whatsapp: string | null; cep: string | null; endereco: string | null; cidade: string | null; uf: string | null; observacoes: string | null; ativo: boolean };
type Obra = { id: string; cliente_id: string; nome: string; codigo: string | null; cidade: string | null; uf: string | null; ativo: boolean };
type Contato = { id: string; cliente_id: string; obra_id: string | null; obra: string | null; nome: string; email: string | null; whatsapp: string | null; recebe_fatura: boolean };
type Contrato = { id: string; numero: string | null; status: string; valor_mensal: number; data_inicio: string; data_desmobilizacao: string | null; obra: string | null; placa: string; empresa: string };

const colObras: ColumnDef<Obra, unknown>[] = [
  { accessorKey: "nome", header: "Obra", meta: { tituloMobile: true } },
  { accessorKey: "codigo", header: "Código" },
  { id: "local", header: "Cidade", cell: ({ row }) => [row.original.cidade, row.original.uf].filter(Boolean).join(" / ") || "—" },
  { accessorKey: "ativo", header: "Situação", cell: ({ getValue }) => <StatusBadge status={getValue() ? "ativo" : "encerrado"} /> },
];

const colContatos: ColumnDef<Contato, unknown>[] = [
  { accessorKey: "nome", header: "Nome", meta: { tituloMobile: true } },
  { accessorKey: "obra", header: "Obra", cell: ({ getValue }) => (getValue() as string) ?? <span className="text-muted-foreground">Todas</span> },
  { accessorKey: "email", header: "E-mail", cell: ({ getValue }) => getValue() ? <a className="inline-flex items-center gap-1 hover:underline" href={`mailto:${getValue()}`} onClick={(e) => e.stopPropagation()}><IconeEmail className="h-3.5 w-3.5" />{getValue() as string}</a> : "—" },
  { accessorKey: "whatsapp", header: "WhatsApp", cell: ({ getValue }) => getValue() ? <a className="inline-flex items-center gap-1 hover:underline" target="_blank" rel="noopener" href={`https://wa.me/${(getValue() as string).startsWith("55") ? "" : "55"}${getValue()}`} onClick={(e) => e.stopPropagation()}><IconeWhatsApp className="h-3.5 w-3.5" />{maskTelefone(getValue() as string)}</a> : "—" },
  { accessorKey: "recebe_fatura", header: "Fatura", cell: ({ getValue }) => getValue() ? <Badge variant="ok">Recebe</Badge> : <Badge variant="neutro">Não</Badge> },
];

const colContratos: ColumnDef<Contrato, unknown>[] = [
  { accessorKey: "placa", header: "Placa", cell: ({ getValue }) => <span className="font-mono font-semibold">{formatPlaca(getValue() as string)}</span>, meta: { tituloMobile: true } },
  { accessorKey: "numero", header: "Contrato" },
  { accessorKey: "empresa", header: "Empresa" },
  { accessorKey: "obra", header: "Obra" },
  { accessorKey: "valor_mensal", header: "Valor mensal", cell: ({ getValue }) => <Moeda valor={getValue() as number} />, meta: { direita: true } },
  { accessorKey: "data_inicio", header: "Início", cell: ({ getValue }) => formatData(getValue() as string) },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
];

export function FichaCliente({ cliente, obras, contatos, contratos, podeEditar, veContratos }: {
  cliente: Cliente; obras: Obra[]; contatos: Contato[]; contratos: Contrato[]; podeEditar: boolean; veContratos: boolean;
}) {
  const router = useRouter();
  const camposCliente: Campo<ClienteForm>[] = [
    { nome: "nome_fantasia", rotulo: "Nome fantasia", col: 3 },
    { nome: "razao_social", rotulo: "Razão social", obrigatorio: true, col: 3 },
    { nome: "cnpj", rotulo: "CNPJ", tipo: "cpf_cnpj", col: 3, autoCnpj: cnpjParaCliente, ajuda: "Ao digitar, busca os dados na Receita" },
    { nome: "ativo", rotulo: "Ativo", tipo: "checkbox", col: 3 },
    { nome: "email", rotulo: "E-mail", tipo: "email", col: 3 },
    { nome: "whatsapp", rotulo: "WhatsApp", tipo: "telefone", col: 3 },
    { nome: "cep", rotulo: "CEP", col: 2, placeholder: "00000-000" },
    { nome: "endereco", rotulo: "Endereço", col: 4, ajuda: "Rua, número, bairro — sai no boleto" },
    { nome: "cidade", rotulo: "Cidade", col: 4 },
    { nome: "uf", rotulo: "UF", col: 2 },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  ].map((c) => ({ ...c, desabilitado: !podeEditar })) as Campo<ClienteForm>[];
  const camposObra: Campo<ObraForm>[] = [
    { nome: "nome", rotulo: "Nome da obra", obrigatorio: true, col: 4 },
    { nome: "codigo", rotulo: "Código", col: 2, placeholder: "3800-D" },
    { nome: "cidade", rotulo: "Cidade", col: 4 },
    { nome: "uf", rotulo: "UF", col: 2 },
    { nome: "ativo", rotulo: "Ativa", tipo: "checkbox", col: 6 },
  ];
  const camposContato: Campo<ContatoForm>[] = [
    { nome: "nome", rotulo: "Nome", obrigatorio: true, col: 3 },
    { nome: "obra_id", rotulo: "Obra", tipo: "select", vazio: "Todas as obras", opcoes: obras.map((o) => ({ value: o.id, label: o.nome })), col: 3 },
    { nome: "email", rotulo: "E-mail", tipo: "email", col: 3 },
    { nome: "whatsapp", rotulo: "WhatsApp", tipo: "telefone", col: 3 },
    { nome: "recebe_fatura", rotulo: "Recebe fatura / lembrete de faturamento", tipo: "checkbox", col: 6 },
  ];

  return (
    <div>
      <Cabecalho voltar={{ href: "/cadastros/clientes", rotulo: "Clientes" }} titulo={cliente.nome_fantasia ?? cliente.razao_social}
        descricao={<span className="num">{cliente.razao_social}{cliente.cnpj ? ` · ${cliente.cnpj}` : ""}</span>}
        acoes={<StatusBadge status={cliente.ativo ? "ativo" : "encerrado"} />} />
      <Tabs defaultValue="obras">
        <TabsList>
          <TabsTrigger value="dados"><Building2 /> Dados</TabsTrigger>
          <TabsTrigger value="obras"><HardHat /> Obras ({obras.length})</TabsTrigger>
          <TabsTrigger value="contatos"><Users /> Contatos ({contatos.length})</TabsTrigger>
          {veContratos && <TabsTrigger value="contratos"><FileText /> Contratos ({contratos.length})</TabsTrigger>}
        </TabsList>
        <TabsContent value="dados">
          <Card><CardContent className="pt-5">
            <Formulario<ClienteForm> campos={camposCliente} schema={clienteSchema}
              valores={{ razao_social: cliente.razao_social, nome_fantasia: cliente.nome_fantasia, cnpj: cliente.cnpj, email: cliente.email, whatsapp: cliente.whatsapp, cep: cliente.cep, endereco: cliente.endereco, cidade: cliente.cidade, uf: cliente.uf, observacoes: cliente.observacoes, ativo: cliente.ativo }}
              onSalvar={(v) => salvarCliente(cliente.id, v)} onSucesso={() => router.refresh()} />
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="obras">
          <CrudSimples<Obra, ObraForm> semCabecalho busca={false} titulo="Obras" entidade="obra" linhas={obras} colunas={colObras} campos={camposObra} schema={obraSchema}
            novo={{ cliente_id: cliente.id, nome: "", codigo: null, cidade: "São José do Rio Preto", uf: "SP", ativo: true }}
            paraForm={(o) => ({ cliente_id: o.cliente_id, nome: o.nome, codigo: o.codigo, cidade: o.cidade, uf: o.uf, ativo: o.ativo })}
            salvar={salvarObra} excluir={excluirObra} podeEditar={podeEditar} />
        </TabsContent>
        <TabsContent value="contatos">
          <CrudSimples<Contato, ContatoForm> semCabecalho busca={false} titulo="Contatos" entidade="contato" linhas={contatos} colunas={colContatos} campos={camposContato} schema={contatoSchema}
            novo={{ cliente_id: cliente.id, obra_id: null, nome: "", email: null, whatsapp: null, recebe_fatura: true }}
            paraForm={(c) => ({ cliente_id: c.cliente_id, obra_id: c.obra_id, nome: c.nome, email: c.email, whatsapp: c.whatsapp, recebe_fatura: c.recebe_fatura })}
            salvar={salvarContato} excluir={excluirContato} podeEditar={podeEditar} />
        </TabsContent>
        {veContratos && (
          <TabsContent value="contratos" className="space-y-3">
            <DataTable colunas={colContratos} dados={contratos} getId={(c) => c.id} aoClicarLinha={(c) => router.push(`/contratos/${c.id}`)} />
            <Link href={`/contratos?cliente=${cliente.id}`} className="text-sm underline">Ver na lista de contratos</Link>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
