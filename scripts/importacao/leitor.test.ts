import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { lerPlanilha } from "./leitor";
import { clienteObra, data, periodo, placa, valor } from "./normalizar";

describe("leitor de planilhas", () => {
  it("detecta o cabeçalho deslocado e lê as colunas por apelido", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["LEMBRETE DE FATURAMENTO — SETEMBRO/26"],
      [],
      ["Empresa", "Contrato", "Placa", "Cliente", "Período", "Faturado", "Vencimento", "Valor (R$)", "Responsável", "Status", "Observações"],
      ["OLIVEIRA", "OL-001", "fjk-8a12", "CYMI", "01/09/26 A 30/09/26", 46296, "31/10/2026", 18000, "faturamento@cymi.example", "FATURADO", "4123"],
      ["TDTS", "TD-7", "EKL4L78", "CARAMURU - obra 3800-D", "21/08/26 A 20/09/26", null, "#REF!", "R$ 9.000,00", "(17) 99123-4567", "Faturar", "aguardando medição"],
      [],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Oliveira SET26");
    const dir = mkdtempSync(path.join(tmpdir(), "imp-"));
    const arq = path.join(dir, "lembrete.xlsx");
    writeFileSync(arq, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const [aba] = lerPlanilha(arq, ["empresa", "contrato", "placa", "cliente", "periodo", "vencimento", "valor", "status"]);
    expect(aba.nome).toBe("Oliveira SET26");
    expect(aba.linhas).toHaveLength(2);
    const [a, b] = aba.linhas;
    expect(a.linha).toBe(4);
    expect(placa(a.get("placa"))).toBe("FJK8A12");
    expect(periodo(a.get("periodo"))).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(data(a.get("faturado"))).toBe("2026-10-01");
    expect(valor(a.get("valor"))).toBe(18000);
    expect(clienteObra(b.get("cliente"))).toEqual({ cliente: "Caramuru", obra: "3800-D" });
    expect(data(b.get("vencimento"))).toBeNull();
    expect(valor(b.get("valor"))).toBe(9000);
  });
});
