"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CrudSimples } from "@/components/app/crud";
import { BotaoCopiar, StatusBadge } from "@/components/app/comuns";
import { Badge } from "@/components/ui/basicos";
import type { Campo } from "@/components/app/formulario";
import { locadorSchema, opcoesDe, ROTULOS, type LocadorForm } from "@/lib/schemas/cadastros";
import { formatPlaca, maskTelefone } from "@/lib/format";
import { salvarLocador, excluirLocador } from "../actions";

type Linha = {
  id: string; nome: string; cpf_cnpj: string | null; telefone: string | null; chave_pix: string | null;
  tipo_chave_pix: LocadorForm["tipo_chave_pix"]; banco: string | null; nome_titular_pix: string | null; observacoes: string | null; ativo: boolean; placas: string[];
};

const colunas: ColumnDef<Linha, unknown>[] = [
  { accessorKey: "nome", header: "Nome", meta: { tituloMobile: true } },
  { accessorKey: "cpf_cnpj", header: "CPF/CNPJ", cell: ({ getValue }) => <span className="num">{(getValue() as string) ?? "—"}</span> },
  { accessorKey: "telefone", header: "Telefone", cell: ({ getValue }) => (getValue() ? maskTelefone(getValue() as string) : "—") },
  {
    id: "pix", header: "PIX",
    cell: ({ row: { original: l } }) => l.chave_pix ? (
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-all text-sm">
          {l.tipo_chave_pix && <span className="text-xs text-muted-foreground">{ROTULOS.tipoChavePix[l.tipo_chave_pix]}: </span>}
          {l.chave_pix}
        </span>
        <BotaoCopiar texto={l.chave_pix} rotulo="Copiar chave" />
      </div>
    ) : <span className="text-muted-foreground">—</span>,
  },
  { accessorKey: "nome_titular_pix", header: "Titular / banco", cell: ({ row }) => <span className="text-sm">{row.original.nome_titular_pix ?? "—"}{row.original.banco ? ` · ${row.original.banco}` : ""}</span> },
  { id: "placas", header: "Veículos", cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.placas.map((p) => <Badge key={p} variant="outline" className="font-mono">{formatPlaca(p)}</Badge>)}</div> },
  { accessorKey: "ativo", header: "Situação", cell: ({ getValue }) => <StatusBadge status={getValue() ? "ativo" : "encerrado"} />, meta: { ocultarMobile: true } },
];

const campos: Campo<LocadorForm>[] = [
  { nome: "nome", rotulo: "Nome", obrigatorio: true, col: 4 },
  { nome: "cpf_cnpj", rotulo: "CPF/CNPJ", tipo: "cpf_cnpj", col: 2 },
  { nome: "telefone", rotulo: "Telefone / WhatsApp", tipo: "telefone", col: 2 },
  { nome: "tipo_chave_pix", rotulo: "Tipo da chave PIX", tipo: "select", opcoes: opcoesDe(ROTULOS.tipoChavePix), vazio: "—", col: 2 },
  { nome: "chave_pix", rotulo: "Chave PIX", col: 2 },
  { nome: "nome_titular_pix", rotulo: "Nome do titular (PIX)", col: 4 },
  { nome: "banco", rotulo: "Banco", col: 2 },
  { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  { nome: "ativo", rotulo: "Ativo", tipo: "checkbox", col: 6 },
];

export function LocadoresCliente({ linhas, total, pagina, tamanho, podeEditar }: { linhas: Linha[]; total: number; pagina: number; tamanho: number; podeEditar: boolean }) {
  return (
    <CrudSimples<Linha, LocadorForm>
      titulo="Locadores" entidade="locador" tamanhoForm="lg"
      descricao="Donos dos veículos sublocados. Dados de CPF/CNPJ e PIX visíveis só para admin e financeiro (LGPD)."
      linhas={linhas} total={total} pagina={pagina} tamanho={tamanho} colunas={colunas} campos={campos} schema={locadorSchema}
      busca="Buscar nome, CPF/CNPJ, PIX…"
      novo={{ nome: "", cpf_cnpj: null, telefone: null, chave_pix: null, tipo_chave_pix: null, banco: null, nome_titular_pix: null, observacoes: null, ativo: true }}
      paraForm={(r) => ({ nome: r.nome, cpf_cnpj: r.cpf_cnpj, telefone: r.telefone, chave_pix: r.chave_pix, tipo_chave_pix: r.tipo_chave_pix, banco: r.banco, nome_titular_pix: r.nome_titular_pix, observacoes: r.observacoes, ativo: r.ativo })}
      salvar={salvarLocador} excluir={excluirLocador} podeEditar={podeEditar}
      exportar={{ nome: "locadores", colunas: [
        { titulo: "Nome", valor: (r) => r.nome, largura: 28 }, { titulo: "CPF/CNPJ", valor: (r) => r.cpf_cnpj, largura: 20 }, { titulo: "Telefone", valor: (r) => r.telefone },
        { titulo: "Chave PIX", valor: (r) => r.chave_pix, largura: 30 }, { titulo: "Titular", valor: (r) => r.nome_titular_pix, largura: 28 }, { titulo: "Banco", valor: (r) => r.banco },
        { titulo: "Veículos", valor: (r) => r.placas.join(", "), largura: 24 },
      ] }}
    />
  );
}
