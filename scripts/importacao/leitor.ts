import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { chave } from "./normalizar";

export interface LinhaPlanilha {
  aba: string;
  linha: number; // 1-based como no Excel
  /** primeiro valor não vazio entre as colunas cujo cabeçalho contém algum dos apelidos */
  get: (...apelidos: string[]) => unknown;
  bruto: Record<string, unknown>;
}

export interface Aba {
  nome: string;
  cabecalho: string[];
  linhas: LinhaPlanilha[];
}

/**
 * Lê todas as abas. A linha de cabeçalho é detectada entre as 15 primeiras como a
 * que tem mais células batendo com os apelidos esperados.
 */
export function lerPlanilha(caminho: string, esperados: string[]): Aba[] {
  const wb = XLSX.read(readFileSync(caminho), { type: "buffer", cellDates: false, cellFormula: false });
  const alvo = esperados.map(chave);
  return wb.SheetNames.map((nome) => {
    const ws = wb.Sheets[nome];
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    let idx = 0;
    let melhor = -1;
    for (let i = 0; i < Math.min(15, matriz.length); i++) {
      const score = (matriz[i] ?? []).filter((c) => { const k = chave(c); return k && alvo.some((a) => k.includes(a)); }).length;
      if (score > melhor) { melhor = score; idx = i; }
    }
    const cabecalho = (matriz[idx] ?? []).map((c) => chave(c));
    const linhas: LinhaPlanilha[] = [];
    for (let i = idx + 1; i < matriz.length; i++) {
      const r = matriz[i] ?? [];
      if (!r.some((c) => c !== null && String(c).trim() !== "")) continue;
      const bruto: Record<string, unknown> = {};
      cabecalho.forEach((h, j) => { if (h) bruto[h] = r[j]; });
      linhas.push({
        aba: nome,
        linha: i + 1,
        bruto,
        get: (...apelidos) => {
          for (const a of apelidos.map(chave)) {
            // igual primeiro, depois "contém"
            const j = cabecalho.findIndex((h) => h === a);
            const k = j >= 0 ? j : cabecalho.findIndex((h) => h.includes(a));
            if (k >= 0 && r[k] !== null && r[k] !== undefined && String(r[k]).trim() !== "") return r[k];
          }
          return null;
        },
      });
    }
    return { nome, cabecalho, linhas };
  });
}
