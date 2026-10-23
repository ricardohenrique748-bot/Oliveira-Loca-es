/**
 * Envio da DPS assinada à Sefin Nacional (POST /nfse) e leitura da resposta — só no servidor (Node).
 * O corpo é JSON com a DPS compactada em gzip e codificada em base64. A autenticação é o próprio certificado (mTLS).
 * O formato da resposta vem de fontes secundárias (o Swagger oficial exige certificado): conferir na homologação.
 */
import { gunzipSync, gzipSync } from "node:zlib";

export const SEFIN = {
  homologacao: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse",
  producao: "https://sefin.nfse.gov.br/SefinNacional/nfse",
} as const;

export function corpoEnvio(xmlAssinado: string) {
  return { dpsXmlGZipB64: gzipSync(Buffer.from(xmlAssinado, "utf8")).toString("base64") };
}

export type RespostaNFSe = { ok: true; chave: string; numero: string | null; xml: string } | { ok: false; erro: string };

type Erro = { Codigo?: string; codigo?: string; Descricao?: string; descricao?: string };

export function lerResposta(status: number, corpo: unknown): RespostaNFSe {
  const c = (corpo ?? {}) as { chaveAcesso?: string; nfseXmlGZipB64?: string; erros?: Erro[]; Erros?: Erro[] };
  if (status >= 200 && status < 300 && c.chaveAcesso && c.nfseXmlGZipB64) {
    const xml = gunzipSync(Buffer.from(c.nfseXmlGZipB64, "base64")).toString("utf8");
    return { ok: true, chave: c.chaveAcesso, numero: xml.match(/<nNFSe>(\d+)<\/nNFSe>/)?.[1] ?? null, xml };
  }
  const erros = c.erros ?? c.Erros ?? [];
  if (erros.length) return { ok: false, erro: erros.map((e) => `${e.Codigo ?? e.codigo ?? "?"} – ${e.Descricao ?? e.descricao ?? ""}`).join("; ") };
  return { ok: false, erro: `A Sefin Nacional recusou o envio (HTTP ${status})` };
}
