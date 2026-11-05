/**
 * Vercel: assinatura eletrônica do contrato pela Clicksign.
 * POST com o token do usuário logado; leituras e gravações usam o token dele (RLS do Supabase).
 *   { acao: "enviar", contratoId, pdfBase64, signatario: { nome, email, whatsapp?, canal } }
 *   { acao: "status", contratoId }   → consulta a Clicksign; assinado: guarda o PDF assinado no storage
 *   { acao: "reenviar", contratoId } → manda o convite de novo ao cliente
 * Secrets: CLICKSIGN_ACCESS_TOKEN e CLICKSIGN_AMBIENTE (sandbox, a não ser que seja "producao").
 * O access token nunca vai para o navegador nem para log.
 */
import { createClient } from "@supabase/supabase-js";
import { clienteClicksign, ErroClicksign, statusDoEnvelope, type Signatario } from "../src/lib/assinatura/clicksign.js";

type Corpo = { acao?: string; contratoId?: string; pdfBase64?: string; signatario?: Partial<Signatario> };
type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: Corpo };
type Res = { status: (n: number) => { json: (b: unknown) => void } };

// mesma regra de src/lib/supabase/env.ts (ver api/nfse/emitir.ts)
const envUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const envAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const legado = !envUrl || !envAnon || envUrl.includes("yvloohupcjaczotbhxos");
const SUPABASE_URL = legado ? "https://hbhuofkpjcnmqnbuefrz.supabase.co" : envUrl;
const SUPABASE_ANON = legado ? "sb_publishable_BwcOrx8hekJrl8-pJ1HsrA_miohLgiP" : envAnon;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST" });
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const { acao, contratoId } = req.body ?? {};
  if (!token) return res.status(401).json({ erro: "Faça login novamente" });
  if (!contratoId) return res.status(400).json({ erro: "Informe o contrato" });

  const tokenClicksign = process.env.CLICKSIGN_ACCESS_TOKEN;
  if (!tokenClicksign) return res.status(500).json({ erro: "Clicksign não configurada na Vercel (CLICKSIGN_ACCESS_TOKEN)" });
  const ambiente = process.env.CLICKSIGN_AMBIENTE === "producao" ? "producao" : "sandbox";
  const cs = clienteClicksign(tokenClicksign, ambiente);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: usuario } = await sb.auth.getUser(token);
  if (!usuario.user) return res.status(401).json({ erro: "Login não reconhecido: saia e entre de novo no sistema" });

  const { data: c, error } = await sb.from("contratos")
    .select("id, numero, assinatura_envelope_id, assinatura_documento_id, assinatura_status, assinatura_arquivo, clientes(razao_social, nome_fantasia), veiculos(placa)")
    .eq("id", contratoId).maybeSingle();
  if (error || !c) return res.status(404).json({ erro: "Contrato não encontrado ou sem permissão" });

  try {
    if (acao === "enviar") {
      const s = req.body?.signatario ?? {};
      const nome = String(s.nome ?? "").trim().replace(/\s+/g, " ");
      const email = String(s.email ?? "").trim();
      const canal = s.canal === "whatsapp" ? "whatsapp" : "email";
      const pdf = String(req.body?.pdfBase64 ?? "");
      if (nome.split(" ").length < 2) return res.status(400).json({ erro: "Informe nome e sobrenome de quem vai assinar" });
      if (!EMAIL.test(email)) return res.status(400).json({ erro: "Informe um e-mail válido de quem vai assinar" });
      if (!pdf) return res.status(400).json({ erro: "PDF do contrato não veio" });
      if (c.assinatura_status === "enviado") return res.status(409).json({ erro: "Este contrato já está aguardando assinatura: use \"Reenviar\" ou \"Atualizar\"" });
      if (c.assinatura_status === "assinado") return res.status(409).json({ erro: "Este contrato já foi assinado" });

      const cliente = c.clientes as unknown as { razao_social: string; nome_fantasia: string | null } | null;
      const placa = (c.veiculos as unknown as { placa: string } | null)?.placa ?? "";
      const titulo = `Contrato ${c.numero ?? ""} ${placa} ${cliente?.nome_fantasia ?? cliente?.razao_social ?? ""}`.replace(/\s+/g, " ").trim();
      const r = await cs.enviar({
        nomeEnvelope: titulo, arquivo: `${titulo.replace(/[^\w-]+/g, "_")}.pdf`, pdfBase64: pdf,
        signatario: { nome, email, whatsapp: s.whatsapp ?? null, canal },
      });
      const { error: errUp } = await sb.from("contratos").update({
        assinatura_envelope_id: r.envelopeId, assinatura_documento_id: r.documentoId, assinatura_status: "enviado",
        assinatura_signatario: `${nome} <${email}>`, assinatura_enviada_em: new Date().toISOString(), assinatura_concluida_em: null, assinatura_arquivo: null,
      }).eq("id", c.id);
      if (errUp) return res.status(500).json({ erro: `Enviado à Clicksign, mas não gravou no contrato: ${errUp.message}`, envelope: r.envelopeId });
      return res.status(200).json({ ok: true, ambiente, status: "enviado" });
    }

    if (!c.assinatura_envelope_id || !c.assinatura_documento_id) return res.status(400).json({ erro: "Este contrato ainda não foi enviado para assinatura" });

    if (acao === "reenviar") {
      await cs.notificar(c.assinatura_envelope_id);
      return res.status(200).json({ ok: true, status: c.assinatura_status });
    }

    if (acao === "status") {
      const status = statusDoEnvelope(await cs.statusEnvelope(c.assinatura_envelope_id)) ?? c.assinatura_status;
      let arquivo = c.assinatura_arquivo;
      if (status === "assinado" && !arquivo) {
        const url = await cs.urlAssinado(c.assinatura_envelope_id, c.assinatura_documento_id);
        if (url) {
          const pdf = await fetch(url);
          if (!pdf.ok) throw new ErroClicksign(`Não foi possível baixar o PDF assinado (HTTP ${pdf.status})`);
          const d = new Date();
          const caminho = `contratos-assinados/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID().slice(0, 8)}-contrato_${c.numero ?? c.id.slice(0, 8)}_assinado.pdf`;
          const { error: errSt } = await sb.storage.from("anexos").upload(caminho, Buffer.from(await pdf.arrayBuffer()), { contentType: "application/pdf", upsert: false });
          if (errSt) throw new Error(`PDF assinado não foi guardado: ${errSt.message}`);
          arquivo = `anexos/${caminho}`;
        }
      }
      if (status !== c.assinatura_status || arquivo !== c.assinatura_arquivo) {
        await sb.from("contratos").update({
          assinatura_status: status, assinatura_arquivo: arquivo,
          ...(status === "assinado" && c.assinatura_status !== "assinado" ? { assinatura_concluida_em: new Date().toISOString() } : {}),
        }).eq("id", c.id);
      }
      return res.status(200).json({ ok: true, status, arquivo });
    }

    return res.status(400).json({ erro: "Ação inválida" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(e instanceof ErroClicksign ? 422 : 500).json({ erro: msg });
  }
}
