import { addDias, diffDias, type ISODate } from "./datas";

export type StatusPreventiva = "em_dia" | "proxima" | "vencida";
export type CriterioPreventiva = "km" | "horas" | "dias";

export interface PlanoPreventiva {
  intervaloKm?: number | null;
  intervaloHoras?: number | null;
  intervaloDias?: number | null;
  ultimaKm?: number | null;
  ultimaHoras?: number | null;
  ultimaData?: ISODate | null;
}

export interface LeituraAtual {
  km?: number | null;
  horas?: number | null;
  data: ISODate;
}

export interface ResultadoPreventiva {
  status: StatusPreventiva;
  /** fração consumida do intervalo pelo critério que vence primeiro (1 = 100%) */
  pct: number;
  /** critério que vence primeiro (null se não há histórico) */
  criterio: CriterioPreventiva | null;
  proximaKm: number | null;
  proximaHoras: number | null;
  proximaData: ISODate | null;
  /** quanto falta no critério determinante (km, horas ou dias; negativo = atrasado) */
  restante: number | null;
  semHistorico: boolean;
}

/**
 * Próxima preventiva = a que vencer primeiro entre km, horas e dias.
 * Status: em_dia (< 90% consumido), proxima (≥ 90%), vencida (≥ 100%).
 * Plano sem nenhuma execução registrada é tratado como vencido (precisa da 1ª execução).
 */
export function calcularPreventiva(plano: PlanoPreventiva, atual: LeituraAtual, pctAlerta = 0.9): ResultadoPreventiva {
  const candidatos: { criterio: CriterioPreventiva; pct: number; restante: number }[] = [];

  const proximaKm = plano.intervaloKm && plano.ultimaKm != null ? plano.ultimaKm + plano.intervaloKm : null;
  const proximaHoras = plano.intervaloHoras && plano.ultimaHoras != null ? plano.ultimaHoras + plano.intervaloHoras : null;
  const proximaData = plano.intervaloDias && plano.ultimaData ? addDias(plano.ultimaData, plano.intervaloDias) : null;

  if (proximaKm != null && atual.km != null) {
    const usado = atual.km - plano.ultimaKm!;
    candidatos.push({ criterio: "km", pct: usado / plano.intervaloKm!, restante: proximaKm - atual.km });
  }
  if (proximaHoras != null && atual.horas != null) {
    const usado = atual.horas - plano.ultimaHoras!;
    candidatos.push({ criterio: "horas", pct: usado / plano.intervaloHoras!, restante: proximaHoras - atual.horas });
  }
  if (proximaData != null) {
    const usado = diffDias(plano.ultimaData!, atual.data);
    candidatos.push({ criterio: "dias", pct: usado / plano.intervaloDias!, restante: diffDias(atual.data, proximaData) });
  }

  if (!candidatos.length) {
    return { status: "vencida", pct: 1, criterio: null, proximaKm, proximaHoras, proximaData, restante: null, semHistorico: true };
  }

  const pior = candidatos.reduce((a, b) => (b.pct > a.pct ? b : a));
  const pct = Math.max(0, pior.pct);
  const status: StatusPreventiva = pct >= 1 ? "vencida" : pct >= pctAlerta ? "proxima" : "em_dia";
  return { status, pct, criterio: pior.criterio, proximaKm, proximaHoras, proximaData, restante: pior.restante, semHistorico: false };
}
