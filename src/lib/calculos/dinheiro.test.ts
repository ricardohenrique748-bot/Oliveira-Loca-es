import { describe, expect, it } from "vitest";
import { arred2, formatBRL, parseBRL, somar } from "./dinheiro";
import { addMesesClamp, diffDias, hojeSP, isISODate } from "./datas";

describe("dinheiro", () => {
  it("formata em BRL", () => {
    expect(formatBRL(1234.56)).toBe("R$ 1.234,56");
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(null)).toBe("—");
  });

  it("interpreta valores digitados", () => {
    expect(parseBRL("R$ 1.234,56")).toBe(1234.56);
    expect(parseBRL("1234,5")).toBe(1234.5);
    expect(parseBRL("1234.56")).toBe(1234.56);
    expect(parseBRL("1.234")).toBe(1234);
    expect(parseBRL("")).toBeNull();
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("-50,00")).toBe(-50);
  });

  it("soma sem erro de ponto flutuante", () => {
    expect(somar([0.1, 0.2])).toBe(0.3);
    expect(arred2(1.005)).toBe(1.01);
  });
});

describe("datas", () => {
  it("valida ISO e soma meses", () => {
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(addMesesClamp("2026-01-31", 1)).toBe("2026-02-28");
    expect(diffDias("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("hoje em America/Sao_Paulo", () => {
    // 02:30 UTC de 17/10 ainda é 16/10 em São Paulo (UTC−3)
    expect(hojeSP(new Date("2026-10-17T02:30:00Z"))).toBe("2026-10-16");
  });
});
