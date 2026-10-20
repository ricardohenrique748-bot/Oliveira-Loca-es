"use server";
import { z } from "zod";
import { excluirRegistro, salvarRegistro } from "@/lib/crud";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { propostaSchema } from "@/lib/schemas/comercial";

const R = ["/comercial/propostas"];

export async function salvarProposta(id: string | null, dados: unknown) {
  if (id) {
    const supabase = await createClient();
    const { data: atual } = await supabase.from("propostas").select("status").eq("id", id).maybeSingle();
    if (atual?.status === "convertida") return { ok: false as const, erro: "Esta proposta já virou contrato — altere direto no contrato." };
  }
  return salvarRegistro({ tabela: "propostas", modulo: "comercial", id, dados, schema: propostaSchema, revalidar: R });
}

export async function excluirProposta(id: string) {
  return excluirRegistro({ tabela: "propostas", modulo: "comercial", id, revalidar: R });
}

/** Proposta aprovada → contrato ativo com os mesmos valores. */
export async function gerarContratoDaProposta(propostaId: string) {
  return executar(async () => {
    await exigirEscrita("comercial");
    const id = z.string().uuid().parse(propostaId);
    const supabase = await createClient();
    const contratoId = checar(await supabase.rpc("fn_proposta_gerar_contrato", { p_proposta: id })) as string;
    return { contratoId };
  }, [...R, "/contratos", "/cadastros/veiculos"], "Contrato gerado a partir da proposta");
}
