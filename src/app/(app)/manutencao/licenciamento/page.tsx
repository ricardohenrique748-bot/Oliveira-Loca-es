import React from "react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { hojeSP } from "@/lib/calculos";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { LicenciamentoCliente, type LinhaLicenciamento, type LinhaCalendario } from "./client";

export default function LicenciamentoPage() {
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const supabase = createClient();
    const ano = Number(hojeSP().slice(0, 4));
    let q = supabase.from("licenciamento_v").select(`veiculo_id, empresa_apelido, placa, renavam, tipo, calendario_licenciamento, licenciado_exercicio,
      licenciamento_verificado_em, licenciamento_fonte, exercicio, final, vencimento, calendario_fonte, situacao, dias_para_vencer`);
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const [{ data: linhas }, { data: calendario }] = await Promise.all([
      q.order("vencimento", { ascending: true, nullsFirst: false }).order("placa"),
      supabase.from("calendario_licenciamento").select("ano, grupo, final, vencimento, fonte").in("ano", [ano, ano + 1]),
    ]);
    return {
      linhas: (linhas ?? []) as LinhaLicenciamento[],
      calendario: (calendario ?? []) as LinhaCalendario[],
      ano,
      podeEditar: podeEscrever(s.perfil, "manutencao"),
    };
  }, [sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <LicenciamentoCliente {...data} />;
}
