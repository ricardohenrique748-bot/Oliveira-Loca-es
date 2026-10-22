"use client";
/** Busca no banco o que cada documento precisa e baixa o PDF. */
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { montarContrato, type DadosContrato } from "./contrato";
import { montarFatura, type DadosFatura } from "./fatura";
import { montarProposta, type DadosProposta } from "./proposta";
import { baixarDocumentoPDF } from "./pdf";

const EMPRESA = "razao_social, cnpj, endereco, cidade, uf, contato_nome, telefone, email";
const CLIENTE = "razao_social, nome_fantasia, cnpj, endereco, cidade, uf, email";

async function gerar(montar: () => Promise<Parameters<typeof baixarDocumentoPDF>[0] | null>) {
  try {
    const d = await montar();
    if (!d) return void toast.error("Registro não encontrado");
    await baixarDocumentoPDF(d);
  } catch (e) {
    console.error(e);
    toast.error("Não foi possível gerar o PDF");
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
        data_vencimento, forma_pagamento, descricao, observacoes,
        empresas(${EMPRESA}), contratos(numero, tipo_cobranca, clientes(${CLIENTE}), obras(nome), veiculos(placa, tipo))`)
      .eq("id", id).maybeSingle();
    if (error) throw error;
    const c = m?.contratos;
    if (!m?.empresas || !c?.clientes || !c.veiculos) return null;
    const dados: DadosFatura = {
      ...m,
      valor_mensal: Number(m.valor_mensal), valor_base: Number(m.valor_base), acrescimos: Number(m.acrescimos),
      descontos: Number(m.descontos), valor_final: Number(m.valor_final),
      forma_pagamento: m.forma_pagamento as DadosFatura["forma_pagamento"],
      contrato_numero: c.numero == null ? null : String(c.numero), tipo_cobranca: c.tipo_cobranca as DadosFatura["tipo_cobranca"], base_dias: baseDias,
      placa: c.veiculos.placa, veiculo_tipo: c.veiculos.tipo, obra: c.obras?.nome ?? null,
      empresa: m.empresas, cliente: c.clientes,
    };
    return montarFatura(dados);
  });
}
