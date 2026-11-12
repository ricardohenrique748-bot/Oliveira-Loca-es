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

const DECL_UTF8 = '<?xml version="1.0" encoding="UTF-8"?>';

/** XML exatamente como vai compactado para a Sefin (é o que fica registrado na tentativa).
 *  Sem a declaração a Sefin rejeita com E1229 ("Xml não está utilizando codificação UTF-8"); fica fora do trecho assinado. */
export function xmlParaEnvio(xmlAssinado: string): string {
  return xmlAssinado.startsWith("<?xml") ? xmlAssinado : DECL_UTF8 + xmlAssinado;
}

export function corpoEnvio(xmlAssinado: string) {
  return { dpsXmlGZipB64: gzipSync(Buffer.from(xmlParaEnvio(xmlAssinado), "utf8")).toString("base64") };
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

// ---------- eventos (cancelamento): POST {SEFIN}/{chave}/eventos ----------
export const urlEventos = (ambiente: keyof typeof SEFIN, chave: string) => `${SEFIN[ambiente]}/${chave}/eventos`;

export function corpoEvento(xmlAssinado: string) {
  return { pedidoRegistroEventoXmlGZipB64: gzipSync(Buffer.from(xmlParaEnvio(xmlAssinado), "utf8")).toString("base64") };
}

export type RespostaEvento = { ok: true; xml: string | null } | { ok: false; erro: string; codigos: string[] };

/** sucesso: 2xx com o XML do evento registrado; erro: a lista vem em "erros", "Erros" ou "erro" (lista ou objeto) */
export function lerRespostaEvento(status: number, corpo: unknown): RespostaEvento {
  const c = (corpo ?? {}) as { eventoXmlGZipB64?: string; erros?: Erro[]; Erros?: Erro[]; erro?: Erro[] | Erro | null };
  const bruto = c.erros ?? c.Erros ?? c.erro ?? [];
  const erros = (Array.isArray(bruto) ? bruto : [bruto]).filter((e) => e && (e.Codigo || e.codigo || e.Descricao || e.descricao));
  if (status >= 200 && status < 300 && !erros.length) {
    let xml: string | null = null;
    try { xml = c.eventoXmlGZipB64 ? gunzipSync(Buffer.from(c.eventoXmlGZipB64, "base64")).toString("utf8") : null; } catch { xml = null; }
    return { ok: true, xml };
  }
  if (erros.length) return {
    ok: false,
    erro: erros.map((e) => `${e.Codigo ?? e.codigo ?? "?"} – ${e.Descricao ?? e.descricao ?? ""}`).join("; "),
    codigos: erros.map((e) => String(e.Codigo ?? e.codigo ?? "")).filter(Boolean),
  };
  return { ok: false, erro: `A Sefin Nacional recusou o pedido (HTTP ${status})`, codigos: [] };
}
