"use client";
import { usePathname } from "next/navigation";
import { DropdownNavigation, type NavItem } from "@/components/ui/dropdown-navigation";
import { podeLer, type Perfil } from "@/lib/permissoes";
import { ativo } from "./sidebar";
import { MENU } from "./navegacao";

/** Navegação principal no topo (desktop): cada grupo do MENU vira um item com submenu em colunas por seção. */
export function MenuTopo({ perfil, className }: { perfil: Perfil; className?: string }) {
  const pathname = usePathname();
  // "/configuracoes/importacao" também casa com "/configuracoes": vale o item mais específico
  const marcado = MENU.flatMap((g) => g.itens).filter((it) => ativo(pathname, it.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const itens: NavItem[] = MENU.flatMap((grupo): NavItem[] => {
    const visiveis = grupo.itens.filter((it) => podeLer(perfil, it.modulo));
    if (!visiveis.length) return [];
    if (!grupo.titulo) return visiveis.map((it) => ({ id: it.href, label: it.titulo, link: it.href, active: it.href === marcado }));

    const secoes = new Map<string, typeof visiveis>();
    for (const it of visiveis) {
      const s = it.secao ?? grupo.titulo;
      secoes.set(s, [...(secoes.get(s) ?? []), it]);
    }
    return [{
      id: grupo.titulo,
      label: grupo.titulo,
      active: visiveis.some((it) => it.href === marcado),
      subMenus: [...secoes].map(([titulo, lista]) => ({
        title: titulo,
        items: lista.map((it) => ({ label: it.titulo, description: it.descricao, icon: it.icone, href: it.href, active: it.href === marcado })),
      })),
    }];
  });

  return <DropdownNavigation navItems={itens} className={className} />;
}
