import React from "react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { ContasCliente } from "./client";

export default function ContasBancariasPage() {
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("contasBancarias");
    const supabase = createClient();
    let q = supabase
      .from("contas_bancarias")
      // "*": continua funcionando antes da migration 0078 (colunas do Itaú) estar aplicada
      .select("*, empresas(apelido)")
      .order("apelido");
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const { data: linhas } = await q;

    return {
      linhas: (linhas ?? []).map((c) => ({ ...c, empresa: c.empresas?.apelido ?? "" })),
      empresas: s.empresas.map((e) => ({ value: e.id, label: e.apelido })),
      empresaPadrao: s.empresaId,
      podeEditar: podeEscrever(s, "contasBancarias"),
    };
  }, [sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <ContasCliente {...data} />;
}
