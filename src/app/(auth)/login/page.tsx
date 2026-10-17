import React from "react";
import { useSearchParams } from "react-router-dom";
import { LoginForm } from "./login-form";
import { Item, Palco } from "./animacao";
import { CenaLocacao } from "./cena-locacao";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || undefined;

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-6 baixa:py-4 curta:py-3">
      {/* bolhas de luz se movendo ao fundo */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/30 blur-3xl animate-blob" />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-blob [animation-delay:-5s]" />
        <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-foreground/10 blur-3xl animate-blob [animation-delay:-9s]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-sm animate-fade-in-up overflow-hidden rounded-3xl border border-foreground/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.15)] md:max-w-4xl md:grid-cols-2">
        <div className="flex flex-col bg-card p-8 sm:p-10 md:p-12 baixa:md:py-8 curta:py-5 curta:md:py-5">
          <Palco className="mx-auto flex w-full max-w-xs flex-1 flex-col justify-center">
            <Item className="mb-8 flex flex-col items-center gap-4 baixa:mb-5 curta:mb-3 curta:gap-2">
              <img src="/logo-oliveira.svg" alt="Oliveira Locações" className="logo-marca h-24 w-auto animate-scale-in baixa:h-20 curta:h-14" />
              <div className="text-center">
                <h1 className="text-xl font-black uppercase tracking-tight curta:text-lg">Bem-vindo de volta</h1>
                <p className="mt-1 text-xs font-medium uppercase text-muted-foreground">Acesse o sistema Oliveira Locações</p>
              </div>
            </Item>
            <LoginForm next={next} />
          </Palco>
        </div>

        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1f1f1f] via-brand-black to-black p-10 text-white md:flex baixa:p-8 curta:p-6">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -left-10 bottom-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          </div>
          <p className="relative z-10 text-2xl font-bold leading-snug baixa:text-xl curta:text-lg">
            Contratos, medições e frota da <span className="text-primary">Oliveira Locações</span> em um só lugar.
          </p>
          <div className="relative z-10 flex flex-1 items-center justify-center py-8 baixa:py-4 curta:py-2">
            <CenaLocacao />
          </div>
          <div className="relative z-10 text-center curta:hidden">
            <p className="text-xs text-white/80">Da retirada à devolução: cada locação medida, faturada e repassada.</p>
            <div aria-hidden className="mt-4 flex items-center justify-center gap-1.5 baixa:mt-3">
              <span className="h-1.5 w-6 rounded-full bg-primary" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
