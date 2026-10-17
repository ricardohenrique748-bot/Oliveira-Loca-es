import React from "react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { CategoriasCliente } from "./client";

export default function CategoriasPage() {
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("categorias");
    const supabase = createClient();
    const { data: linhas } = await supabase.from("categorias_despesa").select("id, nome, tipo, ativo").order("tipo").order("nome");
    return {
      linhas: linhas ?? [],
      podeEditar: podeEscrever(s.perfil, "categorias"),
    };
  }, [sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <CategoriasCliente {...data} />;
}
