import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { MultasCliente, type LinhaMulta } from "./client";

export default function MultasPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const p = lerParams(searchParams);
    const supabase = createClient();
    let qv = supabase.from("veiculos").select("id, placa").neq("status", "vendido").order("placa");
    if (s.empresaId) qv = qv.eq("empresa_id", s.empresaId);

    let q = supabase.from("multas_v").select(`id, veiculo_id, placa, renavam, empresa_apelido, contrato_id, contrato_numero, cliente_nome, auto_infracao,
      data_infracao, orgao, descricao, codigo, pontos, valor, vencimento, status, status_exibicao, responsavel, pago_em, anexo_url, observacoes`);
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    if (p.get("veiculo")) q = q.eq("veiculo_id", p.get("veiculo")!);
    if (p.get("responsavel")) q = q.eq("responsavel", p.get("responsavel")!);
    const status = p.get("status");
    // "pendente" no filtro inclui as vencidas (ainda não pagas)
    if (status === "pendente") q = q.eq("status", "pendente");
    else if (status) q = q.eq("status_exibicao", status);

    const [{ data: veiculos }, { data: multas }] = await Promise.all([
      qv,
      q.order("vencimento", { ascending: true, nullsFirst: false }).order("data_infracao", { ascending: false }),
    ]);

    return {
      linhas: (multas ?? []) as LinhaMulta[],
      veiculos: (veiculos ?? []).map((v) => ({ value: v.id, label: v.placa })),
      veiculoInicial: p.get("veiculo"),
      podeEditar: podeEscrever(s.perfil, "manutencao"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <MultasCliente {...data} />;
}
