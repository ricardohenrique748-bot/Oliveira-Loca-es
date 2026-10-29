/**
 * Boletos Sicredi a partir das medições faturadas.
 * POST { acao: "emitir", medicao_id, conta_bancaria_id?, vencimento?, encargos? }
 *      encargos: { multa_pct, juros_mes_pct, apos_vencimento: "protesto" | "negativacao" | null, dias_apos_vencimento }
 * POST { acao: "pdf", boleto_id }                → { pdf_base64 }
 * POST { acao: "atualizar", boleto_ids? }        → consulta os boletos em aberto; pagos viram recebimento
 * POST { acao: "baixar", boleto_id }             → cancela (baixa) o boleto no banco
 *
 * Permissões: lê com o JWT do usuário (RLS decide o que ele enxerga) e grava com service_role.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { ambiente, baixarBoleto, type Beneficiario, consultarBoleto, criarBoleto, type Encargos, ErroSicredi, type Pagador, pdfBoleto } from "./sicredi.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ESCRITA = ["admin", "financeiro", "faturamento"];

class ErroUso extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const digitos = (s: unknown) => (typeof s === "string" ? s.replace(/\D/g, "") : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const { data: { user } } = await usuario.auth.getUser(auth.replace(/^Bearer /i, ""));
    if (!user) throw new ErroUso("Sessão expirada. Entre novamente.", 401);
    const { data: perfil } = await usuario.from("usuarios_perfil").select("perfil").eq("user_id", user.id).eq("ativo", true).maybeSingle();
    if (!perfil || !ESCRITA.includes(perfil.perfil)) throw new ErroUso("Seu perfil não pode emitir ou alterar boletos.", 403);

    const corpo = await req.json().catch(() => ({}));
    const ctx = { usuario, admin, userId: user.id };
    switch (corpo.acao) {
      case "emitir": return json(await emitir(ctx, corpo));
      case "pdf": return json(await pdf(ctx, corpo.boleto_id));
      case "atualizar": return json(await atualizar(ctx, corpo.boleto_ids));
      case "baixar": return json(await baixar(ctx, corpo.boleto_id));
      default: throw new ErroUso("Ação inválida");
    }
  } catch (e) {
    if (e instanceof ErroUso) return json({ erro: e.message }, e.status);
    if (e instanceof ErroSicredi) {
      console.error("[sicredi]", e.status, JSON.stringify(e.corpo));
      return json({ erro: e.message }, 502);
    }
    console.error("[sicredi-boleto]", e);
    return json({ erro: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});

type Ctx = { usuario: SupabaseClient; admin: SupabaseClient; userId: string };

// ---------- emitir ----------
type EncargosCorpo = { multa_pct?: number | null; juros_mes_pct?: number | null; apos_vencimento?: string | null; dias_apos_vencimento?: number | null };

async function emitir({ usuario, admin, userId }: Ctx, corpo: { medicao_id?: string; conta_bancaria_id?: string; vencimento?: string; encargos?: EncargosCorpo }) {
  const { data: m } = await usuario.from("medicoes_v")
    .select("id, empresa_id, cliente_id, status, saldo, data_vencimento, numero_nf, placa, descricao, periodo_inicio, periodo_fim")
    .eq("id", corpo.medicao_id ?? "").maybeSingle();
  if (!m) throw new ErroUso("Medição não encontrada.", 404);
  if (!["faturado", "recebido_parcial"].includes(m.status)) throw new ErroUso("Só é possível gerar boleto de medição faturada e em aberto.");
  const valor = Number(m.saldo);
  if (!(valor > 0)) throw new ErroUso("Medição sem saldo em aberto.");

  const vencimento = corpo.vencimento ?? m.data_vencimento;
  if (!vencimento || !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) throw new ErroUso("Informe o vencimento do boleto.");
  if (vencimento < hojeSP()) throw new ErroUso("O vencimento já passou. Informe uma nova data de vencimento.");

  const { data: aberto } = await admin.from("boletos").select("id").eq("medicao_id", m.id).eq("status", "emitido").maybeSingle();
  if (aberto) throw new ErroUso("Esta medição já tem um boleto em aberto. Cancele-o antes de gerar outro.");

  const conta = await contaCobranca(usuario, m.empresa_id, corpo.conta_bancaria_id);
  const pagador = await pagadorDoCliente(usuario, admin, m.cliente_id);
  const encargos = validarEncargos(corpo.encargos);

  const seuNumero = (digitos(m.numero_nf) || m.id.replace(/-/g, "").slice(0, 10)).slice(-10);
  const b = await criarBoleto(conta.beneficiario, {
    pagador, seuNumero, vencimento, valor,
    encargos,
    mensagens: [`${m.placa ? `Locação ${m.placa}` : m.descricao ?? "Serviço"} · ${br(m.periodo_inicio)} a ${br(m.periodo_fim)}`, m.numero_nf ? `NF ${m.numero_nf}` : ""].filter(Boolean),
  });

  const { data: boleto, error } = await admin.from("boletos").insert({
    medicao_id: m.id, empresa_id: m.empresa_id, conta_bancaria_id: conta.id, ambiente: ambiente(), seu_numero: seuNumero,
    nosso_numero: b.nossoNumero, linha_digitavel: b.linhaDigitavel, codigo_barras: b.codigoBarras, pix_copia_cola: b.qrCode, txid: b.txid,
    valor, data_vencimento: vencimento, created_by: userId,
    multa_pct: encargos.multaPct, juros_mes_pct: encargos.jurosMesPct, protesto_dias: encargos.protestoDias, negativacao_dias: encargos.negativacaoDias,
  }).select().single();
  if (error) {
    // o boleto já existe no banco: não deixar órfão
    await baixarBoleto(conta.beneficiario, b.nossoNumero).catch(() => {});
    throw error;
  }
  return boleto;
}

/** Mesmas regras do cadastro da conta (limites do Manual API Cobrança 4.0). */
function validarEncargos(e: EncargosCorpo = {}): Encargos {
  const pct = (v: unknown, rotulo: string) => {
    if (v == null || v === "" || Number(v) === 0) return null;
    const n = Number(v);
    if (!(n > 0 && n < 100)) throw new ErroUso(`${rotulo}: informe um percentual entre 0 e 100.`);
    return Math.round(n * 100) / 100;
  };
  const r: Encargos = { multaPct: pct(e.multa_pct, "Multa"), jurosMesPct: pct(e.juros_mes_pct, "Juros"), protestoDias: null, negativacaoDias: null };
  if (e.apos_vencimento === "protesto" || e.apos_vencimento === "negativacao") {
    const [min, max] = e.apos_vencimento === "protesto" ? [3, 99] : [46, 99];
    const d = Number(e.dias_apos_vencimento);
    if (!Number.isInteger(d) || d < min || d > max) {
      throw new ErroUso(`${e.apos_vencimento === "protesto" ? "Protesto" : "Negativação"}: informe de ${min} a ${max} dias após o vencimento.`);
    }
    if (e.apos_vencimento === "protesto") r.protestoDias = d; else r.negativacaoDias = d;
  }
  return r;
}

async function contaCobranca(usuario: SupabaseClient, empresaId: string, contaId?: string) {
  let q = usuario.from("contas_bancarias").select("id, banco, agencia, posto, codigo_beneficiario, apelido")
    .eq("empresa_id", empresaId).eq("banco", "Sicredi").eq("ativo", true).not("codigo_beneficiario", "is", null);
  if (contaId) q = q.eq("id", contaId);
  const { data } = await q.order("apelido").limit(1).maybeSingle();
  if (!data) throw new ErroUso("Nenhuma conta Sicredi com código do beneficiário cadastrada para esta empresa (Cadastros → Contas bancárias).");
  const cooperativa = digitos(data.agencia).padStart(4, "0");
  const posto = digitos(data.posto).padStart(2, "0");
  if (cooperativa.length !== 4 || !digitos(data.posto)) throw new ErroUso(`Conta ${data.apelido}: preencha a agência (cooperativa) e o posto.`);
  return { id: data.id as string, beneficiario: { cooperativa, posto, codigo: digitos(data.codigo_beneficiario) } satisfies Beneficiario };
}

/** Endereço do cliente; se faltar, busca na Receita pelo CNPJ e grava no cadastro. */
async function pagadorDoCliente(usuario: SupabaseClient, admin: SupabaseClient, clienteId: string): Promise<Pagador> {
  const { data: c } = await usuario.from("clientes").select("id, razao_social, cnpj, email, whatsapp, cep, endereco, cidade, uf").eq("id", clienteId).single();
  if (!c) throw new ErroUso("Cliente não encontrado.");
  const documento = digitos(c.cnpj);
  if (documento.length !== 14 && documento.length !== 11) throw new ErroUso(`Cadastre o CPF ou CNPJ do cliente ${c.razao_social} para gerar o boleto.`);

  let end = { cep: digitos(c.cep), endereco: c.endereco, cidade: c.cidade, uf: c.uf };
  if ((!end.cep || !end.endereco || !end.cidade || !end.uf) && documento.length === 14) {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${documento}`).catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      const rua = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" ");
      end = {
        cep: end.cep || digitos(d.cep),
        endereco: end.endereco || [[rua, d.numero].filter(Boolean).join(", "), d.complemento, d.bairro].filter(Boolean).join(" - "),
        cidade: end.cidade || d.municipio,
        uf: end.uf || d.uf,
      };
      await admin.from("clientes").update({ cep: end.cep, endereco: end.endereco, cidade: end.cidade, uf: end.uf }).eq("id", c.id);
    }
  }
  if (end.cep.length !== 8 || !end.endereco || !end.cidade || !end.uf) {
    throw new ErroUso(`Complete o endereço (CEP, endereço, cidade e UF) do cliente ${c.razao_social} para gerar o boleto.`);
  }
  return { documento, nome: c.razao_social, endereco: end.endereco, cidade: end.cidade, uf: end.uf.toUpperCase(), cep: end.cep, email: c.email, telefone: c.whatsapp };
}

// ---------- pdf / atualizar / baixar ----------
async function boletoComConta(usuario: SupabaseClient, id: string) {
  const { data } = await usuario.from("boletos")
    .select("id, medicao_id, nosso_numero, linha_digitavel, status, valor, ambiente, contas_bancarias(agencia, posto, codigo_beneficiario)")
    .eq("id", id ?? "").maybeSingle();
  if (!data) throw new ErroUso("Boleto não encontrado.", 404);
  if (data.ambiente !== ambiente()) throw new ErroUso(`Boleto emitido em ${data.ambiente}; a integração está em ${ambiente()}.`);
  const cb = data.contas_bancarias as unknown as { agencia: string; posto: string; codigo_beneficiario: string };
  const beneficiario: Beneficiario = { cooperativa: digitos(cb.agencia).padStart(4, "0"), posto: digitos(cb.posto).padStart(2, "0"), codigo: digitos(cb.codigo_beneficiario) };
  return { ...data, beneficiario };
}

async function pdf({ usuario }: Ctx, id: string) {
  const b = await boletoComConta(usuario, id);
  const bytes = await pdfBoleto(b.beneficiario, b.linha_digitavel);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { pdf_base64: btoa(bin) };
}

async function atualizar(ctx: Ctx, ids?: string[]) {
  let q = ctx.usuario.from("boletos").select("id").eq("status", "emitido").eq("ambiente", ambiente());
  if (Array.isArray(ids) && ids.length) q = q.in("id", ids);
  const { data } = await q.limit(200);
  const resultado = { consultados: 0, pagos: 0, baixados: 0, erros: [] as string[] };
  for (const { id } of data ?? []) {
    try {
      const b = await boletoComConta(ctx.usuario, id);
      const s = await consultarBoleto(b.beneficiario, b.nosso_numero);
      resultado.consultados++;
      if (s.liquidado) { await registrarPagamento(ctx, b, s.dataPagamento ?? hojeSP(), s.valorPago ?? Number(b.valor)); resultado.pagos++; }
      else if (s.baixado) { await ctx.admin.from("boletos").update({ status: "baixado" }).eq("id", id); resultado.baixados++; }
    } catch (e) {
      resultado.erros.push(e instanceof Error ? e.message : String(e));
    }
  }
  return resultado;
}

/** Boleto pago: lança o recebimento (limitado ao saldo) e marca o boleto. */
async function registrarPagamento({ admin, userId }: Ctx, b: { id: string; medicao_id: string; nosso_numero: string }, data: string, valorPago: number) {
  const { data: m } = await admin.from("medicoes_v").select("saldo").eq("id", b.medicao_id).single();
  const valor = Math.min(valorPago, Number(m?.saldo ?? 0));
  let recebimentoId: string | null = null;
  if (valor > 0) {
    const { data: conta } = await admin.from("boletos").select("conta_bancaria_id").eq("id", b.id).single();
    const { data: r, error } = await admin.from("recebimentos").insert({
      medicao_id: b.medicao_id, data, valor, conta_bancaria_id: conta?.conta_bancaria_id ?? null,
      observacoes: `Boleto Sicredi ${b.nosso_numero} (baixa automática)${valorPago > valor + 0.005 ? ` · pago ${valorPago.toFixed(2).replace(".", ",")} com multa/juros` : ""}`, created_by: userId,
    }).select("id").single();
    if (error) throw error;
    recebimentoId = r.id;
  }
  await admin.from("boletos").update({ status: "pago", data_pagamento: data, valor_pago: valorPago, recebimento_id: recebimentoId }).eq("id", b.id);
}

async function baixar({ usuario, admin }: Ctx, id: string) {
  const b = await boletoComConta(usuario, id);
  if (b.status !== "emitido") throw new ErroUso("Só boletos em aberto podem ser cancelados.");
  await baixarBoleto(b.beneficiario, b.nosso_numero);
  await admin.from("boletos").update({ status: "baixado" }).eq("id", b.id);
  return { ok: true };
}

const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
