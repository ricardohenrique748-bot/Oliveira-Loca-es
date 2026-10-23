/**
 * DPS (Declaração de Prestação de Serviço) da NFS-e Padrão Nacional, leiaute 1.01 (XSD de 09/02/2026).
 * Função pura: só monta o XML sem assinatura. Assinar e enviar ficam na função do servidor (certificado A1).
 * Referência: gov.br/nfse → Documentação atual → NFSe-ESQUEMAS_XSD v1.01 (DPS_v1.01.xsd, tiposComplexos, tiposSimples).
 */

export interface DadosDPS {
  /** 1 = produção, 2 = homologação */
  ambiente: 1 | 2;
  serie: number;
  numero: number;
  emissao: Date;
  prestador: {
    cnpj: string; im: string | null; codigoIbge: string;
    regime: "mei" | "simples_nacional" | "normal";
    /** código de tributação: 6 dígitos (nacional) ou 9 (nacional + municipal, ex.: 16.02.01.000) */
    codigoServico: string;
    aliquotaIss: number;
  };
  tomador: { documento: string | null; nome: string };
  /** inicio = data em que a prestação começou (dCompet); complemento = texto fixo da empresa (ex.: dados bancários), no fim */
  servico: { descricao: string; inicio: string; complemento?: string | null };
  valor: number;
}

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dec2 = (v: number) => v.toFixed(2);

/** "DPS" + IBGE(7) + tipo de inscrição (1 CPF / 2 CNPJ) + inscrição(14) + série(5) + número(15) */
export function idDPS(codigoIbge: string, cnpj: string, serie: number, numero: number): string {
  return `DPS${codigoIbge}2${digitos(cnpj).padStart(14, "0")}${String(serie).padStart(5, "0")}${String(numero).padStart(15, "0")}`;
}

/** horário de Brasília (UTC−3, sem horário de verão desde 2019) no formato do XSD */
function dataHoraBrasilia(d: Date): string {
  const b = new Date(d.getTime() - 3 * 3600_000);
  return `${b.toISOString().slice(0, 19)}-03:00`;
}

const OP_SIMPLES = { normal: 1, mei: 2, simples_nacional: 3 } as const;

export function montarDPS(d: DadosDPS): string {
  // 6 dígitos = código nacional; 9 = nacional + 3 do código municipal (Rio Preto: 16.02.01.000)
  const codigo = digitos(d.prestador.codigoServico);
  if (codigo.length !== 6 && codigo.length !== 9) throw new Error("Código do serviço precisa ter 6 ou 9 dígitos (ex.: 16.02.01.000)");
  const cTribNac = codigo.slice(0, 6);
  // a Sefin não aceita cTribMun "000" (E0315): nesse caso o campo opcional não vai
  const mun = codigo.slice(6);
  const cTribMun = codigo.length === 9 && mun !== "000" ? `<cTribMun>${mun}</cTribMun>` : "";
  const doc = digitos(d.tomador.documento);
  if (doc.length !== 11 && doc.length !== 14) throw new Error("Cliente sem CPF ou CNPJ: complete o cadastro antes de emitir a nota");

  const discriminacao = [d.servico.descricao, d.servico.complemento].filter(Boolean).join("\n");
  const op = OP_SIMPLES[d.prestador.regime];
  const regTrib = `<regTrib><opSimpNac>${op}</opSimpNac>${op === 3 ? "<regApTribSN>1</regApTribSN>" : ""}<regEspTrib>0</regEspTrib></regTrib>`;

  return (
    `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">` +
    `<infDPS Id="${idDPS(d.prestador.codigoIbge, d.prestador.cnpj, d.serie, d.numero)}">` +
    `<tpAmb>${d.ambiente}</tpAmb><dhEmi>${dataHoraBrasilia(d.emissao)}</dhEmi><verAplic>OliveiraLoc-1.0</verAplic>` +
    `<serie>${d.serie}</serie><nDPS>${d.numero}</nDPS><dCompet>${d.servico.inicio}</dCompet>` +
    // finNFSe (0 = regular): exigido pelo XSD da homologação de 20/10/2026; o de produção (09/02/2026) ainda não tem o campo
    `<tpEmit>1</tpEmit>${d.ambiente === 2 ? "<finNFSe>0</finNFSe>" : ""}<cLocEmi>${d.prestador.codigoIbge}</cLocEmi>` +
    // IM só em produção: o cadastro (CNC) da homologação não tem os dados do município e rejeita a IM (E0120)
    `<prest><CNPJ>${digitos(d.prestador.cnpj)}</CNPJ>${d.prestador.im && d.ambiente === 1 ? `<IM>${esc(d.prestador.im)}</IM>` : ""}${regTrib}</prest>` +
    `<toma><${doc.length === 14 ? "CNPJ" : "CPF"}>${doc}</${doc.length === 14 ? "CNPJ" : "CPF"}><xNome>${esc(d.tomador.nome)}</xNome></toma>` +
    `<serv><locPrest><cLocPrestacao>${d.prestador.codigoIbge}</cLocPrestacao></locPrest>` +
    `<cServ><cTribNac>${cTribNac}</cTribNac>${cTribMun}<xDescServ>${esc(discriminacao.slice(0, 2000))}</xDescServ></cServ></serv>` +
    `<valores><vServPrest><vServ>${dec2(d.valor)}</vServ></vServPrest>` +
    `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN><pAliq>${dec2(d.prestador.aliquotaIss)}</pAliq></tribMun>` +
    `<totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>` +
    `</infDPS></DPS>`
  );
}
