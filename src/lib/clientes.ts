import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar, type Resultado } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import type { Modulo } from "@/lib/permissoes";
import { CLIENTE_NOVO, telefoneOpc, textoOpc } from "@/lib/schemas/cadastros";

/**
 * Formulário com cliente digitado (CLIENTE_NOVO): reaproveita um cadastro com a mesma razão social
 * ou cria um com nome, endereço e telefone (completar o resto depois em Clientes). Devolve os dados com o cliente_id real.
 */
export async function resolverClienteNovo(dados: unknown, modulo: Modulo): Promise<Resultado<unknown>> {
  const form = (dados ?? {}) as { cliente_id?: unknown; cliente_novo?: unknown; cliente_novo_endereco?: unknown; cliente_novo_telefone?: unknown };
  if (form.cliente_id !== CLIENTE_NOVO) return { ok: true, dados };
  return executar(async () => {
    await exigirEscrita(modulo);
    const nome = z.string({ invalid_type_error: "Digite o nome do cliente" }).trim().min(1, "Digite o nome do cliente").max(200).parse(form.cliente_novo);
    const endereco = textoOpc.parse(form.cliente_novo_endereco);
    const whatsapp = telefoneOpc.parse(form.cliente_novo_telefone);
    const supabase = await createClient();
    // mesma razão social (sem diferenciar maiúsculas) = mesmo cliente, evita duplicar ao salvar de novo
    const existente = checar(await supabase.from("clientes").select("id").ilike("razao_social", nome.replace(/[%_\\]/g, "\\$&")).limit(1));
    const clienteId = existente?.[0]?.id ?? checar(await supabase.from("clientes").insert({ razao_social: nome, endereco, whatsapp }).select("id").single())!.id;
    return { ...form, cliente_id: clienteId };
  }, ["/cadastros/clientes"]);
}
