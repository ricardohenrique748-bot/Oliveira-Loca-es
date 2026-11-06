import { describe, expect, it } from "vitest";
import { formatarDocumento, lerNFSe } from "./danfse";

const CHAVE = "35498052244889430000181000000000000626116474549264";
/** NFS-e nº 6 (06/11/2026), no formato do XML que a Sefin devolve */
export const XML_NFSE = `<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${CHAVE}">
<xLocEmi>São José do Rio Preto</xLocEmi><xLocPrestacao>São José do Rio Preto</xLocPrestacao><nNFSe>6</nNFSe><cLocIncid>3549805</cLocIncid>
<xLocIncid>São José do Rio Preto</xLocIncid><xTribNac>Outros serviços de transporte de natureza municipal.</xTribNac><verAplic>SefinNac_Pre_1.0.0</verAplic>
<ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>100</cStat><dhProc>2026-11-06T09:57:05-03:00</dhProc><nDFSe>123</nDFSe>
<emit><CNPJ>44889430000181</CNPJ><xNome>OLIVEIRA &amp; OLIVEIRA RIO PRETO LTDA</xNome><enderNac><xLgr>RUA PRIMAVERA</xLgr><nro>SN</nro><xBairro>CONDOMINIO AREIA BRANCA</xBairro><cMun>3549805</cMun><UF>SP</UF><CEP>15048542</CEP></enderNac></emit>
<valores><vLiq>1710.00</vLiq></valores>
<DPS versao="1.00"><infDPS Id="DPS354980524488943000018100001000000000000034"><tpAmb>1</tpAmb><dhEmi>2026-11-06T09:57:04-03:00</dhEmi><verAplic>oliveira-1</verAplic>
<serie>1</serie><nDPS>34</nDPS><dCompet>2026-11-03</dCompet><tpEmit>1</tpEmit><cLocEmi>3549805</cLocEmi>
<prest><CNPJ>44889430000181</CNPJ><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>
<toma><CNPJ>47026842000186</CNPJ><xNome>ATMO SISTEMAS, CONSULTORIA E SERVICOS LTDA</xNome></toma>
<serv><locPrest><cLocPrestacao>3549805</cLocPrestacao></locPrest><cServ><cTribNac>160201</cTribNac><xDescServ>LOCAÇAO MUNCK placa QHP0I60 03/11/2026 (6 × R$ 180,00)</xDescServ></cServ></serv>
<valores><vServPrest><vServ>1710.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>0</pTotTribSN></totTrib></trib></valores>
</infDPS></DPS></infNFSe></NFSe>`;

describe("lerNFSe", () => {
  const d = lerNFSe(XML_NFSE);
  it("cabeçalho e identificação", () => {
    expect(d.chave).toBe(CHAVE);
    expect(d.numero).toBe("6");
    expect(d.competencia).toBe("03/11/2026");
    expect(d.emissaoNFSe).toBe("06/11/2026 09:57:05");
    expect(d.numeroDPS).toBe("34");
    expect(d.emissaoDPS).toBe("06/11/2026 09:57:04");
    expect(d.municipioEmissao).toBe("São José do Rio Preto - SP");
    expect(d.situacao).toBe("NFS-e Gerada");
    expect(d.emitente).toBe("Prestador");
  });
  it("prestador e tomador", () => {
    expect(d.prestador.documento).toBe("44.889.430/0001-81");
    expect(d.prestador.nome).toBe("OLIVEIRA & OLIVEIRA RIO PRETO LTDA");
    expect(d.prestador.ibgeCep).toBe("35.49805 / 15.048-542");
    expect(d.prestador.endereco).toBe("RUA PRIMAVERA, SN, CONDOMINIO AREIA BRANCA");
    expect(d.prestador.simples).toContain("ME/EPP");
    expect(d.tomador.documento).toBe("47.026.842/0001-86");
    expect(d.tomador.nome).toBe("ATMO SISTEMAS, CONSULTORIA E SERVICOS LTDA");
    expect(d.tomador.endereco).toBe("-");
  });
  it("serviço, ISSQN e valores", () => {
    expect(d.servico.codTrib).toBe("16.02.01 / -");
    expect(d.servico.local).toBe("São José do Rio Preto / SP / -");
    expect(d.servico.descricao).toContain("LOCAÇAO MUNCK placa QHP0I60");
    expect(d.issqn.tipo).toBe("Operação Tributável");
    expect(d.issqn.retencao).toBe("Não Retido");
    expect(d.valores.servico.replace(/\s/g, " ")).toBe("R$ 1.710,00");
    expect(d.valores.liquido.replace(/\s/g, " ")).toBe("R$ 1.710,00");
    expect(d.valores.descIncond).toBe("-");
  });
});

describe("formatarDocumento", () => {
  it("CNPJ e CPF", () => {
    expect(formatarDocumento("44889430000181")).toBe("44.889.430/0001-81");
    expect(formatarDocumento("12345678901")).toBe("123.456.789-01");
  });
});
