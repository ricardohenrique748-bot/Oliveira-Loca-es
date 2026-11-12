/**
 * Pedido de registro de evento da NFS-e Padrão Nacional: cancelamento (e101101).
 * Função pura: só monta o XML sem assinatura. Assinar (infPedReg) e enviar ficam na função do servidor.
 * Referência: pedRegEvento_v1.01.xsd / tiposEventos_v1.01.xsd (TCInfPedReg, TE101101, TSIdPedRegEvt, TSCodJustCanc, TSMotivo).
 * Envio: POST {SEFIN}/{chave}/eventos com { pedidoRegistroEventoXmlGZipB64 }.
 *
 * O Id tem duas versões publicadas do leiaute: "PRE" + chave(50) + tipo(6) (59 caracteres, sem nPedRegEvento)
 * e, numa revisão do 1.01, "PRE" + chave + tipo + nPedRegEvento(3) com <nPedRegEvento> antes do e101101.
 * A função do servidor manda a primeira e, se a Sefin pedir o nPedRegEvento, repete com a segunda.
 */
import { dataHoraBrasilia } from "./dps.js";

export const MOTIVOS_CANCELAMENTO = { 1: "Erro na emissão", 2: "Serviço não prestado", 9: "Outros" } as const;
export type CodigoMotivo = keyof typeof MOTIVOS_CANCELAMENTO;

export interface DadosCancelamento {
  /** 1 = produção, 2 = homologação */
  ambiente: 1 | 2;
  /** CNPJ do prestador (autor do pedido) */
  cnpjAutor: string;
  /** chave de acesso da NFS-e (50 dígitos) */
  chave: string;
  codigo: CodigoMotivo;
  /** justificativa: 15 a 255 caracteres */
  motivo: string;
  quando: Date;
  /** leiaute com nPedRegEvento (001) no Id e no corpo */
  comSequencial?: boolean;
}

const digitos = (s: string) => s.replace(/\D/g, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** justificativa como vai no XML: espaços colapsados (o XSD conta caracteres) */
export function normalizarMotivo(motivo: string): string {
  return motivo.replace(/\s+/g, " ").trim();
}

export function validarCancelamento(d: Pick<DadosCancelamento, "chave" | "codigo" | "motivo" | "cnpjAutor">): string | null {
  if (!/^\d{50}$/.test(d.chave)) return "Chave da NFS-e inválida (precisa ter 50 dígitos)";
  if (digitos(d.cnpjAutor).length !== 14) return "CNPJ da empresa inválido";
  if (!(d.codigo in MOTIVOS_CANCELAMENTO)) return "Escolha o motivo do cancelamento";
  const m = normalizarMotivo(d.motivo);
  if (m.length < 15) return "Escreva a justificativa com pelo menos 15 caracteres";
  if (m.length > 255) return "A justificativa passou de 255 caracteres";
  return null;
}

export function idPedidoCancelamento(chave: string, comSequencial = false): string {
  return `PRE${chave}101101${comSequencial ? "001" : ""}`;
}

export function montarPedidoCancelamento(d: DadosCancelamento): string {
  const erro = validarCancelamento(d);
  if (erro) throw new Error(erro);
  return `<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">` +
    `<infPedReg Id="${idPedidoCancelamento(d.chave, d.comSequencial)}">` +
    `<tpAmb>${d.ambiente}</tpAmb><verAplic>OliveiraLoc-1.0</verAplic><dhEvento>${dataHoraBrasilia(d.quando)}</dhEvento>` +
    `<CNPJAutor>${digitos(d.cnpjAutor)}</CNPJAutor><chNFSe>${d.chave}</chNFSe>` +
    (d.comSequencial ? "<nPedRegEvento>001</nPedRegEvento>" : "") +
    `<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>${d.codigo}</cMotivo><xMotivo>${esc(normalizarMotivo(d.motivo))}</xMotivo></e101101>` +
    `</infPedReg></pedRegEvento>`;
}
