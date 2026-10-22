"use server";
import { z } from "zod";
import { salvarRegistro } from "@/lib/crud";
import { resolverClienteNovo } from "@/lib/clientes";
import { enviarAoFaturamento, faturarDiaria } from "../medicoes/actions";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { contratoSchema, desmobilizarSchema, renovacaoSchema } from "@/lib/schemas/operacao";
import { cobrancaAvulsa } from "@/lib/calculos";

export async function salvarContrato(id: string | null, dados: unknown) {
  const cliente = await resolverClienteNovo(dados, "contratos");
  if (!cliente.ok) return cliente;
  // diária / hora vale um dia só: o último dia do contrato é o próprio início (mais dias = renovar)
  const form = cliente.dados as { tipo_cobranca?: string; data_inicio?: string | null; data_fim?: string | null };
  const valores = !id && cobrancaAvulsa(form.tipo_cobranca) ? { ...form, data_fim: form.data_inicio } : form;
  const r = await salvarRegistro({ tabela: "contratos", modulo: "contratos", id, dados: valores, schema: contratoSchema, revalidar: ["/contratos", "/medicoes", "/dashboard"] });
  if (!r.ok || id) return r;
  // contrato novo já entra no faturamento; se falhar, o contrato fica salvo e a fatura sai pelo "Gerar faturas do período"
  const f = await enviarAoFaturamento(r.dados.id);
  return { ...r, mensagem: f.ok && f.dados.geradas ? "Contrato criado e enviado ao faturamento" : "Contrato criado" };
}

/** Exclui o contrato com as medições dele (e recebimentos, boletos e repasses delas). */
export async function excluirContrato(id: string) {
  return executar(async () => {
    await exigirEscrita("contratos");
    const contratoId = z.string().uuid().parse(id);
    const supabase = await createClient();
    const contrato = checar(await supabase.from("contratos").select("veiculo_id, status").eq("id", contratoId).maybeSingle());
    if (!contrato) throw new Error("Contrato não encontrado ou sem permissão");
    const medicoes = (checar(await supabase.from("medicoes").select("id").eq("contrato_id", contratoId)) ?? []).map((m) => m.id);
    // filhos primeiro: se algo falhar no meio, o contrato continua inteiro
    if (medicoes.length) {
      checar(await supabase.from("boletos").delete().in("medicao_id", medicoes));
      checar(await supabase.from("recebimentos").delete().in("medicao_id", medicoes));
      checar(await supabase.from("repasses").delete().in("medicao_id", medicoes));
      checar(await supabase.from("medicoes").delete().in("id", medicoes));
    }
    checar(await supabase.from("propostas").update({ contrato_id: null }).eq("contrato_id", contratoId));
    checar(await supabase.from("contratos").delete().eq("id", contratoId));
    // sem contrato ativo, o veículo volta a ficar disponível
    if (contrato.status === "ativo") await supabase.from("veiculos").update({ status: "disponivel" }).eq("id", contrato.veiculo_id).eq("status", "locado");
    return null;
  }, ["/contratos", "/medicoes", "/receber", "/repasses", "/dashboard", "/cadastros/veiculos"], "Contrato excluído");
}

export async function desmobilizarContrato(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("contratos");
    const d = desmobilizarSchema.parse(dados);
    const supabase = await createClient();
    const c = checar(await supabase.from("contratos").select("tipo_cobranca").eq("id", d.contrato_id).maybeSingle());
    // diária / hora: cada dia já tem a sua fatura, então só encerra (o trigger devolve o veículo)
    if (cobrancaAvulsa(c?.tipo_cobranca)) {
      checar(await supabase.from("contratos").update({ status: "encerrado", data_desmobilizacao: d.data }).eq("id", d.contrato_id));
      return { medicaoId: null };
    }
    const medicaoId = checar(await supabase.rpc("fn_desmobilizar_contrato", { p_contrato: d.contrato_id, p_data: d.data }));
    return { medicaoId };
  }, ["/contratos", "/medicoes", "/dashboard", "/cadastros/veiculos"], "Contrato desmobilizado");
}

/** Diária / hora: mais um dia de locação — estende o contrato e manda a fatura do dia ao faturamento. */
export async function renovarContrato(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("contratos");
    const d = renovacaoSchema.parse(dados);
    const supabase = await createClient();
    const c = checar(await supabase.from("contratos").select("tipo_cobranca, status, data_inicio, data_fim").eq("id", d.contrato_id).maybeSingle());
    if (!c) throw new Error("Contrato não encontrado ou sem permissão");
    if (!cobrancaAvulsa(c.tipo_cobranca)) throw new Error("Só contrato por diária ou por hora é renovado");
    if (c.status !== "ativo") throw new Error("Só contrato ativo pode ser renovado");
    if (d.data <= (c.data_fim ?? c.data_inicio)) throw new Error("Escolha um dia depois do último dia do contrato");
    const f = await faturarDiaria(d.contrato_id, d.data);
    if (!f.ok) throw new Error(f.erro);
    checar(await supabase.from("contratos").update({ data_fim: d.data }).eq("id", d.contrato_id));
    return null;
  }, ["/contratos", "/medicoes", "/dashboard"], "Contrato renovado — fatura do dia enviada ao faturamento");
}
