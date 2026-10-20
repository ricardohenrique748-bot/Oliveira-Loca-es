import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams, termoBusca } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { VeiculosCliente } from "./client";

const ORDENS = ["placa", "modelo", "status", "km_atual", "tipo"];

export default function VeiculosPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("veiculos");
    const p = lerParams(searchParams, { ordem: "placa" });
    const supabase = createClient();
    let q = supabase
      .from("veiculos")
      .select("id, placa, renavam, chassi, cor, tipo, marca, modelo, ano, proprietario, locador_id, empresa_id, km_atual, horimetro_atual, status, foto_url, observacoes, empresas(apelido)", { count: "exact" });
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    if (p.q) q = q.or(`placa.ilike.${termoBusca(p.q.replace(/-/g, ""))},modelo.ilike.${termoBusca(p.q)},marca.ilike.${termoBusca(p.q)}`);
    for (const f of ["status", "tipo", "proprietario"] as const) {
      const v = p.get(f);
      if (v) q = q.eq(f, v as never);
    }
    if (!p.get("status")) q = q.neq("status", "vendido");
    const ordem = ORDENS.includes(p.ordem!) ? p.ordem! : "placa";
    const [{ data: linhas, count }, { data: locadores }] = await Promise.all([
      q.order(ordem, { ascending: !p.desc }).range(p.de, p.ate),
      supabase.from("vw_locadores_publico").select("id, nome").order("nome"),
    ]);
    const nomeLocador = new Map((locadores ?? []).map((l) => [l.id!, l.nome!]));
    return {
      linhas: (linhas ?? []).map(({ empresas, ...v }) => ({
        ...v,
        empresa: empresas?.apelido ?? "",
        locador: v.locador_id ? nomeLocador.get(v.locador_id) ?? "" : null,
      })),
      total: count ?? 0,
      pagina: p.pagina,
      tamanho: p.tamanho,
      empresas: s.empresas.map((e) => ({ value: e.id, label: e.apelido })),
      empresaPadrao: s.empresaId,
      locadores: (locadores ?? []).map((l) => ({ value: l.id!, label: l.nome! })),
      podeEditar: podeEscrever(s.perfil, "veiculos"),
      novo: p.get("novo") === "1",
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <VeiculosCliente {...data} />;
}
