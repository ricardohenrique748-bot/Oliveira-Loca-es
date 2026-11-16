import { describe, expect, it } from "vitest";
import { podeEscrever, podeLer, separarPerfis, veReceita } from "./permissoes";

describe("vários setores por usuário", () => {
  const lauana = { perfil: "financeiro" as const, perfisExtras: ["manutencao" as const], soFaturasAvulsas: true };

  it("soma as permissões dos setores marcados", () => {
    expect(podeEscrever(lauana, "receber")).toBe(true); // financeiro
    expect(podeEscrever(lauana, "manutencao")).toBe(true); // manutenção (documentos dos veículos)
    expect(podeEscrever({ perfil: "financeiro" }, "manutencao")).toBe(false);
    expect(veReceita(lauana)).toBe(true);
    expect(veReceita({ perfil: "manutencao" })).toBe(false);
  });

  it("só faturas avulsas esconde Contratos, menos para admin", () => {
    expect(podeLer(lauana, "contratos")).toBe(false);
    expect(podeLer({ ...lauana, soFaturasAvulsas: false }, "contratos")).toBe(true);
    expect(podeLer({ perfil: "admin", soFaturasAvulsas: true }, "contratos")).toBe(true);
  });

  it("o setor de mais acesso vira o principal; admin dispensa os outros", () => {
    expect(separarPerfis(["manutencao", "financeiro"])).toEqual({ perfil: "financeiro", extras: ["manutencao"] });
    expect(separarPerfis(["consulta", "admin", "financeiro"])).toEqual({ perfil: "admin", extras: [] });
    expect(separarPerfis(["comercial"])).toEqual({ perfil: "comercial", extras: [] });
  });
});
