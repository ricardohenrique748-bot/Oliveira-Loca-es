import { describe, expect, it } from "vitest";
import { gunzipSync, gzipSync } from "node:zlib";
import forge from "node-forge";
import { assinarElemento } from "./assinar";
import { corpoEvento, lerRespostaEvento, urlEventos } from "./envio";
import { idPedidoCancelamento, montarPedidoCancelamento, validarCancelamento } from "./evento";

const CHAVE = "35498052244889430000181000000000001526111234567890";
const base = { ambiente: 2 as const, cnpjAutor: "44.889.430/0001-81", chave: CHAVE, codigo: 1 as const, motivo: "Valor da nota emitido errado", quando: new Date("2026-11-12T18:00:00Z") };

describe("NFS-e — pedido de cancelamento (e101101)", () => {
  it("leiaute 1.01: pedRegEvento > infPedReg com os campos na ordem do XSD", () => {
    expect(montarPedidoCancelamento(base)).toBe(
      `<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infPedReg Id="PRE${CHAVE}101101">` +
      `<tpAmb>2</tpAmb><verAplic>OliveiraLoc-1.0</verAplic><dhEvento>2026-11-12T15:00:00-03:00</dhEvento>` +
      `<CNPJAutor>44889430000181</CNPJAutor><chNFSe>${CHAVE}</chNFSe>` +
      `<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>Valor da nota emitido errado</xMotivo></e101101>` +
      `</infPedReg></pedRegEvento>`);
  });

  it("Id: PRE + chave + 101101 (59) ou, no leiaute com sequencial, + 001 (62) e <nPedRegEvento> antes do e101101", () => {
    expect(idPedidoCancelamento(CHAVE)).toHaveLength(59);
    expect(idPedidoCancelamento(CHAVE, true)).toHaveLength(62);
    const xml = montarPedidoCancelamento({ ...base, comSequencial: true });
    expect(xml).toContain(`Id="PRE${CHAVE}101101001"`);
    expect(xml).toContain(`<chNFSe>${CHAVE}</chNFSe><nPedRegEvento>001</nPedRegEvento><e101101>`);
  });

  it("justificativa: espaços colapsados, caracteres especiais escapados, 15 a 255 caracteres", () => {
    expect(montarPedidoCancelamento({ ...base, motivo: "  Erro  <valor> & \n data errada " })).toContain("<xMotivo>Erro &lt;valor&gt; &amp; data errada</xMotivo>");
    expect(validarCancelamento({ ...base, motivo: "curto demais" })).toMatch(/15 caracteres/);
    expect(validarCancelamento({ ...base, motivo: "x".repeat(256) })).toMatch(/255/);
    expect(validarCancelamento({ ...base, chave: "123" })).toMatch(/50 dígitos/);
    expect(validarCancelamento({ ...base, codigo: 5 as never })).toMatch(/motivo/);
    expect(() => montarPedidoCancelamento({ ...base, motivo: "curto" })).toThrow();
  });

  it("assinatura enveloped logo depois do infPedReg, referenciando o Id", () => {
    const k = forge.pki.rsa.generateKeyPair(1024);
    const c = forge.pki.createCertificate();
    c.publicKey = k.publicKey; c.serialNumber = "01";
    c.validity.notBefore = new Date(); c.validity.notAfter = new Date(Date.now() + 864e5);
    c.setSubject([{ name: "commonName", value: "T" }]); c.setIssuer([{ name: "commonName", value: "T" }]);
    c.sign(k.privateKey, forge.md.sha256.create());
    const pfx = forge.util.encode64(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(k.privateKey, [c], "s", { algorithm: "3des" })).getBytes());
    const assinado = assinarElemento(montarPedidoCancelamento(base), "infPedReg", pfx, "s");
    expect(assinado).toMatch(/<\/infPedReg><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">.*<\/Signature><\/pedRegEvento>$/s);
    expect(assinado).toContain(`<Reference URI="#PRE${CHAVE}101101">`);
  });

  it("envio: POST em /{chave}/eventos com o XML em gzip+base64 no campo pedidoRegistroEventoXmlGZipB64", () => {
    expect(urlEventos("producao", CHAVE)).toBe(`https://sefin.nfse.gov.br/SefinNacional/nfse/${CHAVE}/eventos`);
    const { pedidoRegistroEventoXmlGZipB64 } = corpoEvento("<pedRegEvento/>");
    expect(gunzipSync(Buffer.from(pedidoRegistroEventoXmlGZipB64, "base64")).toString("utf8")).toBe('<?xml version="1.0" encoding="UTF-8"?><pedRegEvento/>');
  });
});

describe("NFS-e — resposta do evento", () => {
  it("sucesso com o XML do evento", () => {
    const evento = Buffer.from("<evento/>");
    expect(lerRespostaEvento(201, { tipoAmbiente: 2, eventoXmlGZipB64: gzipSync(evento).toString("base64") })).toEqual({ ok: true, xml: "<evento/>" });
  });

  it("erros em 'erro' (objeto ou lista) ou 'erros', com os códigos", () => {
    expect(lerRespostaEvento(400, { erro: { codigo: "E0840", descricao: "Já existe evento" } }))
      .toEqual({ ok: false, erro: "E0840 – Já existe evento", codigos: ["E0840"] });
    expect(lerRespostaEvento(400, { erros: [{ Codigo: "E1235", Descricao: "Falha no schema: nPedRegEvento" }] }).ok).toBe(false);
    // 200 com lista de erros não é sucesso
    expect(lerRespostaEvento(200, { erro: [{ codigo: "E0001", descricao: "x" }] }).ok).toBe(false);
    expect(lerRespostaEvento(403, null)).toEqual({ ok: false, erro: "A Sefin Nacional recusou o pedido (HTTP 403)", codigos: [] });
  });
});
