import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams, termoBusca } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { ClientesCliente } from "./client";

export default function ClientesPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("cadastros");
    const p = lerParams(searchParams);
    const supabase = createClient();
    let q = supabase
      .from("clientes")
      .select("id, razao_social, nome_fantasia, cnpj, observacoes, ativo, obras(id), contatos(id)", { count: "exact" });
    if (p.q) q = q.or(`razao_social.ilike.${termoBusca(p.q)},nome_fantasia.ilike.${termoBusca(p.q)},cnpj.ilike.${termoBusca(p.q)}`);
    if (p.get("situacao") === "inativos") q = q.eq("ativo", false);
    else if (p.get("situacao") !== "todos") q = q.eq("ativo", true);
    const { data: linhas, count } = await q.order("nome_fantasia", { nullsFirst: false }).order("razao_social").range(p.de, p.ate);

    return {
      linhas: (linhas ?? []).map(({ obras, contatos, ...c }) => ({
        ...c,
        qtdObras: obras?.length ?? 0,
        qtdContatos: contatos?.length ?? 0,
      })),
      total: count ?? 0,
      pagina: p.pagina,
      tamanho: p.tamanho,
      podeEditar: podeEscrever(s.perfil, "cadastros"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <ClientesCliente {...data} />;
}
