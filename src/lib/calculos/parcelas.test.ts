import { describe, expect, it } from "vitest";
import {
  descricaoBase,
  extrairParcela,
  gerarParcelas,
  planejarEdicaoParcelas,
  statusConta,
  vencimentosRecorrentesFaltantes,
  type ParcelaExistente,
} from "./parcelas";

describe("parcelamento", () => {
  it("gera 1/4..4/4 com vencimentos mensais e mesmo valor", () => {
    const p = gerarParcelas({ descricao: "Silcar Pneus", valor: 1250, total: 4, primeiroVencimento: "2026-10-10" });
    expect(p.map((x) => x.descricao)).toEqual(["Silcar Pneus 1/4", "Silcar Pneus 2/4", "Silcar Pneus 3/4", "Silcar Pneus 4/4"]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(p.every((x) => x.valor === 1250 && x.parcelaTotal === 4)).toBe(true);
    expect(p.map((x) => x.parcelaNum)).toEqual([1, 2, 3, 4]);
  });

  it("dividir total: centavos restantes na última parcela", () => {
    const p = gerarParcelas({ descricao: "Pneus", valor: 1000, modo: "total", total: 3, primeiroVencimento: "2026-10-05" });
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(p.reduce((s, x) => s + Math.round(x.valor * 100), 0)).toBe(100000);
  });

  it("vencimento dia 31 respeita fim de mês sem perder o dia", () => {
    const p = gerarParcelas({ descricao: "Seguro", valor: 100, total: 4, primeiroVencimento: "2027-01-31" });
    expect(p.map((x) => x.vencimento)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("pode começar no meio (importação 15/53)", () => {
    const p = gerarParcelas({ descricao: "Financiamento Guindaste 15/53", valor: 8900, total: 53, inicio: 15, primeiroVencimento: "2026-10-20" });
    expect(p).toHaveLength(39);
    expect(p[0]).toMatchObject({ descricao: "Financiamento Guindaste 15/53", parcelaNum: 15 });
    expect(p.at(-1)).toMatchObject({ descricao: "Financiamento Guindaste 53/53", vencimento: "2029-12-20" });
  });

  it("valida número de parcelas", () => {
    expect(() => gerarParcelas({ descricao: "x", valor: 1, total: 0, primeiroVencimento: "2026-10-01" })).toThrow();
  });

  it("extrai e remove 'n/N' do texto", () => {
    expect(extrairParcela("Parcela FGI 1/48")).toEqual({ num: 1, total: 48 });
    expect(extrairParcela("15 / 53")).toEqual({ num: 15, total: 53 });
    expect(extrairParcela("sem parcela")).toBeNull();
    expect(extrairParcela("5/4")).toBeNull();
    expect(descricaoBase("Silcar Pneus 2/4")).toBe("Silcar Pneus");
  });
});

describe("edição de parcela", () => {
  const grupo: ParcelaExistente[] = gerarParcelas({ descricao: "Silcar Pneus", valor: 1250, total: 4, primeiroVencimento: "2026-10-10" })
    .map((p, i) => ({ id: `p${p.parcelaNum}`, parcelaNum: p.parcelaNum, parcelaTotal: 4, descricao: p.descricao, vencimento: p.vencimento, valor: p.valor, pago: i === 0 }));

  it("só esta", () => {
    expect(planejarEdicaoParcelas(grupo, 2, { valor: 1300 }, "esta")).toEqual([{ id: "p2", alteracoes: { valor: 1300 } }]);
  });

  it("esta e as seguintes: desloca vencimentos e troca descrição base", () => {
    const r = planejarEdicaoParcelas(grupo, 2, { vencimento: "2026-11-15", descricao: "Silcar Pneus Ltda" }, "seguintes");
    expect(r).toEqual([
      { id: "p2", alteracoes: { vencimento: "2026-11-15", descricao: "Silcar Pneus Ltda 2/4" } },
      { id: "p3", alteracoes: { vencimento: "2026-12-15", descricao: "Silcar Pneus Ltda 3/4" } },
      { id: "p4", alteracoes: { vencimento: "2027-01-15", descricao: "Silcar Pneus Ltda 4/4" } },
    ]);
  });

  it("não altera parcelas pagas (exceto a própria alvo)", () => {
    const r = planejarEdicaoParcelas(grupo, 1, { valor: 1 }, "seguintes");
    expect(r.map((x) => x.id)).toEqual(["p1", "p2", "p3", "p4"]);
    const r2 = planejarEdicaoParcelas(grupo.map((p) => ({ ...p, pago: p.parcelaNum <= 3 })), 2, { valor: 1 }, "seguintes");
    expect(r2.map((x) => x.id)).toEqual(["p2", "p4"]);
  });
});

describe("recorrência", () => {
  it("gera os próximos 12 meses a partir do mês atual", () => {
    const v = vencimentosRecorrentesFaltantes({ vencimentoBase: "2026-10-05", existentes: ["2026-10-05"], hoje: "2026-10-16" });
    expect(v).toHaveLength(11);
    expect(v[0]).toBe("2026-11-05");
    expect(v.at(-1)).toBe("2027-09-05");
  });

  it("job mensal completa só o que falta", () => {
    const existentes = vencimentosRecorrentesFaltantes({ vencimentoBase: "2026-10-31", existentes: [], hoje: "2026-10-01" });
    expect(existentes).toHaveLength(12);
    expect(existentes[1]).toBe("2026-11-30");
    const faltam = vencimentosRecorrentesFaltantes({ vencimentoBase: "2026-10-31", existentes, hoje: "2026-11-01" });
    expect(faltam).toEqual(["2027-10-31"]);
  });
});

describe("status da conta a pagar", () => {
  it("pago | vencido | a_vencer", () => {
    expect(statusConta("2026-10-10", "2026-10-09", "2026-10-16")).toBe("pago");
    expect(statusConta("2026-10-15", null, "2026-10-16")).toBe("vencido");
    expect(statusConta("2026-10-16", null, "2026-10-16")).toBe("a_vencer");
  });
});
