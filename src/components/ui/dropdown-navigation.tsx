"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavSubItem {
  label: string;
  description?: string;
  icon: React.ElementType;
  href: string;
  active?: boolean;
}

export interface NavItem {
  id: string | number;
  label: string;
  /** item sem submenu: vira link direto */
  link?: string;
  active?: boolean;
  subMenus?: { title: string; items: NavSubItem[] }[];
}

/** Menu horizontal com submenus em painel que "desliza" de um item para outro (hover, clique ou teclado). */
export function DropdownNavigation({ navItems, className }: { navItems: NavItem[]; className?: string }) {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [isHover, setIsHover] = React.useState<string | number | null>(null);

  const pill = (item: NavItem) =>
    (isHover === item.id || openMenu === item.label) && (
      <motion.span layoutId="hover-bg" aria-hidden className="absolute inset-0 -z-10 size-full rounded-full bg-primary/15" transition={{ type: "spring", bounce: 0.15, duration: 0.4 }} />
    );

  const classeBotao = (item: NavItem) => cn(
    "relative isolate flex cursor-pointer items-center justify-center gap-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
    item.active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
  );

  return (
    <nav aria-label="Menu principal" className={className} onKeyDown={(e) => e.key === "Escape" && setOpenMenu(null)}>
      <ul className="relative flex items-center">
        {navItems.map((navItem) => (
          <li
            key={navItem.id}
            className="relative"
            onMouseEnter={() => setOpenMenu(navItem.subMenus ? navItem.label : null)}
            onMouseLeave={() => setOpenMenu(null)}
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpenMenu(null)}
          >
            {navItem.subMenus ? (
              <button
                type="button"
                aria-expanded={openMenu === navItem.label}
                aria-haspopup="true"
                className={cn(classeBotao(navItem), "group")}
                onMouseEnter={() => setIsHover(navItem.id)}
                onMouseLeave={() => setIsHover(null)}
                onFocus={() => setIsHover(navItem.id)}
                onClick={() => setOpenMenu((m) => (m === navItem.label ? null : navItem.label))}
              >
                {navItem.active && <span aria-hidden className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary-ink" />}
                <span>{navItem.label}</span>
                <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform duration-300", openMenu === navItem.label && "rotate-180")} />
                {pill(navItem)}
              </button>
            ) : (
              <Link
                href={navItem.link ?? "#"}
                aria-current={navItem.active ? "page" : undefined}
                className={classeBotao(navItem)}
                onMouseEnter={() => setIsHover(navItem.id)}
                onMouseLeave={() => setIsHover(null)}
              >
                {navItem.active && <span aria-hidden className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary-ink" />}
                <span>{navItem.label}</span>
                {pill(navItem)}
              </Link>
            )}

            <AnimatePresence>
              {openMenu === navItem.label && navItem.subMenus && (
                <div className="absolute left-0 top-full z-50 w-auto pt-2">
                  <motion.div
                    layoutId="menu"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                    className="w-max rounded-2xl border border-foreground/[0.08] bg-popover p-4 shadow-2xl shadow-black/20 dark:shadow-black/60"
                  >
                    <div className="flex w-fit shrink-0 space-x-9 overflow-hidden">
                      {navItem.subMenus.map((sub) => (
                        <motion.div layout className="w-full" key={sub.title}>
                          <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{sub.title}</h3>
                          <ul className="space-y-4">
                            {sub.items.map((item) => {
                              const Icon = item.icon;
                              return (
                                <li key={item.href}>
                                  <Link
                                    href={item.href}
                                    aria-current={item.active ? "page" : undefined}
                                    onClick={() => setOpenMenu(null)}
                                    className="group flex items-start space-x-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                  >
                                    <div className={cn(
                                      "flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors duration-300",
                                      item.active
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-foreground/10 text-foreground group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground",
                                    )}>
                                      <Icon className="h-[18px] w-[18px] flex-none" aria-hidden />
                                    </div>
                                    <div className="w-max leading-5">
                                      <p className="shrink-0 text-sm font-medium text-foreground">{item.label}</p>
                                      {item.description && (
                                        <p className="shrink-0 text-xs text-muted-foreground transition-colors duration-300 group-hover:text-foreground">{item.description}</p>
                                      )}
                                    </div>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </li>
        ))}
      </ul>
    </nav>
  );
}
