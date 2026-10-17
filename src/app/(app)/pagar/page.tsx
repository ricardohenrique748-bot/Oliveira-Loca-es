import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams, termoBusca } from "@/lib/consulta";
import { competenciaDe, fimDoMes, hojeSP } from "@/lib/calculos";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { PagarCliente, type LinhaConta } from "./client";

export default function PagarPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("pagar");
    const p = lerParams(searchParams);
    const supabase = createClient();
    const mes = p.get("mes") ?? competenciaDe(hojeSP());
    const inicio = `${mes}-01`;

    let q = supabase.from("contas_pagar_v").select(`id, empresa_id, empresa_apelido, fornecedor_id, fornecedor_nome, descricao, categoria_id, categoria_nome, tipo,
      veiculo_id, placa, vencimento, valor, parcela_num, parcela_total, grupo_parcela_id, recorrente, forma_pagamento, conta_bancaria_id, banco, conta_apelido,
      descontar_locador, repasse_id, ordem_servico_id, pago_em, valor_pago, anexo_url, observacoes, status, valor_abatido`);
    if (p.get("id")) q = q.eq("id", p.get("id")!);
    else if (p.get("status") === "vencido") q = q.eq("status", "vencido");
    else q = q.gte("vencimento", inicio).lte("vencimento", fimDoMes(inicio));
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    for (const f of ["tipo", "categoria_id", "veiculo_id", "banco", "forma_pagamento"] as const) {
      const v = p.get(f);
      if (v) q = q.eq(f, v);
    }
    const st = p.get("status");
    if (st && st !== "vencido") q = q.eq("status", st);
    if (p.get("descontar") === "1") q = q.eq("descontar_locador", true);
    if (p.q) q = q.or(`descricao.ilike.${termoBusca(p.q)},fornecedor_nome.ilike.${termoBusca(p.q)},placa.ilike.${termoBusca(p.q.toUpperCase())}`);

    let qv = supabase.from("veiculos").select("id, placa, proprietario, empresa_id").neq("status", "vendido").order("placa");
    if (s.empresaId) qv = qv.eq("empresa_id", s.empresaId);

    const [{ data: contasPagar }, { data: categorias }, { data: fornecedores }, { data: veiculos }, { data: contas }] = await Promise.all([
      q.order("vencimento").order("descricao").limit(2000),
      supabase.from("categorias_despesa").select("id, nome, tipo").eq("ativo", true).order("nome"),
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
      qv,
      supabase.from("contas_bancarias").select("id, apelido, banco, empresa_id").eq("ativo", true).order("apelido"),
    ]);

    return {
      linhas: (contasPagar ?? []) as LinhaConta[],
      mes,
      foco: p.get("id"),
      opcoes: {
        empresas: s.empresas.map((e) => ({ value: e.id, label: e.apelido })),
        categorias: (categorias ?? []).map((c) => ({ value: c.id, label: c.nome, tipo: c.tipo })),
        fornecedores: (fornecedores ?? []).map((f) => ({ value: f.id, label: f.nome })),
        veiculos: (veiculos ?? []).map((v) => ({ value: v.id, label: v.placa + (v.proprietario === "locador" ? " (sublocado)" : ""), locador: v.proprietario === "locador", empresa_id: v.empresa_id })),
        contas: (contas ?? []).map((c) => ({ value: c.id, label: c.apelido, banco: c.banco, empresa_id: c.empresa_id })),
      },
      empresaPadrao: s.empresaId,
      podeEditar: podeEscrever(s.perfil, "pagar"),
      abrirNovo: p.get("novo") === "1",
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <PagarCliente {...data} />;
}
