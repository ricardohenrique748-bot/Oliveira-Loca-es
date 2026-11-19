"use client";
/** Carrega uma fatura (medição) pelo id, no formato da linha da tela de Faturamento — para abrir a janela da fatura de outras telas. */
import { createClient } from "@/lib/supabase/client";
import type { PlacaFatura } from "@/lib/schemas/operacao";
import type { LinhaMedicao } from "./client";

/** mesmas colunas da listagem de Faturamento (medicoes/page.tsx) */
const COLUNAS = `id, contrato_id, empresa_id, empresa_apelido, periodo_inicio, periodo_fim, competencia, dias, valor_mensal,
  valor_base, acrescimos, descontos, valor_final, numero_nf, data_emissao, data_vencimento, status, status_exibicao, observacoes, final,
  cliente_id, cliente_fantasia, obra_nome, placa, proprietario, prazo_pagamento_dias, dia_pagamento, dia_corte_inicio, valor_recebido, repasse_liquido, margem,
  contrato_numero, cliente_nome, veiculo_tipo, saldo, tipo_cobranca, forma_pagamento, acrescimos_itens, descontos_itens, descricao, unidade, itens, numero_os`;

export async function carregarFatura(id: string): Promise<LinhaMedicao | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("medicoes_v").select(COLUNAS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Não foi possível abrir a fatura: ${error.message}`);
  if (!data) return null;
  // placas de contrato com várias (consulta à parte: sem a migration 0071 abre igual)
  const { data: comPlacas } = await supabase.from("medicoes").select("placas").eq("id", id).maybeSingle();
  return { ...data, placas: (comPlacas?.placas ?? null) as unknown as PlacaFatura[] | null } as LinhaMedicao;
}
