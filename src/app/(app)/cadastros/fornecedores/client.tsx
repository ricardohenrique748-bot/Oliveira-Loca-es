"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CrudSimples } from "@/components/app/crud";
import { StatusBadge } from "@/components/app/comuns";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { fornecedorSchema, type FornecedorForm } from "@/lib/schemas/cadastros";
import { maskTelefone } from "@/lib/format";
import { cnpjParaFornecedor } from "@/lib/cnpj";
import { salvarFornecedor, excluirFornecedor } from "../actions";

type Linha = { id: string; nome: string; cpf_cnpj: string | null; telefone: string | null; email: string | null; categoria: string | null; ativo: boolean };

const colunas: ColumnDef<Linha, unknown>[] = [
  { accessorKey: "nome", header: "Nome", meta: { ordem: "nome", tituloMobile: true } },
  { accessorKey: "categoria", header: "Categoria", meta: { ordem: "categoria" } },
  { accessorKey: "cpf_cnpj", header: "CPF/CNPJ", cell: ({ getValue }) => <span className="num">{(getValue() as string) ?? "—"}</span> },
  { accessorKey: "telefone", header: "Telefone", cell: ({ getValue }) => (getValue() ? maskTelefone(getValue() as string) : "—") },
  { accessorKey: "email", header: "E-mail" },
  { accessorKey: "ativo", header: "Situação", cell: ({ getValue }) => <StatusBadge status={getValue() ? "ativo" : "encerrado"} /> },
];

export function FornecedoresCliente({ linhas, total, pagina, tamanho, categorias, podeEditar, novo }: {
  linhas: Linha[]; total: number; pagina: number; tamanho: number; categorias: string[]; podeEditar: boolean; novo: boolean;
}) {
  const campos: Campo<FornecedorForm>[] = [
    { nome: "nome", rotulo: "Nome", obrigatorio: true, col: 4 },
    { nome: "categoria", rotulo: "Categoria", col: 2, placeholder: "Pneus, Peças, Oficina…" },
    { nome: "cpf_cnpj", rotulo: "CPF/CNPJ", tipo: "cpf_cnpj", col: 3, autoCnpj: cnpjParaFornecedor },
    { nome: "telefone", rotulo: "Telefone", tipo: "telefone", col: 3 },
    { nome: "email", rotulo: "E-mail", tipo: "email", col: 4 },
    { nome: "ativo", rotulo: "Ativo", tipo: "checkbox", col: 2 },
  ];
  return (
    <CrudSimples<Linha, FornecedorForm>
      titulo="Fornecedores" entidade="fornecedor" abrirNovo={novo}
      linhas={linhas} total={total} pagina={pagina} tamanho={tamanho} colunas={colunas} campos={campos} schema={fornecedorSchema}
      busca="Buscar nome, CNPJ, categoria…"
      filtros={<FiltroSelectUrl param="categoria" rotulo="Categoria" vazio="Todas" opcoes={categorias.map((c) => ({ value: c, label: c }))} />}
      novo={{ nome: "", cpf_cnpj: null, telefone: null, email: null, categoria: null, ativo: true }}
      paraForm={(r) => ({ nome: r.nome, cpf_cnpj: r.cpf_cnpj, telefone: r.telefone, email: r.email, categoria: r.categoria, ativo: r.ativo })}
      salvar={salvarFornecedor} excluir={excluirFornecedor} podeEditar={podeEditar}
      exportar={{ nome: "fornecedores", colunas: [
        { titulo: "Nome", valor: (r) => r.nome, largura: 32 }, { titulo: "Categoria", valor: (r) => r.categoria }, { titulo: "CPF/CNPJ", valor: (r) => r.cpf_cnpj, largura: 20 },
        { titulo: "Telefone", valor: (r) => r.telefone }, { titulo: "E-mail", valor: (r) => r.email, largura: 28 },
      ] }}
    />
  );
}
