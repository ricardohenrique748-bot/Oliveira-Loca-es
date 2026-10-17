"use server";
import { salvarRegistro, excluirRegistro } from "@/lib/crud";
import {
  categoriaSchema, clienteSchema, contaBancariaSchema, contatoSchema, empresaSchema, fornecedorSchema, locadorSchema, obraSchema, veiculoSchema,
} from "@/lib/schemas/cadastros";

const R = "/cadastros";

export async function salvarEmpresa(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "empresas", modulo: "configuracoes", id, dados, schema: empresaSchema, revalidar: [`${R}/empresas`, "/"] });
}
export async function excluirEmpresa(id: string) {
  return excluirRegistro({ tabela: "empresas", modulo: "configuracoes", id, revalidar: [`${R}/empresas`] });
}

export async function salvarContaBancaria(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "contas_bancarias", modulo: "contasBancarias", id, dados, schema: contaBancariaSchema, revalidar: [`${R}/contas-bancarias`] });
}
export async function excluirContaBancaria(id: string) {
  return excluirRegistro({ tabela: "contas_bancarias", modulo: "contasBancarias", id, revalidar: [`${R}/contas-bancarias`] });
}

export async function salvarCliente(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "clientes", modulo: "cadastros", id, dados, schema: clienteSchema, revalidar: [`${R}/clientes`] });
}
export async function excluirCliente(id: string) {
  return excluirRegistro({ tabela: "clientes", modulo: "cadastros", id, revalidar: [`${R}/clientes`] });
}

export async function salvarObra(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "obras", modulo: "cadastros", id, dados, schema: obraSchema, revalidar: [`${R}/clientes`] });
}
export async function excluirObra(id: string) {
  return excluirRegistro({ tabela: "obras", modulo: "cadastros", id, revalidar: [`${R}/clientes`] });
}

export async function salvarContato(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "contatos", modulo: "cadastros", id, dados, schema: contatoSchema, revalidar: [`${R}/clientes`] });
}
export async function excluirContato(id: string) {
  return excluirRegistro({ tabela: "contatos", modulo: "cadastros", id, revalidar: [`${R}/clientes`] });
}

export async function salvarLocador(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "locadores", modulo: "locadores", id, dados, schema: locadorSchema, revalidar: [`${R}/locadores`] });
}
export async function excluirLocador(id: string) {
  return excluirRegistro({ tabela: "locadores", modulo: "locadores", id, revalidar: [`${R}/locadores`] });
}

export async function salvarFornecedor(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "fornecedores", modulo: "fornecedores", id, dados, schema: fornecedorSchema, revalidar: [`${R}/fornecedores`] });
}
export async function excluirFornecedor(id: string) {
  return excluirRegistro({ tabela: "fornecedores", modulo: "fornecedores", id, revalidar: [`${R}/fornecedores`] });
}

export async function salvarCategoria(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "categorias_despesa", modulo: "categorias", id, dados, schema: categoriaSchema, revalidar: [`${R}/categorias`] });
}
export async function excluirCategoria(id: string) {
  return excluirRegistro({ tabela: "categorias_despesa", modulo: "categorias", id, revalidar: [`${R}/categorias`] });
}

export async function salvarVeiculo(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "veiculos", modulo: "veiculos", id, dados, schema: veiculoSchema, revalidar: [`${R}/veiculos`, "/manutencao"] });
}
export async function excluirVeiculo(id: string) {
  return excluirRegistro({ tabela: "veiculos", modulo: "veiculos", id, revalidar: [`${R}/veiculos`] });
}
