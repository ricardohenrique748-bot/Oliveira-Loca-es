import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams } from "@/lib/consulta";
import { getConfig } from "@/lib/config";
import { addCompetencia, competenciaDe, hojeSP } from "@/lib/calculos";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { MedicoesCliente, type LinhaMedicao } from "./client";

export default function MedicoesPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("medicoes");
    const p = lerParams(searchParams, { tamanho: 200 });
    const supabase = createClient();
    const cfg = await getConfig();
    const padrao = addCompetencia(competenciaDe(hojeSP()), -1);
    const comp = p.get("comp") ?? padrao;

    let q = supabase.from("medicoes_v").select(`id, contrato_id, empresa_id, empresa_apelido, periodo_inicio, periodo_fim, competencia, dias, valor_mensal,
      valor_base, acrescimos, descontos, valor_final, numero_nf, data_emissao, data_vencimento, status, status_exibicao, observacoes, final,
      cliente_id, cliente_fantasia, obra_nome, placa, proprietario, prazo_pagamento_dias, dia_corte_inicio, valor_recebido, repasse_liquido, margem`, { count: "exact" });
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    if (comp !== "todas") q = q.eq("competencia", `${comp}-01`);
    const status = p.get("status");
    if (status) q = q.eq("status_exibicao", status);
    else if (comp === "todas") q = q.in("status", ["a_faturar"]);
    else q = q.neq("status", "cancelado");
    if (p.get("cliente")) q = q.eq("cliente_id", p.get("cliente")!);
    const placa = (p.get("placa") ?? p.q).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (placa) q = q.ilike("placa", `%${placa}%`);

    const [{ data: linhas, count }, { data: clientes }] = await Promise.all([
      q.order("empresa_apelido").order("cliente_fantasia").order("placa").order("periodo_inicio").range(p.de, p.ate),
      supabase.from("clientes").select("id, razao_social, nome_fantasia").eq("ativo", true).order("nome_fantasia"),
    ]);

    return {
      linhas: (linhas ?? []) as LinhaMedicao[],
      total: count ?? 0,
      pagina: p.pagina,
      tamanho: p.tamanho,
      competencia: comp,
      competenciaPadrao: padrao,
      clientes: (clientes ?? []).map((c) => ({ value: c.id, label: c.nome_fantasia ?? c.razao_social })),
      baseDias: Number(cfg.base_dias_mes) || 30,
      podeEditar: podeEscrever(s.perfil, "medicoes"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <MedicoesCliente {...data} />;
}
