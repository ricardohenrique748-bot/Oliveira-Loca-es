import { describe, expect, it } from "vitest";
import { documentoFormSchema, laudosLoteSchema } from "./manutencao";

const V = "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b";

describe("documentos: todos os laudos de uma vez", () => {
  it("exige pelo menos um laudo anexado", () => {
    const base = { veiculo_id: V, tipo: "todos_laudos", data_emissao: "2026-10-28", validade: "2027-10-28" };
    expect(documentoFormSchema.safeParse({ ...base, laudos: {} }).success).toBe(false);
    expect(documentoFormSchema.safeParse({ ...base, laudos: { laudo_dieletrico: null } }).success).toBe(false);
    expect(documentoFormSchema.safeParse({ ...base, laudos: { laudo_dieletrico: "documentos/a.pdf" } }).success).toBe(true);
  });

  it("vencimento antes da emissão é recusado (avulso e em lote)", () => {
    const datas = { data_emissao: "2026-10-28", validade: "2026-10-01" };
    expect(documentoFormSchema.safeParse({ veiculo_id: V, tipo: "laudo_escada", ...datas }).success).toBe(false);
    expect(laudosLoteSchema.safeParse({ veiculo_id: V, ...datas, laudos: { laudo_escada: "x.pdf" } }).success).toBe(false);
  });

  it("o lote só aceita tipos de laudo", () => {
    const ok = laudosLoteSchema.safeParse({ veiculo_id: V, data_emissao: "2026-10-28", validade: "2027-10-28", laudos: { laudo_escada: "x.pdf", laudo_opacidade: null } });
    expect(ok.success).toBe(true);
    expect(laudosLoteSchema.safeParse({ veiculo_id: V, laudos: { seguro: "x.pdf" } }).success).toBe(false);
  });
});
