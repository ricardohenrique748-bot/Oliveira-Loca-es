"use server";
import { salvarRegistro } from "@/lib/crud";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { contratoSchema, desmobilizarSchema } from "@/lib/schemas/operacao";

export async function salvarContrato(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "contratos", modulo: "contratos", id, dados, schema: contratoSchema, revalidar: ["/contratos", "/medicoes", "/dashboard"] });
}

export async function desmobilizarContrato(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("contratos");
    const d = desmobilizarSchema.parse(dados);
    const supabase = await createClient();
    const medicaoId = checar(await supabase.rpc("fn_desmobilizar_contrato", { p_contrato: d.contrato_id, p_data: d.data }));
    return { medicaoId };
  }, ["/contratos", "/medicoes", "/dashboard", "/cadastros/veiculos"], "Contrato desmobilizado — medição final gerada");
}
