import { describe, expect, it } from "vitest";
import { descricaoKm } from "./descricao-km";

describe("descricaoKm", () => {
  it("troca locação por deslocamento, no mesmo caso", () => {
    expect(descricaoKm("LOCAÇAO MUNCK- 07:00h as 13:30h")).toBe("DESLOCAMENTO MUNCK- 07:00h as 13:30h - KM rodado");
    expect(descricaoKm("LOCAÇÃO MUNCK")).toBe("DESLOCAMENTO MUNCK - KM rodado");
    expect(descricaoKm("Locação de munck")).toBe("Deslocamento de munck - KM rodado");
    expect(descricaoKm("locacao caminhão")).toBe("deslocamento caminhão - KM rodado");
  });
  it("sem a palavra locação, começa com Deslocamento", () => {
    expect(descricaoKm("Munck 07:00 às 13:30")).toBe("Deslocamento - Munck 07:00 às 13:30 - KM rodado");
    expect(descricaoKm("  ")).toBe("Deslocamento - KM rodado");
  });
});
