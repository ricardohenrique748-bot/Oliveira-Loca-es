import React from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever, podeLer } from "@/lib/permissoes";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { FichaCliente } from "./client";

export default function ClienteDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    if (!id) return null;
    const s = await exigirSessao("cadastros");
    const supabase = createClient();
    const { data: cliente } = await supabase
      .from("clientes")
      .select("id, razao_social, nome_fantasia, cnpj, email, whatsapp, cep, endereco, cidade, uf, observacoes, ativo")
      .eq("id", id)
      .maybeSingle();

    if (!cliente) return { naoEncontrado: true } as const;

    const [{ data: obras }, { data: contatos }, contratos] = await Promise.all([
      supabase.from("obras").select("id, cliente_id, nome, codigo, cidade, uf, ativo").eq("cliente_id", id).order("nome"),
      supabase.from("contatos").select("id, cliente_id, obra_id, nome, email, whatsapp, recebe_fatura, obras(nome)").eq("cliente_id", id).order("nome"),
      podeLer(s.perfil, "contratos")
        ? supabase.from("contratos").select("id, numero, status, valor_mensal, data_inicio, data_desmobilizacao, obras(nome), veiculos(placa), empresas(apelido)").eq("cliente_id", id).order("data_inicio", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    return {
      naoEncontrado: false,
      cliente,
      obras: obras ?? [],
      contatos: (contatos ?? []).map((c) => ({ ...c, obra: c.obras?.nome ?? null })),
      contratos: (contratos.data ?? []).map((c) => ({
        id: c.id,
        numero: c.numero,
        status: c.status,
        valor_mensal: c.valor_mensal,
        data_inicio: c.data_inicio,
        data_desmobilizacao: c.data_desmobilizacao,
        obra: c.obras?.nome ?? null,
        placa: c.veiculos?.placa ?? "",
        empresa: c.empresas?.apelido ?? "",
      })),
      podeEditar: podeEscrever(s.perfil, "cadastros"),
      veContratos: podeLer(s.perfil, "contratos"),
    };
  }, [id, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  if (data.naoEncontrado) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-muted-foreground">Cliente não encontrado.</p>
        <Link to="/cadastros/clientes" className="text-primary-ink underline">Voltar para clientes</Link>
      </div>
    );
  }

  return <FichaCliente {...data} />;
}
