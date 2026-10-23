/**
 * Assinatura da DPS com o certificado A1 (.pfx) da empresa — só no servidor (Node), nunca no navegador.
 * XMLDSig enveloped no fim da DPS, referenciando o Id do infDPS: RSA-SHA256, digest SHA-256, C14N 1.0.
 */
import forge from "node-forge";
import { SignedXml } from "xml-crypto";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const INF_DPS = "//*[local-name(.)='infDPS']";

/** chave privada e certificado (PEM) de dentro do .pfx */
export function lerCertificado(pfxBase64: string, senha: string): { chavePem: string; certPem: string } {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    // senha colada em painel costuma vir com espaço ou quebra de linha no fim
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(pfxBase64.replace(/\s+/g, ""))), senha.trim());
  } catch (e) {
    // o motivo técnico (senha errada x criptografia não suportada) não expõe nada do certificado
    throw new Error(`Não foi possível abrir o certificado: confira o arquivo .pfx e a senha do certificado (${e instanceof Error ? e.message : String(e)})`);
  }
  const chave = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
  const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
  if (!chave || !cert) throw new Error("O certificado .pfx não tem chave privada ou certificado");
  return { chavePem: forge.pki.privateKeyToPem(chave), certPem: forge.pki.certificateToPem(cert) };
}

export function assinarDPS(xml: string, pfxBase64: string, senha: string): string {
  const { chavePem, certPem } = lerCertificado(pfxBase64, senha);
  const sig = new SignedXml({
    privateKey: chavePem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({
    xpath: INF_DPS,
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", C14N],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  sig.computeSignature(xml, { location: { reference: INF_DPS, action: "after" } });
  return sig.getSignedXml();
}
