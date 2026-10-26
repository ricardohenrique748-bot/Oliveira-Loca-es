import type { Campo } from "@/components/app/formulario";
import type { ClienteForm } from "@/lib/schemas/cadastros";
import { cnpjParaCliente } from "@/lib/cnpj";

/** Campos do cadastro de cliente (tela de clientes e "+ Novo cliente" do lançamento de fatura) */
export const CAMPOS_CLIENTE: Campo<ClienteForm>[] = [
  { nome: "nome_fantasia", rotulo: "Nome fantasia", col: 3, placeholder: "Ex.: CYMI" },
  { nome: "razao_social", rotulo: "Razão social / nome", obrigatorio: true, col: 3 },
  { nome: "cnpj", rotulo: "CPF ou CNPJ", tipo: "cpf_cnpj", col: 3, autoCnpj: cnpjParaCliente, ajuda: "CNPJ busca os dados na Receita; CPF se preenche à mão" },
  { nome: "ativo", rotulo: "Ativo", tipo: "checkbox", col: 3 },
  { nome: "email", rotulo: "E-mail", tipo: "email", col: 3 },
  { nome: "whatsapp", rotulo: "WhatsApp", tipo: "telefone", col: 3 },
  { nome: "cep", rotulo: "CEP", col: 2, placeholder: "00000-000" },
  { nome: "endereco", rotulo: "Endereço", col: 4, ajuda: "Rua, número, bairro — sai no boleto" },
  { nome: "cidade", rotulo: "Cidade", col: 4 },
  { nome: "uf", rotulo: "UF", col: 2 },
  { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
];

export const CLIENTE_NOVO: ClienteForm = {
  razao_social: "", nome_fantasia: null, cnpj: null, email: null, whatsapp: null, cep: null, endereco: null, cidade: null, uf: null, observacoes: null, ativo: true,
};
