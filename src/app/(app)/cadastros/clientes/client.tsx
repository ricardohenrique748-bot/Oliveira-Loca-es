"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CrudSimples } from "@/components/app/crud";
import { StatusBadge } from "@/components/app/comuns";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { clienteSchema, type ClienteForm } from "@/lib/schemas/cadastros";
import { cnpjParaCliente } from "@/lib/cnpj";
import { salvarCliente, excluirCliente } from "../actions";

type Linha = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; email: string | null; whatsapp: string | null; cep: string | null; endereco: string | null; cidade: string | null; uf: string | null; observacoes: string | null; ativo: boolean; qtdObras: number; qtdContatos: number };

const colunas: ColumnDef<Linha, unknown>[] = [
  { id: "nome", header: "Cliente", meta: { tituloMobile: true }, cell: ({ row: { original: c } }) => (
    <div><p className="font-medium">{c.nome_fantasia ?? c.razao_social}</p>{c.nome_fantasia && <p className="text-xs text-muted-foreground">{c.razao_social}</p>}</div>
  ) },
  { accessorKey: "cnpj", header: "CNPJ", cell: ({ getValue }) => <span className="num">{(getValue() as string) ?? "—"}</span> },
  { accessorKey: "qtdObras", header: "Obras", meta: { direita: true } },
  { accessorKey: "qtdContatos", header: "Contatos", meta: { direita: true } },
  { accessorKey: "ativo", header: "Situação", cell: ({ getValue }) => <StatusBadge status={getValue() ? "ativo" : "encerrado"} /> },
];

const campos: Campo<ClienteForm>[] = [
  { nome: "nome_fantasia", rotulo: "Nome fantasia", col: 3, placeholder: "Ex.: CYMI" },
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
];

export function ClientesCliente({ linhas, total, pagina, tamanho, podeEditar }: { linhas: Linha[]; total: number; pagina: number; tamanho: number; podeEditar: boolean }) {
  return (
    <CrudSimples<Linha, ClienteForm>
      titulo="Clientes e obras" descricao="Construtoras e concessionárias. Clique para ver obras, contatos de faturamento e contratos." entidade="cliente"
      linhas={linhas} total={total} pagina={pagina} tamanho={tamanho} colunas={colunas} campos={campos} schema={clienteSchema}
      busca="Buscar nome ou CNPJ…" hrefLinha={(r) => `/cadastros/clientes/${r.id}`}
      filtros={<FiltroSelectUrl param="situacao" rotulo="Situação" vazio="Ativos" opcoes={[{ value: "inativos", label: "Inativos" }, { value: "todos", label: "Todos" }]} />}
      novo={{ razao_social: "", nome_fantasia: null, cnpj: null, email: null, whatsapp: null, cep: null, endereco: null, cidade: null, uf: null, observacoes: null, ativo: true }}
      paraForm={(r) => ({ razao_social: r.razao_social, nome_fantasia: r.nome_fantasia, cnpj: r.cnpj, email: r.email, whatsapp: r.whatsapp, cep: r.cep, endereco: r.endereco, cidade: r.cidade, uf: r.uf, observacoes: r.observacoes, ativo: r.ativo })}
      salvar={salvarCliente} excluir={excluirCliente} podeEditar={podeEditar}
      exportar={{ nome: "clientes", colunas: [
        { titulo: "Nome fantasia", valor: (r) => r.nome_fantasia, largura: 20 }, { titulo: "Razão social", valor: (r) => r.razao_social, largura: 40 },
        { titulo: "CNPJ", valor: (r) => r.cnpj, largura: 20 }, { titulo: "E-mail", valor: (r) => r.email, largura: 30 }, { titulo: "WhatsApp", valor: (r) => r.whatsapp, largura: 16 },
        { titulo: "Obras", valor: (r) => r.qtdObras, tipo: "numero" },
      ] }}
    />
  );
}
