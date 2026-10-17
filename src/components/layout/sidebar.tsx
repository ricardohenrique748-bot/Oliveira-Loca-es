"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { podeLer, type Perfil } from "@/lib/permissoes";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { sair } from "@/app/(auth)/login/actions";
import { MENU } from "./navegacao";

function ativo(pathname: string, href: string) {
  if (href === "/manutencao") return pathname === "/manutencao";
  if (href === "/configuracoes") return pathname === "/configuracoes" || pathname.startsWith("/configuracoes/usuarios");
  return pathname === href || pathname.startsWith(href + "/");
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function Navegacao({ perfil, aoNavegar }: { perfil: Perfil; aoNavegar?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
      {MENU.map((grupo, i) => {
        const itens = grupo.itens.filter((it) => podeLer(perfil, it.modulo));
        if (!itens.length) return null;
        return (
          <div key={i} className="space-y-1">
            {grupo.titulo && <p className="px-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">{grupo.titulo}</p>}
            {itens.map((it) => {
              const a = ativo(pathname, it.href);
              return (
                <Link key={it.href} href={it.href} onClick={aoNavegar} aria-current={a ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-4 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
                    a ? "bg-brand-yellow font-semibold text-brand-black shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}>
                  <it.icone className={cn("h-[18px] w-[18px] shrink-0", a ? "text-brand-black" : "text-muted-foreground/70 group-hover:text-foreground")} aria-hidden />
                  {it.titulo}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Logo() {
  return (
    <div className="shrink-0 px-5 pt-5">
      <Link href="/dashboard" className="flex items-center justify-center rounded-md bg-brand-black px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <img src="/logo-oliveira.svg" alt="Oliveira Locações" className="h-12 w-auto" />
      </Link>
    </div>
  );
}

function Sair() {
  const [pendente, iniciar] = useTransition();
  return (
    <div className="shrink-0 border-t px-5 py-4">
      <button type="button" disabled={pendente} onClick={() => iniciar(() => sair())}
        className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60">
        <LogOut className="h-[18px] w-[18px]" aria-hidden />
        Sair
      </button>
    </div>
  );
}

export function Sidebar({ perfil }: { perfil: Perfil }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17rem] flex-col border-r bg-card lg:flex">
      <Logo />
      <Navegacao perfil={perfil} />
      <Sair />
    </aside>
  );
}

export function SidebarMobile({ perfil }: { perfil: Perfil }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col bg-card p-0" aria-describedby={undefined}>
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <Logo />
        <Navegacao perfil={perfil} aoNavegar={() => setAberto(false)} />
        <Sair />
      </SheetContent>
    </Sheet>
  );
}
