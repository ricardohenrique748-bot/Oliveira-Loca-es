"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { excluirRegistro, salvarRegistro } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { abrirOSSchema, documentoSchema, editarOSSchema, fecharOSSchema, itemOSSchema, leituraSchema, multaSchema, planoSchema, pneuSchema } from "@/lib/schemas/manutencao";

const M = "/manutencao";
const REV = [M, `${M}/ordens`, `${M}/planos`, "/dashboard", "/cadastros/veiculos"];

// ---------- Planos ----------
export async function salvarPlano(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "planos_manutencao", modulo: "manutencao", id, dados, schema: planoSchema, revalidar: REV });
}
export async function excluirPlano(id: string) {
  return excluirRegistro({ tabela: "planos_manutencao", modulo: "manutencao", id, revalidar: REV });
}
export async function aplicarPlanoModelo(id: string) {
  return executar(async () => {
    await exigirEscrita("manutencao");
    const supabase = await createClient();
    const n = checar(await supabase.rpc("fn_aplicar_plano_modelo", { p_plano: id }));
    return { criados: n ?? 0 };
  }, REV);
}

// ---------- OS ----------
export async function abrirOS(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("manutencao");
    const d = abrirOSSchema.parse(dados);
    const supabase = await createClient();
    const { data: v } = await supabase.from("veiculos").select("empresa_id, proprietario").eq("id", d.veiculo_id).single();
    if (!v) throw new Error("Veículo não encontrado");
    const os = checar(await supabase.from("ordens_servico").insert({
      ...d, empresa_id: v.empresa_id, descontar_locador: d.descontar_locador && v.proprietario === "locador",
    }).select("id, numero").single());
    return os!;
  }, REV, "OS aberta");
}

export async function editarOS(id: string, dados: unknown) {
  return executar(async () => {
    await exigirEscrita("manutencao");
    const d = editarOSSchema.parse(dados);
    const supabase = await createClient();
    checar(await supabase.from("ordens_servico").update(d).eq("id", id).not("status", "in", "(fechada,cancelada)"));
    return null;
  }, [...REV, `${M}/ordens/${id}`], "OS atualizada");
}

export async function mudarStatusOS(id: string, status: "aberta" | "em_execucao" | "aguardando_peca" | "cancelada") {
  return executar(async () => {
    await exigirEscrita("manutencao");
    const s = z.enum(["aberta", "em_execucao", "aguardando_peca", "cancelada"]).parse(status);
    const supabase = await createClient();
    checar(await supabase.from("ordens_servico").update({ status: s }).eq("id", id).not("status", "in", "(fechada,cancelada)"));
    return null;
  }, [...REV, `${M}/ordens/${id}`], "Status atualizado");
}

export async function salvarItemOS(id: string | null, dados: unknown) {
  return executar(async () => {
    await exigirEscrita("manutencao");
    const d = itemOSSchema.parse(dados);
    const supabase = await createClient();
    const { data: os } = await supabase.from("ordens_servico").select("status").eq("id", d.ordem_servico_id).single();
    if (!os || os.status === "fechada" || os.status === "cancelada") throw new Error("OS fechada não pode ser alterada");
    if (id) checar(await supabase.from("os_itens").update(d).eq("id", id));
    else checar(await supabase.from("os_itens").insert(d));
    return null;
  }, [`${M}/ordens/${(dados as { ordem_servico_id?: string })?.ordem_servico_id ?? ""}`, `${M}/ordens`]);
}

export async function excluirItemOS(id: string, osId: string) {
  return excluirRegistro({ tabela: "os_itens", modulo: "manutencao", id, revalidar: [`${M}/ordens/${osId}`] });
}

export async function anexarFotoOS(id: string, ref: string) {
  return executar(async () => {
    await exigirEscrita("manutencao");
    const supabase = await createClient();
    const { data: os } = await supabase.from("ordens_servico").select("fotos").eq("id", id).single();
    checar(await supabase.from("ordens_servico").update({ fotos: [...(os?.fotos ?? []), z.string().parse(ref)] }).eq("id", id));
    return null;
  }, [`${M}/ordens/${id}`], "Foto anexada");
}

/** Fecha a OS via RPC (conta a pagar vinculada, plano preventivo, leitura e status do veículo). */
export async function fecharOS(id: string, dados: unknown) {
  return executar(async () => {
    await exigirEscrita("manutencao");
    const d = fecharOSSchema.parse(dados);
    const supabase = await createClient();
    const conta = checar(await supabase.rpc("fn_fechar_os", {
      p_os: id, p_data_fechamento: d.data_fechamento, p_km: d.km ?? undefined, p_horimetro: d.horimetro ?? undefined,
      p_horas_parado: d.horas_parado ?? undefined, p_gerar_conta: d.gerar_conta, p_vencimento: d.vencimento ?? undefined,
      p_forma_pagamento: d.forma_pagamento, p_conta_bancaria: d.conta_bancaria_id ?? undefined, p_categoria: d.categoria_id ?? undefined,
      p_diagnostico: d.diagnostico ?? undefined,
    }));
    return { contaPagarId: conta };
  }, [...REV, `${M}/ordens/${id}`, "/pagar", "/repasses"], "OS fechada");
}

// ---------- Documentos ----------
export async function salvarDocumento(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "documentos_veiculo", modulo: "manutencao", id, dados, schema: documentoSchema, revalidar: [`${M}/documentos`, M] });
}
export async function excluirDocumento(id: string) {
  return excluirRegistro({ tabela: "documentos_veiculo", modulo: "manutencao", id, revalidar: [`${M}/documentos`, M] });
}

// ---------- Multas ----------
export async function salvarMulta(id: string | null, dados: unknown) {
  return salvarRegistro({ tabela: "multas", modulo: "manutencao", id, dados, schema: multaSchema, revalidar: [`${M}/multas`, M, "/cadastros/veiculos"] });
}
export async function excluirMulta(id: string) {
  return excluirRegistro({ tabela: "multas", modulo: "manutencao", id, revalidar: [`${M}/multas`, M, "/cadastros/veiculos"] });
}

// ---------- Pneus ----------
export async function salvarPneu(id: string | null, dados: unknown) {
  return executar(async () => {
    await exigirEscrita("manutencao");
    const d = pneuSchema.parse(dados);
    const supabase = await createClient();
    let antes: { veiculo_id: string | null; posicao: string | null; ressolagens: number; status: string } | null = null;
    if (id) {
      const { data } = await supabase.from("pneus").select("veiculo_id, posicao, ressolagens, status").eq("id", id).single();
      antes = data;
      checar(await supabase.from("pneus").update(d).eq("id", id));
    }
    const novo = id ? { id } : checar(await supabase.from("pneus").insert(d).select("id").single())!;
    // histórico automático
    const eventos: { evento: string; veiculo_id: string | null; posicao: string | null }[] = [];
    if (!antes && d.veiculo_id) eventos.push({ evento: "instalacao", veiculo_id: d.veiculo_id, posicao: d.posicao });
    if (antes) {
      if (antes.veiculo_id !== d.veiculo_id) {
        if (antes.veiculo_id) eventos.push({ evento: "remocao", veiculo_id: antes.veiculo_id, posicao: antes.posicao });
        if (d.veiculo_id) eventos.push({ evento: "instalacao", veiculo_id: d.veiculo_id, posicao: d.posicao });
      } else if (antes.posicao !== d.posicao && d.veiculo_id) eventos.push({ evento: "rodizio", veiculo_id: d.veiculo_id, posicao: d.posicao });
      if (d.ressolagens > antes.ressolagens) eventos.push({ evento: "ressolagem", veiculo_id: d.veiculo_id, posicao: d.posicao });
      if (d.status === "descartado" && antes.status !== "descartado") eventos.push({ evento: "descarte", veiculo_id: null, posicao: null });
    }
    if (eventos.length) {
      const { data: v } = d.veiculo_id ? await supabase.from("veiculos").select("km_atual").eq("id", d.veiculo_id).single() : { data: null };
      checar(await supabase.from("pneus_historico").insert(eventos.map((e) => ({ ...e, pneu_id: novo.id, km: v?.km_atual ?? null }))));
    }
    return { id: novo.id };
  }, [`${M}/pneus`], id ? "Pneu atualizado" : "Pneu cadastrado");
}
export async function excluirPneu(id: string) {
  return excluirRegistro({ tabela: "pneus", modulo: "manutencao", id, revalidar: [`${M}/pneus`] });
}
export async function historicoPneu(id: string) {
  return executar(async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("pneus_historico").select("id, data, evento, posicao, km, veiculos(placa)").eq("pneu_id", id).order("data", { ascending: false }).order("created_at", { ascending: false });
    return (data ?? []).map((h) => ({ id: h.id, data: h.data, evento: h.evento, posicao: h.posicao, km: h.km, placa: h.veiculos?.placa ?? null }));
  });
}

// ---------- Leituras ----------
export async function lancarLeituras(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("manutencao");
    const lista = z.array(leituraSchema).min(1).max(200).parse(dados);
    const supabase = await createClient();
    const ids = lista.map((l) => l.veiculo_id);
    const { data: atuais } = await supabase.from("veiculos").select("id, placa, km_atual, horimetro_atual").in("id", ids);
    const avisos: string[] = [];
    for (const l of lista) {
      const v = atuais?.find((a) => a.id === l.veiculo_id);
      if (v && l.km != null && l.km < v.km_atual) avisos.push(`${v.placa}: km menor que o atual`);
      if (v && l.horimetro != null && l.horimetro < v.horimetro_atual) avisos.push(`${v.placa}: horímetro menor que o atual`);
    }
    // vw_preventivas_status recalcula ao vivo; status_calculado dos planos é atualizado pelo job diário
    checar(await supabase.from("leituras").insert(lista.map((l) => ({ ...l, origem: "manual" as const }))));
    return { lancadas: lista.length, avisos };
  }, [`${M}/leituras`, M, `${M}/planos`]);
}
