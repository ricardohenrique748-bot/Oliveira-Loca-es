import { z } from "zod";
import { PLACA_RE, validarCNPJ, validarCPF } from "@/lib/format";

// ---------- helpers ----------
export const textoOpc = z.string().trim().max(500).nullish().transform((v) => (v ? v : null));
export const textoObr = (rotulo: string, max = 200) => z.string({ required_error: `${rotulo} é obrigatório`, invalid_type_error: `${rotulo} é obrigatório` }).trim().min(1, `${rotulo} é obrigatório`).max(max);
export const uuidOpc = z.string().uuid().nullish().transform((v) => v ?? null);
export const uuidObr = (rotulo: string) => z.string({ required_error: `Selecione ${rotulo}`, invalid_type_error: `Selecione ${rotulo}` }).uuid(`Selecione ${rotulo}`);
export const dataOpc = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullish().transform((v) => v ?? null);
export const dataObr = (rotulo: string) => z.string({ required_error: `Informe ${rotulo}`, invalid_type_error: `Informe ${rotulo}` }).regex(/^\d{4}-\d{2}-\d{2}$/, `Informe ${rotulo}`);
export const moedaObr = (rotulo: string) => z.number({ required_error: `Informe ${rotulo}`, invalid_type_error: `Informe ${rotulo}` }).min(0, `${rotulo} não pode ser negativo`).max(999_999_999);
export const moedaOpc = z.number().min(0).max(999_999_999).nullish().transform((v) => v ?? null);
export const numeroOpc = z.number().min(0).nullish().transform((v) => v ?? null);

const soDig = (s: string) => s.replace(/\D/g, "");

export const cnpjOpc = textoOpc.refine((v) => !v || validarCNPJ(v), "CNPJ inválido");
export const cpfCnpjOpc = textoOpc.refine((v) => !v || (soDig(v).length === 11 ? validarCPF(v) : validarCNPJ(v)), "CPF/CNPJ inválido");
export const emailOpc = z.string().trim().email("E-mail inválido").nullish().or(z.literal("")).transform((v) => (v ? v : null));
export const telefoneOpc = textoOpc.transform((v) => (v ? soDig(v) : null)).refine((v) => !v || v.length >= 10, "Telefone incompleto");
export const placa = z.string({ required_error: "Informe a placa" }).transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "")).refine((v) => PLACA_RE.test(v), "Placa inválida (ABC1D23 ou ABC1234)");

// ---------- cliente digitado no formulário (proposta, contrato) ----------
/** valor do select de cliente que libera o campo para digitar um cliente ainda sem cadastro */
export const CLIENTE_NOVO = "__novo__";
export const clienteFormCampos = {
  cliente_id: z.string({ required_error: "Selecione o cliente", invalid_type_error: "Selecione o cliente" }).min(1, "Selecione o cliente"),
  cliente_novo: textoOpc,
  cliente_novo_endereco: textoOpc,
  cliente_novo_telefone: telefoneOpc,
};
export function validarClienteForm(p: { cliente_id: string; cliente_novo: string | null }, ctx: z.RefinementCtx) {
  if (p.cliente_id === CLIENTE_NOVO) {
    if (!p.cliente_novo) ctx.addIssue({ code: "custom", path: ["cliente_novo"], message: "Digite o nome do cliente" });
  } else if (!z.string().uuid().safeParse(p.cliente_id).success) ctx.addIssue({ code: "custom", path: ["cliente_id"], message: "Selecione o cliente" });
}

// ---------- entidades ----------
export const empresaSchema = z.object({
  apelido: textoObr("Apelido", 20).transform((v) => v.toUpperCase()),
  razao_social: textoObr("Razão social"),
  cnpj: cnpjOpc,
  // cabeçalho/rodapé da proposta e do contrato
  endereco: textoOpc,
  cidade: textoOpc,
  uf: z.string().trim().length(2, "UF com 2 letras").transform((v) => v.toUpperCase()).nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  contato_nome: textoOpc,
  telefone: telefoneOpc,
  email: emailOpc,
  ativo: z.boolean().default(true),
  // nota fiscal de serviço (NFS-e)
  inscricao_municipal: textoOpc,
  regime_tributario: z.enum(["mei", "simples_nacional", "normal"]).nullish().transform((v) => v ?? null),
  codigo_ibge: textoOpc.refine((v) => !v || /^\d{7}$/.test(v), "Código IBGE tem 7 dígitos"),
  nfse_codigo_servico: textoOpc,
  nfse_aliquota_iss: z.number().min(0).max(100).nullish().transform((v) => v ?? null),
  nfse_texto_complementar: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
});
export type EmpresaForm = z.infer<typeof empresaSchema>;

// ---------- encargos do boleto (padrão na conta Sicredi) ----------
const pctOpc = z.number().gt(0, "Deve ser maior que zero").lt(100, "Deve ser menor que 100%").nullish().transform((v) => v ?? null);
export const APOS_VENCIMENTO = [
  { value: "protesto", label: "Protestar em cartório" },
  { value: "negativacao", label: "Negativar no Serasa" },
] as const;
/** No Sicredi a multa é cobrada uma vez; o que corre por dia de atraso são os juros. */
export const JUROS_TIPOS = [
  { value: "pct_dia", label: "% ao dia" },
  { value: "valor_dia", label: "R$ por dia" },
  { value: "pct_mes", label: "% ao mês" },
] as const;
export type JurosTipo = (typeof JUROS_TIPOS)[number]["value"];
/** limites do Sicredi (Manual API Cobrança 4.0) */
export const DIAS_APOS_VENCIMENTO = { protesto: [3, 99], negativacao: [46, 99] } as const;
const encargosBoletoCampos = {
  boleto_multa_pct: pctOpc,
  boleto_juros: z.number().gt(0, "Deve ser maior que zero").nullish().transform((v) => v ?? null),
  boleto_juros_tipo: z.enum(["pct_dia", "pct_mes", "valor_dia"]).default("pct_dia"),
  boleto_apos_vencimento: z.enum(["protesto", "negativacao"]).nullish().transform((v) => v ?? null),
  boleto_dias_apos_vencimento: z.number().int().nullish().transform((v) => v ?? null),
};
function validarEncargosBoleto(v: { boleto_juros: number | null; boleto_juros_tipo: JurosTipo; boleto_apos_vencimento: "protesto" | "negativacao" | null; boleto_dias_apos_vencimento: number | null }, ctx: z.RefinementCtx) {
  if (v.boleto_juros != null && v.boleto_juros_tipo !== "valor_dia" && v.boleto_juros >= 100) ctx.addIssue({ code: "custom", path: ["boleto_juros"], message: "Deve ser menor que 100%" });
  if (!v.boleto_apos_vencimento) return;
  const [min, max] = DIAS_APOS_VENCIMENTO[v.boleto_apos_vencimento];
  const d = v.boleto_dias_apos_vencimento;
  if (d == null || d < min || d > max) ctx.addIssue({ code: "custom", path: ["boleto_dias_apos_vencimento"], message: `Entre ${min} e ${max} dias` });
}

export const contaBancariaSchema = z.object({
  empresa_id: uuidObr("a empresa"),
  banco: z.enum(["Bradesco", "Sicredi", "Inter", "Outro"], { errorMap: () => ({ message: "Selecione o banco" }) }),
  agencia: textoOpc,
  conta: textoOpc,
  posto: textoOpc,
  codigo_beneficiario: textoOpc,
  apelido: textoObr("Apelido"),
  ativo: z.boolean().default(true),
  ...encargosBoletoCampos,
}).superRefine(validarEncargosBoleto);
export type ContaBancariaForm = z.infer<typeof contaBancariaSchema>;

export const clienteSchema = z.object({
  razao_social: textoObr("Razão social"),
  nome_fantasia: textoOpc,
  /** CNPJ ou CPF (pessoa física); a coluna continua se chamando cnpj */
  cnpj: cpfCnpjOpc,
  email: emailOpc,
  whatsapp: telefoneOpc,
  cep: textoOpc.transform((v) => (v ? soDig(v) : null)).refine((v) => !v || v.length === 8, "CEP com 8 dígitos"),
  endereco: textoOpc,
  cidade: textoOpc,
  uf: z.string().trim().length(2, "UF com 2 letras").transform((v) => v.toUpperCase()).nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  observacoes: textoOpc,
  ativo: z.boolean().default(true),
});
export type ClienteForm = z.infer<typeof clienteSchema>;

export const obraSchema = z.object({
  cliente_id: uuidObr("o cliente"),
  nome: textoObr("Nome da obra"),
  codigo: textoOpc,
  cidade: textoOpc,
  uf: z.string().trim().length(2, "UF com 2 letras").transform((v) => v.toUpperCase()).nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  ativo: z.boolean().default(true),
});
export type ObraForm = z.infer<typeof obraSchema>;

export const contatoSchema = z.object({
  cliente_id: uuidObr("o cliente"),
  obra_id: uuidOpc,
  nome: textoObr("Nome"),
  email: emailOpc,
  whatsapp: telefoneOpc,
  recebe_fatura: z.boolean().default(true),
}).refine((c) => c.email || c.whatsapp, { message: "Informe e-mail ou WhatsApp", path: ["email"] });
export type ContatoForm = z.infer<typeof contatoSchema>;

export const locadorSchema = z.object({
  nome: textoObr("Nome"),
  cpf_cnpj: cpfCnpjOpc,
  telefone: telefoneOpc,
  chave_pix: textoOpc,
  tipo_chave_pix: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]).nullish().transform((v) => v ?? null),
  banco: textoOpc,
  nome_titular_pix: textoOpc,
  observacoes: textoOpc,
  ativo: z.boolean().default(true),
});
export type LocadorForm = z.infer<typeof locadorSchema>;

export const fornecedorSchema = z.object({
  nome: textoObr("Nome"),
  cpf_cnpj: cpfCnpjOpc,
  telefone: telefoneOpc,
  email: emailOpc,
  categoria: textoOpc,
  ativo: z.boolean().default(true),
});
export type FornecedorForm = z.infer<typeof fornecedorSchema>;

export const categoriaSchema = z.object({
  nome: textoObr("Nome"),
  tipo: z.enum(["fixa", "variavel", "veiculo"]),
  ativo: z.boolean().default(true),
});
export type CategoriaForm = z.infer<typeof categoriaSchema>;

export const veiculoSchema = z.object({
  placa,
  renavam: z.preprocess((v) => (typeof v === "string" ? v.replace(/\D/g, "") || null : v ?? null),
    z.string().regex(/^\d{9,11}$/, "RENAVAM deve ter 9 a 11 dígitos").nullable()),
  tipo: z.enum(["caminhao", "guindaste", "trator", "munck", "carro", "outro"]),
  marca: textoOpc,
  modelo: textoOpc,
  ano: z.number().int().min(1950, "Ano inválido").max(2100, "Ano inválido").nullish().transform((v) => v ?? null),
  chassi: textoOpc.transform((v) => (v ? v.toUpperCase().replace(/\s+/g, "") : null)),
  cor: textoOpc,
  proprietario: z.enum(["proprio", "locador"]),
  locador_id: uuidOpc,
  empresa_id: uuidObr("a empresa"),
  km_atual: z.number().min(0).nullish().transform((v) => v ?? 0),
  horimetro_atual: z.number().min(0).nullish().transform((v) => v ?? 0),
  status: z.enum(["disponivel", "locado", "manutencao", "parado", "vendido"]),
  foto_url: textoOpc,
  observacoes: textoOpc,
}).superRefine((v, ctx) => {
  if (v.proprietario === "locador" && !v.locador_id) ctx.addIssue({ code: "custom", message: "Selecione o locador", path: ["locador_id"] });
}).transform((v) => ({ ...v, locador_id: v.proprietario === "locador" ? v.locador_id : null }));
export type VeiculoForm = z.input<typeof veiculoSchema>;

export const ROTULOS = {
  tipoVeiculo: { caminhao: "Caminhão", guindaste: "Guindaste", trator: "Trator", munck: "Munck", carro: "Carro", outro: "Outro" },
  proprietario: { proprio: "Frota própria", locador: "Sublocado (locador)" },
  tipoChavePix: { cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Telefone", aleatoria: "Aleatória" },
  tipoDespesa: { fixa: "Fixa", variavel: "Variável", veiculo: "Veículo" },
  formaPagamento: { boleto: "Boleto", debito_automatico: "Débito automático", cartao: "Cartão", pix: "PIX", transferencia: "Transferência" },
  tipoOS: { preventiva: "Preventiva", corretiva: "Corretiva", pneu: "Pneu", inspecao: "Inspeção" },
  tipoDocumento: {
    licenciamento: "Licenciamento", seguro: "Seguro", tacografo: "Tacógrafo", inspecao_icamento: "Inspeção de içamento", antt: "ANTT",
    laudo_viabilidade: "Laudo de viabilidade técnica", plano_manutencao: "Plano de manutenção", checklist_fotografico: "Checklist e registro fotográfico",
    os_preventiva: "OS de manutenções preventivas", laudo_dieletrico: "Laudo dielétrico", apreciacao_riscos_hrn: "Apreciação de riscos HRN",
    laudo_escada: "Laudo da escada de acesso", laudo_guarda_corpo: "Laudo do guarda-corpo", checklist_detalhado: "Checklist detalhado",
    laudo_opacidade: "Laudo de opacidade (fumaça preta)", plano_inspecao: "Procedimento operacional / plano de inspeção", outro: "Outro",
  },
} as const;

export function opcoesDe<T extends Record<string, string>>(r: T) {
  return Object.entries(r).map(([value, label]) => ({ value, label }));
}
