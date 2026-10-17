"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CrudSimples } from "@/components/app/crud";
import { StatusBadge } from "@/components/app/comuns";
import type { Campo } from "@/components/app/formulario";
import type { Opcao } from "@/components/ui/select";
import { contaBancariaSchema, type ContaBancariaForm } from "@/lib/schemas/cadastros";
import { salvarContaBancaria, excluirContaBancaria } from "../actions";

type Linha = { id: string; empresa_id: string; empresa: string; banco: ContaBancariaForm["banco"]; agencia: string | null; conta: string | null; apelido: string; ativo: boolean };

const colunas: ColumnDef<Linha, unknown>[] = [
  { accessorKey: "apelido", header: "Apelido", meta: { tituloMobile: true } },
  { accessorKey: "empresa", header: "Empresa" },
  { accessorKey: "banco", header: "Banco" },
  { accessorKey: "agencia", header: "Agência" },
  { accessorKey: "conta", header: "Conta" },
  { accessorKey: "ativo", header: "Situação", cell: ({ getValue }) => <StatusBadge status={getValue() ? "ativo" : "encerrado"} /> },
];

export function ContasCliente({ linhas, empresas, empresaPadrao, podeEditar }: { linhas: Linha[]; empresas: Opcao[]; empresaPadrao: string | null; podeEditar: boolean }) {
  const campos: Campo<ContaBancariaForm>[] = [
    { nome: "apelido", rotulo: "Apelido", obrigatorio: true, col: 6, placeholder: "Ex.: Bradesco Oliveira" },
    { nome: "empresa_id", rotulo: "Empresa", tipo: "select", opcoes: empresas, obrigatorio: true },
    { nome: "banco", rotulo: "Banco", tipo: "select", opcoes: ["Bradesco", "Sicredi", "Inter", "Outro"].map((b) => ({ value: b, label: b })), obrigatorio: true },
    { nome: "agencia", rotulo: "Agência", col: 2 },
    { nome: "conta", rotulo: "Conta", col: 2 },
    { nome: "ativo", rotulo: "Ativa", tipo: "checkbox", col: 2 },
  ];
  return (
    <CrudSimples<Linha, ContaBancariaForm>
      titulo="Contas bancárias" descricao="Bradesco, Sicredi e Inter de cada empresa — usadas em recebimentos e pagamentos." entidade="conta"
      linhas={linhas} colunas={colunas} campos={campos} schema={contaBancariaSchema} busca={false}
      novo={{ empresa_id: empresaPadrao ?? empresas[0]?.value, banco: "Bradesco", agencia: null, conta: null, apelido: "", ativo: true }}
      paraForm={(r) => ({ empresa_id: r.empresa_id, banco: r.banco, agencia: r.agencia, conta: r.conta, apelido: r.apelido, ativo: r.ativo })}
      salvar={salvarContaBancaria} excluir={excluirContaBancaria} podeEditar={podeEditar}
      exportar={{ nome: "contas_bancarias", colunas: [
        { titulo: "Apelido", valor: (r) => r.apelido }, { titulo: "Empresa", valor: (r) => r.empresa }, { titulo: "Banco", valor: (r) => r.banco },
        { titulo: "Agência", valor: (r) => r.agencia }, { titulo: "Conta", valor: (r) => r.conta },
      ] }}
    />
  );
}
