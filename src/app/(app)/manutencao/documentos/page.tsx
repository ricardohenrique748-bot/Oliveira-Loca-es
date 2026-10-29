import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams } from "@/lib/consulta";
import { addDias, hojeSP } from "@/lib/calculos";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { DocumentosCliente, type LinhaDoc } from "./client";

export default function DocumentosPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const p = lerParams(searchParams);
    const supabase = createClient();
    let qv = supabase.from("veiculos").select("id, placa").neq("status", "vendido").order("placa");
    if (s.empresaId) qv = qv.eq("empresa_id", s.empresaId);
    const { data: veiculos } = await qv;
    const ids = (veiculos ?? []).map((v) => v.id);
    let q = supabase.from("documentos_veiculo").select("id, veiculo_id, tipo, numero, data_emissao, validade, anexo_url, observacoes").in("veiculo_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    if (p.get("veiculo")) q = q.eq("veiculo_id", p.get("veiculo")!);
    if (p.get("tipo")) q = q.eq("tipo", p.get("tipo") as "seguro");
    const prazo = p.get("prazo");
    if (prazo) q = q.lte("validade", addDias(hojeSP(), Number(prazo)));
    const { data: docs } = await q.order("validade", { nullsFirst: false });
    const placa = new Map((veiculos ?? []).map((v) => [v.id, v.placa]));

    return {
      linhas: (docs ?? []).map((d) => ({ ...d, placa: placa.get(d.veiculo_id) ?? "" })) as LinhaDoc[],
      veiculos: (veiculos ?? []).map((v) => ({ value: v.id, label: v.placa })),
      veiculoInicial: p.get("veiculo"),
      podeEditar: podeEscrever(s.perfil, "manutencao"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <DocumentosCliente {...data} />;
}
