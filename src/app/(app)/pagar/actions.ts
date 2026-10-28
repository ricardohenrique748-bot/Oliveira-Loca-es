"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { baixaContaSchema, contaPagarEdicaoSchema, contaPagarNovaSchema, estornoContaSchema } from "@/lib/schemas/financeiro";
import { gerarParcelas, hojeSP, planejarEdicaoParcelas, vencimentosRecorrentesFaltantes } from "@/lib/calculos";
import { formatBRL } from "@/lib/format";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

const REVALIDAR = ["/pagar", "/repasses", "/dashboard"];

/** Cria conta única, parcelada (N registros "n/N"), recorrente (12 meses à frente) ou boleto com várias placas (uma conta por placa). */
export async function criarContaPagar(dados: unknown) {
  return executar(async () => {
    const s = await exigirEscrita("pagar");
    const { repeticao, parcelas, parcela_inicial, modo_valor, rateio, itens, ...c } = contaPagarNovaSchema.parse(dados);
    const supabase = await createClient();
    const comum: Omit<TablesInsert<"contas_pagar">, "descricao" | "vencimento" | "valor"> = {
      empresa_id: c.empresa_id, fornecedor_id: c.fornecedor_id, categoria_id: c.categoria_id, tipo: c.tipo,
      veiculo_id: c.tipo === "veiculo" ? c.veiculo_id : null, forma_pagamento: c.forma_pagamento, conta_bancaria_id: c.conta_bancaria_id,
      descontar_locador: c.tipo === "veiculo" && c.descontar_locador, anexo_url: c.anexo_url, observacoes: c.observacoes, created_by: s.userId,
    };
    // valor para o locador: só com "descontar do locador"; em parcelas, na mesma proporção do valor de cada uma
    const locador = comum.descontar_locador && c.valor_locador ? c.valor_locador / c.valor : null;
    const comLocador = (l: TablesInsert<"contas_pagar">) => ({ ...l, valor_locador: locador ? Math.round(Number(l.valor) * locador * 100) / 100 : null });
    let linhas: TablesInsert<"contas_pagar">[];
    if (rateio) {
      // boleto único com várias placas: uma conta por nota, cada uma na sua placa, mesmo vencimento e mesmo boleto
      const obs = `Boleto único de ${formatBRL(c.valor)} com ${itens.length} placas`;
      const linhasRateio = itens.map((i) => ({
        ...comum, empresa_id: i.empresa_id ?? c.empresa_id, veiculo_id: i.veiculo_id, descontar_locador: i.descontar_locador,
        valor_locador: i.descontar_locador ? i.valor_locador : null,
        descricao: i.nota ? `${c.descricao} – NF ${i.nota}` : c.descricao, vencimento: c.vencimento, valor: i.valor!,
        observacoes: c.observacoes ? `${c.observacoes}
${obs}` : obs,
      }));
      checar(await supabase.from("contas_pagar").insert(linhasRateio));
      return { criadas: linhasRateio.length };
    }
    if (repeticao === "parcelada") {
      const grupo = crypto.randomUUID();
      linhas = gerarParcelas({ descricao: c.descricao, valor: c.valor, modo: modo_valor, total: parcelas!, inicio: parcela_inicial ?? 1, primeiroVencimento: c.vencimento })
        .map((p) => ({ ...comum, descricao: p.descricao, vencimento: p.vencimento, valor: p.valor, parcela_num: p.parcelaNum, parcela_total: p.parcelaTotal, grupo_parcela_id: grupo }));
      // vários boletos: um por parcela, na ordem (1º boleto → 1ª parcela gerada); um só (carnê) vai em todas
      const boletos = (c.anexo_url ?? "").split("\n").map((r) => r.trim()).filter(Boolean);
      if (boletos.length > 1) linhas = linhas.map((l, i) => ({ ...l, anexo_url: boletos[i] ?? null }));
    } else if (repeticao === "recorrente") {
      const grupo = crypto.randomUUID();
      const venc = [c.vencimento, ...vencimentosRecorrentesFaltantes({ vencimentoBase: c.vencimento, existentes: [c.vencimento], hoje: hojeSP() })];
      linhas = venc.map((v) => ({ ...comum, descricao: c.descricao, vencimento: v, valor: c.valor, recorrente: true, grupo_parcela_id: grupo }));
    } else {
      linhas = [{ ...comum, descricao: c.descricao, vencimento: c.vencimento, valor: c.valor }];
    }
    checar(await supabase.from("contas_pagar").insert(linhas.map(comLocador)));
    return { criadas: linhas.length };
  }, REVALIDAR);
}

/** Edita conta; em parcelas/recorrências pode aplicar "só esta" ou "esta e as seguintes". */
export async function editarContaPagar(id: string, dados: unknown) {
  return executar(async () => {
    await exigirEscrita("pagar");
    const { escopo, ...c } = contaPagarEdicaoSchema.parse(dados);
    const supabase = await createClient();
    const { data: atual } = await supabase.from("contas_pagar").select("*").eq("id", z.string().uuid().parse(id)).single();
    if (!atual) throw new Error("Conta não encontrada");

    const comuns = {
      empresa_id: c.empresa_id, fornecedor_id: c.fornecedor_id, categoria_id: c.categoria_id, tipo: c.tipo,
      veiculo_id: c.tipo === "veiculo" ? c.veiculo_id : null, forma_pagamento: c.forma_pagamento, conta_bancaria_id: c.conta_bancaria_id,
      descontar_locador: c.tipo === "veiculo" && c.descontar_locador, observacoes: c.observacoes,
    };
    const descontar = comuns.descontar_locador;

    if (escopo === "seguintes" && atual.grupo_parcela_id) {
      const { data: grupo } = await supabase.from("contas_pagar").select("id, parcela_num, parcela_total, descricao, vencimento, valor, pago_em")
        .eq("grupo_parcela_id", atual.grupo_parcela_id).order("vencimento");
      const lista = (grupo ?? []).map((g, i) => ({
        id: g.id, parcelaNum: g.parcela_num ?? i + 1, parcelaTotal: g.parcela_total ?? grupo!.length, descricao: g.descricao,
        vencimento: g.vencimento, valor: g.valor, pago: !!g.pago_em,
      }));
      const alvo = lista.find((g) => g.id === id)!;
      const ehParcelada = atual.parcela_total != null;
      // anexo só se propaga quando foi alterado, para não sobrescrever o boleto próprio de cada parcela
      const anexoMudou = (c.anexo_url ?? null) !== (atual.anexo_url ?? null);
      // vários boletos na parcela (ainda não paga): um por parcela, na ordem, desta em diante (como na criação);
      // assim dá para anexar todos na 1ª e espalhar depois
      const boletos = (c.anexo_url ?? "").split("\n").map((r) => r.trim()).filter(Boolean);
      const distribuir = ehParcelada && !atual.pago_em && boletos.length > 1;
      const plano = planejarEdicaoParcelas(lista, alvo.parcelaNum, {
        valor: c.valor !== atual.valor ? c.valor : undefined,
        vencimento: c.vencimento !== atual.vencimento ? c.vencimento : undefined,
        descricao: c.descricao !== atual.descricao ? c.descricao : undefined,
      }, "seguintes");
      for (const [k, p] of plano.entries()) {
        const alt: TablesUpdate<"contas_pagar"> = { ...comuns };
        // valor para o locador na mesma proporção do valor (parcelas com valores diferentes)
        const valorParcela = p.alteracoes.valor ?? lista.find((g) => g.id === p.id)?.valor ?? c.valor;
        alt.valor_locador = descontar && c.valor_locador ? Math.round(valorParcela * (c.valor_locador / c.valor) * 100) / 100 : null;
        if (p.alteracoes.valor !== undefined) alt.valor = p.alteracoes.valor;
        if (p.alteracoes.vencimento) alt.vencimento = p.alteracoes.vencimento;
        if (p.alteracoes.descricao) alt.descricao = ehParcelada ? p.alteracoes.descricao : c.descricao;
        if (distribuir) { if (boletos[k]) alt.anexo_url = boletos[k]; }
        else if (p.id === id || anexoMudou) alt.anexo_url = c.anexo_url;
        checar(await supabase.from("contas_pagar").update(alt).eq("id", p.id));
      }
      return { alteradas: plano.length };
    }
    checar(await supabase.from("contas_pagar").update({ ...comuns, descricao: c.descricao, vencimento: c.vencimento, valor: c.valor, anexo_url: c.anexo_url,
      valor_locador: descontar ? c.valor_locador : null }).eq("id", id));
    return { alteradas: 1 };
  }, REVALIDAR, "Conta atualizada");
}

export async function baixarContas(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("pagar");
    const b = baixaContaSchema.parse(dados);
    const supabase = await createClient();
    const { data: contas } = await supabase.from("contas_pagar").select("id, valor, conta_bancaria_id, anexo_url").in("id", b.ids).is("pago_em", null);
    for (const c of contas ?? []) {
      checar(await supabase.from("contas_pagar").update({
        pago_em: b.pago_em,
        valor_pago: b.ids.length === 1 && b.valor_pago ? b.valor_pago : c.valor,
        conta_bancaria_id: b.conta_bancaria_id ?? c.conta_bancaria_id,
        // comprovantes somam aos anexos que a conta já tinha (boleto), um por linha
        anexo_url: [c.anexo_url, b.anexo_url].filter(Boolean).join("\n") || null,
      }).eq("id", c.id));
    }
    return { baixadas: contas?.length ?? 0 };
  }, REVALIDAR);
}

export async function estornarContas(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("pagar");
    const { ids } = estornoContaSchema.parse(dados);
    const supabase = await createClient();
    checar(await supabase.from("contas_pagar").update({ pago_em: null, valor_pago: null }).in("id", ids));
    return null;
  }, REVALIDAR, "Pagamento estornado");
}

export async function excluirContas(id: string, escopo: "esta" | "seguintes") {
  return executar(async () => {
    await exigirEscrita("pagar");
    const supabase = await createClient();
    const { data: c } = await supabase.from("contas_pagar").select("id, grupo_parcela_id, vencimento, ordem_servico_id").eq("id", id).single();
    if (!c) throw new Error("Conta não encontrada");
    if (c.ordem_servico_id) throw new Error("Conta gerada por OS — ajuste pela ordem de serviço");
    let q = supabase.from("contas_pagar").delete({ count: "exact" });
    q = escopo === "seguintes" && c.grupo_parcela_id
      ? q.eq("grupo_parcela_id", c.grupo_parcela_id).gte("vencimento", c.vencimento).is("pago_em", null)
      : q.eq("id", id);
    const { count, error } = await q;
    if (error) throw error;
    return { excluidas: count ?? 0 };
  }, REVALIDAR, "Excluído");
}

/** Encerra uma recorrência: remove as futuras não pagas e desmarca recorrente. */
export async function encerrarRecorrencia(id: string) {
  return executar(async () => {
    await exigirEscrita("pagar");
    const supabase = await createClient();
    const { data: c } = await supabase.from("contas_pagar").select("grupo_parcela_id, vencimento").eq("id", id).single();
    if (!c?.grupo_parcela_id) throw new Error("Conta não é recorrente");
    checar(await supabase.from("contas_pagar").delete().eq("grupo_parcela_id", c.grupo_parcela_id).gt("vencimento", c.vencimento).is("pago_em", null));
    checar(await supabase.from("contas_pagar").update({ recorrente: false }).eq("grupo_parcela_id", c.grupo_parcela_id));
    return null;
  }, REVALIDAR, "Recorrência encerrada");
}
