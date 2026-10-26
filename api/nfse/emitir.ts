/**
 * Vercel: emite a NFS-e de uma fatura no Emissor Nacional (Sefin Nacional).
 * POST { medicaoId } com o token do usuário logado. As leituras e gravações usam o token dele (RLS do Supabase).
 * Certificado A1: secrets NFSE_CERT_PFX_BASE64 e NFSE_CERT_SENHA (só aqui, nunca no navegador).
 * Ambiente: homologação, a não ser que NFSE_AMBIENTE=producao.
 * Cada envio fica em nfse_tentativas (XML exato enviado + status/corpo bruto da resposta, ou erro de conexão),
 * para diagnóstico. Nunca registrar certificado, senha, chave privada nem token. Nada disto vai para log.
 */
import { request } from "node:https";
import { createClient } from "@supabase/supabase-js";
import { montarDPS } from "../../src/lib/nfse/dps.js";
import { assinarDPS, lerCertificado } from "../../src/lib/nfse/assinar.js";
import { corpoEnvio, lerResposta, SEFIN, xmlParaEnvio } from "../../src/lib/nfse/envio.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: { medicaoId?: string } };
type Res = { status: (n: number) => { json: (b: unknown) => void } };

// mesma regra de src/lib/supabase/env.ts: sem variável ou apontando para o projeto legado, usa o projeto atual (onde o usuário loga)
const envUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const envAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const legado = !envUrl || !envAnon || envUrl.includes("yvloohupcjaczotbhxos");
const SUPABASE_URL = legado ? "https://hbhuofkpjcnmqnbuefrz.supabase.co" : envUrl;
const SUPABASE_ANON = legado ? "sb_publishable_BwcOrx8hekJrl8-pJ1HsrA_miohLgiP" : envAnon;

/** POST com o certificado na conexão (mTLS). Usa chave e certificado já abertos (PEM): o Node não lê .pfx com criptografia antiga ("Unsupported PKCS12 PFX data") */
function postComCertificado(url: string, corpo: unknown, cert: { chavePem: string; certPem: string }): Promise<{ status: number; texto: string; json: unknown }> {
  const dados = JSON.stringify(corpo);
  return new Promise((resolve, reject) => {
    const r = request(url, { method: "POST", key: cert.chavePem, cert: cert.certPem, timeout: 50_000,
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

const dataBR = (d: string) => d.split("-").reverse().join("/");
const moedaBR = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Fatura avulsa: a descrição digitada; com vários itens, um por um ("Frete (2 × R$ 500,00); Munck placa ABC1D23 (8 × R$ 150,00)") */
function descricaoAvulsa(descricao: string | null, placa: string | null | undefined, itens: unknown): string {
  const lista = (Array.isArray(itens) ? itens : []) as { descricao: string; placa: string | null; quantidade: number; valor_unitario: number; periodo_inicio?: string; periodo_fim?: string }[];
  if (!lista.length) return `${descricao ?? "Serviço"}${placa ? ` – placa ${placa}` : ""}`;
  return lista.map((i) => `${i.descricao}${i.placa ? ` placa ${i.placa}` : ""}${i.periodo_inicio && i.periodo_fim ? ` ${dataBR(i.periodo_inicio)}${i.periodo_fim !== i.periodo_inicio ? ` a ${dataBR(i.periodo_fim)}` : ""}` : ""} (${Number(i.quantidade).toLocaleString("pt-BR")} × ${moedaBR(Number(i.valor_unitario))})`).join("; ");
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST" });
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const medicaoId = req.body?.medicaoId;
  if (!token) return res.status(401).json({ erro: "Faça login novamente" });
  if (!medicaoId) return res.status(400).json({ erro: "Informe a fatura" });

  const pfx = process.env.NFSE_CERT_PFX_BASE64, senha = process.env.NFSE_CERT_SENHA;
  if (!pfx || !senha) return res.status(500).json({ erro: "Certificado não configurado na Vercel (NFSE_CERT_PFX_BASE64 / NFSE_CERT_SENHA)" });
  const ambiente = process.env.NFSE_AMBIENTE === "producao" ? "producao" : "homologacao";

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: usuario, error: errUser } = await sb.auth.getUser(token);
  if (!usuario.user) return res.status(401).json({ erro: `Login não reconhecido (${errUser?.message ?? "sem usuário"}): saia e entre de novo no sistema` });

  const { data: m, error } = await sb.from("medicoes")
    .select(`id, empresa_id, status, valor_final, periodo_inicio, periodo_fim, nfse_chave, nfse_ambiente, descricao, itens,
      clientes(razao_social, cnpj), veiculos(placa),
      empresas(cnpj, regime_tributario, codigo_ibge, nfse_codigo_servico, nfse_aliquota_iss, nfse_texto_complementar),
      contratos(numero, clientes(razao_social, cnpj), veiculos(placa, tipo))`)
    .eq("id", medicaoId).maybeSingle();
  if (error || !m) return res.status(404).json({ erro: "Fatura não encontrada ou sem permissão" });
  if (m.status === "cancelado") return res.status(400).json({ erro: "Fatura cancelada não emite nota" });
  if (m.nfse_chave && m.nfse_ambiente === ambiente) return res.status(409).json({ erro: "Esta fatura já tem nota emitida", chave: m.nfse_chave });

  const e = m.empresas as unknown as { cnpj: string | null; regime_tributario: "mei" | "simples_nacional" | "normal" | null;
    codigo_ibge: string | null; nfse_codigo_servico: string | null; nfse_aliquota_iss: number | null; nfse_texto_complementar: string | null } | null;
  const c = m.contratos as unknown as { numero: string | null; clientes: { razao_social: string; cnpj: string | null } | null; veiculos: { placa: string; tipo: string } | null } | null;
  if (!e?.cnpj || !e.codigo_ibge || !e.regime_tributario || !e.nfse_codigo_servico || e.nfse_aliquota_iss == null)
    return res.status(400).json({ erro: "Complete os dados fiscais da empresa em Cadastros → Empresas" });
  // fatura avulsa (sem contrato): cliente na própria fatura, descrição digitada no lançamento
  const tomadorCliente = c?.clientes ?? (m.clientes as unknown as { razao_social: string; cnpj: string | null } | null);
  if (!tomadorCliente) return res.status(400).json({ erro: "Fatura sem cliente" });

  let numero: number | null = null;
  let xmlEnviado: string | null = null;
  let registrada = false; // um envio = uma tentativa, mesmo se algo falhar depois de gravar
  /** grava a tentativa (só inclusão); devolve o id, ou null se o banco recusar — o envio já aconteceu, então não falha por isso */
  const registrar = async (resultado: { http_status: number; resposta_corpo: string } | { erro: string }) => {
    registrada = true;
    const { data, error: errReg } = await sb.from("nfse_tentativas")
      .insert({ medicao_id: m.id, ambiente, numero_dps: numero, xml_enviado: xmlEnviado, ...resultado }).select("id").single();
    return errReg ? null : (data as { id: string }).id;
  };
  const comRegistro = (corpo: Record<string, unknown>, tentativa: string | null) =>
    ({ ...corpo, tentativa, ...(tentativa ? {} : { aviso: "A tentativa não pôde ser registrada no histórico" }) });

  try {
    const { data: numeroReservado, error: errNum } = await sb.rpc("fn_nfse_reservar_dps", { p_empresa: m.empresa_id });
    numero = numeroReservado;
    if (errNum || !numero) throw new Error(errNum?.message ?? "Não foi possível reservar o número da nota");

    const xml = montarDPS({
      ambiente: ambiente === "producao" ? 1 : 2, serie: 1, numero, emissao: new Date(),
      prestador: { cnpj: e.cnpj, codigoIbge: e.codigo_ibge, regime: e.regime_tributario,
        codigoServico: e.nfse_codigo_servico, aliquotaIss: Number(e.nfse_aliquota_iss) },
      tomador: { documento: tomadorCliente.cnpj, nome: tomadorCliente.razao_social },
      servico: {
        descricao: c
          ? `Locação de ${c.veiculos?.tipo ?? "veículo"} placa ${c.veiculos?.placa ?? ""} – período ${dataBR(m.periodo_inicio)} a ${dataBR(m.periodo_fim)}${c.numero ? ` – contrato ${c.numero}` : ""}`
          : `${descricaoAvulsa(m.descricao, (m.veiculos as unknown as { placa: string } | null)?.placa, m.itens)} – período ${dataBR(m.periodo_inicio)} a ${dataBR(m.periodo_fim)}`,
        inicio: m.periodo_inicio, complemento: e.nfse_texto_complementar,
      },
      valor: Number(m.valor_final),
    });
    xmlEnviado = xmlParaEnvio(assinarDPS(xml, pfx, senha));
    const r = await postComCertificado(SEFIN[ambiente], corpoEnvio(xmlEnviado), lerCertificado(pfx, senha));
    const tentativa = await registrar({ http_status: r.status, resposta_corpo: r.texto });
    const resp = lerResposta(r.status, r.json);

    await sb.from("medicoes").update(resp.ok
      ? { nfse_ambiente: ambiente, nfse_dps: numero, nfse_chave: resp.chave, nfse_erro: null, nfse_emitida_em: new Date().toISOString(),
          ...(ambiente === "producao" && resp.numero ? { numero_nf: resp.numero } : {}) }
      : { nfse_ambiente: ambiente, nfse_dps: numero, nfse_erro: resp.erro }).eq("id", m.id);

    return resp.ok
      ? res.status(200).json(comRegistro({ ok: true, ambiente, chave: resp.chave, numero: resp.numero }, tentativa))
      : res.status(422).json(comRegistro({ erro: resp.erro, ambiente }, tentativa));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // só registra se o XML chegou a ser montado e assinado (houve tentativa de envio)
    const tentativa = xmlEnviado && !registrada ? await registrar({ erro: msg }) : null;
    return res.status(500).json(tentativa ? comRegistro({ erro: msg, ambiente }, tentativa) : { erro: msg, ambiente });
  }
}
