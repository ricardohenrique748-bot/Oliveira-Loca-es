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
import { definirEmpresa, marcarAlertasLidos } from "./actions";
import { sair } from "@/app/(auth)/login/actions";

export interface AlertaHeader {
  id: string;
  titulo: string;
  descricao: string | null;
  severidade: "info" | "alerta" | "critico";
  link: string | null;
}

/** Saudação pela hora de São Paulo (mesma no servidor e no navegador). */
function saudacao() {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(new Date()));
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

const BOTAO_REDONDO = "relative h-10 w-10 rounded-full bg-muted text-foreground/80 hover:bg-accent hover:text-foreground";

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
  const primeiroNome = nome.trim().split(/\s+/)[0];

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b bg-card px-4 sm:px-6 lg:px-10">
      <SidebarMobile perfil={perfil} />
      <p className="min-w-0 flex-1 truncate text-lg text-muted-foreground sm:text-xl" suppressHydrationWarning>
        <span className="hidden sm:inline">{saudacao()}, </span><span className="font-semibold text-foreground">{primeiroNome}!</span>
      </p>

      <div className="relative hidden items-center md:flex">
        <Building2 className="pointer-events-none absolute left-3 z-10 h-4 w-4 text-muted-foreground" aria-hidden />
        <SelectSimples
          aria-label="Empresa"
          className={cn("h-10 w-52 pl-9", pendente && "opacity-60")}
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
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-yellow px-1 text-[10px] font-semibold text-brand-black ring-2 ring-card">
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
                <Link href={a.link ?? "/dashboard"} className="flex gap-3 px-4 py-2.5 hover:bg-muted">
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
            className="flex items-center gap-3 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 md:pr-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-yellow text-sm font-semibold text-brand-black">{iniciais(nome)}</span>
            <span className="hidden min-w-0 text-left md:block">
              <span className="block max-w-[11rem] truncate text-sm font-medium leading-tight">{nome}</span>
              <span className="block max-w-[11rem] truncate text-xs text-muted-foreground">{email}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-muted-foreground md:block" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">{nome}</span>
            <span className="block text-xs text-muted-foreground">{PERFIS.find((p) => p.valor === perfil)?.rotulo}</span>
          </DropdownMenuLabel>
          {/* no celular o seletor de empresa sai do cabeçalho e vem para cá */}
          <div className="px-2 pb-2 md:hidden">
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
    </header>
  );
}
