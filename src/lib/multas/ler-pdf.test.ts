import { describe, expect, it } from "vitest";
import { interpretarMulta, normalizarPlaca, pontosPorValor } from "./ler-pdf";

// texto do OCR dos PDFs "Detalhes da Infração" (SENATRAN) impressos pelo Microsoft Print to PDF
const PRF = `Detalhes da Infração
N
B TRANSITAR COM O VEICULO EM MARCAS DE CANALIZACAO
Placa à época da infração: ALZ2G88
Órgão Autuador 000100 - POLICIA RODOVIARIA FEDERAL
Órgão Competente/Responsável OOO0100 - POLICIA RODOVIARIA FEDERAL
Local da Infração RJ - BR 101 - KM 297.00 - D - ITABORAI
Data/Hora do Cometimento da Infração 14/04/2026 17:39
Número do Auto de Infração NOO5009822
Código da Infração 5819-6
Número RENAINF 11254112685
Valor Original e R$ 88041
Data da Notificação de Autuação 20/04/2026
Data Limite para Interposição de Defesa 09/06/2026
Prévia
Data Limite para Identificação do 09/06/2026
Condutor Infrator
Data da Notificação de Penalidade 07/09/2026
Data Limite para Interposição de Recurso 05/01/2027
Data do Vencimento do Desconto 05/01/2027
`;

const PREFEITURA = `Detalhes da Infração
N
B ESTACIONAR LOCAL/HORARIO DE ESTACIONAMENTO E PARADA PROIBIDOS PELA SINALIZAÇÃO
Placa à época da infração: ALZ2G88
Órgão Autuador 258970 - PREF. DE RJ SAO GONCALO
Órgão Competente/Responsável 258970 - PREF. DE RJ SAO GONCALO
Local da Infração RUA DR ALBERTO TORRES 1255 NEVES - SAO GONCALO
Data/Hora do Cometimento da Infração 06/04/2026 09:30
Número do Auto de Infração S$31511524
Código da Infração 5568- O
Número RENAINF 11240976240
Valor Original = R$ 195,23
Data da Notificação de Autuação 13/04/2026
Data Limite para Interposição de Defesa 13/05/2026
Prévia
Data Limite para Identificação do 13/05/2026
Condutor Infrator
`;

describe("interpretarMulta", () => {
  it("multa da PRF com penalidade e desconto", () => {
    expect(interpretarMulta(PRF)).toEqual({
      placa: "ALZ2G88",
      descricao: "TRANSITAR COM O VEICULO EM MARCAS DE CANALIZACAO",
      orgao: "000100 - POLICIA RODOVIARIA FEDERAL",
      local: "RJ - BR 101 - KM 297.00 - D - ITABORAI",
      data_infracao: "2026-04-14",
      hora: "17:39",
      auto_infracao: "N005009822",
      codigo: "5819-6",
      renainf: "11254112685",
      valor: 880.41,
      pontos: 7,
      notificacao_autuacao: "2026-04-20",
      limite_defesa: "2026-06-09",
      limite_condutor: "2026-06-09",
      notificacao_penalidade: "2026-09-07",
      limite_recurso: "2027-01-05",
      vencimento_desconto: "2027-01-05",
    });
  });

  it("multa municipal ainda na fase de autuação", () => {
    const m = interpretarMulta(PREFEITURA)!;
    expect(m.descricao).toBe("ESTACIONAR LOCAL/HORARIO DE ESTACIONAMENTO E PARADA PROIBIDOS PELA SINALIZAÇÃO");
    expect(m.auto_infracao).toBe("S31511524");
    expect(m.codigo).toBe("5568-0");
    expect(m.valor).toBe(195.23);
    expect(m.pontos).toBe(5);
    expect(m.data_infracao).toBe("2026-04-06");
    expect(m.limite_condutor).toBe("2026-05-13");
    expect(m.notificacao_penalidade).toBeNull();
    expect(m.vencimento_desconto).toBeNull();
  });

  it("ignora página que não é de multa", () => {
    expect(interpretarMulta("Política de cookies\nAceitar")).toBeNull();
  });
});

describe("auxiliares", () => {
  it("normaliza placa com trocas do OCR", () => {
    expect(normalizarPlaca("ALZ 2G88")).toBe("ALZ2G88");
    expect(normalizarPlaca("A1Z2G8B")).toBe("AIZ2G88");
    expect(normalizarPlaca("ABC-1234")).toBe("ABC1234");
    expect(normalizarPlaca("XYZ")).toBeNull();
  });
  it("pontos pela gravidade do valor", () => {
    expect(pontosPorValor(88.38)).toBe(3);
    expect(pontosPorValor(130.16)).toBe(4);
    expect(pontosPorValor(586.94)).toBe(7);
    expect(pontosPorValor(100)).toBeNull();
  });
});
