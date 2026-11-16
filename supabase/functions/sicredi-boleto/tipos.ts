/** Tipos comuns aos bancos de cobrança (Sicredi, Itaú). */

export type Ambiente = "sandbox" | "producao";

export interface Pagador {
  documento: string; // só dígitos
  nome: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string; // só dígitos
  email?: string | null;
  telefone?: string | null;
}

/** Cobrados após o vencimento. */
export interface Encargos {
  multaPct: number | null;
  juros: number | null; // por dia de atraso, conforme jurosTipo
  jurosTipo: "pct_dia" | "pct_mes" | "valor_dia";
  protestoDias: number | null; // 3–99, exclusivo com negativação
  negativacaoDias: number | null; // 46–99, exige Serasa no cadastro do beneficiário
}

export interface DadosBoleto {
  pagador: Pagador;
  seuNumero: string;
  vencimento: string; // yyyy-mm-dd
  valor: number;
  mensagens?: string[];
  encargos?: Encargos;
}

export interface BoletoCriado {
  nossoNumero: string;
  linhaDigitavel: string;
  codigoBarras: string | null;
  qrCode: string | null;
  txid: string | null;
}

export interface SituacaoBoleto {
  situacao: string;
  liquidado: boolean;
  baixado: boolean;
  dataPagamento: string | null; // yyyy-mm-dd
  valorPago: number | null;
}

/** Erro devolvido pelo banco (vira 502 para o app, com a mensagem do banco). */
export class ErroBanco extends Error {
  constructor(message: string, readonly status: number, readonly corpo?: unknown) {
    super(message);
  }
}

// ---------- utilitários ----------
export async function lerJson(r: Response) {
  const t = await r.text();
  try { return t ? JSON.parse(t) : {}; } catch { return { message: t.slice(0, 300) }; }
}

export function mensagemDe(d: unknown): string | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  if (typeof o.message === "string" && o.message) {
    // Itaú: { message, campos: [{ campo, mensagem }] }
    const campos = Array.isArray(o.campos) ? o.campos.map((c) => { const x = c as Record<string, unknown>; return [x.campo, x.mensagem].filter(Boolean).join(": "); }).filter(Boolean) : [];
    return campos.length ? `${o.message} (${campos.join("; ")})` : o.message;
  }
  if (typeof o.mensagem === "string") return o.mensagem;
  if (typeof o.error_description === "string") return o.error_description;
  if (typeof o.error === "string") return o.error;
  if (Array.isArray(o.errors)) return o.errors.map((e) => (e as Record<string, unknown>)?.message ?? JSON.stringify(e)).join("; ");
  return null;
}

/** aceita yyyy-mm-dd, yyyy-mm-ddTHH:mm e dd/mm/yyyy */
export function paraIso(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

export function numero(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
