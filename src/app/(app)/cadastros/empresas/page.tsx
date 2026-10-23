import React from "react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { EmpresasCliente } from "./client";

export default function EmpresasPage() {
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("configuracoes");
    const supabase = createClient();
    const { data: linhas } = await supabase.from("empresas").select("id, apelido, razao_social, cnpj, ativo, endereco, cidade, uf, contato_nome, telefone, email, inscricao_municipal, regime_tributario, codigo_ibge, nfse_codigo_servico, nfse_aliquota_iss, nfse_texto_complementar").order("apelido");
    return {
      linhas: linhas ?? [],
      podeEditar: podeEscrever(s.perfil, "configuracoes"),
    };
  }, [sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <EmpresasCliente {...data} />;
}
