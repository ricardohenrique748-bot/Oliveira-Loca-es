/**
 * Aritmética de datas sobre strings ISO "yyyy-MM-dd" (datas civis, sem fuso).
 * Todas as contas usam UTC internamente para não sofrer com horário de verão
 * nem com o fuso da máquina.
 */

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIA_MS = 86_400_000;

export function parseISO(d: ISODate): Date {
  const m = ISO_RE.exec(d);
  if (!m) throw new Error(`Data inválida: ${d}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function isISODate(d: unknown): d is ISODate {
  if (typeof d !== "string" || !ISO_RE.test(d)) return false;
  return toISO(parseISO(d)) === d;
}

export function addDias(d: ISODate, n: number): ISODate {
  return toISO(new Date(parseISO(d).getTime() + n * DIA_MS));
}

/** Diferença em dias corridos (b − a). */
export function diffDias(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DIA_MS);
}

export function ultimoDiaDoMes(ano: number, mes1a12: number): number {
  return new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
}

export function fimDoMes(d: ISODate): ISODate {
  const dt = parseISO(d);
  const ano = dt.getUTCFullYear();
  const mes = dt.getUTCMonth() + 1;
  return montar(ano, mes, ultimoDiaDoMes(ano, mes));
}

export function inicioDoMes(d: ISODate): ISODate {
  return d.slice(0, 8) + "01";
}

export function montar(ano: number, mes1a12: number, dia: number): ISODate {
  return `${String(ano).padStart(4, "0")}-${String(mes1a12).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Soma meses mantendo o dia, limitado ao último dia do mês de destino
 * (31/01 + 1 mês = 28/02 ou 29/02).
 */
export function addMesesClamp(d: ISODate, n: number, diaPreferido?: number): ISODate {
  const dt = parseISO(d);
  const dia = diaPreferido ?? dt.getUTCDate();
  const total = dt.getUTCFullYear() * 12 + dt.getUTCMonth() + n;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return montar(ano, mes, Math.min(dia, ultimoDiaDoMes(ano, mes)));
}

export function minData(...ds: (ISODate | null | undefined)[]): ISODate | null {
  const v = ds.filter((x): x is ISODate => !!x);
  return v.length ? v.reduce((a, b) => (a < b ? a : b)) : null;
}

export function maxData(...ds: (ISODate | null | undefined)[]): ISODate | null {
  const v = ds.filter((x): x is ISODate => !!x);
  return v.length ? v.reduce((a, b) => (a > b ? a : b)) : null;
}

/** Competência "yyyy-MM" → {ano, mes}. */
export function parseCompetencia(c: string): { ano: number; mes: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(c);
  if (!m) throw new Error(`Competência inválida: ${c}`);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) throw new Error(`Competência inválida: ${c}`);
  return { ano: Number(m[1]), mes };
}

export function competenciaDe(d: ISODate): string {
  return d.slice(0, 7);
}

export function addCompetencia(c: string, n: number): string {
  const { ano, mes } = parseCompetencia(c);
  return addMesesClamp(montar(ano, mes, 1), n).slice(0, 7);
}

/** Hoje no fuso America/Sao_Paulo. */
export function hojeSP(agora: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}
