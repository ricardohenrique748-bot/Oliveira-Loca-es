import type { SupabaseServer } from "@/lib/supabase/server";

/** Opções para o formulário de contrato (clientes, obras, veículos). */
export async function opcoesContrato(supabase: SupabaseServer, empresaId: string | null) {
  let qv = supabase.from("veiculos").select("id, placa, modelo, proprietario, empresa_id, status").neq("status", "vendido").order("placa");
  if (empresaId) qv = qv.eq("empresa_id", empresaId);
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
