import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { OrdensCliente, type LinhaOS } from "./client";

export default function OrdensPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("manutencao");
    const p = lerParams(searchParams);
    const supabase = createClient();

    let q = supabase.from("ordens_servico").select(`id, numero, veiculo_id, empresa_id, tipo, plano_id, data_abertura, data_fechamento, km, horimetro, fornecedor_id,
      descricao_problema, diagnostico, custo_total, horas_parado, descontar_locador, parar_veiculo, status, veiculos(placa, modelo, proprietario), fornecedores(nome)`);
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const visao = p.get("visao") ?? "kanban";
    if (visao === "kanban") q = q.or(`status.in.(aberta,em_execucao,aguardando_peca),data_fechamento.gte.${new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10)}`);
    if (p.get("status")) q = q.eq("status", p.get("status") as "aberta");
    if (p.get("tipo")) q = q.eq("tipo", p.get("tipo") as "corretiva");
    if (p.get("veiculo")) q = q.eq("veiculo_id", p.get("veiculo")!);

    let qv = supabase.from("veiculos").select("id, placa, modelo, proprietario, km_atual, horimetro_atual").neq("status", "vendido").order("placa");
    if (s.empresaId) qv = qv.eq("empresa_id", s.empresaId);

    const [{ data: ordens }, { data: veiculos }, { data: fornecedores }, { data: planos }] = await Promise.all([
      q.order("data_abertura", { ascending: false }).order("numero", { ascending: false }).limit(500),
      qv,
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("vw_preventivas_status").select("plano_id, veiculo_id, servico, status"),
    ]);

    return {
      linhas: (ordens ?? []).map((o) => ({ ...o, placa: o.veiculos?.placa ?? "", modelo: o.veiculos?.modelo ?? null, fornecedor: o.fornecedores?.nome ?? null })) as LinhaOS[],
      veiculos: (veiculos ?? []).map((v) => ({ value: v.id, label: `${v.placa}${v.modelo ? ` · ${v.modelo}` : ""}`, locador: v.proprietario === "locador", km: v.km_atual, horas: v.horimetro_atual })),
      fornecedores: (fornecedores ?? []).map((f) => ({ value: f.id, label: f.nome })),
      planos: (planos ?? []).map((pl) => ({ value: pl.plano_id!, label: `${pl.servico} (${pl.status})`, veiculo_id: pl.veiculo_id! })),
      podeEditar: podeEscrever(s.perfil, "manutencao"),
      abrirNovo: p.get("novo") === "1",
      veiculoInicial: p.get("veiculo"),
      planoInicial: p.get("plano"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <OrdensCliente {...data} />;
}
