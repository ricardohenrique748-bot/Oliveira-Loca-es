import { addDias, diffDias, maxData, minData, montar, parseCompetencia, ultimoDiaDoMes, addMesesClamp, parseISO, type ISODate } from "./datas";
import { deCentavos, paraCentavos } from "./dinheiro";

export const BASE_DIAS_PADRAO = 30;

export type DiaCorte = 1 | 21;

export interface Periodo {
  inicio: ISODate;
  fim: ISODate;
}

/**
 * Período de medição de uma competência ("yyyy-MM" = mês em que o período TERMINA).
 *  - corte 1  → 01/MM a último dia de MM
 *  - corte 21 → 21/(MM−1) a 20/MM
 */
export function periodoDaCompetencia(diaCorte: DiaCorte, competencia: string): Periodo {
  const { ano, mes } = parseCompetencia(competencia);
  if (diaCorte === 1) {
    return { inicio: montar(ano, mes, 1), fim: montar(ano, mes, ultimoDiaDoMes(ano, mes)) };
  }
  const fim = montar(ano, mes, 20);
  return { inicio: addMesesClamp(montar(ano, mes, 21), -1), fim };
}

/** Período (do contrato) que contém a data informada. */
export function periodoContendo(diaCorte: DiaCorte, data: ISODate): Periodo {
  const dt = parseISO(data);
  const ano = dt.getUTCFullYear();
  const mes = dt.getUTCMonth() + 1;
  const dia = dt.getUTCDate();
  const comp = montar(ano, mes, 1).slice(0, 7);
  if (diaCorte === 1 || dia <= 20) return periodoDaCompetencia(diaCorte, comp);
  // dia ≥ 21 com corte 21: período termina no dia 20 do mês seguinte
  return periodoDaCompetencia(21, addMesesClamp(montar(ano, mes, 1), 1).slice(0, 7));
}

export interface EntradaDias {
  periodo: Periodo;
  dataInicioContrato: ISODate;
  /** menor entre data_fim e data_desmobilizacao (ou null) */
  dataFimEfetiva?: ISODate | null;
  baseDias?: number;
}

/**
 * Dias a medir no período:
 *  - período completo conta BASE_DIAS (30), independentemente de o mês ter 28 ou 31 dias;
 *  - se o início do contrato ou a desmobilização caírem dentro do período, conta só
 *    os dias efetivos (inclusive), limitado a BASE_DIAS;
 *  - contrato fora do período → 0.
 */
export function calcularDias({ periodo, dataInicioContrato, dataFimEfetiva, baseDias = BASE_DIAS_PADRAO }: EntradaDias): number {
  const ini = maxData(periodo.inicio, dataInicioContrato)!;
  const fim = minData(periodo.fim, dataFimEfetiva)!;
  if (fim < ini) return 0;
  if (ini === periodo.inicio && fim === periodo.fim) return baseDias;
  return Math.min(diffDias(ini, fim) + 1, baseDias);
}

/** Período mensal que começa na data informada (15/01 → 15/01 a 14/02). */
export function periodoMensalDesde(inicio: ISODate): Periodo {
  return { inicio, fim: addDias(addMesesClamp(inicio, 1), -1) };
}

/** Próximo período mensal após uma medição que terminou em `fimAnterior`. */
export function proximoPeriodo(fimAnterior: ISODate): Periodo {
  return periodoMensalDesde(addDias(fimAnterior, 1));
}

/**
 * Dias de um período informado livremente (lançamento manual):
 *  - período de um mês cheio (ex.: 15/01 a 14/02) dentro do contrato conta BASE_DIAS;
 *  - senão, os dias efetivos (inclusive) dentro da vigência, limitado a BASE_DIAS.
 */
export function calcularDiasPeriodoLivre({ periodo, dataInicioContrato, dataFimEfetiva, baseDias = BASE_DIAS_PADRAO }: EntradaDias): number {
  const ini = maxData(periodo.inicio, dataInicioContrato)!;
  const fim = minData(periodo.fim, dataFimEfetiva)!;
  if (fim < ini) return 0;
  if (ini === periodo.inicio && fim === periodo.fim && periodoMensalDesde(ini).fim === fim) return baseDias;
  return Math.min(diffDias(ini, fim) + 1, baseDias);
}

export type TipoCobranca = "mensal" | "diaria" | "hora";

/** Diária e hora: contrato de um dia só (mais dias = renovar); a fatura cobra valor × quantidade (diárias ou horas). */
export function cobrancaAvulsa(tipo: TipoCobranca | string | null | undefined): boolean {
  return tipo === "diaria" || tipo === "hora";
}

export function rotuloValorCobranca(tipo: TipoCobranca | string | null | undefined): string {
  return tipo === "diaria" ? "Valor da diária" : tipo === "hora" ? "Valor da hora" : "Valor mensal";
}

/** Divisor do valor do contrato: diária e hora = 1 (valor × quantidade), mensal = base de dias. */
export function baseCobranca(tipo: TipoCobranca | null | undefined, baseDias = BASE_DIAS_PADRAO): number {
  return cobrancaAvulsa(tipo) ? 1 : baseDias;
}

/** Dias corridos (inclusive) do período dentro da vigência — usado na diária. */
export function calcularDiasCorridos({ periodo, dataInicioContrato, dataFimEfetiva }: EntradaDias): number {
  const ini = maxData(periodo.inicio, dataInicioContrato)!;
  const fim = minData(periodo.fim, dataFimEfetiva)!;
  return fim < ini ? 0 : diffDias(ini, fim) + 1;
}

export interface EntradaValor {
  valorMensal: number;
  dias: number;
  acrescimos?: number;
  descontos?: number;
  baseDias?: number;
}

export interface ValorMedicao {
  valorBase: number;
  valorFinal: number;
}

/** valor = (mensal / BASE) × dias + acréscimos − descontos, arredondado a 2 casas no final (nunca negativo). */
export function calcularValorMedicao({ valorMensal, dias, acrescimos = 0, descontos = 0, baseDias = BASE_DIAS_PADRAO }: EntradaValor): ValorMedicao {
  if (baseDias <= 0) throw new Error("Base de dias deve ser positiva");
  const baseCent = Math.round((paraCentavos(valorMensal) * dias) / baseDias);
  const finalCent = Math.max(0, baseCent + paraCentavos(acrescimos) - paraCentavos(descontos));
  return { valorBase: deCentavos(baseCent), valorFinal: deCentavos(finalCent) };
}

/** Diária = 10 horas; a hora além disso custa a hora normal (diária ÷ 10) com 10% a mais. */
export const HORAS_DIARIA = 10;
export const ADICIONAL_HORA_EXTRA = 0.1;

export function calcularHoraExtra(valorDiaria: number, diarias: number, horasTrabalhadas: number) {
  const horas = Math.max(0, horasTrabalhadas - HORAS_DIARIA * diarias);
  const valorHora = deCentavos(Math.round((paraCentavos(valorDiaria) / HORAS_DIARIA) * (1 + ADICIONAL_HORA_EXTRA)));
  return { horas, valorHora, total: deCentavos(Math.round(paraCentavos(valorHora) * horas)) };
}

/** Vencimento = emissão + prazo (dias corridos). */
export function calcularVencimento(dataEmissao: ISODate | null | undefined, prazoDias: number): ISODate | null {
  return dataEmissao ? addDias(dataEmissao, prazoDias) : null;
}

export type StatusMedicao = "a_faturar" | "faturado" | "recebido_parcial" | "recebido" | "cancelado";
export type StatusMedicaoExibicao = StatusMedicao | "vencido";

/** Status a partir da soma dos recebimentos. */
export function derivarStatusMedicao(atual: StatusMedicao, valorFinal: number, totalRecebido: number): StatusMedicao {
  if (atual === "cancelado") return atual;
  const rec = paraCentavos(totalRecebido);
  if (rec > 0 && rec >= paraCentavos(valorFinal)) return "recebido";
  if (rec > 0) return "recebido_parcial";
  if (atual === "recebido" || atual === "recebido_parcial") return "faturado";
  return atual;
}

/** Status de exibição: "vencido" quando hoje > vencimento e ainda não recebido. */
export function statusExibicaoMedicao(status: StatusMedicao, dataVencimento: ISODate | null | undefined, hoje: ISODate): StatusMedicaoExibicao {
  if ((status === "faturado" || status === "recebido_parcial") && dataVencimento && hoje > dataVencimento) return "vencido";
  return status;
}

export interface ContratoParaMedir {
  id: string;
  valorMensal: number;
  valorRepasseMensal: number | null;
  diaCorte: DiaCorte;
  dataInicio: ISODate;
  dataFim: ISODate | null;
  dataDesmobilizacao: ISODate | null;
  prazoPagamentoDias: number;
  tipoCobranca?: TipoCobranca;
}

export interface MedicaoPrevista {
  contratoId: string;
  periodo: Periodo;
  dias: number;
  valorBase: number;
  valorFinal: number;
  valorRepasseBruto: number | null;
}

/** Prévia de medição de um contrato numa competência (null se o contrato não estava vigente). */
export function preverMedicao(c: ContratoParaMedir, competencia: string, baseDias = BASE_DIAS_PADRAO): MedicaoPrevista | null {
  const periodo = periodoDaCompetencia(c.diaCorte, competencia);
  const entrada = { periodo, dataInicioContrato: c.dataInicio, dataFimEfetiva: minData(c.dataFim, c.dataDesmobilizacao), baseDias };
  const dias = c.tipoCobranca === "diaria" ? calcularDiasCorridos(entrada) : calcularDias(entrada);
  if (dias <= 0) return null;
  const divisor = baseCobranca(c.tipoCobranca, baseDias);
  const { valorBase, valorFinal } = calcularValorMedicao({ valorMensal: c.valorMensal, dias, baseDias: divisor });
  const valorRepasseBruto = c.valorRepasseMensal == null ? null : calcularValorMedicao({ valorMensal: c.valorRepasseMensal, dias, baseDias: divisor }).valorBase;
  return { contratoId: c.id, periodo, dias, valorBase, valorFinal, valorRepasseBruto };
}
