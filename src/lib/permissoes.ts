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

/** Quem está pedindo: só um perfil, ou a sessão (setor principal + setores extras + marcações por usuário). */
export type Quem = Perfil | { perfil: Perfil; perfisExtras?: readonly Perfil[]; soFaturasAvulsas?: boolean } | null | undefined;

/** Todos os setores (perfis) de quem está pedindo; espelha app.perfis_atuais() da migration 0080. */
export function perfisDe(q: Quem): Perfil[] {
  if (!q) return [];
  return typeof q === "string" ? [q] : [q.perfil, ...(q.perfisExtras ?? [])];
}

/** tem algum destes setores? */
export function temPerfil(q: Quem, ...perfis: Perfil[]): boolean {
  return perfisDe(q).some((p) => perfis.includes(p));
}

/** "Ver só faturas avulsas" também tira a tela de Contratos (admin sempre vê, como no RLS da 0073) */
const semContratos = (q: Quem, modulo: Modulo) => modulo === "contratos" && typeof q === "object" && !!q?.soFaturasAvulsas && !temPerfil(q, "admin");

export function podeLer(quem: Quem, modulo: Modulo): boolean {
  if (semContratos(quem, modulo)) return false;
  return temPerfil(quem, ...(MODULOS[modulo].ler as readonly Perfil[]));
}

export function podeEscrever(quem: Quem, modulo: Modulo): boolean {
  if (semContratos(quem, modulo)) return false;
  return temPerfil(quem, ...(MODULOS[modulo].escrever as readonly Perfil[]));
}

/** LGPD: CPF/CNPJ e PIX de locadores só para admin e financeiro. */
export function veDadosSensiveis(quem: Quem): boolean {
  return temPerfil(quem, "admin", "financeiro");
}

/** Vê valores de receita: qualquer setor que não seja só Manutenção. */
export function veReceita(quem: Quem): boolean {
  return perfisDe(quem).some((p) => p !== "manutencao");
}

/** Setor principal gravado em usuarios_perfil.perfil quando há vários marcados (o de mais acesso). */
export const ORDEM_PERFIS: readonly Perfil[] = ["admin", "financeiro", "faturamento", "manutencao", "comercial", "consulta"];
export function separarPerfis(perfis: readonly Perfil[]): { perfil: Perfil; extras: Perfil[] } {
  const marcados = ORDEM_PERFIS.filter((p) => perfis.includes(p));
  if (marcados.includes("admin")) return { perfil: "admin", extras: [] };
  const [perfil = "consulta", ...extras] = marcados;
  return { perfil, extras };
}
