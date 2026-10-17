import React from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever, podeLer } from "@/lib/permissoes";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { DetalheOS } from "./client";

export default function OrdemDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { sessao } = useAuth();

  const fechar = searchParams.get("fechar");

  const { data, loading } = useAsyncPage(async () => {
    if (!id) return null;
    const s = await exigirSessao("manutencao");
    const supabase = createClient();
    const { data: os } = await supabase.from("ordens_servico").select(`id, numero, veiculo_id, empresa_id, tipo, plano_id, data_abertura, data_fechamento, km, horimetro,
      fornecedor_id, descricao_problema, diagnostico, custo_total, horas_parado, descontar_locador, parar_veiculo, status_veiculo_anterior, fotos, status,
      veiculos(placa, modelo, proprietario, km_atual, horimetro_atual), fornecedores(nome), empresas(apelido), planos_manutencao(servico)`).eq("id", id).maybeSingle();

    if (!os) return { naoEncontrado: true } as const;

    const [{ data: itens }, { data: fornecedores }, { data: planos }, { data: categorias }, { data: contas }, contaGerada] = await Promise.all([
      supabase.from("os_itens").select("id, ordem_servico_id, tipo, descricao, quantidade, valor_unitario, valor_total").eq("ordem_servico_id", id).order("created_at"),
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("planos_manutencao").select("id, servico").eq("veiculo_id", os.veiculo_id).eq("ativo", true),
      supabase.from("categorias_despesa").select("id, nome").eq("tipo", "veiculo").eq("ativo", true).order("nome"),
      supabase.from("contas_bancarias").select("id, apelido").eq("empresa_id", os.empresa_id).eq("ativo", true),
      podeLer(s.perfil, "pagar") || s.perfil === "manutencao"
        ? supabase.from("contas_pagar").select("id, descricao, vencimento, valor, pago_em, descontar_locador").eq("ordem_servico_id", id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      naoEncontrado: false,
      os: {
        ...os,
        placa: os.veiculos?.placa ?? "",
        modelo: os.veiculos?.modelo ?? null,
        locador: os.veiculos?.proprietario === "locador",
        km_atual: os.veiculos?.km_atual ?? 0,
        horimetro_atual: os.veiculos?.horimetro_atual ?? 0,
        fornecedor: os.fornecedores?.nome ?? null,
        empresa: os.empresas?.apelido ?? "",
        plano: os.planos_manutencao?.servico ?? null,
      },
      itens: (itens ?? []).map((i) => ({ ...i, valor_total: i.valor_total ?? 0 })),
      fornecedores: (fornecedores ?? []).map((f) => ({ value: f.id, label: f.nome })),
      planos: (planos ?? []).map((p) => ({ value: p.id, label: p.servico })),
      categorias: (categorias ?? []).map((c) => ({ value: c.id, label: c.nome })),
      contas: (contas ?? []).map((c) => ({ value: c.id, label: c.apelido })),
      contaGerada: contaGerada.data,
      podeEditar: podeEscrever(s.perfil, "manutencao"),
      abrirFechamento: fechar === "1",
    };
  }, [id, fechar, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  if (data.naoEncontrado) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-muted-foreground">Ordem de serviço não encontrada.</p>
        <Link to="/manutencao/ordens" className="text-primary-ink underline">Voltar para ordens de serviço</Link>
      </div>
    );
  }

  return <DetalheOS {...data} />;
}
