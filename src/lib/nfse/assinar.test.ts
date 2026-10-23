import { describe, expect, it } from "vitest";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { assinarDPS } from "./assinar";
import { montarDPS } from "./dps";

/** certificado A1 de mentira (autoassinado) num .pfx com senha, como o da empresa */
function pfxDeTeste(senha: string) {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const nome = [{ name: "commonName", value: "EMPRESA TESTE:44889430000181" }];
  cert.setSubject(nome);
  cert.setIssuer(nome);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], senha, { algorithm: "3des" });
  return { base64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()), certPem: forge.pki.certificateToPem(cert) };
}

const dps = montarDPS({
  ambiente: 2, serie: 1, numero: 1, emissao: new Date("2026-10-23T14:30:00Z"),
  prestador: { cnpj: "44889430000181", im: "3886940", codigoIbge: "3549805", regime: "simples_nacional", codigoServico: "16.02.01.000", aliquotaIss: 3 },
  tomador: { documento: "15370280000105", nome: "RIO PRETO POSTES PADRAO LTDA" },
  servico: { descricao: "SERVIÇOS PRESTADOS", inicio: "2026-10-01", complemento: "Dados Bancários: PIX" },
  valor: 4098,
});

describe("NFS-e — assinarDPS", () => {
  const pfx = pfxDeTeste("123");
  const assinado = assinarDPS(dps, pfx.base64, "123");

  it("assinatura enveloped no fim da DPS, referenciando o Id do infDPS, RSA-SHA256 + C14N", () => {
    expect(assinado).toMatch(/<\/infDPS><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">.*<\/Signature><\/DPS>$/s);
    expect(assinado).toContain('<Reference URI="#DPS354980524488943000018100001000000000000001">');
    expect(assinado).toContain('<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>');
    expect(assinado).toContain('<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>');
    expect(assinado).toContain('<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>');
    expect(assinado).toContain('<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>');
    expect(assinado).toContain("<X509Certificate>");
  });

  it("a assinatura confere com o certificado", () => {
    const v = new SignedXml({ publicCert: pfx.certPem });
    v.loadSignature(assinado.match(/<Signature[\s\S]*<\/Signature>/)![0]);
    expect(v.checkSignature(assinado)).toBe(true);
  });

  it("alterar o valor depois de assinar invalida a assinatura", () => {
    const adulterado = assinado.replace("<vServ>4098.00</vServ>", "<vServ>1.00</vServ>");
    const v = new SignedXml({ publicCert: pfx.certPem });
    v.loadSignature(adulterado.match(/<Signature[\s\S]*<\/Signature>/)![0]);
    expect(v.checkSignature(adulterado)).toBe(false);
  });

  it("senha errada dá erro claro", () => {
    expect(() => assinarDPS(dps, pfx.base64, "errada")).toThrow(/senha do certificado/i);
  });
});
