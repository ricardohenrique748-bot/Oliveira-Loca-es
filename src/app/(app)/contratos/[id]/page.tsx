import React from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { getConfig } from "@/lib/config";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { opcoesContrato } from "../dados";
import { DetalheContrato } from "./client";

export default function ContratoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    if (!id) return null;
    const s = await exigirSessao("contratos");
    const supabase = createClient();
    const { data: c } = await supabase
      .from("contratos")
      .select(`id, numero, empresa_id, cliente_id, obra_id, veiculo_id, tipo_cobranca, valor_mensal, valor_repasse_mensal, dia_corte_inicio, prazo_pagamento_dias,
        data_inicio, data_fim, data_desmobilizacao, status, observacoes, anexo_url, empresas(apelido), clientes(razao_social, nome_fantasia), obras(nome), veiculos!inner(placa, modelo, proprietario)`)
      .eq("id", id)
      .maybeSingle();

    if (!c) return { naoEncontrado: true } as const;

    const [{ data: medicoes }, opcoes, cfg] = await Promise.all([
      supabase.from("medicoes_v").select("id, periodo_inicio, periodo_fim, dias, valor_final, acrescimos, descontos, numero_nf, data_emissao, data_vencimento, status_exibicao, valor_recebido, repasse_liquido, margem, final")
        .eq("contrato_id", id).order("periodo_inicio", { ascending: false }),
      opcoesContrato(supabase, null),
      getConfig(),
    ]);

    return {
      naoEncontrado: false,
      contrato: {
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
      },
      medicoes: (medicoes ?? []) as never,
      opcoes,
      empresas: s.empresas.map((e) => ({ value: e.id, label: e.apelido })),
      podeEditar: podeEscrever(s.perfil, "contratos"),
      podeLancar: podeEscrever(s.perfil, "medicoes"),
      baseDias: Number(cfg.base_dias_mes) || 30,
    };
  }, [id, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  if (data.naoEncontrado) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-muted-foreground">Contrato não encontrado.</p>
        <Link to="/contratos" className="text-primary-ink underline">Voltar para contratos</Link>
      </div>
    );
  }

  return <DetalheContrato {...data} />;
}
