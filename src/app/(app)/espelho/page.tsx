import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { hojeSP } from "@/lib/format";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { EspelhosCliente, type EspelhoLista, type OpcoesEspelho } from "./client";

export default function EspelhoPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();
  const comp = searchParams.get("comp") || hojeSP().slice(0, 7);
  const historico = searchParams.get("aba") === "historico";
  const filtroPlaca = searchParams.get("placa");
  const filtroCliente = searchParams.get("cliente");
  const filtroStatus = searchParams.get("status");

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("medicoes");
    const supabase = createClient();

    let q = supabase.from("espelhos")
      .select("id, competencia, total_horas, status, token, enviado_em, respondido_em, respondido_por, motivo_recusa, veiculos(placa, modelo), clientes(razao_social, nome_fantasia, whatsapp, email), obras(nome)");
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    // placa e cliente filtram nas duas abas; Histórico: todos os meses (mais recentes primeiro) e filtro de status
    if (filtroPlaca) q = q.eq("veiculo_id", filtroPlaca);
    if (filtroCliente) q = q.eq("cliente_id", filtroCliente);
    if (historico) {
      if (filtroStatus) q = q.eq("status", filtroStatus);
      q = q.order("competencia", { ascending: false }).limit(500);
    } else {
      q = q.eq("competencia", `${comp}-01`);
    }

    let qv = supabase.from("veiculos").select("id, placa, modelo").neq("status", "vendido").order("placa");
    if (s.empresaId) qv = qv.eq("empresa_id", s.empresaId);
    let qc = supabase.from("contratos").select("id, numero, veiculo_id, cliente_id, obra_id").eq("status", "ativo");
    if (s.empresaId) qc = qc.eq("empresa_id", s.empresaId);

    const [{ data: espelhos }, { data: veiculos }, { data: clientes }, { data: contratos }, { data: obras }] = await Promise.all([
      q.order("created_at"),
      qv,
      supabase.from("clientes").select("id, razao_social, nome_fantasia").eq("ativo", true).order("razao_social"),
      qc,
      supabase.from("obras").select("id, nome, cliente_id").eq("ativo", true).order("nome"),
    ]);

    const lista: EspelhoLista[] = (espelhos ?? []).map((e) => ({
      id: e.id,
      competencia: e.competencia,
      total_horas: e.total_horas,
      status: e.status,
      token: e.token,
      enviado_em: e.enviado_em,
      respondido_em: e.respondido_em,
      respondido_por: e.respondido_por,
      motivo_recusa: e.motivo_recusa,
      placa: e.veiculos?.placa ?? "",
      modelo: e.veiculos?.modelo ?? null,
      cliente: e.clientes ? e.clientes.nome_fantasia || e.clientes.razao_social : "",
      cliente_whatsapp: e.clientes?.whatsapp ?? null,
      cliente_email: e.clientes?.email ?? null,
      obra: e.obras?.nome ?? null,
    })).sort((a, b) => (historico ? b.competencia.localeCompare(a.competencia) : 0) || a.placa.localeCompare(b.placa));

    const opcoes: OpcoesEspelho = {
      veiculos: veiculos ?? [],
      clientes: (clientes ?? []).map((c) => ({ id: c.id, nome: c.nome_fantasia || c.razao_social })),
      contratos: contratos ?? [],
      obras: obras ?? [],
    };

    return { comp, historico, espelhos: lista, opcoes, podeEditar: podeEscrever(s.perfil, "medicoes") };
  }, [comp, historico, filtroPlaca, filtroCliente, filtroStatus, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <EspelhosCliente {...data} />;
}
