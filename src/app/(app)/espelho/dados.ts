import type { createClient } from "@/lib/supabase/client";
import type { OpcoesEspelho } from "./client";

/** Placas, clientes, contratos ativos e obras para criar ou editar um espelho. */
export async function carregarOpcoesEspelho(supabase: ReturnType<typeof createClient>, empresaId: string | null): Promise<OpcoesEspelho> {
  let qv = supabase.from("veiculos").select("id, placa, modelo").neq("status", "vendido").order("placa");
  if (empresaId) qv = qv.eq("empresa_id", empresaId);
  let qc = supabase.from("contratos").select("id, numero, veiculo_id, cliente_id, obra_id").eq("status", "ativo");
  if (empresaId) qc = qc.eq("empresa_id", empresaId);

  const [{ data: veiculos }, { data: clientes }, { data: contratos }, { data: obras }] = await Promise.all([
    qv,
    supabase.from("clientes").select("id, razao_social, nome_fantasia").eq("ativo", true).order("razao_social"),
    qc,
    supabase.from("obras").select("id, nome, cliente_id").eq("ativo", true).order("nome"),
  ]);
  return {
    veiculos: veiculos ?? [],
    clientes: (clientes ?? []).map((c) => ({ id: c.id, nome: c.nome_fantasia || c.razao_social })),
    contratos: contratos ?? [],
    obras: obras ?? [],
  };
}
