import React from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever, podeLer } from "@/lib/permissoes";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { FichaVeiculo } from "./client";

export default function VeiculoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    if (!id) return null;
    const s = await exigirSessao("veiculos");
    const supabase = createClient();
    const { data: v } = await supabase
      .from("veiculos")
      .select("id, placa, renavam, chassi, cor, tipo, marca, modelo, ano, proprietario, locador_id, empresa_id, km_atual, horimetro_atual, status, foto_url, observacoes, empresas(apelido)")
      .eq("id", id)
      .maybeSingle();

    if (!v) return { naoEncontrado: true } as const;

    const veContratos = podeLer(s.perfil, "contratos");
    const veMedicoes = podeLer(s.perfil, "medicoes");
    const veResultado = podeLer(s.perfil, "relatorios");
    const vazio = Promise.resolve({ data: [] as never[] });

    const [locadores, contratos, medicoes, os, docs, leituras, planos, resultado, multas] = await Promise.all([
      supabase.from("vw_locadores_publico").select("id, nome").order("nome"),
      veContratos ? supabase.from("contratos").select("id, numero, status, valor_mensal, valor_repasse_mensal, data_inicio, data_desmobilizacao, clientes(razao_social, nome_fantasia), obras(nome)").eq("veiculo_id", id).order("data_inicio", { ascending: false }) : vazio,
      veMedicoes ? supabase.from("medicoes_v").select("id, periodo_inicio, periodo_fim, dias, valor_final, numero_nf, status_exibicao, cliente_fantasia, repasse_liquido, margem").eq("veiculo_id", id).order("periodo_inicio", { ascending: false }).limit(36) : vazio,
      supabase.from("ordens_servico").select("id, numero, tipo, status, data_abertura, data_fechamento, descricao_problema, custo_total, horas_parado, fornecedores(nome)").eq("veiculo_id", id).order("data_abertura", { ascending: false }),
      supabase.from("documentos_veiculo").select("id, tipo, numero, validade, anexo_url").eq("veiculo_id", id).order("validade"),
      supabase.from("leituras").select("id, data, km, horimetro, origem").eq("veiculo_id", id).order("data", { ascending: false }).limit(60),
      supabase.from("vw_preventivas_status").select("plano_id, servico, status, pct, criterio, proxima_km, proxima_horas, proxima_data, restante").eq("veiculo_id", id),
      veResultado ? supabase.from("vw_margem_placa_mes").select("mes, receita, repasse, manutencao, outras_despesas, margem, margem_pct").eq("veiculo_id", id).order("mes", { ascending: false }).limit(24) : vazio,
      supabase.from("multas_v").select("id, data_infracao, descricao, auto_infracao, valor, vencimento, status, status_exibicao, cliente_nome, pago_em").eq("veiculo_id", id).order("data_infracao", { ascending: false }),
    ]);

    const locadorNome = v.locador_id ? (locadores.data ?? []).find((l) => l.id === v.locador_id)?.nome ?? null : null;

    return {
      naoEncontrado: false,
      veiculo: { ...v, empresa: v.empresas?.apelido ?? "", locador: locadorNome },
      empresas: s.empresas.map((e) => ({ value: e.id, label: e.apelido })),
      locadores: (locadores.data ?? []).map((l) => ({ value: l.id!, label: l.nome! })),
      contratos: (contratos.data ?? []).map((c) => ({
        id: c.id,
        numero: c.numero,
        status: c.status,
        valor_mensal: c.valor_mensal,
        valor_repasse_mensal: c.valor_repasse_mensal,
        data_inicio: c.data_inicio,
        data_desmobilizacao: c.data_desmobilizacao,
        cliente: c.clientes?.nome_fantasia ?? c.clientes?.razao_social ?? "",
        obra: c.obras?.nome ?? null,
      })),
      medicoes: (medicoes.data ?? []) as never,
      ordens: (os.data ?? []).map((o) => ({ ...o, fornecedor: o.fornecedores?.nome ?? null })),
      documentos: docs.data ?? [],
      multas: (multas.data ?? []) as never,
      leituras: leituras.data ?? [],
      planos: (planos.data ?? []) as never,
      resultado: (resultado.data ?? []) as never,
      permissoes: { editar: podeEscrever(s.perfil, "veiculos"), contratos: veContratos, medicoes: veMedicoes, resultado: veResultado },
    };
  }, [id, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  if (data.naoEncontrado) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-muted-foreground">Veículo não encontrado.</p>
        <Link to="/cadastros/veiculos" className="text-primary-ink underline">Voltar para veículos</Link>
      </div>
    );
  }

  return <FichaVeiculo {...data} />;
}
