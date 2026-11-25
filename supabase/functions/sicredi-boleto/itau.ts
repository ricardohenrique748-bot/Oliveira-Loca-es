/**
 * Cliente da API de Cobrança Itaú (Cash Management v2 + BoleCode / boleto com PIX).
 * Portal: https://devportal.itau.com.br (APIs "Cobrança - Boletos" e "Pix Recebimentos - Boletos Pix").
 *
 * Variáveis de ambiente (secrets da função):
 *   ITAU_AMBIENTE        sandbox (padrão) | producao
 *   ITAU_CLIENT_ID       client_id da aplicação no portal Itaú (vai também no header x-itau-apikey)
 *   ITAU_CLIENT_SECRET   client_secret
 *                        Com mais de uma conta: ITAU_CLIENT_ID_<agencia+conta> / ITAU_CLIENT_SECRET_<agencia+conta> (12 dígitos).
 *   ITAU_CERT, ITAU_KEY  certificado e chave do mTLS (PEM ou PEM em base64) — obrigatórios em produção.
 *   ITAU_URL_TOKEN, ITAU_URL_BOLETOS, ITAU_URL_BOLECODE, ITAU_URL_CONSULTA
 *                        opcionais: trocam as URLs padrão (o Itaú está migrando os gateways; confira no portal).
 *
 * Diferenças para o Sicredi:
 *   • o nosso número é gerado por nós (8 dígitos, sequencial por conta — ver boleto_proximo_nosso_numero);
 *   • a API não devolve PDF: o app desenha o boleto com os dados gravados;
 *   • valores vão como texto só com dígitos (17 posições, centavos) e percentuais com 12 (7 inteiros + 5 decimais).
 */
import { type Ambiente, type BoletoCriado, type DadosBoleto, ErroBanco, lerJson, mensagemDe, paraIso, type SituacaoBoleto } from "./tipos.ts";

export interface BeneficiarioItau {
  agencia: string; // 4 dígitos
  conta: string; // 8 dígitos: conta (7) + DAC (1)
  carteira: string; // 3 dígitos (ex.: 109)
  pixChave: string | null; // com chave: boleto + QR Code PIX (BoleCode)
}

export class ErroItau extends ErroBanco {}

export const ambiente = (): Ambiente => (Deno.env.get("ITAU_AMBIENTE") === "producao" ? "producao" : "sandbox");

const URLS = {
  producao: {
    token: "https://sts.itau.com.br/api/oauth/token",
    boletos: "https://api.itau.com.br/cash_management/v2",
    bolecode: "https://secure.api.itau/pix_recebimentos_conciliacoes/v2",
    consulta: "https://secure.api.cloud.itau.com.br/boletoscash/v2",
  },
  sandbox: {
    token: "https://devportal.itau.com.br/api/jwt",
    boletos: "https://devportal.itau.com.br/sandboxapi/cash_management_ext_v2/v2",
    bolecode: "https://devportal.itau.com.br/sandboxapi/pix_recebimentos_conciliacoes_ext_v2/v2",
    consulta: "https://devportal.itau.com.br/sandboxapi/boletoscash_ext_v2/v2",
  },
};
const url = (k: keyof typeof URLS.producao) => Deno.env.get(`ITAU_URL_${k.toUpperCase()}`) || URLS[ambiente()][k];

export const idBeneficiario = (b: BeneficiarioItau) => `${b.agencia}${b.conta}`;
/** id do boleto nas rotas de baixa/alteração: beneficiário (12) + carteira (3) + nosso número (8) */
export const idBoleto = (b: BeneficiarioItau, nossoNumero: string) => `${idBeneficiario(b)}${b.carteira}${nossoNumero.padStart(8, "0")}`;

function credenciais(b: BeneficiarioItau) {
  const id = Deno.env.get(`ITAU_CLIENT_ID_${idBeneficiario(b)}`) ?? Deno.env.get("ITAU_CLIENT_ID");
  const secret = Deno.env.get(`ITAU_CLIENT_SECRET_${idBeneficiario(b)}`) ?? Deno.env.get("ITAU_CLIENT_SECRET");
  if (!id || !secret) throw new ErroItau("Integração Itaú não configurada: falta ITAU_CLIENT_ID / ITAU_CLIENT_SECRET.", 500);
  return { id, secret };
}

// ---------- mTLS ----------
const pem = (v: string | undefined) => (!v ? null : v.includes("-----BEGIN") ? v.replace(/\\n/g, "\n") : atob(v.replace(/\s/g, "")));
let cliente: Deno.HttpClient | undefined | null = null;
function httpClient(): Deno.HttpClient | undefined {
  if (cliente !== null) return cliente;
  const cert = pem(Deno.env.get("ITAU_CERT"));
  const key = pem(Deno.env.get("ITAU_KEY"));
  if ((!cert || !key) && ambiente() === "producao") throw new ErroItau("Integração Itaú não configurada: falta o certificado (ITAU_CERT / ITAU_KEY).", 500);
  if (cert && key && typeof Deno.createHttpClient !== "function") {
    throw new ErroItau("Este ambiente de Edge Functions não suporta certificado de cliente (mTLS), exigido pelo Itaú.", 500);
  }
  cliente = cert && key ? Deno.createHttpClient({ cert, key }) : undefined;
  return cliente;
}
/** 30 s por chamada: sem resposta, avisa em vez de ficar pendurado (o boleto pode ter sido criado: conferir antes de repetir) */
const buscar = (u: string, init: RequestInit) =>
  fetch(u, { ...init, client: httpClient(), signal: AbortSignal.timeout(30_000) } as RequestInit).catch((e) => {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new ErroItau("O Itaú não respondeu em 30 segundos. Consulte os boletos da fatura antes de tentar emitir de novo.", 504);
    }
    throw e;
  });

// ---------- token (cache por client_id enquanto a instância vive) ----------
const tokens = new Map<string, { access: string; expira: number }>();

async function token(b: BeneficiarioItau): Promise<string> {
  const c = credenciais(b);
  const t = tokens.get(c.id);
  if (t && t.expira > Date.now() + 30_000) return t.access;
  const r = await buscar(url("token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-itau-correlationID": crypto.randomUUID(), "x-itau-flowID": crypto.randomUUID() },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.id, client_secret: c.secret }),
  });
  const d = await lerJson(r);
  if (!r.ok || !d.access_token) throw new ErroItau(`Itaú recusou a autenticação: ${mensagemDe(d) ?? r.status}`, r.status, d);
  tokens.set(c.id, { access: d.access_token, expira: Date.now() + Number(d.expires_in ?? 300) * 1000 });
  return d.access_token;
}

async function chamar(b: BeneficiarioItau, u: string, init: RequestInit = {}) {
  const r = await buscar(u, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token(b)}`,
      "x-itau-apikey": credenciais(b).id,
      "x-itau-correlationID": crypto.randomUUID(),
      "x-itau-flowID": crypto.randomUUID(),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const d = await lerJson(r);
  if (!r.ok) throw new ErroItau(`Itaú: ${mensagemDe(d) ?? `erro ${r.status}`}`, r.status, d);
  return d;
}

// ---------- formatos ----------
const valor17 = (v: number) => String(Math.round(v * 100)).padStart(17, "0");
const pct12 = (p: number) => String(Math.round(p * 100_000)).padStart(12, "0");

/** procura a chave em qualquer nível da resposta (o Itaú aninha em data / dado_boleto / dados_individuais_boleto) */
function achar(o: unknown, ...chaves: string[]): unknown {
  if (!o || typeof o !== "object") return undefined;
  for (const k of chaves) {
    const v = (o as Record<string, unknown>)[k];
    if (v != null && v !== "") return v;
  }
  for (const v of Object.values(o as Record<string, unknown>)) {
    const achado = achar(v, ...chaves);
    if (achado != null) return achado;
  }
  return undefined;
}

/** "00000000000010000" (centavos, 17 dígitos) ou "100.00" */
function valorItau(v: unknown): number | null {
  if (typeof v === "number") return v > 0 ? v : null;
  if (typeof v !== "string" || !v) return null;
  const n = /^\d{15,}$/.test(v) ? Number(v) / 100 : Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------- operações ----------
export async function criarBoleto(b: BeneficiarioItau, nossoNumero: string, dados: DadosBoleto): Promise<BoletoCriado> {
  const p = dados.pagador;
  const e = dados.encargos;
  if (e?.negativacaoDias) throw new ErroItau("Negativação automática ainda não está disponível para boletos Itaú nesta integração. Use protesto ou deixe em branco.", 400);
  const nn = nossoNumero.padStart(8, "0");
  const pix = !!b.pixChave;
  // endereço do cadastro: "Rua X, 123 - complemento - bairro" → o último trecho vira o bairro
  const partes = p.endereco.split(" - ").map((s) => s.trim()).filter(Boolean);
  const bairro = partes.length > 1 ? partes[partes.length - 1] : "";
  const logradouro = (partes.length > 1 ? partes.slice(0, -1).join(" - ") : p.endereco);
  const corpo = {
    etapa_processo_boleto: "efetivacao",
    codigo_canal_operacao: "API",
    beneficiario: { id_beneficiario: idBeneficiario(b) },
    dado_boleto: {
      descricao_instrumento_cobranca: pix ? "boleto_pix" : "boleto",
      tipo_boleto: "a vista",
      codigo_carteira: b.carteira,
      valor_total_titulo: valor17(dados.valor),
      codigo_especie: "01", // duplicata mercantil
      valor_abatimento: valor17(0),
      data_emissao: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()),
      pagador: {
        pessoa: {
          nome_pessoa: p.nome.slice(0, 50),
          tipo_pessoa: p.documento.length === 11
            ? { codigo_tipo_pessoa: "F", numero_cadastro_pessoa_fisica: p.documento }
            : { codigo_tipo_pessoa: "J", numero_cadastro_nacional_pessoa_juridica: p.documento },
        },
        endereco: {
          nome_logradouro: logradouro.slice(0, 45),
          ...(bairro ? { nome_bairro: bairro.slice(0, 15) } : {}),
          nome_cidade: p.cidade.slice(0, 20),
          sigla_UF: p.uf,
          numero_CEP: p.cep,
        },
      },
      dados_individuais_boleto: [{
        numero_nosso_numero: nn,
        data_vencimento: dados.vencimento,
        valor_titulo: valor17(dados.valor),
        texto_uso_beneficiario: dados.seuNumero,
        texto_seu_numero: dados.seuNumero.slice(0, 10),
      }],
      ...(e?.multaPct ? { multa: { codigo_tipo_multa: "02", quantidade_dias_multa: 1, percentual_multa: pct12(e.multaPct) } } : {}),
      ...(e?.juros ? {
        juros: e.jurosTipo === "valor_dia"
          ? { codigo_tipo_juros: "93", quantidade_dias_juros: 1, valor_juros: valor17(e.juros) }
          : { codigo_tipo_juros: e.jurosTipo === "pct_mes" ? "90" : "91", quantidade_dias_juros: 1, percentual_juros: pct12(e.juros) },
      } : {}),
      ...(e?.protestoDias ? { protesto: { codigo_tipo_protesto: 1, quantidade_dias_protesto: e.protestoDias } } : {}),
      ...(dados.mensagens?.length ? { lista_mensagem_cobranca: dados.mensagens.slice(0, 4).map((m) => ({ mensagem: m.slice(0, 80) })) } : {}),
    },
    ...(pix ? { dados_qrcode: { chave: b.pixChave } } : {}),
  };
  const d = pix
    ? await chamar(b, `${url("bolecode")}/boletos_pix`, { method: "POST", body: JSON.stringify(corpo) })
    : await chamar(b, `${url("boletos")}/boletos`, { method: "POST", body: JSON.stringify(corpo) });
  const linha = String(achar(d, "numero_linha_digitavel", "linha_digitavel") ?? "").replace(/\D/g, "");
  if (linha.length !== 47) throw new ErroItau("Itaú registrou o boleto mas não devolveu a linha digitável. Confira no Internet Banking antes de gerar outro.", 502, d);
  const qr = achar(d, "emv", "pix_copia_e_cola", "copia_e_cola");
  const txid = achar(d, "txid");
  const barras = achar(d, "codigo_barras");
  return {
    nossoNumero: String(achar(d, "numero_nosso_numero") ?? nn),
    linhaDigitavel: linha,
    codigoBarras: typeof barras === "string" ? barras.replace(/\D/g, "") || null : null,
    qrCode: typeof qr === "string" ? qr.trim() || null : null,
    txid: typeof txid === "string" ? txid : null,
  };
}

export async function consultarBoleto(b: BeneficiarioItau, nossoNumero: string): Promise<SituacaoBoleto> {
  const q = new URLSearchParams({ id_beneficiario: idBeneficiario(b), codigo_carteira: b.carteira, nosso_numero: nossoNumero.padStart(8, "0") });
  const d = await chamar(b, `${url("consulta")}/boletos?${q}`);
  const situacao = String(achar(d, "situacao_geral_boleto", "status_boleto", "situacao") ?? "").toUpperCase();
  const pago = /PAG|LIQUID/.test(situacao);
  return {
    situacao,
    liquidado: pago,
    baixado: !pago && /BAIX/.test(situacao),
    dataPagamento: paraIso(achar(d, "data_inclusao_pagamento", "data_pagamento", "data_credito")),
    valorPago: valorItau(achar(d, "valor_pago_total_cobranca", "valor_pago", "valor_liquido_creditado")),
  };
}

export async function baixarBoleto(b: BeneficiarioItau, nossoNumero: string): Promise<void> {
  await chamar(b, `${url("boletos")}/boletos/${idBoleto(b, nossoNumero)}/baixa`, { method: "PATCH", body: "{}" });
}
