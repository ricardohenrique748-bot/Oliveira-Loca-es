import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever, podeLer } from "@/lib/permissoes";
import { lerParams, termoBusca } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import type { StatusProposta } from "@/lib/schemas/comercial";
import { opcoesContrato } from "../../contratos/dados";
import { PropostasCliente } from "./client";

export default function PropostasPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("comercial");
    const p = lerParams(searchParams, { ordem: "created_at", desc: true });
    const supabase = createClient();
    let q = supabase.from("propostas")
      .select(`id, numero, empresa_id, cliente_id, obra_id, veiculo_id, equipamento, tipo_cobranca, valor, dia_corte_inicio, prazo_pagamento_dias,
        data_inicio_prevista, periodo_minimo, validade, condicoes, observacoes, status, motivo_recusa, contrato_id, created_at,
        empresas(apelido, razao_social, cnpj), clientes(razao_social, nome_fantasia, cnpj), obras(nome), veiculos(placa, modelo)`, { count: "exact" });
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const status = p.get("status") ?? "abertas";
    if (status === "abertas") q = q.in("status", ["rascunho", "enviada", "aprovada"]);
    else if (status !== "todas") q = q.eq("status", status);
    if (p.get("cliente")) q = q.eq("cliente_id", p.get("cliente")!);
    if (p.q) q = q.or(`numero.ilike.${termoBusca(p.q)},equipamento.ilike.${termoBusca(p.q)}`);
    const ordem = ["created_at", "valor", "validade", "status"].includes(p.ordem!) ? p.ordem! : "created_at";
    const [{ data: linhas, count }, opcoes] = await Promise.all([
      q.order(ordem, { ascending: !p.desc }).range(p.de, p.ate),
      opcoesContrato(supabase, s.empresaId),
    ]);

    return {
      linhas: (linhas ?? []).map((r) => ({
        id: r.id, numero: r.numero, empresa_id: r.empresa_id, cliente_id: r.cliente_id, obra_id: r.obra_id, veiculo_id: r.veiculo_id,
        equipamento: r.equipamento, tipo_cobranca: r.tipo_cobranca as "mensal" | "diaria", valor: Number(r.valor),
        dia_corte_inicio: r.dia_corte_inicio, prazo_pagamento_dias: r.prazo_pagamento_dias, data_inicio_prevista: r.data_inicio_prevista,
        periodo_minimo: r.periodo_minimo, validade: r.validade, condicoes: r.condicoes, observacoes: r.observacoes,
        status: r.status as StatusProposta, motivo_recusa: r.motivo_recusa, contrato_id: r.contrato_id, created_at: r.created_at,
        empresa: r.empresas?.apelido ?? "", empresa_razao: r.empresas?.razao_social ?? "", empresa_cnpj: r.empresas?.cnpj ?? null,
        cliente: r.clientes?.nome_fantasia ?? r.clientes?.razao_social ?? "", cliente_razao: r.clientes?.razao_social ?? "",
        cliente_cnpj: r.clientes?.cnpj ?? null, obra: r.obras?.nome ?? null, placa: r.veiculos?.placa ?? null, modelo: r.veiculos?.modelo ?? null,
      })),
      total: count ?? 0,
      pagina: p.pagina,
      tamanho: p.tamanho,
      opcoes,
      empresas: s.empresas.map((e) => ({ value: e.id, label: e.apelido })),
      empresaPadrao: s.empresaId,
      podeEditar: podeEscrever(s.perfil, "comercial"),
      veContratos: podeLer(s.perfil, "contratos"),
      novo: p.get("novo") === "1",
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <PropostasCliente {...data} />;
}
