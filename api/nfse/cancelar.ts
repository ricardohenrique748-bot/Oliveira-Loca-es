/**
 * Vercel: cancela a NFS-e de uma fatura no Emissor Nacional (evento e101101 na Sefin Nacional).
 * POST { medicaoId, codigo (1 | 2 | 9), motivo } com o token do usuário logado; leituras e gravações usam o token dele (RLS).
 * Só admin e financeiro (fn_nfse_preparar_cancelamento confere perfil e empresa antes de qualquer envio).
 * O ambiente é o da própria nota (homologação ou produção), não o da variável NFSE_AMBIENTE.
 * O pedido assinado e a resposta ficam em nfse_tentativas (tipo = cancelamento). Nada de certificado/senha/token em log.
 */
import { request } from "node:https";
import { createClient } from "@supabase/supabase-js";
import { assinarElemento, lerCertificado } from "../../src/lib/nfse/assinar.js";
import { corpoEvento, lerRespostaEvento, urlEventos, xmlParaEnvio } from "../../src/lib/nfse/envio.js";
import { montarPedidoCancelamento, normalizarMotivo, validarCancelamento, type CodigoMotivo } from "../../src/lib/nfse/evento.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: { medicaoId?: string; codigo?: number | string; motivo?: string } };
type Res = { status: (n: number) => { json: (b: unknown) => void } };

// mesma regra de emitir.ts (projeto atual do Supabase)
const envUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const envAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const legado = !envUrl || !envAnon || envUrl.includes("yvloohupcjaczotbhxos");
const SUPABASE_URL = legado ? "https://hbhuofkpjcnmqnbuefrz.supabase.co" : envUrl;
const SUPABASE_ANON = legado ? "sb_publishable_BwcOrx8hekJrl8-pJ1HsrA_miohLgiP" : envAnon;

function postComCertificado(url: string, corpo: unknown, cert: { chavePem: string; certPem: string }): Promise<{ status: number; texto: string; json: unknown }> {
  const dados = JSON.stringify(corpo);
  return new Promise((resolve, reject) => {
    const r = request(url, { method: "POST", key: cert.chavePem, cert: cert.certPem, timeout: 25_000,
      headers: { "Content-Type": "application/json", Accept: "application/json", "Content-Length": Buffer.byteLength(dados) } }, (res) => {
      let txt = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (txt += c));
      res.on("end", () => {
        let json: unknown = null;
        try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
        resolve({ status: res.statusCode ?? 0, texto: txt, json });
      });
    });
    r.on("timeout", () => r.destroy(new Error("A Sefin Nacional não respondeu a tempo")));
    r.on("error", reject);
    r.end(dados);
  });
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST" });
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const medicaoId = req.body?.medicaoId;
  const codigo = Number(req.body?.codigo) as CodigoMotivo;
  const motivo = normalizarMotivo(String(req.body?.motivo ?? ""));
  if (!token) return res.status(401).json({ erro: "Faça login novamente" });
  if (!medicaoId) return res.status(400).json({ erro: "Informe a fatura" });

  const pfx = process.env.NFSE_CERT_PFX_BASE64, senha = process.env.NFSE_CERT_SENHA;
  if (!pfx || !senha) return res.status(500).json({ erro: "Certificado não configurado na Vercel (NFSE_CERT_PFX_BASE64 / NFSE_CERT_SENHA)" });

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: usuario } = await sb.auth.getUser(token);
  if (!usuario.user) return res.status(401).json({ erro: "Login não reconhecido: saia e entre de novo no sistema" });

  // perfil, empresa e nota da fatura (sem a migration 0076: avisa para rodar o SQL)
  const { data: prep, error: errPrep } = await sb.rpc("fn_nfse_preparar_cancelamento", { p_medicao: medicaoId });
  if (errPrep) {
    const msg = /fn_nfse_preparar_cancelamento/.test(errPrep.message) ? "O banco ainda não tem o cancelamento de NFS-e: rode o SQL 0076 no Supabase" : errPrep.message;
    return res.status(/permiss/i.test(msg) ? 403 : 400).json({ erro: msg });
  }
  const nota = (Array.isArray(prep) ? prep[0] : prep) as { chave: string; ambiente: string | null; cnpj: string | null; numero_nf: string | null } | undefined;
  if (!nota?.chave) return res.status(400).json({ erro: "Esta fatura não tem NFS-e emitida pelo sistema" });
  const ambiente = nota.ambiente === "producao" ? "producao" : "homologacao";
  const invalido = validarCancelamento({ chave: nota.chave, codigo, motivo, cnpjAutor: nota.cnpj ?? "" });
  if (invalido) return res.status(400).json({ erro: invalido });

  const cert = lerCertificado(pfx, senha);
  /** um envio = uma linha no histórico; se o banco recusar o registro, o cancelamento não falha por isso */
  const registrar = async (xml: string, resultado: { http_status: number; resposta_corpo: string } | { erro: string }) => {
    const { error } = await sb.from("nfse_tentativas").insert({ medicao_id: medicaoId, ambiente, tipo: "cancelamento", numero_dps: null, xml_enviado: xml, ...resultado });
    return !error;
  };
  const enviar = async (comSequencial: boolean) => {
    const xml = xmlParaEnvio(assinarElemento(
      montarPedidoCancelamento({ ambiente: ambiente === "producao" ? 1 : 2, cnpjAutor: nota.cnpj ?? "", chave: nota.chave, codigo, motivo, quando: new Date(), comSequencial }),
      "infPedReg", pfx, senha));
    try {
      const r = await postComCertificado(urlEventos(ambiente, nota.chave), corpoEvento(xml), cert);
      await registrar(xml, { http_status: r.status, resposta_corpo: r.texto });
      return { ...lerRespostaEvento(r.status, r.json), texto: r.texto };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await registrar(xml, { erro: msg });
      throw e;
    }
  };

  try {
    let r = await enviar(false);
    // leiaute revisado do 1.01 exige o nPedRegEvento: a rejeição de schema não registra nada, então repete no outro formato
    if (!r.ok && /nPedRegEvento/i.test(`${r.erro} ${r.texto}`)) r = await enviar(true);
    // E0840 = já existe evento de cancelamento para esta nota: ela já está cancelada na Receita
    const jaCancelada = !r.ok && r.codigos.includes("E0840");
    if (!r.ok && !jaCancelada) return res.status(422).json({ erro: r.erro, ambiente });

    const texto = `${codigo} – ${motivo}`;
    const { error: errReg } = await sb.rpc("fn_nfse_registrar_cancelamento", { p_medicao: medicaoId, p_chave: nota.chave, p_motivo: texto });
    if (errReg) return res.status(500).json({ erro: `A Receita cancelou a nota, mas o sistema não conseguiu registrar: ${errReg.message}. Avise o suporte.`, ambiente, cancelada: true });
    return res.status(200).json({ ok: true, ambiente, chave: nota.chave, numero: nota.numero_nf, jaCancelada });
  } catch (err) {
    return res.status(500).json({ erro: err instanceof Error ? err.message : String(err), ambiente });
  }
}
