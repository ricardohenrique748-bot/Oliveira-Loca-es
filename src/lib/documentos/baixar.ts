"use client";
/** Busca no banco o que cada documento precisa e baixa o PDF. */
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { montarContrato, type DadosContrato } from "./contrato";
import { montarFatura, type DadosFatura } from "./fatura";
import { montarProposta, type DadosProposta } from "./proposta";
import { baixarDocumentoPDF } from "./pdf";
import { montarReciboDescontos, montarReciboRepasse, type DadosReciboRepasse } from "./recibo-repasse";
export type { ItemRecibo } from "./recibo-repasse";
import { hojeSP } from "@/lib/calculos";

const EMPRESA = "razao_social, cnpj, endereco, cidade, uf, contato_nome, telefone, email";
const CLIENTE = "razao_social, nome_fantasia, cnpj, endereco, cidade, uf, email";

async function gerar(montar: () => Promise<Parameters<typeof baixarDocumentoPDF>[0] | null>) {
  try {
    const d = await montar();
    if (!d) return void toast.error("Registro não encontrado");
    await baixarDocumentoPDF(d);
  } catch (e) {
    console.error(e);
    // mostra o motivo: sem ele não dá para saber se foi o banco (consulta) ou o desenho do PDF
    const motivo = e instanceof Error ? e.message : (e as { message?: string })?.message;
    toast.error(`Não foi possível gerar o PDF${motivo ? `: ${motivo}` : ""}`);
  }
}

export function baixarPropostaPDF(id: string) {
  return gerar(async () => {
    const { data: p, error } = await createClient().from("propostas")
      .select(`numero, created_at, modelo_documento, modalidade, tipo_cobranca, valor, quantidade, franquia, km_livre, jornada, equipamento, contato_cliente,
        local_operacao, data_inicio_prevista, periodo_minimo, validade, prazo_pagamento_dias, dia_corte_inicio, valor_mobilizacao,
        valor_desmobilizacao, multa_rescisao_pct, condicoes,
        empresas(${EMPRESA}), clientes(${CLIENTE}), obras(nome), veiculos(placa, tipo, marca, modelo, ano)`)
      .eq("id", id).maybeSingle();
    if (error) throw error;
    if (!p?.empresas || !p.clientes) return null;
    const dados: DadosProposta = {
      ...p,
      modelo_documento: p.modelo_documento as DadosProposta["modelo_documento"], modalidade: p.modalidade as DadosProposta["modalidade"],
      tipo_cobranca: p.tipo_cobranca as DadosProposta["tipo_cobranca"], valor: Number(p.valor),
      valor_mobilizacao: p.valor_mobilizacao == null ? null : Number(p.valor_mobilizacao),
      valor_desmobilizacao: p.valor_desmobilizacao == null ? null : Number(p.valor_desmobilizacao),
      multa_rescisao_pct: Number(p.multa_rescisao_pct),
      empresa: p.empresas, cliente: p.clientes, obra: p.obras?.nome ?? null, veiculo: p.veiculos ?? null,
    };
    return montarProposta(dados);
  });
}

export function baixarContratoPDF(id: string) {
  return gerar(async () => {
    const { data: c, error } = await createClient().from("contratos")
      .select(`numero, tipo_cobranca, valor_mensal, dia_corte_inicio, prazo_pagamento_dias, data_inicio, data_fim,
        empresas(${EMPRESA}), clientes(${CLIENTE}), obras(nome),
        veiculos(placa, marca, modelo, ano, chassi, cor, km_atual, horimetro_atual, proprietario)`)
      .eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c?.empresas || !c.clientes || !c.veiculos) return null;
    const dados: DadosContrato = {
      ...c,
      tipo_cobranca: c.tipo_cobranca as DadosContrato["tipo_cobranca"], valor_mensal: Number(c.valor_mensal),
      empresa: c.empresas, cliente: c.clientes, obra: c.obras?.nome ?? null,
      veiculo: { ...c.veiculos, km_atual: Number(c.veiculos.km_atual), horimetro_atual: Number(c.veiculos.horimetro_atual) },
    };
    return montarContrato(dados);
  });
}

export function baixarFaturaPDF(id: string, baseDias: number) {
  return gerar(async () => {
    const { data: m, error } = await createClient().from("medicoes")
      .select(`periodo_inicio, periodo_fim, dias, valor_mensal, valor_base, acrescimos, descontos, valor_final, numero_nf, data_emissao,
        data_vencimento, forma_pagamento, acrescimos_itens, descontos_itens, observacoes, descricao, unidade, itens,
        empresas(${EMPRESA}), clientes(${CLIENTE}), veiculos(placa, tipo), contratos(numero, tipo_cobranca, clientes(${CLIENTE}), obras(nome), veiculos(placa, tipo))`)
      .eq("id", id).maybeSingle();
    if (error) throw error;
    // sem contrato (fatura avulsa): o cliente vem da própria fatura e não há veículo
    const c = m?.contratos;
    const cliente = c?.clientes ?? m?.clientes;
    if (!m?.empresas || !cliente || (c && !c.veiculos)) return null;
    const dados: DadosFatura = {
      ...m,
      valor_mensal: Number(m.valor_mensal), valor_base: Number(m.valor_base), acrescimos: Number(m.acrescimos),
      descontos: Number(m.descontos), valor_final: Number(m.valor_final),
      forma_pagamento: m.forma_pagamento as DadosFatura["forma_pagamento"],
      acrescimos_itens: ((m.acrescimos_itens ?? []) as DadosFatura["acrescimos_itens"]).map((a) => ({ descricao: a.descricao, valor: Number(a.valor) })),
      descontos_itens: ((m.descontos_itens ?? []) as DadosFatura["descontos_itens"]).map((a) => ({ descricao: a.descricao, valor: Number(a.valor) })),
      itens: (m.itens ?? []) as unknown as DadosFatura["itens"],
      contrato_numero: c?.numero == null ? null : String(c.numero), tipo_cobranca: (c?.tipo_cobranca ?? "avulsa") as DadosFatura["tipo_cobranca"], base_dias: baseDias,
      placa: (c?.veiculos ?? m.veiculos)?.placa ?? null, veiculo_tipo: (c?.veiculos ?? m.veiculos)?.tipo ?? null, obra: c?.obras?.nome ?? null,
      empresa: m.empresas, cliente,
    };
    return montarFatura(dados);
  });
}

/** Recibo para o locador assinar: os repasses escolhidos (mesma placa), com os abatimentos de cada um. */
export function baixarReciboRepassePDF(ids: string[], ajustes?: DadosReciboRepasse["ajustes"]) {
  return gerar(async () => {
    const supabase = createClient();
    const { data: rs, error } = await supabase.from("repasses_v")
      .select("id, placa, locador_id, empresa_id, periodo_inicio, periodo_fim, dias, valor_bruto, valor_liquido").in("id", ids);
    if (error) throw error;
    const [r0] = rs ?? [];
    if (!r0?.locador_id || !r0.empresa_id) return null;
    const [loc, emp, abat] = await Promise.all([
      supabase.from("locadores").select("nome, cpf_cnpj, chave_pix, tipo_chave_pix, banco, nome_titular_pix").eq("id", r0.locador_id).maybeSingle(),
      supabase.from("empresas").select(EMPRESA).eq("id", r0.empresa_id).maybeSingle(),
      supabase.from("repasse_abatimentos").select("repasse_id, descricao, valor").in("repasse_id", ids),
    ]);
    for (const x of [loc, emp, abat]) if (x.error) throw x.error;
    if (!loc.data || !emp.data) return null;
    const dados: DadosReciboRepasse = {
      placa: r0.placa ?? "", empresa: emp.data, locador: loc.data as DadosReciboRepasse["locador"], data: hojeSP(), ajustes,
      repasses: (rs ?? []).map((r) => ({
        periodo_inicio: r.periodo_inicio!, periodo_fim: r.periodo_fim!, dias: r.dias, valor_bruto: r.valor_bruto ?? 0, valor_liquido: r.valor_liquido ?? 0,
        abatimentos: (abat.data ?? []).filter((a) => a.repasse_id === r.id).map((a) => ({ descricao: a.descricao, valor: a.valor })),
      })),
    };
    return montarReciboRepasse(dados);
  });
}

/** Recibo das despesas "descontar do locador" de uma placa sem fatura (mesmo modelo do recibo de repasse). */
export function baixarReciboDescontosPDF(contaIds: string[]) {
  return gerar(async () => {
    const supabase = createClient();
    const { data: cs, error } = await supabase.from("contas_pagar_v")
      .select("id, placa, veiculo_id, empresa_id, descricao, vencimento, valor, valor_locador, valor_abatido").in("id", contaIds);
    if (error) throw error;
    const [c0] = cs ?? [];
    if (!c0?.veiculo_id || !c0.empresa_id) return null;
    const { data: v, error: ev } = await supabase.from("veiculos").select("locador_id").eq("id", c0.veiculo_id).maybeSingle();
    if (ev) throw ev;
    if (!v?.locador_id) return null;
    const [loc, emp] = await Promise.all([
      supabase.from("locadores").select("nome, cpf_cnpj, chave_pix, tipo_chave_pix, banco, nome_titular_pix").eq("id", v.locador_id).maybeSingle(),
      supabase.from("empresas").select(EMPRESA).eq("id", c0.empresa_id).maybeSingle(),
    ]);
    for (const x of [loc, emp]) if (x.error) throw x.error;
    if (!loc.data || !emp.data) return null;
    return montarReciboDescontos({
      placa: c0.placa ?? "", empresa: emp.data, locador: loc.data as DadosReciboRepasse["locador"], data: hojeSP(),
      descontos: (cs ?? []).map((c) => ({ descricao: c.descricao ?? "Despesa", data: c.vencimento,
        valor: Math.round(((c.valor_locador ?? c.valor ?? 0) - (c.valor_abatido ?? 0)) * 100) / 100 })).filter((x) => x.valor > 0),
    });
  });
}
