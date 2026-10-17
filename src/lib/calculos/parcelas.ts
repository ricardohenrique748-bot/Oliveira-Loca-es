import { addMesesClamp, addCompetencia, competenciaDe, parseISO, montar, parseCompetencia, ultimoDiaDoMes, type ISODate } from "./datas";
import { deCentavos, paraCentavos } from "./dinheiro";

export interface ParcelaGerada {
  parcelaNum: number;
  parcelaTotal: number;
  descricao: string;
  vencimento: ISODate;
  valor: number;
}

/** Remove sufixo "n/N" de uma descrição ("Silcar Pneus 2/4" → "Silcar Pneus"). */
export function descricaoBase(descricao: string): string {
  return descricao.replace(/\s*\(?\d{1,3}\s*\/\s*\d{1,3}\)?\s*$/, "").trim();
}

/** Lê "n/N" de um texto livre ("Parcela FGI 1/48", "15/53"). */
export function extrairParcela(texto: string | null | undefined): { num: number; total: number } | null {
  if (!texto) return null;
  const m = /(\d{1,3})\s*\/\s*(\d{1,3})/.exec(texto);
  if (!m) return null;
  const num = Number(m[1]);
  const total = Number(m[2]);
  if (num < 1 || total < 1 || num > total) return null;
  return { num, total };
}

/**
 * Gera N parcelas mensais "desc n/N".
 *  - modo "parcela": cada parcela tem o valor informado;
 *  - modo "total": divide o total; os centavos que sobram vão para a última.
 * `inicio` permite começar no meio (ex.: importar a partir da 15/53).
 */
export function gerarParcelas(p: {
  descricao: string;
  valor: number;
  modo?: "parcela" | "total";
  total: number;
  primeiroVencimento: ISODate;
  inicio?: number;
}): ParcelaGerada[] {
  const { total, primeiroVencimento } = p;
  const inicio = p.inicio ?? 1;
  if (!Number.isInteger(total) || total < 1 || total > 360) throw new Error("Número de parcelas inválido");
  if (inicio < 1 || inicio > total) throw new Error("Parcela inicial inválida");
  const base = descricaoBase(p.descricao);
  const dia = parseISO(primeiroVencimento).getUTCDate();
  const qtd = total - inicio + 1;
  const valorC = paraCentavos(p.valor);
  let valores: number[];
  if ((p.modo ?? "parcela") === "total") {
    const cada = Math.floor(valorC / qtd);
    valores = Array.from({ length: qtd }, (_, i) => (i === qtd - 1 ? valorC - cada * (qtd - 1) : cada));
  } else {
    valores = Array(qtd).fill(valorC);
  }
  return valores.map((v, i) => {
    const n = inicio + i;
    return {
      parcelaNum: n,
      parcelaTotal: total,
      descricao: `${base} ${n}/${total}`,
      vencimento: addMesesClamp(primeiroVencimento, i, dia),
      valor: deCentavos(v),
    };
  });
}

export interface ParcelaExistente {
  id: string;
  parcelaNum: number;
  parcelaTotal: number;
  descricao: string;
  vencimento: ISODate;
  valor: number;
  pago: boolean;
}

export interface EdicaoParcela {
  valor?: number;
  vencimento?: ISODate;
  descricao?: string;
}

/**
 * Edição de parcela: "só esta" ou "esta e as seguintes".
 * Nas seguintes, novo vencimento desloca as próximas mês a mês a partir da data
 * nova; descrição troca a base mantendo o "n/N". Parcelas já pagas não mudam.
 */
export function planejarEdicaoParcelas(
  grupo: ParcelaExistente[],
  alvoNum: number,
  edicao: EdicaoParcela,
  escopo: "esta" | "seguintes",
): { id: string; alteracoes: EdicaoParcela }[] {
  const alvos = grupo
    .filter((p) => (escopo === "esta" ? p.parcelaNum === alvoNum : p.parcelaNum >= alvoNum))
    .filter((p) => p.parcelaNum === alvoNum || !p.pago)
    .sort((a, b) => a.parcelaNum - b.parcelaNum);
  const dia = edicao.vencimento ? parseISO(edicao.vencimento).getUTCDate() : undefined;
  return alvos.map((p) => {
    const alt: EdicaoParcela = {};
    if (edicao.valor !== undefined) alt.valor = edicao.valor;
    if (edicao.vencimento) alt.vencimento = addMesesClamp(edicao.vencimento, p.parcelaNum - alvoNum, dia);
    if (edicao.descricao !== undefined) alt.descricao = `${descricaoBase(edicao.descricao)} ${p.parcelaNum}/${p.parcelaTotal}`;
    return { id: p.id, alteracoes: alt };
  });
}

/**
 * Recorrência: vencimentos que faltam para manter sempre 12 meses à frente
 * (do mês atual até mês atual + meses − 1), a partir do mês da conta-base.
 */
export function vencimentosRecorrentesFaltantes(p: {
  vencimentoBase: ISODate;
  existentes: ISODate[];
  hoje: ISODate;
  meses?: number;
}): ISODate[] {
  const meses = p.meses ?? 12;
  const dia = parseISO(p.vencimentoBase).getUTCDate();
  const compBase = competenciaDe(p.vencimentoBase);
  const compHoje = competenciaDe(p.hoje);
  const inicio = compBase > compHoje ? compBase : compHoje;
  const limite = addCompetencia(compHoje, meses - 1);
  const ja = new Set(p.existentes.map(competenciaDe));
  const out: ISODate[] = [];
  for (let c = inicio; c <= limite; c = addCompetencia(c, 1)) {
    if (ja.has(c)) continue;
    const { ano, mes } = parseCompetencia(c);
    out.push(montar(ano, mes, Math.min(dia, ultimoDiaDoMes(ano, mes))));
  }
  return out;
}

export type StatusConta = "pago" | "vencido" | "a_vencer";

export function statusConta(vencimento: ISODate, pagoEm: ISODate | null | undefined, hoje: ISODate): StatusConta {
  if (pagoEm) return "pago";
  return vencimento < hoje ? "vencido" : "a_vencer";
}
