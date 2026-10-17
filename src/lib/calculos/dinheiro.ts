/** Valores monetários: cálculos em centavos inteiros para evitar erro de ponto flutuante. */

export function paraCentavos(v: number): number {
  return Math.round((v + Number.EPSILON * Math.sign(v)) * 100);
}

export function deCentavos(c: number): number {
  return c / 100;
}

/** Arredonda a 2 casas (meio para cima, como o round() do PostgreSQL para positivos). */
export function arred2(v: number): number {
  return Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;
}

export function somar(valores: number[]): number {
  return deCentavos(valores.reduce((s, v) => s + paraCentavos(v), 0));
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234.5 → "R$ 1.234,50" */
export function formatBRL(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  // Intl usa espaço não separável; normaliza para espaço comum
  return fmtBRL.format(v).replace(/ /g, " ");
}

/** 1234.5 → "1.234,50" */
export function formatNumeroBR(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  return fmtNum.format(v);
}

/** "R$ 1.234,56" | "1234,56" | "1234.56" → 1234.56; vazio → null */
export function parseBRL(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  let t = s.replace(/[R$\s ]/g, "").trim();
  if (!t) return null;
  const negativo = /^-|\(.*\)$/.test(t);
  t = t.replace(/[()-]/g, "");
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}
