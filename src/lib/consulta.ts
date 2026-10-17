/** Parâmetros de listagem vindos da URL (paginação/ordenação/filtros). */
export type SearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

export interface ParamsLista {
  pagina: number;
  tamanho: number;
  q: string;
  ordem: string | null;
  desc: boolean;
  de: number;
  ate: number;
  get: (k: string) => string | null;
}

export const TAMANHOS_PAGINA = [25, 50, 100, 200];

export function lerParams(sp: SearchParams, padrao: { tamanho?: number; ordem?: string; desc?: boolean } = {}): ParamsLista {
  const get = (k: string) => {
    if (sp instanceof URLSearchParams) {
      const v = sp.get(k);
      return v && v.length ? v : null;
    }
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.length ? s : null;
  };
  const pagina = Math.max(1, Number(get("pagina")) || 1);
  const tamanho = TAMANHOS_PAGINA.includes(Number(get("tamanho"))) ? Number(get("tamanho")) : (padrao.tamanho ?? 50);
  const ordem = get("ordem") ?? padrao.ordem ?? null;
  const desc = get("desc") ? get("desc") === "1" : !!padrao.desc;
  return { pagina, tamanho, q: get("q") ?? "", ordem, desc, de: (pagina - 1) * tamanho, ate: pagina * tamanho - 1, get };
}

/** Escapa termo para uso em filtros .or()/.ilike do PostgREST */
export function termoBusca(q: string): string {
  return `%${q.replace(/[%,()*]/g, " ").trim()}%`;
}
