"use server";
import { z } from "zod";
import { salvarRegistro } from "@/lib/crud";
import { resolverClienteNovo } from "@/lib/clientes";
import { enviarAoFaturamento, faturarDiaria } from "../medicoes/actions";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { contratoSchema, desmobilizarSchema, placasContratoSchema, renovacaoSchema } from "@/lib/schemas/operacao";
import { cobrancaAvulsa } from "@/lib/calculos";

export async function salvarContrato(id: string | null, dados: unknown) {
  const cliente = await resolverClienteNovo(dados, "contratos");
  if (!cliente.ok) return cliente;
  // diária / hora vale um dia só: o último dia do contrato é o próprio início (mais dias = renovar)
  const form = cliente.dados as { tipo_cobranca?: string; data_inicio?: string | null; data_fim?: string | null };
  const valores = !id && cobrancaAvulsa(form.tipo_cobranca) ? { ...form, data_fim: form.data_inicio } : form;
  // as outras placas do contrato (só quando o formulário as manda)
  const temExtras = Array.isArray((valores as { placas_extras?: unknown }).placas_extras);
  const extras = placasContratoSchema.safeParse((valores as { placas_extras?: unknown }).placas_extras ?? []);
  if (!extras.success) return { ok: false as const, erro: extras.error.issues[0]?.message ?? "Placas do contrato inválidas" };
  // placa já locada não entra em outro contrato (ao editar, só as que entram agora)
  const veiculoId = (valores as { veiculo_id?: string }).veiculo_id;
  if (veiculoId) {
    const supabase = await createClient();
    const atual = id ? (await supabase.from("contratos").select("veiculo_id").eq("id", id).maybeSingle()).data?.veiculo_id : null;
    const jaNoContrato = new Set<string>([atual ?? ""]);
    if (id && temExtras) for (const p of (await supabase.from("contrato_placas").select("veiculo_id").eq("contrato_id", id)).data ?? []) jaNoContrato.add(p.veiculo_id);
    const novas = [veiculoId, ...(temExtras ? extras.data.map((p) => p.veiculo_id) : [])].filter((v) => !jaNoContrato.has(v));
    if (novas.length) {
      const { data: vs } = await supabase.from("veiculos").select("placa, status").in("id", novas);
      const ocupada = (vs ?? []).find((v) => v.status !== "disponivel" && v.status !== "parado");
      if (ocupada)
        return { ok: false as const, erro: `A placa ${ocupada.placa} está ${ocupada.status === "locado" ? "locada em outro contrato" : "em manutenção ou vendida"} — escolha um veículo disponível` };
    }
  }
  const r = await salvarRegistro({ tabela: "contratos", modulo: "contratos", id, dados: valores, schema: contratoSchema, revalidar: ["/contratos", "/medicoes", "/dashboard", "/cadastros/veiculos", "/manutencao"] });
  if (!r.ok) return r;
  if (temExtras && (id || extras.data.length)) {
    const s = await salvarPlacasContrato(r.dados.id, extras.data.filter((p) => p.veiculo_id !== veiculoId));
    if (!s.ok) {
      // banco sem a tabela das placas (SQL 0071 não rodado): diz o que fazer em vez da mensagem técnica
      const semTabela = /contrato_placas/.test(s.erro) && /schema cache|does not exist/i.test(s.erro);
      return { ok: false as const, erro: semTabela
        ? "Contrato salvo, mas as outras placas não: o banco ainda não tem a tabela das placas. Rode o SQL 0071 (contrato com várias placas) no Supabase e salve de novo."
        : `Contrato salvo, mas as outras placas não: ${s.erro}` };
    }
  }
  if (id) return r;
  // contrato novo já entra no faturamento; se falhar, o contrato fica salvo e a fatura sai pelo "Gerar faturas do período"
  const f = await enviarAoFaturamento(r.dados.id);
  return { ...r, mensagem: f.ok && f.dados.geradas ? "Contrato criado e enviado ao faturamento" : "Contrato criado" };
}

/** Grava as outras placas do contrato: tira as que saíram, atualiza as que ficaram e inclui as novas (os gatilhos acertam veículo e faturas pendentes). */
async function salvarPlacasContrato(contratoId: string, placas: { veiculo_id: string; valor_mensal: number; valor_repasse_mensal: number | null; data_inicio: string | null; data_fim: string | null }[]) {
  return executar(async () => {
    const supabase = await createClient();
    const atuais = checar(await supabase.from("contrato_placas").select("id, veiculo_id").eq("contrato_id", contratoId)) ?? [];
    const sairam = atuais.filter((a) => !placas.some((p) => p.veiculo_id === a.veiculo_id)).map((a) => a.id);
    if (sairam.length) checar(await supabase.from("contrato_placas").delete().in("id", sairam));
    if (placas.length) checar(await supabase.from("contrato_placas").upsert(
      placas.map((p, i) => ({ contrato_id: contratoId, veiculo_id: p.veiculo_id, valor_mensal: p.valor_mensal, valor_repasse_mensal: p.valor_repasse_mensal,
        data_inicio: p.data_inicio, data_fim: p.data_fim, ordem: i })),
      { onConflict: "contrato_id,veiculo_id" }));
    return null;
  }, ["/contratos", "/medicoes", "/cadastros/veiculos"]);
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
    const f = await faturarDiaria(d.contrato_id, d.data, { inicio: d.hora_inicio, fim: d.hora_fim });
    if (!f.ok) throw new Error(f.erro);
    checar(await supabase.from("contratos").update({ data_fim: d.data }).eq("id", d.contrato_id));
    return null;
  }, ["/contratos", "/medicoes", "/dashboard"], "Contrato renovado — fatura do dia enviada ao faturamento");
}
