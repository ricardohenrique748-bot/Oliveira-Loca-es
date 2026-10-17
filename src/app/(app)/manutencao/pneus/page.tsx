import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { PneusCliente, type LinhaPneu } from "./client";

export default function PneusPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const p = lerParams(searchParams);
    const supabase = createClient();
    let qv = supabase.from("veiculos").select("id, placa").neq("status", "vendido").order("placa");
    if (s.empresaId) qv = qv.eq("empresa_id", s.empresaId);
    let q = supabase.from("pneus").select("id, veiculo_id, posicao, marca, medida, numero_fogo, data_compra, km_instalacao, ressolagens, status, observacoes, veiculos(placa, km_atual)");
    if (p.get("veiculo")) q = q.eq("veiculo_id", p.get("veiculo")!);
    if (p.get("status")) q = q.eq("status", p.get("status")!);
    if (p.q) q = q.ilike("numero_fogo", `%${p.q}%`);
    const [{ data: pneusData }, { data: veiculos }] = await Promise.all([q.order("numero_fogo"), qv]);

    return {
      linhas: (pneusData ?? []).map((n) => ({
        ...n,
        placa: n.veiculos?.placa ?? null,
        km_rodado: n.veiculos && n.km_instalacao != null ? n.veiculos.km_atual - n.km_instalacao : null,
      })) as LinhaPneu[],
      veiculos: (veiculos ?? []).map((v) => ({ value: v.id, label: v.placa })),
      podeEditar: podeEscrever(s.perfil, "manutencao"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <PneusCliente {...data} />;
}
