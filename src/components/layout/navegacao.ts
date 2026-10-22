import {
  BarChart3, Building2, CalendarClock, ClipboardList, FileSpreadsheet, FileText, Gauge, HandCoins, Landmark, LayoutDashboard,
  Receipt, Settings, Truck, Users, Wallet, Wrench, Tags, UserSquare2, Factory, CircleDot, FileBadge, TriangleAlert, Handshake,
  type LucideIcon,
} from "lucide-react";
import type { Modulo } from "@/lib/permissoes";
import { MODO_COMERCIAL } from "@/lib/plataforma";

export interface ItemMenu {
  titulo: string;
  href: string;
  icone: LucideIcon;
  modulo: Modulo;
  /** linha de apoio no submenu do topo */
  descricao: string;
  /** coluna do submenu do topo (dentro do grupo) */
  secao?: string;
}

export interface GrupoMenu {
  titulo?: string;
  itens: ItemMenu[];
}

const MENU_COMPLETO: GrupoMenu[] = [
  { itens: [{ titulo: "Dashboard", href: "/dashboard", icone: LayoutDashboard, modulo: "dashboard", descricao: "Visão geral do mês" }] },
  {
    titulo: "Comercial",
    itens: [
      { titulo: "Propostas", href: "/comercial/propostas", icone: Handshake, modulo: "comercial", descricao: "Orçamentos de locação para clientes" },
    ],
  },
  {
    titulo: "Operação",
    itens: [
      { titulo: "Contratos", href: "/contratos", icone: FileText, modulo: "contratos", descricao: "Locações por placa e cliente", secao: "Faturamento" },
      { titulo: "Faturamento", href: "/medicoes", icone: ClipboardList, modulo: "medicoes", descricao: "Medições e notas fiscais", secao: "Faturamento" },
      { titulo: "Contas a receber", href: "/receber", icone: HandCoins, modulo: "receber", descricao: "Faturas e recebimentos", secao: "Faturamento" },
      { titulo: "Repasses", href: "/repasses", icone: Wallet, modulo: "repasses", descricao: "Pagamentos aos locadores", secao: "Financeiro" },
      { titulo: "Contas a pagar", href: "/pagar", icone: Receipt, modulo: "pagar", descricao: "Despesas e vencimentos", secao: "Financeiro" },
    ],
  },
  {
    titulo: "Frota",
    itens: [
      { titulo: "Painel da frota", href: "/manutencao", icone: Gauge, modulo: "manutencao", descricao: "Status de cada veículo", secao: "Manutenção" },
      { titulo: "Ordens de serviço", href: "/manutencao/ordens", icone: Wrench, modulo: "manutencao", descricao: "OS abertas e fechadas", secao: "Manutenção" },
      { titulo: "Planos preventivos", href: "/manutencao/planos", icone: CalendarClock, modulo: "manutencao", descricao: "Revisões programadas", secao: "Manutenção" },
      { titulo: "Leituras km/h", href: "/manutencao/leituras", icone: Gauge, modulo: "manutencao", descricao: "Hodômetro e horímetro", secao: "Controle" },
      { titulo: "Documentos", href: "/manutencao/documentos", icone: FileBadge, modulo: "manutencao", descricao: "CRLV, seguro e laudos", secao: "Controle" },
      { titulo: "Multas", href: "/manutencao/multas", icone: TriangleAlert, modulo: "manutencao", descricao: "Infrações e vencimentos", secao: "Controle" },
      { titulo: "Pneus", href: "/manutencao/pneus", icone: CircleDot, modulo: "manutencao", descricao: "Vida útil e rodízio", secao: "Controle" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { titulo: "Veículos", href: "/cadastros/veiculos", icone: Truck, modulo: "veiculos", descricao: "Frota própria e sublocada", secao: "Frota e clientes" },
      { titulo: "Clientes e obras", href: "/cadastros/clientes", icone: Building2, modulo: "cadastros", descricao: "Clientes e obras atendidas", secao: "Frota e clientes" },
      { titulo: "Locadores", href: "/cadastros/locadores", icone: UserSquare2, modulo: "locadores", descricao: "Donos dos veículos sublocados", secao: "Frota e clientes" },
      { titulo: "Fornecedores", href: "/cadastros/fornecedores", icone: Factory, modulo: "fornecedores", descricao: "Oficinas, peças e serviços", secao: "Frota e clientes" },
      { titulo: "Contas bancárias", href: "/cadastros/contas-bancarias", icone: Landmark, modulo: "contasBancarias", descricao: "Contas para baixas", secao: "Financeiro e empresa" },
      { titulo: "Categorias", href: "/cadastros/categorias", icone: Tags, modulo: "categorias", descricao: "Plano de contas", secao: "Financeiro e empresa" },
      { titulo: "Empresas", href: "/cadastros/empresas", icone: Users, modulo: "configuracoes", descricao: "Empresas do grupo", secao: "Financeiro e empresa" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { titulo: "Relatórios", href: "/relatorios", icone: BarChart3, modulo: "relatorios", descricao: "Relatórios em PDF e planilha", secao: "Análise" },
      { titulo: "Importação", href: "/configuracoes/importacao", icone: FileSpreadsheet, modulo: "configuracoes", descricao: "Importar planilhas antigas", secao: "Sistema" },
      { titulo: "Configurações", href: "/configuracoes", icone: Settings, modulo: "configuracoes", descricao: "Usuários e parâmetros", secao: "Sistema" },
    ],
  },
];

const item = (href: string) => MENU_COMPLETO.flatMap((g) => g.itens).find((i) => i.href === href)!;

/** app Android do comercial: só propostas, clientes e a consulta da frota */
export const MENU: GrupoMenu[] = MODO_COMERCIAL
  ? [{ titulo: "Comercial", itens: [item("/comercial/propostas"), item("/cadastros/clientes"), item("/cadastros/veiculos")] }]
  : MENU_COMPLETO;
