import React from "react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { LicenciamentoCliente, type LinhaLicenciamento } from "./client";

export default function LicenciamentoPage() {
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const supabase = createClient();
    let q = supabase.from("licenciamento_v").select(`veiculo_id, empresa_apelido, placa, renavam, tipo, situacao, dias_para_vencer,
      documento_id, documento_numero, data_emissao, validade, anexo_url`);
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const { data: linhas } = await q.order("validade", { ascending: true, nullsFirst: true }).order("placa");
    return {
      linhas: (linhas ?? []) as LinhaLicenciamento[],
      podeEditar: podeEscrever(s.perfil, "manutencao"),
    };
  }, [sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <LicenciamentoCliente {...data} />;
}
