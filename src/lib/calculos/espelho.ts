/**
 * Espelho de horas: 30 linhas (dia 1 a 30) com início, fim, intervalo e horas.
 * O total também é recalculado no banco (trigger em 0057_espelho_horas.sql).
 */

export const LINHAS_ESPELHO = 30;

export interface LinhaEspelho {
  dia: number;
  /** "HH:MM" */
  inicio: string | null;
  fim: string | null;
  /** intervalo (almoço) em horas, ex.: 1 ou 1,5 */
  intervalo: number | null;
  horas: number | null;
  obs: string | null;
}

export type StatusEspelho = "rascunho" | "enviado" | "aprovado" | "recusado";

const arred2 = (n: number) => Math.round(n * 100) / 100;

export function linhasVazias(): LinhaEspelho[] {
  return Array.from({ length: LINHAS_ESPELHO }, (_, i) => ({ dia: i + 1, inicio: null, fim: null, intervalo: null, horas: null, obs: null }));
}

/** Completa o que veio do banco para sempre ter as 30 linhas, na ordem dos dias. */
export function normalizarLinhas(salvas: unknown): LinhaEspelho[] {
  const porDia = new Map<number, Partial<LinhaEspelho>>();
  if (Array.isArray(salvas)) {
    for (const l of salvas as Partial<LinhaEspelho>[]) if (l && typeof l.dia === "number") porDia.set(l.dia, l);
  }
  return linhasVazias().map((v) => {
    const s = porDia.get(v.dia);
    if (!s) return v;
    return {
      dia: v.dia,
      inicio: s.inicio || null,
      fim: s.fim || null,
      intervalo: typeof s.intervalo === "number" ? s.intervalo : null,
      horas: typeof s.horas === "number" ? s.horas : null,
      obs: s.obs?.trim() ? s.obs : null,
    };
  });
}

function minutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Horas do dia = fim − início − intervalo. Fim antes do início = passou da meia-noite.
 * Sem início ou fim, devolve null (as horas podem ser digitadas direto).
 */
export function calcularHorasDia(inicio: string | null, fim: string | null, intervalo: number | null): number | null {
  if (!inicio || !fim) return null;
  const a = minutos(inicio);
  const b = minutos(fim);
  if (a === null || b === null) return null;
  let total = b - a;
  if (total <= 0) total += 24 * 60;
  const h = total / 60 - (intervalo ?? 0);
  return arred2(Math.max(0, h));
}

export function totalHoras(linhas: LinhaEspelho[]): number {
  return arred2(linhas.reduce((s, l) => s + (l.horas ?? 0), 0));
}

/** Dias com alguma coisa lançada (é o que vai para o banco). */
export function linhasPreenchidas(linhas: LinhaEspelho[]): LinhaEspelho[] {
  return linhas.filter((l) => l.inicio || l.fim || l.intervalo != null || l.horas != null || l.obs);
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * Data da linha na competência ("AAAA-MM-01"). Null quando o dia não existe no mês
 * (ex.: 29 e 30 de fevereiro).
 */
export function dataDaLinha(competencia: string, dia: number): { data: string; rotulo: string; semana: string; fimDeSemana: boolean } | null {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  if (dia < 1 || dia > diasNoMes) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  const dow = d.getUTCDay();
  const dd = String(dia).padStart(2, "0");
  const mm = String(mes).padStart(2, "0");
  return { data: `${ano}-${mm}-${dd}`, rotulo: `${dd}/${mm}`, semana: SEMANA[dow], fimDeSemana: dow === 0 || dow === 6 };
}

/** "8,5" → "8:30" para mostrar ao cliente junto com o decimal */
export function horasEmRelogio(h: number | null | undefined): string {
  if (h == null) return "—";
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
