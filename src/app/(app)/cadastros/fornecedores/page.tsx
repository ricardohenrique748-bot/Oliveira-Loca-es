import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams, termoBusca } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { FornecedoresCliente } from "./client";

export default function FornecedoresPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("fornecedores");
    const p = lerParams(searchParams, { ordem: "nome" });
    const supabase = createClient();
    let q = supabase.from("fornecedores").select("id, nome, cpf_cnpj, telefone, email, categoria, ativo", { count: "exact" });
    if (p.q) q = q.or(`nome.ilike.${termoBusca(p.q)},cpf_cnpj.ilike.${termoBusca(p.q)},categoria.ilike.${termoBusca(p.q)}`);
    if (p.get("categoria")) q = q.eq("categoria", p.get("categoria")!);
    const { data: linhas, count } = await q.order(["nome", "categoria"].includes(p.ordem!) ? p.ordem! : "nome", { ascending: !p.desc }).range(p.de, p.ate);
    const { data: cats } = await supabase.from("fornecedores").select("categoria").not("categoria", "is", null);
    const categorias = [...new Set((cats ?? []).map((c) => c.categoria!))].sort();

    return {
      linhas: linhas ?? [],
      total: count ?? 0,
      pagina: p.pagina,
      tamanho: p.tamanho,
      categorias,
      podeEditar: podeEscrever(s.perfil, "fornecedores"),
      novo: p.get("novo") === "1",
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <FornecedoresCliente {...data} />;
}
