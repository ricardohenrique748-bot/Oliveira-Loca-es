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
      .select("id, empresa_id, banco, agencia, conta, posto, codigo_beneficiario, apelido, ativo, boleto_multa_pct, boleto_juros_mes_pct, boleto_apos_vencimento, boleto_dias_apos_vencimento, empresas(apelido)")
      .order("apelido");
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const { data: linhas } = await q;

    return {
      linhas: (linhas ?? []).map((c) => ({ ...c, empresa: c.empresas?.apelido ?? "" })),
      empresas: s.empresas.map((e) => ({ value: e.id, label: e.apelido })),
      empresaPadrao: s.empresaId,
      podeEditar: podeEscrever(s.perfil, "contasBancarias"),
    };
  }, [sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <ContasCliente {...data} />;
}
