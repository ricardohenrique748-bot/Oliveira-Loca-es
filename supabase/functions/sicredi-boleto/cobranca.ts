/**
 * Escolhe o banco de cobrança pela conta bancária e expõe as mesmas operações para todos.
 * Sicredi: conta com código do beneficiário. Itaú: conta com carteira de cobrança.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import * as sicredi from "./sicredi.ts";
import * as itau from "./itau.ts";
import type { Ambiente, BoletoCriado, DadosBoleto, SituacaoBoleto } from "./tipos.ts";

export const BANCOS_COBRANCA = ["Sicredi", "Itaú"] as const;
export type BancoCobranca = (typeof BANCOS_COBRANCA)[number];

/** colunas de contas_bancarias ("*": funciona antes da migration 0078, sem boleto_carteira/pix_chave) */
export const COLUNAS_CONTA = "*";
export type ContaRow = {
  id: string; banco: string; agencia: string | null; conta: string | null; posto: string | null;
  codigo_beneficiario: string | null; boleto_carteira?: string | null; pix_chave?: string | null; apelido: string;
};

export interface Cobranca {
  banco: BancoCobranca;
  ambiente: Ambiente;
  /** carteira gravada no boleto (Itaú); null no Sicredi */
  carteira: string | null;
  criar(dados: DadosBoleto): Promise<BoletoCriado>;
  consultar(nossoNumero: string): Promise<SituacaoBoleto>;
  baixar(nossoNumero: string): Promise<void>;
  /** PDF do banco; null quando o banco não fornece (o app desenha) */
  pdf(linhaDigitavel: string): Promise<Uint8Array | null>;
}

/** Erro de cadastro (vira 400 com a mensagem para o usuário). */
export class ErroConta extends Error {}

const digitos = (s: unknown) => (typeof s === "string" ? s.replace(/\D/g, "") : "");

/** a conta está configurada para emitir boleto pelo sistema? */
export const emiteBoleto = (c: Pick<ContaRow, "banco" | "codigo_beneficiario" | "boleto_carteira">) =>
  (c.banco === "Sicredi" && !!c.codigo_beneficiario) || (c.banco === "Itaú" && !!c.boleto_carteira);

/**
 * @param carteiraDoBoleto em boletos já emitidos, a carteira usada na emissão (vale mais que a da conta)
 */
export function cobrancaDaConta(admin: SupabaseClient, c: ContaRow, carteiraDoBoleto?: string | null): Cobranca {
  if (c.banco === "Sicredi") {
    const cooperativa = digitos(c.agencia).padStart(4, "0");
    if (cooperativa.length !== 4 || !digitos(c.posto)) throw new ErroConta(`Conta ${c.apelido}: preencha a agência (cooperativa) e o posto.`);
    const b: sicredi.Beneficiario = { cooperativa, posto: digitos(c.posto).padStart(2, "0"), codigo: digitos(c.codigo_beneficiario) };
    return {
      banco: "Sicredi", ambiente: sicredi.ambiente(), carteira: null,
      criar: (d) => sicredi.criarBoleto(b, d),
      consultar: (nn) => sicredi.consultarBoleto(b, nn),
      baixar: (nn) => sicredi.baixarBoleto(b, nn),
      pdf: (linha) => sicredi.pdfBoleto(b, linha),
    };
  }
  if (c.banco === "Itaú") {
    const agencia = digitos(c.agencia);
    const conta = digitos(c.conta);
    const carteira = digitos(carteiraDoBoleto ?? c.boleto_carteira);
    if (!agencia || agencia.length > 4) throw new ErroConta(`Conta ${c.apelido}: preencha a agência Itaú (4 dígitos).`);
    if (conta.length < 2 || conta.length > 8) throw new ErroConta(`Conta ${c.apelido}: preencha a conta Itaú com o dígito (ex.: 12345-6).`);
    if (!carteira || carteira.length > 3) throw new ErroConta(`Conta ${c.apelido}: preencha a carteira de cobrança (ex.: 109).`);
    const b: itau.BeneficiarioItau = { agencia: agencia.padStart(4, "0"), conta: conta.padStart(8, "0"), carteira: carteira.padStart(3, "0"), pixChave: c.pix_chave?.trim() || null };
    return {
      banco: "Itaú", ambiente: itau.ambiente(), carteira: b.carteira,
      criar: async (d) => {
        // nosso número sequencial da conta (o Itaú exige que o beneficiário gere)
        const { data, error } = await admin.rpc("boleto_proximo_nosso_numero", { p_conta: c.id });
        if (error || data == null) throw new Error(`Não foi possível reservar o nosso número: ${error?.message ?? "conta não encontrada"}`);
        const nn = String(data);
        if (nn.length > 8) throw new ErroConta(`Conta ${c.apelido}: a sequência de nosso número passou de 8 dígitos.`);
        return itau.criarBoleto(b, nn, d);
      },
      consultar: (nn) => itau.consultarBoleto(b, nn),
      baixar: (nn) => itau.baixarBoleto(b, nn),
      pdf: () => Promise.resolve(null),
    };
  }
  throw new ErroConta(`Conta ${c.apelido}: o banco ${c.banco} não emite boleto pelo sistema.`);
}
