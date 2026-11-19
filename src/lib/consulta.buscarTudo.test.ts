import { describe, expect, it } from "vitest";
import { buscarTudo } from "./consulta";

/** imita o Supabase: devolve no máximo 1000 linhas por chamada */
const falso = (total: number) => {
  const chamadas: [number, number][] = [];
  const linhas = Array.from({ length: total }, (_, i) => i);
  return { chamadas, q: { range: (de: number, ate: number) => { chamadas.push([de, ate]); return Promise.resolve({ data: linhas.slice(de, Math.min(ate + 1, de + 1000)), error: null }); } } };
};

describe("buscarTudo", () => {
  it("traz além das primeiras 1000 linhas", async () => {
    const { q, chamadas } = falso(2350);
    expect(await buscarTudo(q)).toHaveLength(2350);
    expect(chamadas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("uma chamada só quando cabe numa página (e quando vem exatamente 1000, confere a próxima)", async () => {
    expect((await buscarTudo(falso(10).q))).toHaveLength(10);
    const { q, chamadas } = falso(1000);
    expect(await buscarTudo(q)).toHaveLength(1000);
    expect(chamadas).toHaveLength(2);
  });
  it("erro do banco sobe", async () => {
    await expect(buscarTudo({ range: () => Promise.resolve({ data: null, error: new Error("falhou") }) })).rejects.toThrow("falhou");
  });
});
