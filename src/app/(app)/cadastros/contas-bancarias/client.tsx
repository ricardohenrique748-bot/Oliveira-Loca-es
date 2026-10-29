"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CrudSimples } from "@/components/app/crud";
import { StatusBadge } from "@/components/app/comuns";
import { Badge } from "@/components/ui/basicos";
import type { Campo } from "@/components/app/formulario";
import type { Opcao } from "@/components/ui/select";
import { APOS_VENCIMENTO, contaBancariaSchema, type ContaBancariaForm } from "@/lib/schemas/cadastros";
import { salvarContaBancaria, excluirContaBancaria } from "../actions";

type Linha = { id: string; empresa_id: string; empresa: string; banco: ContaBancariaForm["banco"]; agencia: string | null; conta: string | null; posto: string | null; codigo_beneficiario: string | null; apelido: string; ativo: boolean }
  & Pick<ContaBancariaForm, "boleto_multa_pct" | "boleto_juros_mes_pct" | "boleto_apos_vencimento" | "boleto_dias_apos_vencimento">;

const boletoSicredi = (v: ContaBancariaForm) => v.banco === "Sicredi" && !!v.codigo_beneficiario;

const colunas: ColumnDef<Linha, unknown>[] = [
  { accessorKey: "apelido", header: "Apelido", meta: { tituloMobile: true } },
  { accessorKey: "empresa", header: "Empresa" },
  { accessorKey: "banco", header: "Banco" },
  { accessorKey: "agencia", header: "Agência" },
  { accessorKey: "conta", header: "Conta" },
  { id: "boleto", header: "Boleto", cell: ({ row: { original: c } }) => (c.banco === "Sicredi" && c.codigo_beneficiario ? <Badge variant="ok">Emite boleto</Badge> : <span className="text-muted-foreground">—</span>) },
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
    { nome: "posto", rotulo: "Posto", col: 2, placeholder: "Ex.: 02", ajuda: "Do contrato de cobrança", visivel: (v) => v.banco === "Sicredi" },
    { nome: "codigo_beneficiario", rotulo: "Código do beneficiário", col: 4, ajuda: "Preenchido = esta conta emite boletos pelo sistema", visivel: (v) => v.banco === "Sicredi" },
    { nome: "boleto_multa_pct", rotulo: "Multa por atraso (%)", tipo: "decimal", col: 3, placeholder: "Ex.: 2", ajuda: "Padrão dos boletos; dá para mudar na emissão", visivel: boletoSicredi },
    { nome: "boleto_juros_mes_pct", rotulo: "Juros ao mês (%)", tipo: "decimal", col: 3, placeholder: "Ex.: 1", visivel: boletoSicredi },
    { nome: "boleto_apos_vencimento", rotulo: "Se não pagar", tipo: "select", opcoes: [...APOS_VENCIMENTO], vazio: "Não protestar nem negativar", col: 4, visivel: boletoSicredi },
    { nome: "boleto_dias_apos_vencimento", rotulo: "Dias após o vencimento", tipo: "numero", col: 2,
      ajuda: "Protesto: 3 a 99 · Serasa: 46 a 99", visivel: (v) => boletoSicredi(v) && !!v.boleto_apos_vencimento },
  ];
  return (
    <CrudSimples<Linha, ContaBancariaForm>
      titulo="Contas bancárias" descricao="Bradesco, Sicredi e Inter de cada empresa — usadas em recebimentos e pagamentos." entidade="conta"
      linhas={linhas} colunas={colunas} campos={campos} schema={contaBancariaSchema} busca={false}
      novo={{ empresa_id: empresaPadrao ?? empresas[0]?.value, banco: "Bradesco", agencia: null, conta: null, posto: null, codigo_beneficiario: null, apelido: "", ativo: true,
        boleto_multa_pct: null, boleto_juros_mes_pct: null, boleto_apos_vencimento: null, boleto_dias_apos_vencimento: null }}
      paraForm={(r) => ({ empresa_id: r.empresa_id, banco: r.banco, agencia: r.agencia, conta: r.conta, posto: r.posto, codigo_beneficiario: r.codigo_beneficiario, apelido: r.apelido, ativo: r.ativo,
        boleto_multa_pct: r.boleto_multa_pct, boleto_juros_mes_pct: r.boleto_juros_mes_pct, boleto_apos_vencimento: r.boleto_apos_vencimento, boleto_dias_apos_vencimento: r.boleto_dias_apos_vencimento })}
      salvar={salvarContaBancaria} excluir={excluirContaBancaria} podeEditar={podeEditar}
      exportar={{ nome: "contas_bancarias", colunas: [
        { titulo: "Apelido", valor: (r) => r.apelido }, { titulo: "Empresa", valor: (r) => r.empresa }, { titulo: "Banco", valor: (r) => r.banco },
        { titulo: "Agência", valor: (r) => r.agencia }, { titulo: "Conta", valor: (r) => r.conta },
      ] }}
    />
  );
}
