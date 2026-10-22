"use server";
import { z } from "zod";
import { excluirRegistro, salvarRegistro } from "@/lib/crud";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { CLIENTE_NOVO, propostaFormSchema, propostaSchema } from "@/lib/schemas/comercial";

const R = ["/comercial/propostas"];

export async function salvarProposta(id: string | null, dados: unknown) {
  if (id) {
    const supabase = await createClient();
    const { data: atual } = await supabase.from("propostas").select("status").eq("id", id).maybeSingle();
    if (atual?.status === "convertida") return { ok: false as const, erro: "Esta proposta já virou contrato — altere direto no contrato." };
  }
  const form = (dados ?? {}) as { cliente_id?: unknown; cliente_novo?: unknown };
  if (form.cliente_id === CLIENTE_NOVO) {
    const cliente = await cadastrarClienteNovo(dados);
    if (!cliente.ok) return cliente;
    dados = { ...form, cliente_id: cliente.dados };
  }
  return salvarRegistro({ tabela: "propostas", modulo: "comercial", id, dados, schema: propostaSchema, revalidar: R });
}

/** Cliente digitado na proposta: reaproveita um cadastro com o mesmo nome ou cria um só com o nome (completar depois em Clientes). */
async function cadastrarClienteNovo(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("comercial");
    const nome = propostaFormSchema.parse(dados).cliente_novo!;
    const supabase = await createClient();
    // mesma razão social (sem diferenciar maiúsculas) = mesmo cliente, evita duplicar ao salvar de novo
    const existente = checar(await supabase.from("clientes").select("id").ilike("razao_social", nome.replace(/[%_\\]/g, "\\$&")).limit(1));
    if (existente?.[0]) return existente[0].id;
    return checar(await supabase.from("clientes").insert({ razao_social: nome }).select("id").single())!.id;
  }, ["/cadastros/clientes"]);
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
