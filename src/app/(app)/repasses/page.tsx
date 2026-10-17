import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, exigirSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever } from "@/lib/permissoes";
import { lerParams } from "@/lib/consulta";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { RepassesCliente, type Repasse, type Abatimento, type Locador } from "./client";

export default function RepassesPage() {
  const { sessao } = useAuth();
  const [searchParams] = useSearchParams();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("repasses");
    const p = lerParams(searchParams);
    const supabase = createClient();

    let q = supabase.from("repasses_v").select(`id, medicao_id, locador_id, locador_nome, empresa_id, empresa_apelido, veiculo_id, placa, valor_repasse_mensal,
      valor_bruto, valor_abatimentos, valor_liquido, data_prevista, data_pagamento, adiantado, aprovado_por, comprovante_url, status,
      periodo_inicio, periodo_fim, dias, numero_nf, medicao_valor, medicao_status, medicao_vencimento, competencia, cliente_nome, seria_adiantado`);
    if (s.empresaId) q = q.eq("empresa_id", s.empresaId);
    const status = p.get("status") ?? "pendentes";
    if (status === "pendentes") q = q.in("status", ["previsto", "liberado"]);
    else if (status !== "todos") q = q.eq("status", status as "pago");
    if (p.get("comp")) q = q.eq("competencia", `${p.get("comp")}-01`);
    if (p.get("locador")) q = q.eq("locador_id", p.get("locador")!);
    const { data: repassesData } = await q.order("locador_nome").order("periodo_inicio").limit(1000);
    const repasses = (repassesData ?? []) as Repasse[];

    const ids = repasses.map((r) => r.id);
    const [{ data: abat }, { data: locadores }] = await Promise.all([
      ids.length
        ? supabase.from("repasse_abatimentos").select("id, repasse_id, conta_pagar_id, ordem_servico_id, descricao, valor, contas_pagar(vencimento), ordens_servico(numero)").in("repasse_id", ids)
        : Promise.resolve({ data: [] }),
      supabase.from("locadores").select("id, nome, cpf_cnpj, telefone, chave_pix, tipo_chave_pix, banco, nome_titular_pix").order("nome"),
    ]);

    return {
      repasses,
      abatimentos: (abat ?? []).map((a) => ({
        id: a.id,
        repasse_id: a.repasse_id,
        conta_pagar_id: a.conta_pagar_id,
        ordem_servico_id: a.ordem_servico_id,
        descricao: a.descricao,
        valor: a.valor,
        vencimento: a.contas_pagar?.vencimento ?? null,
        os_numero: a.ordens_servico?.numero ?? null,
      })) as Abatimento[],
      locadores: (locadores ?? []) as Locador[],
      podeEditar: podeEscrever(s.perfil, "repasses"),
    };
  }, [searchParams, sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <RepassesCliente {...data} />;
}
