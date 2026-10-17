import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { PlanosCliente, type LinhaPlano } from "./client";

export default function PlanosPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const p = lerParams(searchParams);
    const supabase = createClient();
    let qv = supabase.from("veiculos").select("id, placa, modelo, empresa_id, km_atual, horimetro_atual").neq("status", "vendido").order("placa");
    if (s.empresaId) qv = qv.eq("empresa_id", s.empresaId);
    const [{ data: planos }, { data: status }, { data: veiculos }] = await Promise.all([
      supabase.from("planos_manutencao").select("id, veiculo_id, modelo, servico, intervalo_km, intervalo_horas, intervalo_dias, ultima_execucao_data, ultima_execucao_km, ultima_execucao_horas, ativo").order("servico"),
      supabase.from("vw_preventivas_status").select("plano_id, status, pct, criterio, proxima_km, proxima_horas, proxima_data, restante, km_atual, horimetro_atual"),
      qv,
    ]);
    const mv = new Map((veiculos ?? []).map((v) => [v.id, v]));
    const ms = new Map((status ?? []).map((x) => [x.plano_id!, x]));
    let linhas: LinhaPlano[] = (planos ?? [])
      .filter((pl) => !pl.veiculo_id || mv.has(pl.veiculo_id))
      .map((pl) => {
        const st = ms.get(pl.id);
        return {
          ...pl,
          placa: pl.veiculo_id ? mv.get(pl.veiculo_id)?.placa ?? null : null,
          status: (st?.status as LinhaPlano["status"]) ?? null,
          pct: st ? Number(st.pct) : null,
          criterio: st?.criterio ?? null,
          proxima_km: st?.proxima_km ?? null,
          proxima_horas: st?.proxima_horas ?? null,
          proxima_data: st?.proxima_data ?? null,
          restante: st?.restante ?? null,
        };
      });
    if (p.get("status")) linhas = linhas.filter((l) => l.status === p.get("status"));
    if (p.get("veiculo")) linhas = linhas.filter((l) => l.veiculo_id === p.get("veiculo"));
    linhas.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    const modelos = [...new Set((veiculos ?? []).map((v) => v.modelo).filter(Boolean) as string[])].sort();

    return {
      linhas,
      veiculos: (veiculos ?? []).map((v) => ({ value: v.id, label: `${v.placa}${v.modelo ? ` · ${v.modelo}` : ""}`, km: v.km_atual, horas: v.horimetro_atual })),
      modelos,
      podeEditar: podeEscrever(s.perfil, "manutencao"),
      abrirNovo: p.get("novo") === "1",
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <PlanosCliente {...data} />;
}
