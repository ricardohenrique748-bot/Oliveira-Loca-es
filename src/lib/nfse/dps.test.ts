import { describe, expect, it } from "vitest";
import { idDPS, montarDPS, type DadosDPS } from "./dps";

const base: DadosDPS = {
  ambiente: 2, serie: 1, numero: 1, emissao: new Date("2026-10-23T14:30:00Z"),
  prestador: { cnpj: "44.889.430/0001-81", codigoIbge: "3549805", regime: "simples_nacional", codigoServico: "16.02.01", aliquotaIss: 3 },
  tomador: { documento: "11.222.333/0001-81", nome: "Construtora Caramuru Ltda" },
  servico: { descricao: "Locação de munck placa CVP-0414 — 23/10/2026", inicio: "2026-10-23" },
  valor: 1800,
};

describe("NFS-e — identificador da DPS", () => {
  it("DPS + IBGE + tipo (2 = CNPJ) + CNPJ + série(5) + número(15) = 45 posições", () => {
    const id = idDPS("3549805", "44889430000181", 1, 27);
    expect(id).toBe("DPS3549805244889430000181" + "00001" + "000000000000027");
    expect(id).toHaveLength(45);
  });
});

describe("NFS-e — montarDPS", () => {
  const xml = montarDPS(base);

  it("raiz na versão 1.01 do padrão nacional", () => {
    expect(xml).toContain('<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">');
    expect(xml).toContain('<infDPS Id="DPS354980524488943000018100001000000000000001">');
  });

  it("homologação (XSD de 20/10/2026) exige finNFSe = 0 depois do tpEmit; produção (XSD de 09/02/2026) não tem o campo", () => {
    expect(xml).toContain("<tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>");
    expect(montarDPS({ ...base, ambiente: 1 })).toContain("<tpEmit>1</tpEmit><cLocEmi>");
  });

  it("ambiente, emissão no horário de Brasília, série, número e competência", () => {
    expect(xml).toContain("<tpAmb>2</tpAmb>");
    expect(xml).toContain("<dhEmi>2026-10-23T11:30:00-03:00</dhEmi>");
    expect(xml).toContain("<serie>1</serie><nDPS>1</nDPS><dCompet>2026-10-23</dCompet>");
    expect(xml).toContain("<cLocEmi>3549805</cLocEmi>");
  });

  it("prestador do Simples Nacional (ME/EPP), sem IM (E0120: Rio Preto sem dados complementares no CNC)", () => {
    expect(xml).toContain("<prest><CNPJ>44889430000181</CNPJ><regTrib>");
    expect(montarDPS({ ...base, ambiente: 1 })).toContain("<prest><CNPJ>44889430000181</CNPJ><regTrib>");
    expect(xml).toContain("<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib>");
  });

  it("tomador por CNPJ ou CPF, só dígitos", () => {
    expect(xml).toContain("<toma><CNPJ>11222333000181</CNPJ><xNome>Construtora Caramuru Ltda</xNome></toma>");
    expect(montarDPS({ ...base, tomador: { documento: "123.456.789-09", nome: "Bruno" } })).toContain("<toma><CPF>12345678909</CPF>");
  });

  it("serviço: código nacional com 6 dígitos e descrição", () => {
    expect(xml).toContain("<locPrest><cLocPrestacao>3549805</cLocPrestacao></locPrest>");
    expect(xml).toContain("<cServ><cTribNac>160201</cTribNac><xDescServ>Locação de munck placa CVP-0414 — 23/10/2026</xDescServ></cServ>");
  });

  it("valores: serviço com 2 casas, ISS tributável não retido a 3%, sem estimativa de tributos", () => {
    expect(xml).toContain("<vServPrest><vServ>1800.00</vServ></vServPrest>");
    expect(xml).toContain("<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN><pAliq>3.00</pAliq></tribMun>");
    expect(xml).toContain("<totTrib><indTotTrib>0</indTotTrib></totTrib>");
  });

  it("escapa caracteres especiais do XML", () => {
    expect(montarDPS({ ...base, tomador: { ...base.tomador, nome: "A & B <Ltda>" } })).toContain("<xNome>A &amp; B &lt;Ltda&gt;</xNome>");
  });

  it("texto fixo da empresa (dados bancários) vai no fim da discriminação", () => {
    const x = montarDPS({ ...base, servico: { ...base.servico, complemento: "Dados Bancários: PIX.: 44.889.430/0001-81" } });
    expect(x).toContain("<xDescServ>Locação de munck placa CVP-0414 — 23/10/2026\nDados Bancários: PIX.: 44.889.430/0001-81</xDescServ>");
  });

  it("código de 9 dígitos: 6 nacionais + 3 municipais", () => {
    const x = montarDPS({ ...base, prestador: { ...base.prestador, codigoServico: "16.02.01.001" } });
    expect(x).toContain("<cServ><cTribNac>160201</cTribNac><cTribMun>001</cTribMun><xDescServ>");
  });

  it("parte municipal 000 não vai (E0315 da Sefin: não é permitido informar 000)", () => {
    const x = montarDPS({ ...base, prestador: { ...base.prestador, codigoServico: "16.02.01.000" } });
    expect(x).toContain("<cServ><cTribNac>160201</cTribNac><xDescServ>");
  });

  it("recusa código de serviço que não tem 6 ou 9 dígitos e tomador sem CPF/CNPJ", () => {
    expect(() => montarDPS({ ...base, prestador: { ...base.prestador, codigoServico: "16.02" } })).toThrow(/6 ou 9 dígitos/);
    expect(() => montarDPS({ ...base, tomador: { documento: null, nome: "Bruno" } })).toThrow(/CPF ou CNPJ/);
  });
});
