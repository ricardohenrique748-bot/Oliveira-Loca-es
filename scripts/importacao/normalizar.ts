/** Normalização dos dados das planilhas (funções puras — testadas em normalizar.test.ts). */
import { extrairParcela } from "../../src/lib/calculos/parcelas";
import { parseBRL } from "../../src/lib/calculos/dinheiro";

/** "Período Medição " → "periodo medicao" */
export function chave(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();
}

export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && !ehErroFormula(s) ? s : null;
}

/** Fórmulas quebradas exportadas como texto (#REF!, #N/D, #VALOR!...) */
export function ehErroFormula(v: unknown): boolean {
  return typeof v === "string" && /^#(REF|N\/?[AD]|VALOR|VALUE|DIV\/0|NOME|NAME|NUM|NULO|NULL)[!?]?/i.test(v.trim());
}

/** Placas em maiúsculas sem hífen; null se não parecer placa (Mercosul ou antiga). */
export function placa(v: unknown): string | null {
  const s = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(s) ? s : null;
}

/**
 * Mapa de sinônimos de clientes → nome canônico (nome fantasia).
 * Chaves comparadas após chave(); ajuste conforme o relatório de inconsistências.
 */
export const SINONIMOS_CLIENTES: Record<string, string> = {
  omexon: "Omexom", omexom: "Omexom", "omexom servicos": "Omexom",
  guarana: "Guaraná", "guarana obra": "Guaraná",
  caramuru: "Caramuru", cymi: "CYMI", zopone: "Zopone", contrel: "Contrel", conserva: "Conserva",
  tabocas: "Tabocas", lcm: "LCM", marcomix: "Marcomix", terravam: "Terravam", "lopes infra": "Lopes Infra",
  "lopes infraestrutura": "Lopes Infra", cobra: "Cobra", nog: "NOG",
};

/** "CARAMURU - obra 3800-D" → { cliente: "Caramuru", obra: "3800-D" } */
export function clienteObra(v: unknown): { cliente: string; obra: string | null } | null {
  const s = texto(v);
  if (!s) return null;
  const m = /^(.*?)\s*[-–(]\s*obra\s*:?\s*([^)]+)\)?$/i.exec(s) ?? /^(.*?)\s+obra\s+(.+)$/i.exec(s);
  const nome = (m ? m[1] : s).trim();
  const obra = m ? m[2].trim() : null;
  const k = chave(nome);
  const canonico = SINONIMOS_CLIENTES[k] ?? Object.entries(SINONIMOS_CLIENTES).find(([sin]) => k.startsWith(sin + " "))?.[1];
  return { cliente: canonico ?? titulo(nome), obra };
}

function titulo(s: string): string {
  if (s === s.toUpperCase() && s.length <= 5) return s; // siglas (LCM, CYMI)
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** Data: número serial do Excel, Date, "dd/mm/aa", "dd/mm/aaaa" ou ISO → "yyyy-mm-dd" */
export function data(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (ehErroFormula(s)) return null;
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    const r = `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    return valida(r) ? r : null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso && valida(iso[0]) ? iso[0] : null;
}

function valida(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** "21/08/26 A 20/09/26" → período */
/**
 * "21/08/26 A 20/09/26" ou, sem ano, "21/08 A 20/09" — nesse caso o ano vem da competência da aba ("2026-09"):
 * o fim fica no ano da competência (ou no anterior, se o mês do fim for bem depois dela) e o início vira o ano quando o mês volta.
 */
export function periodo(v: unknown, competencia?: string | null): { inicio: string; fim: string } | null {
  const s = texto(v);
  if (!s) return null;
  const m = /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s*(?:a|à|ate|até|-|–)\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i.exec(s);
  if (m) {
    const inicio = data(m[1]);
    const fim = data(m[2]);
    return inicio && fim && fim >= inicio ? { inicio, fim } : null;
  }
  const sem = /(\d{1,2})[/.-](\d{1,2})\s*(?:a|à|ate|até|-|–)\s*(\d{1,2})[/.-](\d{1,2})/i.exec(s);
  if (!sem || !competencia) return null;
  const [anoC, mesC] = competencia.split("-").map(Number);
  const [d1, m1, d2, m2] = sem.slice(1).map(Number);
  const anoFim = m2 > mesC + 6 ? anoC - 1 : anoC;
  const anoIni = m1 > m2 ? anoFim - 1 : anoFim;
  const iso = (a: number, me: number, d: number) => `${a}-${String(me).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const inicio = data(iso(anoIni, m1, d1).split("-").reverse().join("/"));
  const fim = data(iso(anoFim, m2, d2).split("-").reverse().join("/"));
  return inicio && fim && fim >= inicio ? { inicio, fim } : null;
}

export function valor(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (ehErroFormula(v)) return null;
  const n = parseBRL(String(v ?? ""));
  return n === null ? null : Math.round(n * 100) / 100;
}

export function inteiro(v: unknown): number | null {
  const n = valor(v);
  return n === null ? null : Math.round(n);
}

/** Status livres da planilha → enum de medição */
export function statusMedicao(v: unknown, recebidoEm?: string | null): "a_faturar" | "faturado" | "recebido" | "recebido_parcial" | "cancelado" {
  const k = chave(v);
  if (recebidoEm) return "recebido";
  if (/cancel/.test(k)) return "cancelado";
  if (/parcial/.test(k)) return "recebido_parcial";
  if (/receb|pago|quitad|ok/.test(k)) return "recebido";
  if (/faturad|emitid|enviad|cobrad|nf/.test(k)) return "faturado";
  return "a_faturar";
}

/** "ok", "pago", "sim", "x" → true */
export function simNao(v: unknown): boolean {
  return /^(ok|sim|s|x|pago|yes|y|1|true)$/i.test(String(v ?? "").trim());
}

/** Responsável: e-mail ou telefone */
export function contato(v: unknown): { email: string | null; whatsapp: string | null; nome: string | null } {
  const s = texto(v) ?? "";
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(s)?.[0]?.toLowerCase() ?? null;
  const dig = s.replace(/[^\d]/g, "");
  const whatsapp = !email && dig.length >= 10 ? (dig.startsWith("55") ? dig : `55${dig}`) : null;
  const nome = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/, "").replace(/[\d()+\s-]{8,}/, "").replace(/[-–:|]+$/, "").trim() || null;
  return { email, whatsapp, nome };
}

/** "Cartão Inter", "Boleto Bradesco", "Débito automático Sicredi", "PIX" → forma + banco */
export function formaBanco(v: unknown): { forma: "boleto" | "debito_automatico" | "cartao" | "pix" | "transferencia"; banco: "Bradesco" | "Sicredi" | "Inter" | null } {
  const k = chave(v);
  const forma = /cart/.test(k) ? "cartao" : /deb|automat/.test(k) ? "debito_automatico" : /pix/.test(k) ? "pix" : /transf|ted|doc/.test(k) ? "transferencia" : "boleto";
  const banco = /bradesco/.test(k) ? "Bradesco" : /sicredi/.test(k) ? "Sicredi" : /inter\b/.test(k) ? "Inter" : null;
  return { forma, banco };
}

export function parcela(v: unknown) {
  return extrairParcela(texto(v));
}

/** Nome da aba "SET26", "Oliveira SET26", "Outubro26", "Março27" → "2026-09" */
const MESES: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};
export function competenciaAba(nome: string): string | null {
  const k = chave(nome);
  const m = /(jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\s*(\d{2,4})/.exec(k);
  if (!m) return null;
  const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${ano}-${String(MESES[m[1]]).padStart(2, "0")}`;
}

/**
 * Observações da planilha → { nf, resto }: "2330", "NF 159", "Fatura 2305" ou texto terminado no número
 * ("Desmobilizado 20/08 - faturar setembro até 20/09 2326"). Datas (20/09) não contam como NF.
 */
export function nfDasObservacoes(v: unknown): { nf: string | null; resto: string | null } {
  const s = texto(v);
  if (!s) return { nf: null, resto: null };
  const m = /(?:^|\s)(?:nf|nfs-?e|fatura|nota)?\s*[:nº#]*\s*(\d{2,9})\s*$/i.exec(s);
  if (!m || /\d[/.-]\d{1,2}$/.test(s)) return { nf: null, resto: s };
  const resto = s.slice(0, m.index).replace(/[\s,;:-]+$/, "").trim();
  return { nf: m[1], resto: resto || null };
}

/** Corte de importação: só jan/2026 em diante */
export const DATA_CORTE = "2026-01-01";
