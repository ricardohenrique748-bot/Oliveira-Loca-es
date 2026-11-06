/**
 * Vercel: baixa a NFS-e já emitida de uma fatura — PDF (DANFSe, no ADN) ou XML (Sefin Nacional).
 * POST { medicaoId, formato: "pdf" | "xml" } com o token do usuário logado (a leitura usa o RLS do Supabase).
 * Só leitura: não emite, não altera a fatura. Certificado A1 dos secrets (mTLS), como na emissão.
 */
import { request } from "node:https";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { lerCertificado } from "../../src/lib/nfse/assinar.js";
import { SEFIN } from "../../src/lib/nfse/envio.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: { medicaoId?: string; formato?: string } };
type Res = { status: (n: number) => { json: (b: unknown) => void; send: (b: Buffer) => void }; setHeader: (k: string, v: string) => void };

// mesma regra de api/nfse/emitir.ts
const envUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const envAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const legado = !envUrl || !envAnon || envUrl.includes("yvloohupcjaczotbhxos");
const SUPABASE_URL = legado ? "https://hbhuofkpjcnmqnbuefrz.supabase.co" : envUrl;
const SUPABASE_ANON = legado ? "sb_publishable_BwcOrx8hekJrl8-pJ1HsrA_miohLgiP" : envAnon;

/** DANFSe (PDF) fica no Ambiente de Dados Nacional */
const ADN = {
  homologacao: "https://adn.producaorestrita.nfse.gov.br/danfse",
  producao: "https://adn.nfse.gov.br/danfse",
} as const;

function getComCertificado(url: string, cert: { chavePem: string; certPem: string }): Promise<{ status: number; tipo: string; corpo: Buffer }> {
  return new Promise((resolve, reject) => {
    const r = request(url, { method: "GET", key: cert.chavePem, cert: cert.certPem, timeout: 50_000 }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (c: Buffer) => partes.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, tipo: String(res.headers["content-type"] ?? ""), corpo: Buffer.concat(partes) }));
    });
    r.on("timeout", () => r.destroy(new Error("A Receita não respondeu a tempo")));
    r.on("error", reject);
    r.end();
  });
}

/** o ADN cai com frequência (503 / sem servidor): tenta de novo algumas vezes antes de desistir (cabe nos 60 s da função) */
async function getComRetentativa(url: string, cert: { chavePem: string; certPem: string }) {
  const esperas = [0, 2_000, 5_000, 8_000];
  let ultimo: { status: number; tipo: string; corpo: Buffer } | null = null;
  let erro: unknown = null;
  for (const ms of esperas) {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    try {
      ultimo = await getComCertificado(url, cert);
      erro = null;
      if (ultimo.status < 500) return ultimo;
    } catch (e) {
      erro = e;
    }
  }
  if (!ultimo) throw erro;
  return ultimo;
}

/** trecho da resposta de erro para a mensagem (sem binário) */
const trecho = (b: Buffer) => b.toString("utf8").replace(/\s+/g, " ").slice(0, 300);

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST" });
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const medicaoId = req.body?.medicaoId;
  const formato = req.body?.formato === "xml" ? "xml" : "pdf";
  if (!token) return res.status(401).json({ erro: "Faça login novamente" });
  if (!medicaoId) return res.status(400).json({ erro: "Informe a fatura" });

  const pfx = process.env.NFSE_CERT_PFX_BASE64, senha = process.env.NFSE_CERT_SENHA;
  if (!pfx || !senha) return res.status(500).json({ erro: "Certificado não configurado na Vercel (NFSE_CERT_PFX_BASE64 / NFSE_CERT_SENHA)" });

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: m, error } = await sb.from("medicoes").select("id, nfse_chave, nfse_ambiente, nfse_dps").eq("id", medicaoId).maybeSingle();
  if (error || !m) return res.status(404).json({ erro: "Fatura não encontrada ou sem permissão" });
  const chave = m.nfse_chave as string | null;
  const ambiente = (m.nfse_ambiente === "homologacao" ? "homologacao" : "producao") as keyof typeof ADN;
  if (!chave || !/^\d{50}$/.test(chave)) return res.status(404).json({ erro: "Esta fatura não tem NFS-e emitida" });

  try {
    const cert = lerCertificado(pfx, senha);
    if (formato === "pdf") {
      const r = await getComRetentativa(`${ADN[ambiente]}/${chave}`, cert);
      if (r.status >= 500)
        return res.status(503).json({ erro: `O serviço de PDF da Receita (ADN) está fora do ar agora (HTTP ${r.status}). A nota está emitida e válida: tente de novo em alguns minutos, baixe o XML, ou pegue o PDF na Consulta Pública (www.nfse.gov.br/consultapublica) com a chave ${chave}`, chave });
      if (r.status !== 200 || !r.corpo.subarray(0, 5).toString("latin1").startsWith("%PDF"))
        return res.status(502).json({ erro: `A Receita não devolveu o PDF (HTTP ${r.status}): ${trecho(r.corpo)}`, chave });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="NFSe_${chave}.pdf"`);
      return res.status(200).send(r.corpo);
    }
    // XML: consulta da NFS-e na Sefin pela chave (vem compactado em gzip + base64)
    const r = await getComCertificado(`${SEFIN[ambiente]}/${chave}`, cert);
    let xml: Buffer | null = null;
    try {
      const j = JSON.parse(r.corpo.toString("utf8")) as { nfseXmlGZipB64?: string };
      if (j.nfseXmlGZipB64) xml = gunzipSync(Buffer.from(j.nfseXmlGZipB64, "base64"));
    } catch { xml = null; }
    if (r.status !== 200 || !xml) return res.status(502).json({ erro: `A Receita não devolveu o XML (HTTP ${r.status}): ${trecho(r.corpo)}` });
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="NFSe_${chave}.xml"`);
    return res.status(200).send(xml);
  } catch (err) {
    return res.status(500).json({ erro: err instanceof Error ? err.message : String(err) });
  }
}
