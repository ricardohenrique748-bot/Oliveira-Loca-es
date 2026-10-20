import type { Enums } from "@/lib/supabase/database.types";

export type Perfil = Enums<"perfil_usuario">;

export const PERFIS: { valor: Perfil; rotulo: string; descricao: string }[] = [
  { valor: "admin", rotulo: "Administrador", descricao: "Tudo, inclusive usuários e configurações" },
  { valor: "financeiro", rotulo: "Financeiro", descricao: "Medições, receber, repasses, pagar e relatórios" },
  { valor: "faturamento", rotulo: "Faturamento", descricao: "Contratos, medições e contas a receber" },
  { valor: "manutencao", rotulo: "Manutenção", descricao: "Veículos, planos, OS, documentos e leituras" },
  { valor: "consulta", rotulo: "Consulta", descricao: "Somente leitura do dashboard e relatórios" },
  { valor: "comercial", rotulo: "Comercial", descricao: "Propostas, clientes e consulta da frota (sem financeiro)" },
];

/** Módulos do sistema × perfis (espelha a matriz de RLS em 0005_rls.sql). */
export const MODULOS = {
  dashboard: { ler: ["admin", "financeiro", "faturamento", "manutencao", "consulta"], escrever: [] },
  cadastros: { ler: ["admin", "financeiro", "faturamento", "manutencao", "consulta", "comercial"], escrever: ["admin", "financeiro", "faturamento", "comercial"] },
  locadores: { ler: ["admin", "financeiro"], escrever: ["admin", "financeiro"] },
  veiculos: { ler: ["admin", "financeiro", "faturamento", "manutencao", "consulta", "comercial"], escrever: ["admin", "financeiro", "manutencao"] },
  fornecedores: { ler: ["admin", "financeiro", "faturamento", "manutencao", "consulta"], escrever: ["admin", "financeiro", "manutencao"] },
  contasBancarias: { ler: ["admin", "financeiro", "faturamento", "consulta"], escrever: ["admin", "financeiro"] },
  categorias: { ler: ["admin", "financeiro", "faturamento", "manutencao", "consulta"], escrever: ["admin", "financeiro"] },
  comercial: { ler: ["admin", "financeiro", "faturamento", "consulta", "comercial"], escrever: ["admin", "faturamento", "comercial"] },
  contratos: { ler: ["admin", "financeiro", "faturamento", "consulta"], escrever: ["admin", "financeiro", "faturamento"] },
  medicoes: { ler: ["admin", "financeiro", "faturamento", "consulta"], escrever: ["admin", "financeiro", "faturamento"] },
  receber: { ler: ["admin", "financeiro", "faturamento", "consulta"], escrever: ["admin", "financeiro", "faturamento"] },
  repasses: { ler: ["admin", "financeiro", "consulta"], escrever: ["admin", "financeiro"] },
  pagar: { ler: ["admin", "financeiro", "consulta"], escrever: ["admin", "financeiro"] },
  manutencao: { ler: ["admin", "financeiro", "faturamento", "manutencao", "consulta"], escrever: ["admin", "manutencao"] },
  relatorios: { ler: ["admin", "financeiro", "faturamento", "consulta"], escrever: [] },
  configuracoes: { ler: ["admin"], escrever: ["admin"] },
} as const satisfies Record<string, { ler: readonly Perfil[]; escrever: readonly Perfil[] }>;

export type Modulo = keyof typeof MODULOS;

export function podeLer(perfil: Perfil | null | undefined, modulo: Modulo): boolean {
  return !!perfil && (MODULOS[modulo].ler as readonly Perfil[]).includes(perfil);
}

export function podeEscrever(perfil: Perfil | null | undefined, modulo: Modulo): boolean {
  return !!perfil && (MODULOS[modulo].escrever as readonly Perfil[]).includes(perfil);
}

/** LGPD: CPF/CNPJ e PIX de locadores só para admin e financeiro. */
export function veDadosSensiveis(perfil: Perfil | null | undefined): boolean {
  return perfil === "admin" || perfil === "financeiro";
}

/** Perfis que veem valores de receita (manutenção não vê). */
export function veReceita(perfil: Perfil | null | undefined): boolean {
  return !!perfil && perfil !== "manutencao";
}
