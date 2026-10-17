import { calcularValorMedicao, BASE_DIAS_PADRAO, type StatusMedicao } from "./medicao";
import { deCentavos, paraCentavos } from "./dinheiro";

export interface PendenciaAbatimento {
  /** conta a pagar com descontar_locador = true */
  contaPagarId: string;
  ordemServicoId?: string | null;
  descricao: string;
  /** data usada para ordenar (vencimento) — mais antiga é abatida primeiro */
  data: string;
  /** valor ainda não abatido em repasses anteriores */
  valorPendente: number;
}

export interface AbatimentoAlocado {
  contaPagarId: string;
  ordemServicoId: string | null;
  descricao: string;
  valor: number;
  /** true se a pendência foi quitada integralmente neste repasse */
  quitada: boolean;
}

export interface ResultadoRepasse {
  valorBruto: number;
  valorAbatimentos: number;
  valorLiquido: number;
  abatimentos: AbatimentoAlocado[];
  /** valor que sobra para o próximo repasse */
  saldoRemanescente: number;
}

/** Bruto = (repasse mensal / BASE) × dias. */
export function calcularRepasseBruto(valorRepasseMensal: number, dias: number, baseDias = BASE_DIAS_PADRAO): number {
  return calcularValorMedicao({ valorMensal: valorRepasseMensal, dias, baseDias }).valorBase;
}

/**
 * Aloca as pendências "Descontar do locador" sobre o bruto, das mais antigas para as
 * mais recentes. O líquido nunca fica negativo: o que não couber vira saldo para o
 * próximo repasse (inclusive parte de uma pendência).
 */
export function alocarAbatimentos(valorBruto: number, pendencias: PendenciaAbatimento[]): ResultadoRepasse {
  const brutoC = paraCentavos(valorBruto);
  let disponivel = brutoC;
  const abatimentos: AbatimentoAlocado[] = [];
  let saldo = 0;
  const ordenadas = [...pendencias]
    .filter((p) => paraCentavos(p.valorPendente) > 0)
    .sort((a, b) => (a.data === b.data ? a.contaPagarId.localeCompare(b.contaPagarId) : a.data < b.data ? -1 : 1));

  for (const p of ordenadas) {
    const pend = paraCentavos(p.valorPendente);
    const usar = Math.min(pend, disponivel);
    if (usar > 0) {
      abatimentos.push({
        contaPagarId: p.contaPagarId,
        ordemServicoId: p.ordemServicoId ?? null,
        descricao: p.descricao,
        valor: deCentavos(usar),
        quitada: usar === pend,
      });
      disponivel -= usar;
    }
    saldo += pend - usar;
  }
  const totalC = brutoC - disponivel;
  return {
    valorBruto: deCentavos(brutoC),
    valorAbatimentos: deCentavos(totalC),
    valorLiquido: deCentavos(disponivel),
    abatimentos,
    saldoRemanescente: deCentavos(saldo),
  };
}

export function calcularRepasse(params: {
  valorRepasseMensal: number;
  dias: number;
  pendencias: PendenciaAbatimento[];
  baseDias?: number;
}): ResultadoRepasse {
  return alocarAbatimentos(calcularRepasseBruto(params.valorRepasseMensal, params.dias, params.baseDias), params.pendencias);
}

/** Margem da medição = valor final − repasse líquido (frota própria: margem = valor final). */
export function margemMedicao(valorFinal: number, repasseLiquido: number | null | undefined): number {
  return deCentavos(paraCentavos(valorFinal) - paraCentavos(repasseLiquido ?? 0));
}

export type ResultadoValidacaoPagamento =
  | { permitido: true; adiantado: boolean }
  | { permitido: false; motivo: "CONFIRMACAO_ADIANTAMENTO" | "REPASSE_JA_PAGO" | "REPASSE_CANCELADO" };

/**
 * Pagar repasse cuja medição ainda não foi recebida exige confirmação explícita
 * (fica gravado como adiantado + aprovado_por).
 */
export function validarPagamentoRepasse(
  statusRepasse: "previsto" | "liberado" | "pago" | "cancelado",
  statusMedicao: StatusMedicao,
  confirmouAdiantamento: boolean,
): ResultadoValidacaoPagamento {
  if (statusRepasse === "pago") return { permitido: false, motivo: "REPASSE_JA_PAGO" };
  if (statusRepasse === "cancelado") return { permitido: false, motivo: "REPASSE_CANCELADO" };
  const adiantado = statusMedicao !== "recebido";
  if (adiantado && !confirmouAdiantamento) return { permitido: false, motivo: "CONFIRMACAO_ADIANTAMENTO" };
  return { permitido: true, adiantado };
}
