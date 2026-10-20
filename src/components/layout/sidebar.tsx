"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { LogOut, Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { podeLer, PERFIS, type Perfil } from "@/lib/permissoes";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { sair } from "@/app/(auth)/login/actions";
import { MENU } from "./navegacao";
import { INICIO } from "@/lib/plataforma";

export function ativo(pathname: string, href: string) {
  if (href === "/manutencao") return pathname === "/manutencao";
  if (href === "/configuracoes") return pathname === "/configuracoes" || pathname.startsWith("/configuracoes/usuarios");
  return pathname === href || pathname.startsWith(href + "/");
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Navegacao({ perfil, aoNavegar }: { perfil: Perfil; aoNavegar?: () => void }) {
  const pathname = usePathname();
  const [busca, setBusca] = useState("");
  const termo = normalizar(busca.trim());
  const grupos = MENU
    .map((g) => ({ ...g, itens: g.itens.filter((it) => podeLer(perfil, it.modulo) && (!termo || normalizar(it.titulo).includes(termo))) }))
    .filter((g) => g.itens.length);

  return (
    <>
      <div className="shrink-0 px-2.5 pb-1.5 pt-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no menu…" aria-label="Buscar no menu"
            className="h-8 w-full rounded-lg border border-foreground/[0.06] bg-foreground/5 pl-8 pr-2.5 text-[13px] text-foreground transition-all placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
      </div>
      <nav aria-label="Menu principal" className="flex-1 space-y-4 overflow-y-auto px-2.5 py-2">
        {grupos.map((grupo, i) => (
          <div key={i} className="space-y-1">
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{grupo.titulo ?? "Menu"}</p>
            {grupo.itens.map((it) => {
              const a = ativo(pathname, it.href);
              return (
                <Link key={it.href} href={it.href} onClick={aoNavegar} aria-current={a ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    a ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  )}>
                  {a && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
                  <it.icone className={cn("h-[18px] w-[18px] shrink-0", a ? "text-primary-ink" : "text-muted-foreground/70 group-hover:text-foreground")} aria-hidden />
                  <span className="truncate">{it.titulo}</span>
                </Link>
              );
            })}
          </div>
        ))}
        {!grupos.length && <p className="px-2 py-1.5 text-xs text-muted-foreground/60">Nenhum resultado.</p>}
      </nav>
    </>
  );
}

function Logo() {
  return (
    <div className="flex h-16 shrink-0 items-center border-b border-foreground/[0.06] px-3">
      <Link href={INICIO} className="flex w-full items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <img src="/logo-oliveira.svg" alt="Oliveira Locações" className="logo-marca h-10 w-auto" />
      </Link>
    </div>
  );
}

function Usuario({ nome, perfil }: { nome: string; perfil: Perfil }) {
  const [pendente, iniciar] = useTransition();
  return (
    <div className="shrink-0 border-t border-foreground/[0.06] p-2">
      <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary-ink">{iniciais(nome)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">{nome}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-status-ok" aria-hidden />
            {PERFIS.find((p) => p.valor === perfil)?.rotulo ?? "Online"}
          </p>
        </div>
        <button type="button" disabled={pendente} onClick={() => iniciar(() => sair())} aria-label="Sair" title="Sair"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60">
          <LogOut className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function SidebarMobile({ perfil, nome }: { perfil: Perfil; nome: string }) {
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
        <Usuario nome={nome} perfil={perfil} />
      </SheetContent>
    </Sheet>
  );
}
