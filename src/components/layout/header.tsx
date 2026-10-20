"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTheme } from "next-themes";
import { Bell, Building2, ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/basicos";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/overlays";
import { SelectSimples } from "@/components/ui/select";
import { PERFIS, type Perfil } from "@/lib/permissoes";
import { cn } from "@/lib/utils";
import { iniciais, SidebarMobile } from "./sidebar";
import { MenuTopo } from "./menu-topo";
import { definirEmpresa, marcarAlertasLidos } from "./actions";
import { sair } from "@/app/(auth)/login/actions";
import { INICIO } from "@/lib/plataforma";

export interface AlertaHeader {
  id: string;
  titulo: string;
  descricao: string | null;
  severidade: "info" | "alerta" | "critico";
  link: string | null;
}

const BOTAO_REDONDO = "relative h-10 w-10 rounded-xl border border-foreground/[0.06] bg-card text-muted-foreground shadow-sm hover:bg-card hover:text-foreground";

export function Header({
  nome, email, perfil, empresas, empresaId, alertas,
}: {
  nome: string;
  email: string;
  perfil: Perfil;
  empresas: { id: string; apelido: string }[];
  empresaId: string | null;
  alertas: AlertaHeader[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const { resolvedTheme, setTheme } = useTheme();
  const naoLidos = alertas.length;

  return (
    <header className="sticky top-0 z-30 border-b border-foreground/[0.06] bg-background/80 backdrop-blur-xl">
     <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-10">
      <SidebarMobile perfil={perfil} nome={nome} />
      <Link href={INICIO} aria-label="Oliveira Locações — início"
        className="flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        <img src="/logo-oliveira.svg" alt="Oliveira Locações" className="logo-marca h-10 w-auto" />
      </Link>
      <MenuTopo perfil={perfil} className="hidden lg:block" />
      <div className="flex-1" />

      <div className="relative hidden items-center xl:flex">
        <Building2 className="pointer-events-none absolute left-3 z-10 h-4 w-4 text-muted-foreground" aria-hidden />
        <SelectSimples
          aria-label="Empresa"
          className={cn("h-10 w-52 bg-card pl-9 shadow-sm", pendente && "opacity-60")}
          value={empresaId}
          vazio="Todas as empresas"
          opcoes={empresas.map((e) => ({ value: e.id, label: e.apelido }))}
          onChange={(v) => iniciar(async () => { await definirEmpresa(v); router.refresh(); })}
        />
      </div>

      <Button variant="ghost" size="icon" className={BOTAO_REDONDO} aria-label="Alternar tema"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
        <Moon className="h-[18px] w-[18px] dark:hidden" />
        <Sun className="hidden h-[18px] w-[18px] dark:block" />
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className={BOTAO_REDONDO} aria-label={`Alertas (${naoLidos})`}>
            <Bell className="h-[18px] w-[18px]" />
            {naoLidos > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-background animate-pulse">
                {naoLidos > 99 ? "99+" : naoLidos}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-medium">Alertas de hoje</p>
            {naoLidos > 0 && (
              <Button size="xs" variant="ghost" onClick={() => iniciar(async () => { await marcarAlertasLidos(alertas.map((a) => a.id)); router.refresh(); })}>
                Marcar como lidos
              </Button>
            )}
          </div>
          <ul className="max-h-96 divide-y overflow-y-auto">
            {alertas.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum alerta pendente 🎉</li>}
            {alertas.map((a) => (
              <li key={a.id}>
                <Link href={a.link ?? INICIO} className="flex gap-3 px-4 py-2.5 hover:bg-muted">
                  <Badge variant={a.severidade === "critico" ? "critico" : a.severidade === "alerta" ? "alerta" : "info"} className="mt-1.5 h-2 w-2 shrink-0 border-0 p-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{a.titulo}</span>
                    {a.descricao && <span className="block truncate text-xs text-muted-foreground">{a.descricao}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Menu do usuário"
            className="flex items-center gap-3 rounded-xl py-1 pl-1 pr-1 transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 2xl:pr-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary-ink">{iniciais(nome)}</span>
            <span className="hidden min-w-0 text-left 2xl:block">
              <span className="block max-w-[11rem] truncate text-sm font-medium leading-tight">{nome}</span>
              <span className="block max-w-[11rem] truncate text-xs text-muted-foreground">{email}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-muted-foreground 2xl:block" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">{nome}</span>
            <span className="block text-xs text-muted-foreground">{PERFIS.find((p) => p.valor === perfil)?.rotulo}</span>
          </DropdownMenuLabel>
          {/* em telas menores o seletor de empresa sai do cabeçalho e vem para cá */}
          <div className="px-2 pb-2 xl:hidden">
            <SelectSimples
              aria-label="Empresa"
              className={cn("h-9", pendente && "opacity-60")}
              value={empresaId}
              vazio="Todas as empresas"
              opcoes={empresas.map((e) => ({ value: e.id, label: e.apelido }))}
              onChange={(v) => iniciar(async () => { await definirEmpresa(v); router.refresh(); })}
            />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => iniciar(() => sair())}>
            <LogOut /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
     </div>
    </header>
  );
}
