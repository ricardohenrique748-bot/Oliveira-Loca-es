"use server";
import { z } from "zod";
import { excluirRegistro, salvarRegistro } from "@/lib/crud";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { resolverClienteNovo } from "@/lib/clientes";
import { enviarAoFaturamento } from "../../medicoes/actions";
import { placasPropostaSchema, propostaSchema } from "@/lib/schemas/comercial";

const R = ["/comercial/propostas"];

export async function salvarProposta(id: string | null, dados: unknown) {
  if (id) {
    const supabase = await createClient();
    const { data: atual } = await supabase.from("propostas").select("status").eq("id", id).maybeSingle();
    if (atual?.status === "convertida") return { ok: false as const, erro: "Esta proposta já virou contrato — altere direto no contrato." };
  }
  const cliente = await resolverClienteNovo(dados, "comercial");
  if (!cliente.ok) return cliente;
  // as outras placas da proposta (só quando o formulário as manda)
  const valores = cliente.dados as { placas_extras?: unknown; veiculo_id?: string | null };
  const temExtras = Array.isArray(valores.placas_extras);
  const extras = placasPropostaSchema.safeParse(valores.placas_extras ?? []);
  if (!extras.success) return { ok: false as const, erro: extras.error.issues[0]?.message ?? "Placas da proposta inválidas" };
  const r = await salvarRegistro({ tabela: "propostas", modulo: "comercial", id, dados: cliente.dados, schema: propostaSchema, revalidar: R });
  if (!r.ok || !temExtras || (!id && !extras.data.length)) return r;
  const principal = valores.veiculo_id ?? null;
  const s = await salvarPlacasProposta(r.dados.id, principal ? extras.data.filter((p) => p.veiculo_id !== principal) : []);
  if (!s.ok) {
    // banco sem a tabela (SQL 0085 não rodado): diz o que fazer em vez da mensagem técnica
    const semTabela = /proposta_placas/.test(s.erro) && /schema cache|does not exist/i.test(s.erro);
    return {
      ok: false as const,
      erro: semTabela
        ? "Proposta salva, mas as outras placas não: o banco ainda não tem a tabela das placas. Rode o SQL 0085 (proposta com várias placas) no Supabase e salve de novo."
        : `Proposta salva, mas as outras placas não: ${s.erro}`,
    };
  }
  return r;
}

async function salvarPlacasProposta(propostaId: string, placas: { veiculo_id: string; valor: number }[]) {
  return executar(async () => {
    const supabase = await createClient();
    const atuais = checar(await supabase.from("proposta_placas").select("id, veiculo_id").eq("proposta_id", propostaId)) ?? [];
    const sairam = atuais.filter((a) => !placas.some((p) => p.veiculo_id === a.veiculo_id)).map((a) => a.id);
    if (sairam.length) checar(await supabase.from("proposta_placas").delete().in("id", sairam));
    if (placas.length) checar(await supabase.from("proposta_placas").upsert(
      placas.map((p, i) => ({ proposta_id: propostaId, veiculo_id: p.veiculo_id, valor: p.valor, ordem: i })),
      { onConflict: "proposta_id,veiculo_id" }));
    return null;
  }, R);
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
    // como no contrato criado à mão, a primeira fatura já vai para o faturamento
    await enviarAoFaturamento(contratoId);
    return { contratoId };
  }, [...R, "/contratos", "/medicoes", "/cadastros/veiculos"], "Contrato gerado a partir da proposta");
}
