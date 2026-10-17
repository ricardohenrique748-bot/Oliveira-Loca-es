import {
  BarChart3, Building2, CalendarClock, ClipboardList, FileSpreadsheet, FileText, Gauge, HandCoins, Landmark, LayoutDashboard,
  Receipt, Settings, Truck, Users, Wallet, Wrench, Tags, UserSquare2, Factory, CircleDot, FileBadge,
  type LucideIcon,
} from "lucide-react";
import type { Modulo } from "@/lib/permissoes";

export interface ItemMenu {
  titulo: string;
  href: string;
  icone: LucideIcon;
  modulo: Modulo;
}

export interface GrupoMenu {
  titulo?: string;
  itens: ItemMenu[];
}

export const MENU: GrupoMenu[] = [
  { itens: [{ titulo: "Dashboard", href: "/dashboard", icone: LayoutDashboard, modulo: "dashboard" }] },
  {
    titulo: "Operação",
    itens: [
      { titulo: "Contratos", href: "/contratos", icone: FileText, modulo: "contratos" },
      { titulo: "Medições", href: "/medicoes", icone: ClipboardList, modulo: "medicoes" },
      { titulo: "Contas a receber", href: "/receber", icone: HandCoins, modulo: "receber" },
      { titulo: "Repasses", href: "/repasses", icone: Wallet, modulo: "repasses" },
      { titulo: "Contas a pagar", href: "/pagar", icone: Receipt, modulo: "pagar" },
    ],
  },
  {
    titulo: "Frota",
    itens: [
      { titulo: "Painel da frota", href: "/manutencao", icone: Gauge, modulo: "manutencao" },
      { titulo: "Ordens de serviço", href: "/manutencao/ordens", icone: Wrench, modulo: "manutencao" },
      { titulo: "Planos preventivos", href: "/manutencao/planos", icone: CalendarClock, modulo: "manutencao" },
      { titulo: "Leituras km/h", href: "/manutencao/leituras", icone: Gauge, modulo: "manutencao" },
      { titulo: "Documentos", href: "/manutencao/documentos", icone: FileBadge, modulo: "manutencao" },
      { titulo: "Pneus", href: "/manutencao/pneus", icone: CircleDot, modulo: "manutencao" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { titulo: "Veículos", href: "/cadastros/veiculos", icone: Truck, modulo: "veiculos" },
      { titulo: "Clientes e obras", href: "/cadastros/clientes", icone: Building2, modulo: "cadastros" },
      { titulo: "Locadores", href: "/cadastros/locadores", icone: UserSquare2, modulo: "locadores" },
      { titulo: "Fornecedores", href: "/cadastros/fornecedores", icone: Factory, modulo: "fornecedores" },
      { titulo: "Contas bancárias", href: "/cadastros/contas-bancarias", icone: Landmark, modulo: "contasBancarias" },
      { titulo: "Categorias", href: "/cadastros/categorias", icone: Tags, modulo: "categorias" },
      { titulo: "Empresas", href: "/cadastros/empresas", icone: Users, modulo: "configuracoes" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { titulo: "Relatórios", href: "/relatorios", icone: BarChart3, modulo: "relatorios" },
      { titulo: "Importação", href: "/configuracoes/importacao", icone: FileSpreadsheet, modulo: "configuracoes" },
      { titulo: "Configurações", href: "/configuracoes", icone: Settings, modulo: "configuracoes" },
    ],
  },
];
