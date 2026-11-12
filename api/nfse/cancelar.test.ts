/**
 * Cancelamento com a Sefin e o Supabase simulados: nenhuma nota é cancelada e nada sai da máquina.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { gunzipSync } from "node:zlib";
import forge from "node-forge";

const https = vi.hoisted(() => ({ request: vi.fn() }));
const supa = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("node:https", () => https);
vi.mock("@supabase/supabase-js", () => supa);

import handler from "./cancelar";

const CHAVE = "35498052244889430000181000000000001526111234567890";
const SENHA = "senha-teste";

beforeAll(() => {
  const k = forge.pki.rsa.generateKeyPair(1024);
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey; c.serialNumber = "01";
  c.validity.notBefore = new Date(); c.validity.notAfter = new Date(Date.now() + 864e5);
  c.setSubject([{ name: "commonName", value: "T" }]); c.setIssuer([{ name: "commonName", value: "T" }]);
  c.sign(k.privateKey, forge.md.sha256.create());
  process.env.NFSE_CERT_PFX_BASE64 = forge.util.encode64(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(k.privateKey, [c], SENHA, { algorithm: "3des" })).getBytes());
  process.env.NFSE_CERT_SENHA = SENHA;
});

type Gravado = { rpc: { nome: string; args: Record<string, unknown> }[]; tentativas: Record<string, unknown>[] };
function supabaseFalso(prep: { data?: unknown; error?: { message: string } | null } = {}) {
  const g: Gravado = { rpc: [], tentativas: [] };
  supa.createClient.mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      g.rpc.push({ nome, args });
      if (nome === "fn_nfse_preparar_cancelamento") return { data: prep.data ?? [{ chave: CHAVE, ambiente: "homologacao", cnpj: "44889430000181", numero_nf: "15" }], error: prep.error ?? null };
      return { data: null, error: null };
    },
    from: () => ({ insert: async (v: Record<string, unknown>) => { g.tentativas.push(v); return { error: null }; } }),
  });
  return g;
}

/** Sefin falsa: cada chamada devolve a próxima resposta da lista; guarda URL e XML enviados */
function sefin(respostas: { status: number; corpo: unknown }[]) {
  const enviados: { url: string; xml: string }[] = [];
  https.request.mockImplementation((url: string, _o: unknown, cb: (r: EventEmitter & { statusCode: number; setEncoding: () => void }) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: (d: string) => void; destroy: () => void };
    req.destroy = () => {};
    req.end = (dados: string) => {
      const b64 = (JSON.parse(dados) as { pedidoRegistroEventoXmlGZipB64: string }).pedidoRegistroEventoXmlGZipB64;
      enviados.push({ url, xml: gunzipSync(Buffer.from(b64, "base64")).toString("utf8") });
      const resp = respostas[Math.min(enviados.length - 1, respostas.length - 1)];
      const res = Object.assign(new EventEmitter(), { statusCode: resp.status, setEncoding: () => {} });
      cb(res);
      res.emit("data", JSON.stringify(resp.corpo));
      res.emit("end");
    };
    return req;
  });
  return enviados;
}

async function chamar(body: Record<string, unknown>) {
  let status = 0, json: Record<string, unknown> = {};
  await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body } as never,
    { status: (n: number) => ({ json: (b: unknown) => { status = n; json = b as Record<string, unknown>; } }) });
  return { status, json };
}

const PEDIDO = { medicaoId: "fat-1", codigo: 1, motivo: "Valor da nota emitido errado" };

describe("cancelar NFS-e", () => {
  beforeEach(() => { https.request.mockReset(); });

  it("aceito: envia o pedido assinado ao ambiente da nota, registra a tentativa e a fatura", async () => {
    const g = supabaseFalso();
    const env = sefin([{ status: 201, corpo: { tipoAmbiente: 2, eventoXmlGZipB64: null } }]);
    const r = await chamar(PEDIDO);
    expect(r).toEqual({ status: 200, json: { ok: true, ambiente: "homologacao", chave: CHAVE, numero: "15", jaCancelada: false } });
    expect(env).toHaveLength(1);
    expect(env[0].url).toBe(`https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse/${CHAVE}/eventos`);
    expect(env[0].xml).toContain(`<infPedReg Id="PRE${CHAVE}101101">`);
    expect(env[0].xml).toContain("<Signature");
    expect(g.tentativas).toHaveLength(1);
    expect(g.tentativas[0]).toMatchObject({ medicao_id: "fat-1", ambiente: "homologacao", tipo: "cancelamento", http_status: 201 });
    expect(g.rpc.at(-1)).toEqual({ nome: "fn_nfse_registrar_cancelamento", args: { p_medicao: "fat-1", p_chave: CHAVE, p_motivo: "1 – Valor da nota emitido errado" } });
    // nada de segredo no histórico
    expect(JSON.stringify(g.tentativas)).not.toContain(SENHA);
  });

  it("Sefin pede o nPedRegEvento: repete no leiaute com sequencial (Id de 62)", async () => {
    const g = supabaseFalso();
    const env = sefin([
      { status: 400, corpo: { erro: [{ codigo: "E1235", descricao: "Falha de schema: era esperado nPedRegEvento" }] } },
      { status: 201, corpo: { tipoAmbiente: 2 } },
    ]);
    const r = await chamar(PEDIDO);
    expect(r.status).toBe(200);
    expect(env).toHaveLength(2);
    expect(env[1].xml).toContain(`Id="PRE${CHAVE}101101001"`);
    expect(env[1].xml).toContain("<nPedRegEvento>001</nPedRegEvento>");
    expect(g.tentativas).toHaveLength(2);
  });

  it("recusa da Receita (ex.: prazo): não mexe na fatura e mostra o erro", async () => {
    const g = supabaseFalso();
    sefin([{ status: 400, corpo: { erro: [{ codigo: "E0835", descricao: "Prazo para cancelamento expirado" }] } }]);
    const r = await chamar(PEDIDO);
    expect(r).toEqual({ status: 422, json: { erro: "E0835 – Prazo para cancelamento expirado", ambiente: "homologacao" } });
    expect(g.rpc.map((x) => x.nome)).not.toContain("fn_nfse_registrar_cancelamento");
  });

  it("E0840 (já cancelada na Receita): só registra na fatura", async () => {
    const g = supabaseFalso();
    sefin([{ status: 400, corpo: { erro: { codigo: "E0840", descricao: "Já existe evento vinculado" } } }]);
    const r = await chamar(PEDIDO);
    expect(r.json).toMatchObject({ ok: true, jaCancelada: true });
    expect(g.rpc.map((x) => x.nome)).toContain("fn_nfse_registrar_cancelamento");
  });

  it("sem permissão ou justificativa curta: nada é enviado", async () => {
    supabaseFalso({ error: { message: "Sem permissão para esta operação" } });
    sefin([{ status: 201, corpo: {} }]);
    expect((await chamar(PEDIDO)).status).toBe(403);
    supabaseFalso();
    expect((await chamar({ ...PEDIDO, motivo: "curto" })).status).toBe(400);
    expect(https.request).not.toHaveBeenCalled();
  });

  it("produção: a nota de produção vai para a Sefin de produção com tpAmb 1", async () => {
    supabaseFalso({ data: [{ chave: CHAVE, ambiente: "producao", cnpj: "44889430000181", numero_nf: "15" }] });
    const env = sefin([{ status: 201, corpo: {} }]);
    await chamar(PEDIDO);
    expect(env[0].url).toBe(`https://sefin.nfse.gov.br/SefinNacional/nfse/${CHAVE}/eventos`);
    expect(env[0].xml).toContain("<tpAmb>1</tpAmb>");
  });
});
