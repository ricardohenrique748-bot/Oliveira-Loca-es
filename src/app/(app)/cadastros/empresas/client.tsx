"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CrudSimples } from "@/components/app/crud";
import { StatusBadge } from "@/components/app/comuns";
import type { Campo } from "@/components/app/formulario";
import { empresaSchema, type EmpresaForm } from "@/lib/schemas/cadastros";
import { cnpjParaEmpresa } from "@/lib/cnpj";
import { salvarEmpresa, excluirEmpresa } from "../actions";

type Linha = {
  id: string; apelido: string; razao_social: string; cnpj: string | null; ativo: boolean;
  endereco: string | null; cidade: string | null; uf: string | null; contato_nome: string | null; telefone: string | null; email: string | null;
};

const colunas: ColumnDef<Linha, unknown>[] = [
  { accessorKey: "apelido", header: "Apelido", cell: ({ row }) => <span className="font-display font-semibold tracking-tight">{row.original.apelido}</span>, meta: { tituloMobile: true } },
  { accessorKey: "razao_social", header: "Razão social" },
  { accessorKey: "cnpj", header: "CNPJ", cell: ({ getValue }) => <span className="num">{(getValue() as string) ?? "—"}</span> },
  { accessorKey: "ativo", header: "Situação", cell: ({ getValue }) => <StatusBadge status={getValue() ? "ativo" : "encerrado"} /> },
];

const campos: Campo<EmpresaForm>[] = [
  { nome: "apelido", rotulo: "Apelido", obrigatorio: true, col: 2, ajuda: "Ex.: OLIVEIRA, TDTS" },
  { nome: "razao_social", rotulo: "Razão social", obrigatorio: true, col: 4 },
  { nome: "cnpj", rotulo: "CNPJ", tipo: "cpf_cnpj", col: 3, autoCnpj: cnpjParaEmpresa },
  { nome: "ativo", rotulo: "Ativa", tipo: "checkbox", col: 3 },
  { nome: "endereco", rotulo: "Endereço", col: 4, ajuda: "Sai no contrato e na proposta", placeholder: "Rua, número, bairro" },
  { nome: "cidade", rotulo: "Cidade", col: 1, ajuda: "Também é o foro" },
  { nome: "uf", rotulo: "UF", col: 1 },
  { nome: "contato_nome", rotulo: "Contato comercial", col: 2, ajuda: "Rodapé da proposta" },
  { nome: "telefone", rotulo: "Telefone", tipo: "telefone", col: 2 },
  { nome: "email", rotulo: "E-mail", tipo: "email", col: 2 },
];

export function EmpresasCliente({ linhas, podeEditar }: { linhas: Linha[]; podeEditar: boolean }) {
  return (
    <CrudSimples<Linha, EmpresaForm>
      titulo="Empresas" descricao="Empresas emissoras de medições, contas e OS." entidade="empresa"
      linhas={linhas} colunas={colunas} campos={campos} schema={empresaSchema} busca={false}
      novo={{ apelido: "", razao_social: "", cnpj: null, ativo: true, endereco: null, cidade: null, uf: null, contato_nome: null, telefone: null, email: null }}
      paraForm={(r) => ({ apelido: r.apelido, razao_social: r.razao_social, cnpj: r.cnpj, ativo: r.ativo, endereco: r.endereco, cidade: r.cidade, uf: r.uf, contato_nome: r.contato_nome, telefone: r.telefone, email: r.email })}
      salvar={salvarEmpresa} excluir={excluirEmpresa} podeEditar={podeEditar}
      exportar={{ nome: "empresas", colunas: [
        { titulo: "Apelido", valor: (r) => r.apelido }, { titulo: "Razão social", valor: (r) => r.razao_social, largura: 40 }, { titulo: "CNPJ", valor: (r) => r.cnpj },
      ] }}
    />
  );
}
