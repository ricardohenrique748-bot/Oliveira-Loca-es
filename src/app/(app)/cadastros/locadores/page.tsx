import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams, termoBusca } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { LocadoresCliente } from "./client";

export default function LocadoresPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("locadores");
    const p = lerParams(searchParams);
    const supabase = createClient();
    let q = supabase
      .from("locadores")
      .select("id, nome, cpf_cnpj, telefone, chave_pix, tipo_chave_pix, banco, nome_titular_pix, observacoes, ativo, veiculos(placa)", { count: "exact" });
    if (p.q) q = q.or(`nome.ilike.${termoBusca(p.q)},cpf_cnpj.ilike.${termoBusca(p.q)},chave_pix.ilike.${termoBusca(p.q)}`);
    const { data: linhas, count } = await q.order("nome").range(p.de, p.ate);

    return {
      linhas: (linhas ?? []).map((l) => ({ ...l, placas: (l.veiculos ?? []).map((v) => v.placa) })),
      total: count ?? 0,
      pagina: p.pagina,
      tamanho: p.tamanho,
      podeEditar: podeEscrever(s.perfil, "locadores"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <LocadoresCliente {...data} />;
}
