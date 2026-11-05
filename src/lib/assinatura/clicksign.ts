/**
 * Clicksign API v3 (envelopes). Só roda no servidor (funções da Vercel): o access token nunca vai ao navegador.
 * Fluxo: envelope → documento (PDF em base64) → signatário → requisitos (concordar + token) → ativar → notificar.
 * Docs: https://developers.clicksign.com/reference
 */

export type AmbienteClicksign = "sandbox" | "producao";

export const HOST_CLICKSIGN: Record<AmbienteClicksign, string> = {
  sandbox: "https://sandbox.clicksign.com/api/v3",
  producao: "https://app.clicksign.com/api/v3",
};

export type Signatario = { nome: string; email: string; whatsapp?: string | null; canal: "email" | "whatsapp" };

/** "(11) 99999-8888" / "+55 11 99999-8888" → "11999998888" (a Clicksign quer 10 ou 11 dígitos) */
export function telefoneClicksign(tel: string | null | undefined): string | null {
  let d = (tel ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/** Status do envelope na Clicksign → status salvo no contrato */
export function statusDoEnvelope(s: string | null | undefined): "enviado" | "assinado" | "cancelado" | null {
  if (s === "running") return "enviado";
  if (s === "closed") return "assinado";
  if (s === "canceled") return "cancelado";
  return null;
}

type Recurso = { data: { id: string; type: string; attributes?: Record<string, unknown>; links?: Record<string, unknown> } };

export class ErroClicksign extends Error {}

export function clienteClicksign(token: string, ambiente: AmbienteClicksign) {
  const base = HOST_CLICKSIGN[ambiente];

  async function chamar(metodo: "GET" | "POST" | "PATCH", caminho: string, corpo?: unknown): Promise<Recurso> {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { Authorization: token, Accept: "application/vnd.api+json", ...(corpo ? { "Content-Type": "application/vnd.api+json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
    if (!r.ok) {
      const erros = (json as { errors?: { detail?: string; title?: string }[] } | null)?.errors;
      const msg = erros?.map((e) => e.detail ?? e.title).filter(Boolean).join("; ");
      if (r.status === 401) throw new ErroClicksign("Clicksign recusou o access token (confira CLICKSIGN_ACCESS_TOKEN e CLICKSIGN_AMBIENTE)");
      throw new ErroClicksign(`Clicksign (${r.status}): ${msg || texto.slice(0, 300) || "sem detalhes"}`);
    }
    return json as Recurso;
  }

  return {
    /** cria e envia o envelope; devolve os ids para consultar depois */
    async enviar(p: { nomeEnvelope: string; arquivo: string; pdfBase64: string; signatario: Signatario; mensagem?: string }) {
      const fone = telefoneClicksign(p.signatario.whatsapp);
      if (p.signatario.canal === "whatsapp" && !fone) throw new ErroClicksign("WhatsApp inválido: informe DDD + número (10 ou 11 dígitos)");

      const env = await chamar("POST", "/envelopes", { data: { type: "envelopes", attributes: {
        name: p.nomeEnvelope.slice(0, 255), locale: "pt-BR", auto_close: true, remind_interval: 3, block_after_refusal: true,
        ...(p.mensagem ? { default_message: p.mensagem } : {}),
      } } });
      const envId = env.data.id;

      const doc = await chamar("POST", `/envelopes/${envId}/documents`, { data: { type: "documents", attributes: {
        filename: p.arquivo, content_base64: `data:application/pdf;base64,${p.pdfBase64}`,
      } } });

      const sig = await chamar("POST", `/envelopes/${envId}/signers`, { data: { type: "signers", attributes: {
        name: p.signatario.nome, email: p.signatario.email, ...(fone ? { phone_number: fone } : {}),
        has_documentation: false,
        communicate_events: { signature_request: p.signatario.canal, signature_reminder: "email", document_signed: "email" },
      } } });

      const rel = { document: { data: { type: "documents", id: doc.data.id } }, signer: { data: { type: "signers", id: sig.data.id } } };
      await chamar("POST", `/envelopes/${envId}/requirements`, { data: { type: "requirements", attributes: { action: "agree", role: "sign" }, relationships: rel } });
      // token de confirmação pelo mesmo canal do convite
      await chamar("POST", `/envelopes/${envId}/requirements`, { data: { type: "requirements", attributes: { action: "provide_evidence", auth: p.signatario.canal }, relationships: rel } });

      await chamar("PATCH", `/envelopes/${envId}`, { data: { id: envId, type: "envelopes", attributes: { status: "running" } } });
      // ativar não avisa ninguém: a notificação é outra chamada
      await chamar("POST", `/envelopes/${envId}/notifications`, { data: { type: "notifications", attributes: p.mensagem ? { message: p.mensagem } : {} } });

      return { envelopeId: envId, documentoId: doc.data.id };
    },

    async statusEnvelope(envelopeId: string): Promise<string | null> {
      const r = await chamar("GET", `/envelopes/${envelopeId}`);
      return (r.data.attributes?.status as string | undefined) ?? null;
    },

    /** link temporário (5 min) do PDF assinado; null enquanto não existe */
    async urlAssinado(envelopeId: string, documentoId: string): Promise<string | null> {
      const r = await chamar("GET", `/envelopes/${envelopeId}/documents/${documentoId}`);
      const files = (r.data.links as { files?: { signed?: string } } | undefined)?.files;
      return files?.signed ?? null;
    },

    /** reenviar o convite ao signatário (envelope em andamento) */
    async notificar(envelopeId: string) {
      await chamar("POST", `/envelopes/${envelopeId}/notifications`, { data: { type: "notifications", attributes: {} } });
    },
  };
}
