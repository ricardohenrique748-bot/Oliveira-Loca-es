/**
 * Espelho de horas: uma linha por dia do espelho (até 62) com início, fim, intervalo e horas.
 * Os dias são os marcados no calendário (podem pular dias) ou, sem marcação, o mês da competência.
 * O total também é recalculado no banco (trigger em 0057_espelho_horas.sql).
 */

export const LINHAS_ESPELHO = 62;

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

/** Completa o que veio do banco para sempre ter as LINHAS_ESPELHO linhas, na ordem dos dias (a tela mostra só as do período). */
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

const utc = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Período contínuo: do início ao fim, inclusive ("AAAA-MM-DD"). Usado por espelhos antigos (data_inicio/data_fim). */
export interface Periodo { inicio: string; fim: string }

/** Máximo de dias (linhas) num espelho. */
export const MAX_DIAS_ESPELHO = LINHAS_ESPELHO;

/** Fim padrão: véspera do mesmo dia no mês seguinte (01/11 → 30/11; 21/10 → 20/11). */
export function fimPeriodo(inicio: string): string {
  const a = utc(inicio);
  const ano = a.getUTCFullYear(), mes = a.getUTCMonth() + 1, dia = a.getUTCDate();
  // dia que não existe no mês seguinte (31/01 → fevereiro): o período termina no último dia dele
  const diasMesSeguinte = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(ano, mes, dia > diasMesSeguinte ? diasMesSeguinte : dia - 1)));
}

/** Período contínuo: sem início, o mês da competência; só com início, até a véspera do mesmo dia no mês seguinte. */
export function periodoDoEspelho(competencia: string, dataInicio?: string | null, dataFim?: string | null): Periodo {
  const inicio = dataInicio || `${competencia.slice(0, 7)}-01`;
  return { inicio, fim: (dataInicio && dataFim) || fimPeriodo(inicio) };
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Datas válidas, sem repetição e em ordem. */
export function ordenarDatas(datas: readonly string[]): string[] {
  return [...new Set(datas.filter((d) => DATA_RE.test(d)))].sort();
}

/**
 * Dias do espelho, um por linha (linha 1 = primeiro dia): os dias marcados no calendário;
 * sem dias marcados, o período contínuo (mês da competência ou data_inicio/data_fim de espelhos antigos).
 */
export function diasDoEspelho(competencia: string, dataInicio?: string | null, dataFim?: string | null, datas?: readonly string[] | null): string[] {
  if (datas?.length) return ordenarDatas(datas);
  const p = periodoDoEspelho(competencia, dataInicio, dataFim);
  const dias: string[] = [];
  for (let d = utc(p.inicio); iso(d) <= p.fim && dias.length < MAX_DIAS_ESPELHO; d = new Date(d.getTime() + 86_400_000)) dias.push(iso(d));
  return dias;
}

/** Erro dos dias marcados, ou null. */
export function erroDatas(datas: readonly string[]): string | null {
  if (datas.some((d) => !DATA_RE.test(d))) return "Data inválida";
  if (ordenarDatas(datas).length > MAX_DIAS_ESPELHO) return `No máximo ${MAX_DIAS_ESPELHO} dias por espelho`;
  return null;
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** "21/10 a 20/11/2026" (dias seguidos) ou "5 dias entre 21/10 e 30/10/2026" (com dias pulados). */
export function rotuloDias(dias: readonly string[]): string {
  if (!dias.length) return "";
  const a = dias[0], f = dias[dias.length - 1];
  if (dias.length === 1) return `${ddmm(a)}/${a.slice(0, 4)}`;
  const anoA = a.slice(0, 4) !== f.slice(0, 4) ? `/${a.slice(0, 4)}` : "";
  const seguidos = Math.round((utc(f).getTime() - utc(a).getTime()) / 86_400_000) + 1 === dias.length;
  return seguidos
    ? `${ddmm(a)}${anoA} a ${ddmm(f)}/${f.slice(0, 4)}`
    : `${dias.length} dias entre ${ddmm(a)}${anoA} e ${ddmm(f)}/${f.slice(0, 4)}`;
}

/** Data da linha (linha 1 = primeiro dia do espelho). Null quando a linha passa do último dia. */
export function dataDaLinha(dias: readonly string[], dia: number): { data: string; rotulo: string; semana: string; fimDeSemana: boolean } | null {
  const data = dias[dia - 1];
  if (!data) return null;
  const dow = utc(data).getUTCDay();
  return { data, rotulo: ddmm(data), semana: SEMANA[dow], fimDeSemana: dow === 0 || dow === 6 };
}

/** Só as linhas dos dias do espelho (as de fora não aparecem, não contam e não vão para o banco). */
export function linhasDoPeriodo<T extends { dia: number }>(linhas: T[], dias: readonly string[]): T[] {
  return linhas.filter((l) => l.dia >= 1 && l.dia <= dias.length);
}

/**
 * Dias trocados: cada linha lançada acompanha a sua data (não a posição).
 * Linhas de dias desmarcados saem.
 */
export function remapearLinhas<T extends { dia: number }>(linhas: T[], diasAntes: readonly string[], diasDepois: readonly string[]): T[] {
  const pos = new Map(diasDepois.map((d, i) => [d, i + 1]));
  const out: T[] = [];
  for (const l of linhas) {
    const novo = pos.get(diasAntes[l.dia - 1] ?? "");
    if (novo) out.push({ ...l, dia: novo });
  }
  return out.sort((a, b) => a.dia - b.dia);
}

/** "8,5" → "8:30" para mostrar ao cliente junto com o decimal */
export function horasEmRelogio(h: number | null | undefined): string {
  if (h == null) return "—";
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Horas do mês que o valor mensal cobre, quando não informado. */
export const HORAS_FRANQUIA_PADRAO = 220;

export interface ValoresEspelho {
  /** valor mensal ÷ horas do mês, arredondado a 2 casas (como na planilha: 80.000 ÷ 220 = 363,64) */
  valorHora: number;
  horasExcedentes: number;
  /** horas excedentes × valor hora */
  valorExcedente: number;
  /** valor mensal + excedente */
  total: number;
}

/**
 * Fechamento do espelho: o valor mensal cobre as horas do mês (ex.: 220); o que passar
 * é cobrado a valor hora. Ex.: 242 h, R$ 80.000 / 220 h → 22 h × 363,64 = 8.000,08; total 88.000,08.
 * Null sem valor mensal ou horas do mês.
 */
export function calcularValoresEspelho(totalHorasEspelho: number, valorMensal: number | null, horasFranquia: number | null): ValoresEspelho | null {
  if (!valorMensal || !horasFranquia || horasFranquia <= 0) return null;
  const valorHora = arredonda2(valorMensal / horasFranquia);
  const horasExcedentes = arredonda2(Math.max(0, totalHorasEspelho - horasFranquia));
  const valorExcedente = arredonda2(horasExcedentes * valorHora);
  return { valorHora, horasExcedentes, valorExcedente, total: arredonda2(valorMensal + valorExcedente) };
}

function arredonda2(v: number): number {
  return Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;
}

/** Itens digitados no fechamento do espelho (como na planilha do cliente). */
export interface FechamentoEspelho {
  /** descontos */
  combustivel?: number | null;
  lavagem?: number | null;
  lubrificante?: number | null;
  pecas?: number | null;
  mao_obra?: number | null;
  pneus?: number | null;
  /** acréscimos */
  mobilizacao?: number | null;
  desmobilizacao?: number | null;
  /** dias parados em reparo mecânico (saem dos dias trabalhados) */
  dias_reparo?: number | null;
  /** base de dias do valor mensal (padrão 30) */
  dias_base?: number | null;
}

export const DESCONTOS_FECHAMENTO = [
  ["combustivel", "Combustível"],
  ["lavagem", "Lavagem"],
  ["lubrificante", "Lubrificante"],
  ["pecas", "Peças & acessórios"],
  ["mao_obra", "Mão de obra / serv. de lubrificação"],
  ["pneus", "Serviços de pneus"],
] as const;

export interface ResultadoFechamento extends ValoresEspelho {
  diasBase: number;
  diasReparo: number;
  diasTrabalhados: number;
  valorDiasReparo: number;
  valorDiasTrabalhados: number;
  totalDescontos: number;
  totalBruto: number;
  totalLiquido: number;
}

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Lê o que veio do banco (jsonb) só com os campos conhecidos e numéricos. */
export function normalizarFechamento(v: unknown): FechamentoEspelho {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const chaves = [...DESCONTOS_FECHAMENTO.map(([k]) => k), "mobilizacao", "desmobilizacao", "dias_reparo", "dias_base"] as const;
  const out: FechamentoEspelho = {};
  for (const k of chaves) if (typeof o[k] === "number") out[k] = o[k] as number;
  return out;
}

/**
 * Fechamento como na planilha: dias trabalhados (valor mensal menos os dias em reparo, base 30 dias),
 * mais horas excedentes, mobilização e desmobilização = total bruto; menos os descontos = total líquido.
 */
export function calcularFechamento(totalHorasEspelho: number, valorMensal: number | null, horasFranquia: number | null, f: FechamentoEspelho): ResultadoFechamento | null {
  const base = calcularValoresEspelho(totalHorasEspelho, valorMensal, horasFranquia);
  if (!base || !valorMensal) return null;
  const diasBase = num(f.dias_base) || 30;
  const diasReparo = Math.min(diasBase, Math.max(0, num(f.dias_reparo)));
  const valorDiasReparo = arredonda2((valorMensal / diasBase) * diasReparo);
  const valorDiasTrabalhados = arredonda2(valorMensal - valorDiasReparo);
  const totalDescontos = arredonda2(DESCONTOS_FECHAMENTO.reduce((s, [k]) => s + num(f[k]), 0));
  const totalBruto = arredonda2(valorDiasTrabalhados + base.valorExcedente + num(f.mobilizacao) + num(f.desmobilizacao));
  return {
    ...base, diasBase, diasReparo, diasTrabalhados: arredonda2(diasBase - diasReparo), valorDiasReparo, valorDiasTrabalhados,
    totalDescontos, totalBruto, totalLiquido: arredonda2(totalBruto - totalDescontos),
  };
}
