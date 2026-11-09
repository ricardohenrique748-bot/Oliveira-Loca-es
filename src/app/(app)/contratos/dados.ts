import type { SupabaseServer } from "@/lib/supabase/server";

/** Opções para o formulário de contrato (clientes, obras, veículos). */
/** Veículos de todas as empresas: a placa não fica presa a uma empresa, ela segue o contrato. */
export async function opcoesContrato(supabase: SupabaseServer, _empresaId: string | null) {
  const qv = supabase.from("veiculos").select("id, placa, modelo, proprietario, empresa_id, status").neq("status", "vendido").order("placa");
  const [{ data: clientes }, { data: obras }, { data: veiculos }] = await Promise.all([
    supabase.from("clientes").select("id, razao_social, nome_fantasia").eq("ativo", true).order("nome_fantasia"),
    supabase.from("obras").select("id, cliente_id, nome").eq("ativo", true).order("nome"),
    qv,
  ]);
  return {
    clientes: (clientes ?? []).map((c) => ({ value: c.id, label: c.nome_fantasia ?? c.razao_social })),
    obras: (obras ?? []).map((o) => ({ value: o.id, label: o.nome, cliente_id: o.cliente_id })),
    veiculos: (veiculos ?? []).map((v) => ({
      value: v.id, label: `${v.placa}${v.modelo ? ` · ${v.modelo}` : ""}${v.proprietario === "locador" ? " (sublocado)" : ""}`,
      proprietario: v.proprietario, empresa_id: v.empresa_id, status: v.status,
    })),
  };
}

export type OpcoesContrato = Awaited<ReturnType<typeof opcoesContrato>>;

export type PlacaExtra = { veiculo_id: string; placa: string; valor_mensal: number; valor_repasse_mensal: number | null; data_inicio: string | null; data_fim: string | null };

/** Outras placas de cada contrato (a principal é contratos.veiculo_id). null = tabela ainda não existe no banco (migration 0071). */
export async function placasDosContratos(supabase: SupabaseServer, ids: string[]): Promise<Map<string, PlacaExtra[]> | null> {
  const mapa = new Map<string, PlacaExtra[]>();
  if (!ids.length) return mapa;
  const { data, error } = await supabase.from("contrato_placas")
    .select("contrato_id, veiculo_id, valor_mensal, valor_repasse_mensal, data_inicio, data_fim, ordem, veiculos(placa)")
    .in("contrato_id", ids).order("ordem").order("created_at");
  if (error) return null;
  for (const p of data ?? []) {
    const lista = mapa.get(p.contrato_id) ?? [];
    lista.push({ veiculo_id: p.veiculo_id, placa: p.veiculos?.placa ?? "", valor_mensal: p.valor_mensal, valor_repasse_mensal: p.valor_repasse_mensal, data_inicio: p.data_inicio, data_fim: p.data_fim });
    mapa.set(p.contrato_id, lista);
  }
  return mapa;
}
