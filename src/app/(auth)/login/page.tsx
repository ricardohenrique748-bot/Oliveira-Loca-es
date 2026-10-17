import React from "react";
import { useSearchParams } from "react-router-dom";
import { LoginForm } from "./login-form";
import { Estrada, Item, Palco, Traco } from "./animacao";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || undefined;

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-brand-black text-white">
      {/* fundo: grade sutil que some nas bordas + brilho amarelo respirando atrás da logo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[18%] h-72 w-[36rem] max-w-[120vw] -translate-x-1/2 rounded-full bg-brand-yellow/[0.16] blur-3xl animate-[login-brilho_8s_ease-in-out_infinite]"
      />

      <div className="relative flex flex-1 items-center justify-center px-4 pt-8 [@media(max-height:800px)]:pt-4">
        <Palco className="w-full max-w-sm space-y-10 [@media(max-height:800px)]:space-y-6">
          <div className="flex flex-col items-center gap-5 [@media(max-height:800px)]:gap-3">
            <Item>
              <img src="/logo-oliveira.svg" alt="Oliveira Locações" className="h-40 w-auto [@media(max-height:800px)]:h-28" />
            </Item>
            <Traco />
          </div>

          <LoginForm next={next} />
        </Palco>
      </div>

      <Estrada />
    </main>
  );
}
