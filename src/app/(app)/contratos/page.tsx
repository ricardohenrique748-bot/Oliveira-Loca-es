import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { ContratosCliente } from "./client";
import { opcoesContrato } from "./dados";

export default function ContratosPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("contratos");
    const p = lerParams(searchParams, { ordem: "data_inicio", desc: true });
    const supabase = createClient();
    let q = supabase.from("contratos")
      .select(`id, numero, empresa_id, cliente_id, obra_id, veiculo_id, tipo_cobranca, valor_mensal, valor_repasse_mensal, dia_corte_inicio, prazo_pagamento_dias,
        data_inicio, data_fim, data_desmobilizacao, status, observacoes, anexo_url,
        empresas(apelido), clientes(razao_social, nome_fantasia), obras(nome), veiculos!inner(placa, modelo, proprietario)`, { count: "exact" });
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const status = p.get("status") ?? "ativo";
    if (status !== "todos") q = q.eq("status", status as "ativo");
    if (p.get("cliente")) q = q.eq("cliente_id", p.get("cliente")!);
    if (p.get("corte")) q = q.eq("dia_corte_inicio", Number(p.get("corte")));
    if (p.q) q = q.ilike("veiculos.placa", `%${p.q.toUpperCase().replace(/[^A-Z0-9]/g, "")}%`);
    const ordem = ["data_inicio", "valor_mensal", "status"].includes(p.ordem!) ? p.ordem! : "data_inicio";
    const [{ data: linhas, count }, opcoes] = await Promise.all([
      q.order(ordem, { ascending: !p.desc }).range(p.de, p.ate),
      opcoesContrato(supabase, s.empresaId),
    ]);

    return {
      linhas: (linhas ?? []).map((c) => ({
        id: c.id,
        numero: c.numero,
        empresa_id: c.empresa_id,
        cliente_id: c.cliente_id,
        obra_id: c.obra_id,
        veiculo_id: c.veiculo_id,
        tipo_cobranca: c.tipo_cobranca as "mensal" | "diaria" | "hora",
        valor_mensal: c.valor_mensal,
        valor_repasse_mensal: c.valor_repasse_mensal,
        dia_corte_inicio: c.dia_corte_inicio,
        prazo_pagamento_dias: c.prazo_pagamento_dias,
        data_inicio: c.data_inicio,
        data_fim: c.data_fim,
        data_desmobilizacao: c.data_desmobilizacao,
        status: c.status,
        observacoes: c.observacoes,
        anexo_url: c.anexo_url,
        empresa: c.empresas?.apelido ?? "",
        cliente: c.clientes?.nome_fantasia ?? c.clientes?.razao_social ?? "",
        obra: c.obras?.nome ?? null,
        placa: c.veiculos.placa,
        modelo: c.veiculos.modelo,
        proprietario: c.veiculos.proprietario,
      })),
      total: count ?? 0,
      pagina: p.pagina,
      tamanho: p.tamanho,
      opcoes,
      empresas: s.empresas.map((e) => ({ value: e.id, label: e.apelido })),
      empresaPadrao: s.empresaId,
      podeEditar: podeEscrever(s.perfil, "contratos"),
      novo: p.get("novo") === "1",
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <ContratosCliente {...data} />;
}
