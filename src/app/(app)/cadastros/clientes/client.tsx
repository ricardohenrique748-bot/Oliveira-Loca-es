"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CrudSimples } from "@/components/app/crud";
import { StatusBadge } from "@/components/app/comuns";
import { FiltroSelectUrl } from "@/components/app/url";
import { clienteSchema, type ClienteForm } from "@/lib/schemas/cadastros";
import { salvarCliente, excluirCliente } from "../actions";
import { CAMPOS_CLIENTE, CLIENTE_NOVO } from "./campos";

type Linha = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; email: string | null; whatsapp: string | null; cep: string | null; endereco: string | null; cidade: string | null; uf: string | null; observacoes: string | null; ativo: boolean; qtdObras: number; qtdContatos: number };

const colunas: ColumnDef<Linha, unknown>[] = [
  { id: "nome", header: "Cliente", meta: { tituloMobile: true }, cell: ({ row: { original: c } }) => (
    <div><p className="font-medium">{c.nome_fantasia ?? c.razao_social}</p>{c.nome_fantasia && <p className="text-xs text-muted-foreground">{c.razao_social}</p>}</div>
  ) },
  { accessorKey: "cnpj", header: "CPF/CNPJ", cell: ({ getValue }) => <span className="num">{(getValue() as string) ?? "—"}</span> },
  { accessorKey: "qtdObras", header: "Obras", meta: { direita: true } },
  { accessorKey: "qtdContatos", header: "Contatos", meta: { direita: true } },
  { accessorKey: "ativo", header: "Situação", cell: ({ getValue }) => <StatusBadge status={getValue() ? "ativo" : "encerrado"} /> },
];

export function ClientesCliente({ linhas, total, pagina, tamanho, podeEditar }: { linhas: Linha[]; total: number; pagina: number; tamanho: number; podeEditar: boolean }) {
  return (
    <CrudSimples<Linha, ClienteForm>
      titulo="Clientes e obras" descricao="Construtoras e concessionárias. Clique para ver obras, contatos de faturamento e contratos." entidade="cliente"
      linhas={linhas} total={total} pagina={pagina} tamanho={tamanho} colunas={colunas} campos={CAMPOS_CLIENTE} schema={clienteSchema}
      busca="Buscar nome, CPF ou CNPJ…" hrefLinha={(r) => `/cadastros/clientes/${r.id}`}
      filtros={<FiltroSelectUrl param="situacao" rotulo="Situação" vazio="Ativos" opcoes={[{ value: "inativos", label: "Inativos" }, { value: "todos", label: "Todos" }]} />}
      novo={CLIENTE_NOVO}
      paraForm={(r) => ({ razao_social: r.razao_social, nome_fantasia: r.nome_fantasia, cnpj: r.cnpj, email: r.email, whatsapp: r.whatsapp, cep: r.cep, endereco: r.endereco, cidade: r.cidade, uf: r.uf, observacoes: r.observacoes, ativo: r.ativo })}
      salvar={salvarCliente} excluir={excluirCliente} podeEditar={podeEditar}
      exportar={{ nome: "clientes", colunas: [
        { titulo: "Nome fantasia", valor: (r) => r.nome_fantasia, largura: 20 }, { titulo: "Razão social", valor: (r) => r.razao_social, largura: 40 },
        { titulo: "CPF/CNPJ", valor: (r) => r.cnpj, largura: 20 }, { titulo: "E-mail", valor: (r) => r.email, largura: 30 }, { titulo: "WhatsApp", valor: (r) => r.whatsapp, largura: 16 },
        { titulo: "Obras", valor: (r) => r.qtdObras, tipo: "numero" },
      ] }}
    />
  );
}
