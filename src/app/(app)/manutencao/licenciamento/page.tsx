import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams, termoBusca } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { LicenciamentoCliente, type LinhaLicenciamento } from "./client";

export default function LicenciamentoPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const supabase = createClient();
    let q = supabase.from("licenciamento_v").select(`veiculo_id, empresa_apelido, placa, renavam, tipo, situacao, dias_para_vencer,
      documento_id, documento_numero, data_emissao, validade, anexo_url`);
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const placa = lerParams(searchParams).q?.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (placa) q = q.ilike("placa", termoBusca(placa));
    const { data: linhas } = await q.order("validade", { ascending: true, nullsFirst: true }).order("placa");
    return {
      linhas: (linhas ?? []) as LinhaLicenciamento[],
      podeEditar: podeEscrever(s.perfil, "manutencao"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <LicenciamentoCliente {...data} />;
}
