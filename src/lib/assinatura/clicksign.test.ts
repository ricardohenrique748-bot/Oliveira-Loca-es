import { afterEach, describe, expect, it, vi } from "vitest";
import { clienteClicksign, statusDoEnvelope, telefoneClicksign } from "./clicksign";

describe("telefoneClicksign", () => {
  it("deixa só DDD + número", () => {
    expect(telefoneClicksign("(11) 99999-8888")).toBe("11999998888");
    expect(telefoneClicksign("+55 11 99999-8888")).toBe("11999998888");
    expect(telefoneClicksign("11 3333-4444")).toBe("1133334444");
  });
  it("recusa número incompleto", () => {
    expect(telefoneClicksign("99999-8888")).toBeNull();
    expect(telefoneClicksign(null)).toBeNull();
  });
});

describe("statusDoEnvelope", () => {
  it("traduz o status da Clicksign", () => {
    expect(statusDoEnvelope("running")).toBe("enviado");
    expect(statusDoEnvelope("closed")).toBe("assinado");
    expect(statusDoEnvelope("canceled")).toBe("cancelado");
    expect(statusDoEnvelope("draft")).toBeNull();
  });
});

describe("clienteClicksign.enviar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cria envelope, documento, signatário, requisitos, ativa e notifica", async () => {
    const chamadas: { metodo: string; url: string; corpo: any; headers: Record<string, string> }[] = [];
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ metodo: String(init.method), url, corpo: init.body ? JSON.parse(String(init.body)) : null, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ data: { id: `id${++n}`, type: "x" } }), { status: 201 });
    }));
    const r = await clienteClicksign("TOKEN", "sandbox").enviar({
      nomeEnvelope: "Contrato 1", arquivo: "c.pdf", pdfBase64: "QUJD",
      signatario: { nome: "Ana Souza", email: "ana@x.com", whatsapp: "(11) 99999-8888", canal: "whatsapp" },
    });
    expect(r).toEqual({ envelopeId: "id1", documentoId: "id2" });
    expect(chamadas.map((c) => `${c.metodo} ${c.url.replace("https://sandbox.clicksign.com/api/v3", "")}`)).toEqual([
      "POST /envelopes", "POST /envelopes/id1/documents", "POST /envelopes/id1/signers",
      "POST /envelopes/id1/requirements", "POST /envelopes/id1/requirements", "PATCH /envelopes/id1", "POST /envelopes/id1/notifications",
    ]);
    expect(chamadas[0].headers.Authorization).toBe("TOKEN");
    expect(chamadas[1].corpo.data.attributes.content_base64).toBe("data:application/pdf;base64,QUJD");
    expect(chamadas[2].corpo.data.attributes).toMatchObject({ phone_number: "11999998888", has_documentation: false, communicate_events: { signature_request: "whatsapp" } });
    expect(chamadas[4].corpo.data.attributes).toEqual({ action: "provide_evidence", auth: "whatsapp" });
    expect(chamadas[5].corpo.data.attributes).toEqual({ status: "running" });
  });

  it("mostra o erro da Clicksign", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ detail: "nome inválido" }] }), { status: 422 })));
    await expect(clienteClicksign("T", "sandbox").enviar({ nomeEnvelope: "x", arquivo: "c.pdf", pdfBase64: "A", signatario: { nome: "A B", email: "a@b.c", canal: "email" } }))
      .rejects.toThrow("nome inválido");
  });
});
