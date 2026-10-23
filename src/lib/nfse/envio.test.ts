import { describe, expect, it } from "vitest";
import { gunzipSync, gzipSync } from "node:zlib";
import { corpoEnvio, lerResposta } from "./envio";

describe("NFS-e — corpo do envio", () => {
  it("XML assinado compactado (gzip) em base64 no campo dpsXmlGZipB64", () => {
    const xml = "<DPS>ção</DPS>";
    const { dpsXmlGZipB64 } = corpoEnvio(xml);
    expect(gunzipSync(Buffer.from(dpsXmlGZipB64, "base64")).toString("utf8")).toBe(`<?xml version="1.0" encoding="UTF-8"?>${xml}`);
  });

  it("declara UTF-8 uma vez só (E1229 da Sefin sem a declaração)", () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><DPS/>';
    expect(gunzipSync(Buffer.from(corpoEnvio(xml).dpsXmlGZipB64, "base64")).toString("utf8")).toBe(xml);
  });
});

describe("NFS-e — resposta da Sefin", () => {
  it("sucesso: chave de acesso e número da NFS-e de dentro do XML devolvido", () => {
    const nfse = "<NFSe><infNFSe Id=\"NFS1\"><nNFSe>27</nNFSe></infNFSe></NFSe>";
    const r = lerResposta(201, { chaveAcesso: "35498052244889430000181000000000002726101234567890", nfseXmlGZipB64: gzipSync(nfse).toString("base64") });
    expect(r).toEqual({ ok: true, chave: "35498052244889430000181000000000002726101234567890", numero: "27", xml: nfse });
  });

  it("rejeição: junta código e descrição de cada erro", () => {
    const r = lerResposta(400, { erros: [{ Codigo: "E0312", Descricao: "Código de tributação inexistente" }, { codigo: "E0001", descricao: "Outro" }] });
    expect(r).toEqual({ ok: false, erro: "E0312 – Código de tributação inexistente; E0001 – Outro" });
  });

  it("erro sem lista (ex.: certificado recusado) mostra o status HTTP", () => {
    expect(lerResposta(403, null)).toEqual({ ok: false, erro: "A Sefin Nacional recusou o envio (HTTP 403)" });
  });
});
