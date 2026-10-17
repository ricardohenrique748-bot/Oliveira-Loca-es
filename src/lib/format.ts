import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export { formatBRL, formatNumeroBR, parseBRL } from "@/lib/calculos/dinheiro";
export { hojeSP } from "@/lib/calculos/datas";

/** "2026-10-16" → "16/10/2026" */
export function formatData(d: string | null | undefined): string {
  if (!d) return "—";
  const [a, m, dia] = d.slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}

/** "2026-10-16T13:00:00Z" → "16/10/2026 10:00" (America/Sao_Paulo) */
export function formatDataHora(d: string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

/** "16/10/2026" → "2026-10-16" (ou null) */
export function parseDataBR(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s.trim());
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** "2026-09" | "2026-09-01" → "set/2026" */
export function formatCompetencia(c: string | null | undefined, longo = false): string {
  if (!c) return "—";
  const d = parseISO(c.length === 7 ? `${c}-01` : c.slice(0, 10));
  return format(d, longo ? "MMMM 'de' yyyy" : "MMM/yyyy", { locale: ptBR });
}

export function formatPeriodo(inicio: string | null | undefined, fim: string | null | undefined): string {
  if (!inicio || !fim) return "—";
  return `${formatData(inicio).slice(0, 5)} a ${formatData(fim)}`;
}

export function formatPct(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function formatKm(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Math.round(v).toLocaleString("pt-BR")} km`;
}

export function formatHoras(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

const soDigitos = (s: string) => s.replace(/\D/g, "");

export function maskCPF(s: string): string {
  return soDigitos(s).slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskCNPJ(s: string): string {
  return soDigitos(s).slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskCpfCnpj(s: string): string {
  return soDigitos(s).length <= 11 ? maskCPF(s) : maskCNPJ(s);
}

export function maskTelefone(s: string): string {
  let d = soDigitos(s);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

/** Placa normalizada: maiúsculas, sem hífen (Mercosul ABC1D23 ou antiga ABC1234) */
export function normalizarPlaca(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export const PLACA_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** Exibição: antiga "ABC-1234", Mercosul "ABC1D23" */
export function formatPlaca(s: string | null | undefined): string {
  if (!s) return "—";
  return /^[A-Z]{3}\d{4}$/.test(s) ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
}

export function validarCPF(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function validarCNPJ(cnpj: string): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Link wa.me com mensagem (número BR com DDI 55) */
export function linkWhatsApp(numero: string | null | undefined, mensagem: string): string | null {
  if (!numero) return null;
  let d = soDigitos(numero);
  if (!d.startsWith("55")) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(mensagem)}`;
}

export function linkEmail(para: string | null | undefined, assunto: string, corpo: string): string | null {
  if (!para) return null;
  return `mailto:${para}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

/** Substitui {chave} no template */
export function preencherTemplate(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}
