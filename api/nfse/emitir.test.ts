/**
 * Função de emissão com a Sefin e o Supabase simulados: nenhuma nota é emitida e nada sai da máquina.
 * Confere o registro da tentativa (XML exato enviado, status e corpo bruto, ou erro de conexão) e que segredos não vazam.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { gunzipSync, gzipSync } from "node:zlib";
import forge from "node-forge";

const https = vi.hoisted(() => ({ request: vi.fn() }));
const supa = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("node:https", () => https);
vi.mock("@supabase/supabase-js", () => supa);

import handler from "./emitir";

const SENHA = "senha-de-teste-9f3k";
let PFX = "";

/** certificado A1 de mentira (autoassinado) num .pfx com senha */
beforeAll(() => {
  const k = forge.pki.rsa.generateKeyPair(2048);
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey; c.serialNumber = "01";
  c.validity.notBefore = new Date(); c.validity.notAfter = new Date(Date.now() + 864e5);
  c.setSubject([{ name: "commonName", value: "TESTE" }]); c.setIssuer([{ name: "commonName", value: "TESTE" }]);
  c.sign(k.privateKey, forge.md.sha256.create());
  PFX = forge.util.encode64(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(k.privateKey, [c], SENHA, { algorithm: "3des" })).getBytes());
});

const FATURA = {
  id: "fat-1", empresa_id: "emp-1", status: "faturado", valor_final: 1800, periodo_inicio: "2026-10-23", periodo_fim: "2026-10-23",
  nfse_chave: null, nfse_ambiente: null,
  empresas: { cnpj: "44889430000181", regime_tributario: "simples_nacional", codigo_ibge: "3549805", nfse_codigo_servico: "16.02.01.000",
    nfse_aliquota_iss: 3, nfse_texto_complementar: "Dados Bancários: PIX" },
  contratos: { numero: "OL-002/26", clientes: { razao_social: "CLIENTE TESTE LTDA", cnpj: "15370280000105" }, veiculos: { placa: "CVP0414", tipo: "munck" } },
};

/** Supabase falso: guarda o que a função grava */
function supabaseFalso() {
  const gravado = { tentativas: [] as Record<string, unknown>[], medicao: [] as Record<string, unknown>[] };
  const sb = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: async () => ({ data: 42, error: null }),
    from: (tabela: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: FATURA, error: null }) }) }),
      update: (v: Record<string, unknown>) => ({ eq: async () => { gravado.medicao.push(v); return { error: null }; } }),
      insert: (v: Record<string, unknown>) => ({
        select: () => ({ single: async () => {
          if (tabela !== "nfse_tentativas") throw new Error("insert inesperado em " + tabela);
          gravado.tentativas.push(v);
          return { data: { id: "tent-" + gravado.tentativas.length }, error: null };
        } }),
      }),
    }),
  };
  supa.createClient.mockReturnValue(sb);
  return gravado;
}

/** Sefin falsa: guarda o corpo enviado e responde com status/corpo dados (ou erro de conexão) */
function sefinFalsa(resposta: { status: number; corpo: string } | { erro: string }) {
  const enviado = { corpo: "", opcoes: {} as Record<string, unknown> };
  https.request.mockImplementation((_url: string, opcoes: Record<string, unknown>, cb: (r: unknown) => void) => {
    enviado.opcoes = opcoes;
    const req = new EventEmitter() as EventEmitter & { end: (d: string) => void; destroy: () => void };
    req.destroy = () => {};
    req.end = (d: string) => {
      enviado.corpo = d;
      setImmediate(() => {
        if ("erro" in resposta) return req.emit("error", new Error(resposta.erro));
        const res = Object.assign(new EventEmitter(), { statusCode: resposta.status, setEncoding: () => {} });
        cb(res);
        res.emit("data", resposta.corpo);
        res.emit("end");
      });
    };
    return req;
  });
  return enviado;
}

async function chamar() {
  let status = 0, corpo: Record<string, unknown> = {};
  await handler(
    { method: "POST", headers: { authorization: "Bearer token-do-usuario" }, body: { medicaoId: "fat-1" } },
    { status: (n: number) => ({ json: (b: unknown) => { status = n; corpo = b as Record<string, unknown>; } }) },
  );
  return { status, corpo };
}

const xmlDoCorpo = (corpo: string) => gunzipSync(Buffer.from(JSON.parse(corpo).dpsXmlGZipB64, "base64")).toString("utf8");

/** nada de certificado, senha, chave privada ou token no registro */
function semSegredos(registro: unknown) {
  const txt = JSON.stringify(registro);
  expect(txt).not.toContain(PFX.slice(0, 40));
  expect(txt).not.toContain(SENHA);
  expect(txt).not.toMatch(/PRIVATE KEY/);
  expect(txt).not.toContain("token-do-usuario");
}

let logs: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  process.env.NFSE_CERT_PFX_BASE64 = PFX;
  process.env.NFSE_CERT_SENHA = SENHA;
  process.env.NFSE_AMBIENTE = "producao";
  logs = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => {
  for (const l of logs) expect(l).not.toHaveBeenCalled(); // nada de XML, resposta ou segredo em log
  vi.restoreAllMocks();
});

describe("emitir — registro das tentativas", () => {
  it("rejeição (E0084): grava XML exato enviado, status 400 e corpo bruto; resumo continua na fatura", async () => {
    const corpoSefin = '{"erros":[{"Codigo":"E0084","Descricao":"CNPJ do emitente prestador não possui estabelecimento"}],"versaoAplicativo":"x"}';
    const gravado = supabaseFalso();
    const enviado = sefinFalsa({ status: 400, corpo: corpoSefin });

    const r = await chamar();

    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: expect.stringContaining("E0084"), tentativa: "tent-1" });
    expect(gravado.tentativas).toHaveLength(1);
    const t = gravado.tentativas[0];
    expect(t.xml_enviado).toBe(xmlDoCorpo(enviado.corpo)); // byte a byte o que foi compactado e enviado
    expect(String(t.xml_enviado)).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?><DPS [\s\S]*<Signature [\s\S]*<\/DPS>$/);
    expect(t).toMatchObject({ medicao_id: "fat-1", ambiente: "producao", numero_dps: 42, http_status: 400, resposta_corpo: corpoSefin });
    expect(t.erro).toBeUndefined();
    expect(gravado.medicao[0]).toMatchObject({ nfse_erro: expect.stringContaining("E0084"), nfse_dps: 42 });
    semSegredos(t);
    expect(enviado.opcoes.key).toMatch(/PRIVATE KEY/); // a chave vai só na conexão (mTLS)
  });

  it("sucesso: grava XML exato, status e corpo bruto; fatura recebe chave e número", async () => {
    const nfse = "<NFSe><infNFSe><nNFSe>190</nNFSe></infNFSe></NFSe>";
    const corpoSefin = JSON.stringify({ chaveAcesso: "3549805".padEnd(50, "1"), nfseXmlGZipB64: gzipSync(nfse).toString("base64") });
    const gravado = supabaseFalso();
    const enviado = sefinFalsa({ status: 201, corpo: corpoSefin });

    const r = await chamar();

    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, numero: "190", tentativa: "tent-1" });
    const t = gravado.tentativas[0];
    expect(t.xml_enviado).toBe(xmlDoCorpo(enviado.corpo));
    expect(t).toMatchObject({ http_status: 201, resposta_corpo: corpoSefin });
    expect(gravado.medicao[0]).toMatchObject({ nfse_chave: "3549805".padEnd(50, "1"), numero_nf: "190" });
    semSegredos(t);
  });

  it("falha de conexão: grava XML e o erro, sem status nem corpo", async () => {
    const gravado = supabaseFalso();
    sefinFalsa({ erro: "connect ECONNREFUSED" });

    const r = await chamar();

    expect(r.status).toBe(500);
    expect(r.corpo).toMatchObject({ erro: "connect ECONNREFUSED", tentativa: "tent-1" });
    const t = gravado.tentativas[0];
    expect(String(t.xml_enviado)).toContain("<Signature ");
    expect(t).toMatchObject({ erro: "connect ECONNREFUSED" });
    expect(t.http_status).toBeUndefined();
    semSegredos(t);
  });

  it("resposta de sucesso corrompida: uma tentativa só (com o corpo bruto), sem duplicar no erro", async () => {
    const corpoSefin = JSON.stringify({ chaveAcesso: "1".repeat(50), nfseXmlGZipB64: "não-é-gzip" });
    const gravado = supabaseFalso();
    sefinFalsa({ status: 201, corpo: corpoSefin });
    const r = await chamar();
    expect(r.status).toBe(500);
    expect(gravado.tentativas).toHaveLength(1);
    expect(gravado.tentativas[0]).toMatchObject({ http_status: 201, resposta_corpo: corpoSefin });
  });

  it("cada envio vira uma tentativa nova (não sobrescreve)", async () => {
    const gravado = supabaseFalso();
    sefinFalsa({ status: 400, corpo: '{"erros":[{"Codigo":"E0084","Descricao":"x"}]}' });
    await chamar();
    await chamar();
    expect(gravado.tentativas).toHaveLength(2);
  });
});
