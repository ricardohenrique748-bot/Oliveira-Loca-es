import { describe, expect, it } from "vitest";
import {
  formatData, formatPlaca, linkWhatsApp, maskCNPJ, maskCPF, maskTelefone, normalizarPlaca, parseDataBR,
  PLACA_RE, preencherTemplate, validarCNPJ, validarCPF, formatCompetencia,
} from "./format";

describe("formatação BR", () => {
  it("datas", () => {
    expect(formatData("2026-10-16")).toBe("16/10/2026");
    expect(parseDataBR("16/10/26")).toBe("2026-10-16");
    expect(parseDataBR("1/2/2027")).toBe("2027-02-01");
    expect(formatCompetencia("2026-09")).toBe("set/2026");
  });

  it("máscaras", () => {
    expect(maskCPF("12345678909")).toBe("123.456.789-09");
    expect(maskCNPJ("12345678000190")).toBe("12.345.678/0001-90");
    expect(maskTelefone("5517991234567")).toBe("(17) 99123-4567");
    expect(maskTelefone("1732221111")).toBe("(17) 3222-1111");
  });

  it("validação de CPF/CNPJ", () => {
    expect(validarCPF("123.456.789-09")).toBe(true);
    expect(validarCPF("111.111.111-11")).toBe(false);
    expect(validarCNPJ("11.222.333/0001-81")).toBe(true);
    expect(validarCNPJ("11.222.333/0001-82")).toBe(false);
  });

  it("placas Mercosul e antiga", () => {
    expect(normalizarPlaca("ght-3b45")).toBe("GHT3B45");
    expect(PLACA_RE.test("GHT3B45")).toBe(true);
    expect(PLACA_RE.test("DQX4521")).toBe(true);
    expect(PLACA_RE.test("DQ4521")).toBe(false);
    expect(formatPlaca("DQX4521")).toBe("DQX-4521");
    expect(formatPlaca("GHT3B45")).toBe("GHT3B45");
  });

  it("links de cobrança", () => {
    expect(linkWhatsApp("(17) 99123-4567", "Olá!")).toBe("https://wa.me/5517991234567?text=Ol%C3%A1!");
    expect(preencherTemplate("NF {nf} — {valor}", { nf: "4101", valor: "R$ 1,00" })).toBe("NF 4101 — R$ 1,00");
  });
});
