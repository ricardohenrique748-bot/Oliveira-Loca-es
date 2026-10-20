/** Consulta pública de CNPJ (dados da Receita Federal) — BrasilAPI, com a CNPJ.ws como reserva. Roda no navegador. */
import { maskCpfCnpj, maskTelefone } from "@/lib/format";

export interface DadosCnpj {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  email: string | null;
  /** só dígitos, com DDD */
  telefone: string | null;
  endereco: string | null;
  /** rua, número, complemento e bairro (sem cidade/CEP) */
  logradouro: string | null;
  cep: string | null;
  municipio: string | null;
  uf: string | null;
  situacao: string | null;
}

const limpar = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);
const digitos = (s: unknown) => (typeof s === "string" ? s.replace(/\D/g, "") : "");

function montarEndereco(p: { logradouro?: unknown; numero?: unknown; complemento?: unknown; bairro?: unknown; municipio?: unknown; uf?: unknown; cep?: unknown }) {
  const rua = [limpar(p.logradouro), limpar(p.numero)].filter(Boolean).join(", ");
  const partes = [rua, limpar(p.complemento), limpar(p.bairro), [limpar(p.municipio), limpar(p.uf)].filter(Boolean).join("/"), digitos(p.cep) && `CEP ${digitos(p.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2")}`];
  return partes.filter(Boolean).join(" · ") || null;
}

function montarLogradouro(p: { logradouro?: unknown; numero?: unknown; complemento?: unknown; bairro?: unknown }) {
  const rua = [limpar(p.logradouro), limpar(p.numero)].filter(Boolean).join(", ");
  return [rua, limpar(p.complemento), limpar(p.bairro)].filter(Boolean).join(" - ") || null;
}

async function brasilApi(cnpj: string, sinal: AbortSignal): Promise<DadosCnpj | null> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: sinal });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`BrasilAPI ${r.status}`);
  const d = await r.json();
  return {
    cnpj, razao_social: limpar(d.razao_social) ?? "", nome_fantasia: limpar(d.nome_fantasia), email: limpar(d.email)?.toLowerCase() ?? null,
    telefone: digitos(d.ddd_telefone_1) || null, endereco: montarEndereco(d),
    logradouro: montarLogradouro({ ...d, logradouro: [limpar(d.descricao_tipo_de_logradouro), limpar(d.logradouro)].filter(Boolean).join(" ") }),
    cep: digitos(d.cep) || null, municipio: limpar(d.municipio), uf: limpar(d.uf),
    situacao: limpar(d.descricao_situacao_cadastral),
  };
}

async function cnpjWs(cnpj: string, sinal: AbortSignal): Promise<DadosCnpj | null> {
  const r = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, { signal: sinal });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`CNPJ.ws ${r.status}`);
  const d = await r.json();
  const e = d.estabelecimento ?? {};
  const rua = [limpar(e.tipo_logradouro), limpar(e.logradouro)].filter(Boolean).join(" ");
  return {
    cnpj, razao_social: limpar(d.razao_social) ?? "", nome_fantasia: limpar(e.nome_fantasia), email: limpar(e.email)?.toLowerCase() ?? null,
    telefone: digitos(`${e.ddd1 ?? ""}${e.telefone1 ?? ""}`) || null,
    endereco: montarEndereco({ ...e, logradouro: rua, municipio: e.cidade?.nome, uf: e.estado?.sigla }),
    logradouro: montarLogradouro({ ...e, logradouro: rua }), cep: digitos(e.cep) || null,
    municipio: limpar(e.cidade?.nome), uf: limpar(e.estado?.sigla), situacao: limpar(e.situacao_cadastral),
  };
}

// ---------- o que cada cadastro preenche (só campos vazios são preenchidos) ----------
const tel = (d: DadosCnpj) => (d.telefone ? maskTelefone(d.telefone) : null);
export const cnpjParaCliente = (d: DadosCnpj) => ({
  razao_social: d.razao_social, nome_fantasia: d.nome_fantasia, email: d.email, whatsapp: tel(d),
  cep: d.cep, endereco: d.logradouro, cidade: d.municipio, uf: d.uf,
});
export const cnpjParaFornecedor = (d: DadosCnpj) => ({ nome: d.nome_fantasia ?? d.razao_social, telefone: tel(d), email: d.email });
export const cnpjParaEmpresa = (d: DadosCnpj) => ({
  razao_social: d.razao_social, endereco: d.logradouro, cidade: d.municipio, uf: d.uf, telefone: tel(d), email: d.email,
});
export const cnpjParaLocador = (d: DadosCnpj) => ({
  nome: d.razao_social, telefone: tel(d), nome_titular_pix: d.razao_social,
  tipo_chave_pix: "cnpj", chave_pix: maskCpfCnpj(d.cnpj),
  observacoes: [d.nome_fantasia && `Nome fantasia: ${d.nome_fantasia}`, d.email && `E-mail: ${d.email}`, d.endereco && `Endereço: ${d.endereco}`].filter(Boolean).join("\n") || null,
});

/** null = CNPJ não encontrado; lança erro se os serviços estiverem fora do ar. */
export async function consultarCnpj(cnpj: string, sinal: AbortSignal): Promise<DadosCnpj | null> {
  const num = digitos(cnpj);
  try {
    return await brasilApi(num, sinal);
  } catch (e) {
    if (sinal.aborted) throw e;
    return cnpjWs(num, sinal);
  }
}
