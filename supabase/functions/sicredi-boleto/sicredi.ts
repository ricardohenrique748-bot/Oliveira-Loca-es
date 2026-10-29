/**
 * Cliente da API de Cobrança Sicredi (api-parceiro).
 * Documentação: https://developer.sicredi.com.br (produto "API Cobrança").
 *
 * Variáveis de ambiente (secrets da função):
 *   SICREDI_AMBIENTE       sandbox (padrão) | producao
 *   SICREDI_API_KEY        x-api-key gerada no portal do desenvolvedor
 *   SICREDI_CODIGO_ACESSO  código de acesso gerado no Internet Banking (Cobrança → Código de acesso).
 *                          Com mais de um beneficiário, use SICREDI_CODIGO_ACESSO_<codigo_beneficiario>.
 */

export type Ambiente = "sandbox" | "producao";

export interface Beneficiario {
  cooperativa: string; // 4 dígitos (agência)
  posto: string; // 2 dígitos
  codigo: string; // código do beneficiário (5 dígitos)
}

export interface Pagador {
  documento: string; // só dígitos
  nome: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string; // só dígitos
  email?: string | null;
  telefone?: string | null;
}

/** Cobrados após o vencimento. Sem dataInicioJuros/Multa: com elas o Sicredi tira o QR Code PIX. */
export interface Encargos {
  multaPct: number | null;
  jurosMesPct: number | null;
  protestoDias: number | null; // 3–99, exclusivo com negativação
  negativacaoDias: number | null; // 46–99, exige Serasa no cadastro do beneficiário
}

export interface BoletoCriado {
  nossoNumero: string;
  linhaDigitavel: string;
  codigoBarras: string | null;
  qrCode: string | null;
  txid: string | null;
}

export interface SituacaoBoleto {
  situacao: string;
  liquidado: boolean;
  baixado: boolean;
  dataPagamento: string | null; // yyyy-mm-dd
  valorPago: number | null;
}

export class ErroSicredi extends Error {
  constructor(message: string, readonly status: number, readonly corpo?: unknown) {
    super(message);
  }
}

export const ambiente = (): Ambiente => (Deno.env.get("SICREDI_AMBIENTE") === "producao" ? "producao" : "sandbox");
const base = () => (ambiente() === "producao" ? "https://api-parceiro.sicredi.com.br" : "https://api-parceiro.sicredi.com.br/sb");

function apiKey() {
  const k = Deno.env.get("SICREDI_API_KEY");
  if (!k) throw new ErroSicredi("Integração Sicredi não configurada: falta SICREDI_API_KEY.", 500);
  return k;
}

function codigoAcesso(b: Beneficiario) {
  const k = Deno.env.get(`SICREDI_CODIGO_ACESSO_${b.codigo}`) ?? Deno.env.get("SICREDI_CODIGO_ACESSO");
  if (!k) throw new ErroSicredi(`Integração Sicredi não configurada: falta o código de acesso do beneficiário ${b.codigo}.`, 500);
  return k;
}

// ---------- token (cache por beneficiário enquanto a instância vive) ----------
const tokens = new Map<string, { access: string; expira: number }>();

async function token(b: Beneficiario): Promise<string> {
  const chave = `${b.cooperativa}:${b.codigo}`;
  const t = tokens.get(chave);
  if (t && t.expira > Date.now() + 30_000) return t.access;
  const r = await fetch(`${base()}/auth/openapi/token`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), context: "COBRANCA", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: `${b.codigo}${b.cooperativa}`,
      password: codigoAcesso(b),
      scope: "cobranca",
      grant_type: "password",
    }),
  });
  const d = await lerJson(r);
  if (!r.ok) throw new ErroSicredi(`Sicredi recusou a autenticação: ${mensagemDe(d) ?? r.status}`, r.status, d);
  tokens.set(chave, { access: d.access_token, expira: Date.now() + Number(d.expires_in ?? 300) * 1000 });
  return d.access_token;
}

async function chamar(b: Beneficiario, caminho: string, init: RequestInit & { aceitar?: string } = {}) {
  const r = await fetch(`${base()}${caminho}`, {
    ...init,
    headers: {
      "x-api-key": apiKey(),
      Authorization: `Bearer ${await token(b)}`,
      cooperativa: b.cooperativa,
      posto: b.posto,
      codigoBeneficiario: b.codigo,
      Accept: init.aceitar ?? "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const d = await lerJson(r);
    throw new ErroSicredi(`Sicredi: ${mensagemDe(d) ?? `erro ${r.status}`}`, r.status, d);
  }
  return r;
}

// ---------- operações ----------
export async function criarBoleto(b: Beneficiario, dados: {
  pagador: Pagador; seuNumero: string; vencimento: string; valor: number; mensagens?: string[]; encargos?: Encargos;
}): Promise<BoletoCriado> {
  const p = dados.pagador;
  const e = dados.encargos;
  // manual 4.0: telefone até 11 dígitos (DDD + número, sem +55); email até 40
  const telefone = (p.telefone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  const email = p.email && p.email.length <= 40 ? p.email : null;
  const r = await chamar(b, "/cobranca/boleto/v1/boletos", {
    method: "POST",
    body: JSON.stringify({
      tipoCobranca: "HIBRIDO", // boleto + QR Code PIX
      codigoBeneficiario: b.codigo,
      pagador: {
        tipoPessoa: p.documento.length === 11 ? "PESSOA_FISICA" : "PESSOA_JURIDICA",
        documento: p.documento,
        nome: p.nome.slice(0, 40),
        endereco: p.endereco.slice(0, 40),
        cidade: p.cidade.slice(0, 25),
        uf: p.uf,
        cep: p.cep,
        ...(email ? { email } : {}),
        ...(telefone.length >= 10 && telefone.length <= 11 ? { telefone } : {}),
      },
      especieDocumento: "DUPLICATA_MERCANTIL_INDICACAO",
      seuNumero: dados.seuNumero,
      dataVencimento: dados.vencimento,
      valor: Number(dados.valor.toFixed(2)),
      ...(e?.multaPct ? { tipoMulta: "PERCENTUAL", multa: e.multaPct } : {}),
      ...(e?.jurosMesPct ? { tipoJuros: "PERCENTUAL", tipoJurosPercentual: "MENSAL", juros: e.jurosMesPct } : {}),
      ...(e?.protestoDias ? { diasProtestoAuto: e.protestoDias } : e?.negativacaoDias ? { diasNegativacaoAuto: e.negativacaoDias } : {}),
      ...(dados.mensagens?.length ? { mensagens: dados.mensagens.slice(0, 4).map((m) => m.slice(0, 80)) } : {}),
    }),
  });
  const d = await r.json();
  return {
    nossoNumero: String(d.nossoNumero),
    linhaDigitavel: String(d.linhaDigitavel),
    codigoBarras: d.codigoBarras ?? null,
    qrCode: d.qrCode?.trim() || null, // sandbox devolve o copia-e-cola com "\n\n" no fim
    txid: d.txid ?? null,
  };
}

export async function pdfBoleto(b: Beneficiario, linhaDigitavel: string): Promise<Uint8Array> {
  const r = await chamar(b, `/cobranca/boleto/v1/boletos/pdf?linhaDigitavel=${encodeURIComponent(linhaDigitavel)}`, { aceitar: "application/pdf" });
  return new Uint8Array(await r.arrayBuffer());
}

export async function consultarBoleto(b: Beneficiario, nossoNumero: string): Promise<SituacaoBoleto> {
  const q = new URLSearchParams({ codigoBeneficiario: b.codigo, nossoNumero });
  const d = await (await chamar(b, `/cobranca/boleto/v1/boletos?${q}`)).json();
  const situacao = String(d.situacao ?? "").toUpperCase();
  const liq = d.dadosLiquidacao ?? {};
  return {
    situacao,
    liquidado: situacao.includes("LIQUIDADO"),
    baixado: situacao.includes("BAIXADO"),
    dataPagamento: paraIso(liq.data ?? d.dataPagamento ?? d.dataLiquidacao),
    valorPago: numero(liq.valor ?? d.valorLiquidado ?? d.valorPago),
  };
}

export async function baixarBoleto(b: Beneficiario, nossoNumero: string): Promise<void> {
  await chamar(b, `/cobranca/boleto/v1/boletos/${encodeURIComponent(nossoNumero)}/baixa`, { method: "PATCH", body: "{}" });
}

// ---------- utilitários ----------
async function lerJson(r: Response) {
  const t = await r.text();
  try { return t ? JSON.parse(t) : {}; } catch { return { message: t.slice(0, 300) }; }
}

function mensagemDe(d: unknown): string | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  if (typeof o.message === "string") return o.message;
  if (typeof o.error_description === "string") return o.error_description;
  if (typeof o.error === "string") return o.error;
  if (Array.isArray(o.errors)) return o.errors.map((e) => (e as Record<string, unknown>)?.message ?? JSON.stringify(e)).join("; ");
  return null;
}

/** aceita yyyy-mm-dd, yyyy-mm-ddTHH:mm e dd/mm/yyyy */
function paraIso(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

function numero(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
