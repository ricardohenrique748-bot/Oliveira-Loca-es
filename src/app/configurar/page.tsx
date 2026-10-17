import React from "react";
import { Navigate } from "react-router-dom";
import { supabaseEnv } from "@/lib/supabase/env";

const Codigo = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-brand-yellow">{children}</code>
);

/** Exibida quando o .env.local ainda não tem as chaves do Supabase. */
export default function Configurar() {
  if (supabaseEnv()) return <Navigate to="/login" replace />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-black p-4 text-neutral-200">
      <div className="w-full max-w-2xl space-y-6 rounded-lg border border-neutral-800 bg-neutral-950 p-6">
        <img src="/logo-oliveira.svg" alt="Oliveira Locações" className="h-24 w-auto" />
        <div>
          <h1 className="text-2xl text-brand-yellow">Falta conectar o banco de dados</h1>
          <p className="mt-1 text-sm text-neutral-400">
            O arquivo <Codigo>.env.local</Codigo> na pasta do projeto ainda não tem a URL e a chave do Supabase.
          </p>
        </div>

        <section className="space-y-2 text-sm">
          <h2 className="text-lg text-white">Opção A — Supabase na nuvem (mais simples, sem Docker)</h2>
          <ol className="list-inside list-decimal space-y-1.5 text-neutral-300">
            <li>Crie um projeto em <a className="underline" href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com/dashboard</a>, região <strong>South America (São Paulo)</strong>.</li>
            <li>Em <em>Project Settings → API</em>, copie a <strong>Project URL</strong>, a chave <strong>anon public</strong> e a <strong>service_role</strong>.</li>
            <li>Cole no <Codigo>.env.local</Codigo> (veja o modelo abaixo).</li>
            <li>No terminal: <Codigo>npx supabase login</Codigo>, <Codigo>npx supabase link --project-ref SEU_REF</Codigo> e <Codigo>npx supabase db push --include-seed</Codigo>.</li>
          </ol>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="text-lg text-white">Opção B — Supabase local (exige Docker Desktop funcionando)</h2>
          <ol className="list-inside list-decimal space-y-1.5 text-neutral-300">
            <li><Codigo>npx supabase start</Codigo> — ao final ele imprime <em>API URL</em>, <em>anon key</em> e <em>service_role key</em>.</li>
            <li>Cole esses valores no <Codigo>.env.local</Codigo>.</li>
            <li><Codigo>npx supabase db reset</Codigo> — cria as tabelas e os dados de exemplo.</li>
          </ol>
        </section>

        <pre className="overflow-x-auto rounded-md bg-black p-4 text-xs text-neutral-300">{`NEXT_PUBLIC_SUPABASE_URL=https://SEU_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000`}</pre>

        <p className="text-sm text-neutral-400">
          Depois de salvar o arquivo, <strong className="text-white">pare e inicie de novo</strong> o <Codigo>npm run dev</Codigo> (o Next só lê o .env.local na inicialização) e recarregue esta página.
          Usuário de teste do seed: <Codigo>admin@oliveira.local</Codigo> / <Codigo>Oliveira@2026</Codigo>.
        </p>
      </div>
    </main>
  );
}
