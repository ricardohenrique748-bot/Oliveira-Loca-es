import React, { useEffect, useState, useCallback } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { hojeSP } from "@/lib/format";
import { Sidebar } from "@/components/layout/sidebar";
import { Header, type AlertaHeader } from "@/components/layout/header";

export default function AppLayout({ children }: { children?: React.ReactNode }) {
  const { sessao, loading } = useAuth();
  const [alertas, setAlertas] = useState<AlertaHeader[]>([]);

  const carregarAlertas = useCallback(async () => {
    if (!sessao) return;
    try {
      const supabase = createClient();
      let q = supabase
        .from("alertas")
        .select("id, titulo, descricao, severidade, link")
        .eq("lida", false)
        .gte("data_ref", hojeSP())
        .order("severidade", { ascending: false })
        .limit(50);
      if (sessao.empresaId) q = q.or(`empresa_id.eq.${sessao.empresaId},empresa_id.is.null`);
      const { data } = await q;
      setAlertas((data ?? []) as AlertaHeader[]);
    } catch {
      // silencioso
    }
  }, [sessao]);

  useEffect(() => {
    carregarAlertas();
    const aoAtualizar = () => carregarAlertas();
    window.addEventListener("oliveira:refresh", aoAtualizar);
    window.addEventListener("oliveira:empresa", aoAtualizar);
    return () => {
      window.removeEventListener("oliveira:refresh", aoAtualizar);
      window.removeEventListener("oliveira:empresa", aoAtualizar);
    };
  }, [carregarAlertas]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo-oliveira.svg" alt="Oliveira Locações" className="h-12 w-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Carregando painel...</p>
        </div>
      </div>
    );
  }

  if (!sessao) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-brand-yellow focus:px-3 focus:py-2 focus:text-brand-black"
      >
        Pular para o conteúdo
      </a>
      <Sidebar perfil={sessao.perfil} />
      <div className="lg:pl-[17rem]">
        <Header
          nome={sessao.nome}
          email={sessao.email}
          perfil={sessao.perfil}
          empresas={sessao.empresas}
          empresaId={sessao.empresaId}
          alertas={alertas}
        />
        <main id="conteudo" className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
