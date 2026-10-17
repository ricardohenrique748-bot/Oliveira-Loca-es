import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { LeiturasCliente } from "./client";

export default function LeiturasPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();
  const placa = searchParams.get("placa") ?? "";

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const supabase = createClient();
    let qv = supabase.from("veiculos").select("id, placa, tipo, modelo, km_atual, horimetro_atual, status").neq("status", "vendido").order("placa");
    if (s.empresaId) qv = qv.eq("empresa_id", s.empresaId);
    const { data: veiculos } = await qv;
    const ids = (veiculos ?? []).map((v) => v.id);
    const { data: ultimas } = ids.length
      ? await supabase.from("leituras").select("veiculo_id, data").in("veiculo_id", ids).order("data", { ascending: false }).limit(1000)
      : { data: [] };
    const ultima = new Map<string, string>();
    for (const l of ultimas ?? []) if (!ultima.has(l.veiculo_id)) ultima.set(l.veiculo_id, l.data);

    return {
      veiculos: (veiculos ?? []).map((v) => ({ ...v, ultima: ultima.get(v.id) ?? null })),
      filtroInicial: placa,
      podeEditar: podeEscrever(s.perfil, "manutencao"),
    };
  }, [placa, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <LeiturasCliente {...data} />;
}
