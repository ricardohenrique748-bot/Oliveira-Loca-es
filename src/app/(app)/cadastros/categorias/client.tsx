"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CrudSimples } from "@/components/app/crud";
import { StatusBadge } from "@/components/app/comuns";
import { Badge } from "@/components/ui/basicos";
import type { Campo } from "@/components/app/formulario";
import { categoriaSchema, opcoesDe, ROTULOS, type CategoriaForm } from "@/lib/schemas/cadastros";
import { salvarCategoria, excluirCategoria } from "../actions";

type Linha = { id: string; nome: string; tipo: "fixa" | "variavel" | "veiculo"; ativo: boolean };

const colunas: ColumnDef<Linha, unknown>[] = [
  { accessorKey: "nome", header: "Nome", meta: { tituloMobile: true } },
  { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => <Badge variant={row.original.tipo === "veiculo" ? "default" : "secondary"}>{ROTULOS.tipoDespesa[row.original.tipo]}</Badge> },
  { accessorKey: "ativo", header: "Situação", cell: ({ getValue }) => <StatusBadge status={getValue() ? "ativo" : "encerrado"} /> },
];

const campos: Campo<CategoriaForm>[] = [
  { nome: "nome", rotulo: "Nome", obrigatorio: true, col: 4 },
  { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: opcoesDe(ROTULOS.tipoDespesa), col: 2 },
  { nome: "ativo", rotulo: "Ativa", tipo: "checkbox", col: 6 },
];

export function CategoriasCliente({ linhas, podeEditar }: { linhas: Linha[]; podeEditar: boolean }) {
  return (
    <CrudSimples<Linha, CategoriaForm>
      titulo="Categorias de despesa" descricao="Fixas (aluguel, folha…) e de veículo (manutenção, pneus, multas…)." entidade="categoria"
      linhas={linhas} colunas={colunas} campos={campos} schema={categoriaSchema} busca={false} tamanhoForm="sm"
      novo={{ nome: "", tipo: "fixa", ativo: true }}
      paraForm={(r) => ({ nome: r.nome, tipo: r.tipo, ativo: r.ativo })}
      salvar={salvarCategoria} excluir={excluirCategoria} podeEditar={podeEditar}
      exportar={{ nome: "categorias", colunas: [{ titulo: "Nome", valor: (r) => r.nome }, { titulo: "Tipo", valor: (r) => ROTULOS.tipoDespesa[r.tipo] }] }}
    />
  );
}
