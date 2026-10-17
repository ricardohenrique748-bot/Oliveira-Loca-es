import { diffDias, maxData, minData, type ISODate } from "./datas";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const arred1 = (v: number) => Math.round(v * 10) / 10;

/** Disponibilidade física (%) = (horas do período − horas paradas) / horas do período × 100 */
export function disponibilidadeFisica(horasPeriodo: number, horasParadas: number): number {
  if (horasPeriodo <= 0) return 0;
  return arred1(clamp(((horasPeriodo - horasParadas) / horasPeriodo) * 100, 0, 100));
}

/** Taxa de ocupação (%) = dias locados / dias do período × 100 */
export function taxaOcupacao(diasLocados: number, diasPeriodo: number): number {
  if (diasPeriodo <= 0) return 0;
  return arred1(clamp((diasLocados / diasPeriodo) * 100, 0, 100));
}

/** MTTR = média de horas paradas das corretivas (null se não houve corretiva). */
export function mttr(horasParadoCorretivas: number[]): number | null {
  if (!horasParadoCorretivas.length) return null;
  return arred1(horasParadoCorretivas.reduce((s, h) => s + h, 0) / horasParadoCorretivas.length);
}

/** MTBF = dias operando / nº de corretivas (null se não houve corretiva). */
export function mtbf(diasOperando: number, qtdCorretivas: number): number | null {
  if (qtdCorretivas <= 0) return null;
  return arred1(diasOperando / qtdCorretivas);
}

export function custoPorUnidade(custo: number, unidades: number): number | null {
  if (unidades <= 0) return null;
  return Math.round((custo / unidades) * 100) / 100;
}

/** Percentual de preventivas sobre o total de OS (preventiva + corretiva). */
export function pctPreventiva(qtdPreventivas: number, qtdCorretivas: number): number | null {
  const t = qtdPreventivas + qtdCorretivas;
  return t ? arred1((qtdPreventivas / t) * 100) : null;
}

/** Horas de um intervalo de datas (inclusive). */
export function horasNoPeriodo(inicio: ISODate, fim: ISODate): number {
  return (diffDias(inicio, fim) + 1) * 24;
}

/** Dias de interseção entre dois intervalos fechados de datas. */
export function diasSobrepostos(a: { inicio: ISODate; fim: ISODate }, b: { inicio: ISODate; fim: ISODate }): number {
  const ini = maxData(a.inicio, b.inicio)!;
  const fim = minData(a.fim, b.fim)!;
  return fim < ini ? 0 : diffDias(ini, fim) + 1;
}

export type FaixaAging = "a_vencer" | "1-30" | "31-60" | "61-90" | "90+";

export function faixaAging(vencimento: ISODate, hoje: ISODate): FaixaAging {
  const atraso = diffDias(vencimento, hoje);
  if (atraso <= 0) return "a_vencer";
  if (atraso <= 30) return "1-30";
  if (atraso <= 60) return "31-60";
  if (atraso <= 90) return "61-90";
  return "90+";
}
