import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams } from "@/lib/consulta";
import { getConfig } from "@/lib/config";
import { hojeSP } from "@/lib/calculos";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { ReceberCliente, type LinhaReceber, type ContatoCobranca } from "./client";
import type { Boleto } from "./actions";

export default function ReceberPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("receber");
    const p = lerParams(searchParams, { ordem: "data_vencimento" });
    const supabase = createClient();
    const cfg = await getConfig();
    const hoje = hojeSP();

    let q = supabase.from("medicoes_v").select(`id, empresa_id, empresa_apelido, cliente_id, cliente_fantasia, obra_id, obra_nome, placa, periodo_inicio, periodo_fim,
      numero_nf, data_emissao, data_vencimento, valor_final, valor_recebido, saldo, status, status_exibicao, dias_atraso, data_ultimo_recebimento`, { count: "exact" });
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const status = p.get("status") ?? "abertos";
    if (status === "abertos") q = q.in("status", ["faturado", "recebido_parcial"]);
    else if (status === "vencido") q = q.eq("status_exibicao", "vencido");
    else if (status === "a_vencer") q = q.in("status", ["faturado", "recebido_parcial"]).gte("data_vencimento", hoje);
    else if (status === "todos") q = q.in("status", ["faturado", "recebido_parcial", "recebido"]);
    else q = q.eq("status", status as "recebido");
    const faixa = p.get("faixa");
    if (faixa) {
      const desde = (d: number) => new Date(Date.parse(hoje) - d * 86400000).toISOString().slice(0, 10);
      const faixas: Record<string, [number, number | null]> = { "1-30": [1, 30], "31-60": [31, 60], "61-90": [61, 90], "90+": [91, null] };
      if (faixa === "a_vencer") q = q.gte("data_vencimento", hoje);
      else if (faixas[faixa]) {
        const [a, b] = faixas[faixa];
        q = q.lte("data_vencimento", desde(a));
        if (b) q = q.gte("data_vencimento", desde(b));
      }
    }
    if (p.get("cliente")) q = q.eq("cliente_id", p.get("cliente")!);
    if (p.get("id")) q = q.eq("id", p.get("id")!);
    if (p.q) q = q.or(`placa.ilike.%${p.q.toUpperCase().replace(/[^A-Z0-9]/g, "")}%,numero_nf.ilike.%${p.q.replace(/[^\w]/g, "")}%`);
    const ordem = ["data_vencimento", "valor_final", "saldo", "data_emissao", "cliente_fantasia"].includes(p.ordem!) ? p.ordem! : "data_vencimento";

    let qa = supabase.from("vw_aging_receber").select("faixa, saldo");
    if (s.empresaId) qa = qa.eq("empresa_id", s.empresaId);

    const [{ data: linhas, count }, { data: aging }, { data: clientes }, { data: contas }] = await Promise.all([
      q.order(ordem, { ascending: !p.desc, nullsFirst: false }).range(p.de, p.ate),
      qa,
      supabase.from("clientes").select("id, razao_social, nome_fantasia").eq("ativo", true).order("nome_fantasia"),
      supabase.from("contas_bancarias").select("id, apelido, empresa_id, banco, codigo_beneficiario").eq("ativo", true).order("apelido"),
    ]);
    const ids = [...new Set((linhas ?? []).map((m) => m.cliente_id!))];
    const medicoes = (linhas ?? []).map((m) => m.id!);
    const [{ data: contatos }, { data: boletos }] = await Promise.all([
      ids.length
        ? supabase.from("contatos").select("cliente_id, obra_id, nome, email, whatsapp").in("cliente_id", ids).eq("recebe_fatura", true)
        : Promise.resolve({ data: [] }),
      medicoes.length
        ? supabase.from("boletos").select("id, medicao_id, nosso_numero, linha_digitavel, pix_copia_cola, valor, data_vencimento, status, data_pagamento, ambiente")
          .in("medicao_id", medicoes).in("status", ["emitido", "pago"]).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    // o mais recente por medição (em aberto tem prioridade)
    const boletoDe = new Map<string, Boleto>();
    for (const b of (boletos ?? []) as Boleto[]) {
      const atual = boletoDe.get(b.medicao_id);
      if (!atual || (atual.status !== "emitido" && b.status === "emitido")) boletoDe.set(b.medicao_id, b);
    }

    const resumo: Record<string, number> = { a_vencer: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const a of aging ?? []) resumo[a.faixa!] = (resumo[a.faixa!] ?? 0) + Number(a.saldo);

    return {
      linhas: ((linhas ?? []) as LinhaReceber[]).map((m) => ({ ...m, boleto: boletoDe.get(m.id) ?? null })),
      total: count ?? 0,
      pagina: p.pagina,
      tamanho: p.tamanho,
      aging: resumo,
      clientes: (clientes ?? []).map((c) => ({ value: c.id, label: c.nome_fantasia ?? c.razao_social })),
      contas: (contas ?? []).map((c) => ({ value: c.id, label: c.apelido, empresa_id: c.empresa_id, boleto: c.banco === "Sicredi" && !!c.codigo_beneficiario })),
      contatos: (contatos ?? []) as ContatoCobranca[],
      templates: { email: cfg.template_cobranca_email, whatsapp: cfg.template_cobranca_whatsapp },
      podeEditar: podeEscrever(s.perfil, "receber"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <ReceberCliente {...data} />;
}
