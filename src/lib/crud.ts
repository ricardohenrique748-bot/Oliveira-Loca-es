import type { ZodType, ZodTypeDef } from "zod";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar, type Resultado } from "@/lib/acoes";
import type { Modulo } from "@/lib/permissoes";

export type Tabela = keyof Database["public"]["Tables"];

/** Insere (id null) ou atualiza um registro validado pelo schema. */
export async function salvarRegistro<T>(p: {
  tabela: Tabela;
  modulo: Modulo;
  id: string | null;
  dados: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: ZodType<T, ZodTypeDef, any>;
  revalidar: string[];
}): Promise<Resultado<{ id: string }>> {
  return executar(async () => {
    await exigirEscrita(p.modulo);
    const valores = p.schema.parse(p.dados) as Record<string, unknown>;
    const supabase = createClient();
    // tipagem dinâmica por tabela: validação é feita pelo schema Zod
    const tabela = supabase.from(p.tabela as "clientes") as unknown as {
      insert: (v: unknown) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> } };
      update: (v: unknown) => { eq: (c: string, v: string) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> } } };
    };
    const r = p.id
      ? await tabela.update(valores).eq("id", p.id).select("id").single()
      : await tabela.insert(valores).select("id").single();
    const dado = checar(r as { data: { id: string } | null; error: null });
    if (!dado) throw new Error("Registro não encontrado ou sem permissão");
    return { id: dado.id };
  }, p.revalidar, p.id ? "Alterações salvas" : "Registro criado");
}

export async function excluirRegistro(p: { tabela: Tabela; modulo: Modulo; id: string; revalidar: string[] }): Promise<Resultado<null>> {
  return executar(async () => {
    await exigirEscrita(p.modulo);
    const supabase = createClient();
    const { error, count } = await supabase.from(p.tabela as "clientes").delete({ count: "exact" }).eq("id", p.id);
    if (error) throw error;
    if (!count) throw new Error("Registro não encontrado ou sem permissão para excluir");
    return null;
  }, p.revalidar, "Registro excluído");
}
