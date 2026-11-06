/**
 * DANFSe montado pelo sistema a partir do XML da NFS-e, para quando o serviço de PDF da Receita (ADN) está fora do ar.
 * Segue o desenho do DANFSe v2.0 oficial (mesmos blocos e rótulos). Os dados são os do XML autorizado.
 * lerNFSe: só texto (roda no Node e nos testes). gerarDanfsePDF: navegador (jsPDF + qrcode, carregados sob demanda).
 */

export type DadosNFSe = {
  chave: string; numero: string; competencia: string; emissaoNFSe: string; numeroDPS: string; serieDPS: string; emissaoDPS: string;
  ambGer: string; tpAmb: string; municipioEmissao: string; emitente: string; situacao: string;
  prestador: { documento: string; im: string; fone: string; nome: string; municipio: string; ibgeCep: string; endereco: string; email: string; simples: string; regimeSN: string };
  tomador: { documento: string; im: string; fone: string; nome: string; municipio: string; ibgeCep: string; endereco: string; email: string };
  servico: { codTrib: string; nbs: string; local: string; tributacaoNacional: string; descricao: string };
  issqn: { tipo: string; incidencia: string; bc: string; aliquota: string; retencao: string; apurado: string };
  valores: { servico: string; descIncond: string; descCond: string; retencoes: string; liquido: string };
  complementares: string;
};

const VAZIO = "-";

/** conteúdo do primeiro <tag> (ignora prefixo de namespace), dentro de `escopo` se houver */
function tag(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  return m ? m[1] : null;
}
const txt = (xml: string | null, nome: string): string => {
  const v = xml ? tag(xml, nome) : null;
  return v == null ? "" : desescapar(v.trim());
};
const ou = (v: string) => (v ? v : VAZIO);

function desescapar(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
}

export function formatarDocumento(d: string): string {
  const n = d.replace(/\D/g, "");
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}
const dataBR = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
/** "2026-11-06T09:57:05-03:00" → "06/11/2026 09:57:05" (hora como veio, que já é a local) */
const dataHoraBR = (iso: string) => (iso ? `${dataBR(iso)} ${iso.slice(11, 19)}`.trim() : "");
const moeda = (v: string) => (v === "" ? VAZIO : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct = (v: string) => (v === "" ? VAZIO : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const cep = (v: string) => (v.length === 8 ? `${v.slice(0, 2)}.${v.slice(2, 5)}-${v.slice(5)}` : v);
const ibge = (v: string) => (v.length === 7 ? `${v.slice(0, 2)}.${v.slice(2)}` : v);
const codTrib = (v: string) => (v.length === 6 ? `${v.slice(0, 2)}.${v.slice(2, 4)}.${v.slice(4)}` : v);

const SIMPLES: Record<string, string> = { "1": "Não Optante", "2": "Optante - Microempreendedor Individual (MEI)", "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)" };
const REGIME_SN: Record<string, string> = {
  "1": "Regime de apuração dos tributos federais e municipal pelo Simples Nacional",
  "2": "Regime de apuração dos tributos federais pelo SN e o ISSQN pela NFS-e conforme legislação municipal",
  "3": "Regime de apuração dos tributos federais e municipal pela NFS-e conforme legislações federal e municipal",
};
const TRIB_ISSQN: Record<string, string> = { "1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço", "4": "Não Incidência" };
const RETENCAO: Record<string, string> = { "1": "Não Retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário" };
const EMITENTE: Record<string, string> = { "1": "Prestador", "2": "Tomador", "3": "Intermediário" };

function endereco(bloco: string | null): string {
  if (!bloco) return "";
  return [txt(bloco, "xLgr"), txt(bloco, "nro"), txt(bloco, "xCpl"), txt(bloco, "xBairro")].filter(Boolean).join(", ");
}

/** lê o XML da NFS-e (o que a Sefin devolve na consulta pela chave) */
export function lerNFSe(xml: string, chaveInformada?: string): DadosNFSe {
  const inf = tag(xml, "infNFSe") ?? xml;
  const idChave = xml.match(/<(?:\w+:)?infNFSe[^>]*\sId="NFS(\d{50})"/)?.[1];
  const dps = tag(inf, "infDPS") ?? "";
  const emit = tag(inf, "emit");
  const prest = tag(dps, "prest");
  const toma = tag(dps, "toma");
  const serv = tag(dps, "serv");
  const valDPS = tag(dps, "valores");
  const valNFSe = (() => {
    // <valores> da NFS-e fica fora do <DPS>: tira o DPS antes de procurar
    const semDps = inf.replace(/<(?:\w+:)?DPS[\s\S]*<\/(?:\w+:)?DPS>/, "");
    return tag(semDps, "valores");
  })();
  const enderEmit = tag(emit ?? "", "enderNac");
  const enderToma = toma ? tag(toma, "end") : null;
  const munEmit = txt(enderEmit, "cMun");
  const regTrib = tag(prest ?? "", "regTrib");
  const tribMun = tag(valDPS ?? "", "tribMun");
  const cStat = txt(inf, "cStat");

  const vServ = txt(valDPS, "vServ");
  const descIncond = txt(valDPS, "vDescIncond");
  const descCond = txt(valDPS, "vDescCond");
  const liquido = txt(valNFSe, "vLiq") || vServ;
  const xLocEmi = txt(inf, "xLocEmi");
  const ufEmit = txt(enderEmit, "UF");

  return {
    chave: idChave ?? chaveInformada ?? "",
    numero: ou(txt(inf, "nNFSe")),
    competencia: ou(dataBR(txt(dps, "dCompet"))),
    emissaoNFSe: ou(dataHoraBR(txt(inf, "dhProc"))),
    numeroDPS: ou(txt(dps, "nDPS")),
    serieDPS: ou(txt(dps, "serie")),
    emissaoDPS: ou(dataHoraBR(txt(dps, "dhEmi"))),
    ambGer: ou(txt(inf, "ambGer")),
    tpAmb: ou(txt(dps, "tpAmb")),
    municipioEmissao: xLocEmi ? `${xLocEmi}${ufEmit ? ` - ${ufEmit}` : ""}` : VAZIO,
    emitente: ou(EMITENTE[txt(dps, "tpEmit")] ?? ""),
    situacao: cStat === "100" || !cStat ? "NFS-e Gerada" : `Situação ${cStat}`,
    prestador: {
      documento: ou(formatarDocumento(txt(emit, "CNPJ") || txt(emit, "CPF") || txt(prest, "CNPJ") || txt(prest, "CPF"))),
      im: ou(txt(emit, "IM")), fone: ou(txt(emit, "fone")), nome: ou(txt(emit, "xNome")),
      municipio: xLocEmi ? `${xLocEmi}${ufEmit ? ` / ${ufEmit}` : ""}` : VAZIO,
      ibgeCep: munEmit || txt(enderEmit, "CEP") ? `${ibge(munEmit) || VAZIO} / ${cep(txt(enderEmit, "CEP")) || VAZIO}` : VAZIO,
      endereco: ou(endereco(enderEmit)), email: ou(txt(emit, "email")),
      simples: ou(SIMPLES[txt(regTrib, "opSimpNac")] ?? ""), regimeSN: ou(REGIME_SN[txt(regTrib, "regApTribSN")] ?? ""),
    },
    tomador: {
      documento: ou(formatarDocumento(txt(toma, "CNPJ") || txt(toma, "CPF") || txt(toma, "NIF"))),
      im: ou(txt(toma, "IM")), fone: ou(txt(toma, "fone")), nome: ou(txt(toma, "xNome")),
      municipio: VAZIO,
      ibgeCep: enderToma ? `${ibge(txt(enderToma, "cMun")) || VAZIO} / ${cep(txt(enderToma, "CEP")) || VAZIO}` : VAZIO,
      endereco: ou(endereco(enderToma)), email: ou(txt(toma, "email")),
    },
    servico: {
      codTrib: `${codTrib(txt(serv, "cTribNac")) || VAZIO} / ${txt(serv, "cTribMun") || VAZIO}`,
      nbs: ou(txt(serv, "cNBS")),
      local: txt(inf, "xLocPrestacao") ? `${txt(inf, "xLocPrestacao")} / ${ufEmit || VAZIO} / -` : VAZIO,
      tributacaoNacional: txt(inf, "xTribNac"),
      descricao: ou(txt(serv, "xDescServ")),
    },
    issqn: {
      tipo: ou(TRIB_ISSQN[txt(tribMun, "tribISSQN")] ?? ""),
      incidencia: txt(inf, "xLocIncid") ? `${txt(inf, "xLocIncid")} / ${ufEmit || VAZIO} / -` : VAZIO,
      bc: moeda(txt(valNFSe, "vBC")), aliquota: pct(txt(valNFSe, "pAliqAplic")),
      retencao: ou(RETENCAO[txt(tribMun, "tpRetISSQN")] ?? ""), apurado: moeda(txt(valNFSe, "vISSQN")),
    },
    valores: {
      servico: moeda(vServ), descIncond: moeda(descIncond), descCond: moeda(descCond),
      retencoes: moeda(txt(valNFSe, "vTotalRet")), liquido: moeda(liquido),
    },
    complementares: txt(dps, "xInfComp"),
  };
}

/** link da Consulta Pública (o mesmo do QR Code do DANFSe oficial) */
export const urlConsultaPublica = (chave: string) => `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`;

/** desenha o DANFSe e devolve o PDF (navegador) */
export async function gerarDanfsePDF(d: DadosNFSe): Promise<Blob> {
  const [{ jsPDF }, QR] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 8, L = 210 - 2 * M, COL = L / 4;
  let y = M;

  const rotulo = (s: string, x: number, yy: number) => { doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.text(s, x, yy); };
  const valor = (s: string, x: number, yy: number, w: number): number => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    const linhas = doc.splitTextToSize(s || VAZIO, w - 1.5) as string[];
    doc.text(linhas, x, yy);
    return linhas.length;
  };
  /** linha de campos: cada campo ocupa `span` colunas; devolve a altura usada */
  const linha = (campos: { r: string; v: string; span?: number }[], col0 = 0) => {
    let x = M + col0 * COL, maxL = 1;
    for (const c of campos) {
      const w = COL * (c.span ?? 1);
      rotulo(c.r, x + 1, y + 2.6);
      maxL = Math.max(maxL, valor(c.v, x + 1, y + 5.4, w));
      x += w;
    }
    y += 3.6 + maxL * 3.2;
  };
  const secao = (titulo: string, campos: { r: string; v: string; span?: number }[]) => {
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.line(M, y, M + L, y);
    doc.setFillColor(235, 235, 235); doc.rect(M, y, COL, 5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.3); doc.text(titulo, M + 1, y + 3.5);
    linha(campos, 1);
  };
  const faixa = (texto: string) => {
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.line(M, y, M + L, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(texto, 105, y + 3.2, { align: "center" });
    y += 4.5;
  };

  doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(M - 2, M - 2, L + 4, 297 - 2 * M + 4);

  // cabeçalho
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(0, 110, 60); doc.text("NFS-e", M + 1, y + 7);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(90); doc.text(["Nota Fiscal de", "Serviço eletrônica"], M + 20, y + 4.5);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(["DANFSe v2.0", "Documento Auxiliar da NFS-e"], 105, y + 4, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`Município: ${d.municipioEmissao}`, M + L, y + 3, { align: "right" });
  doc.setFontSize(6.5); doc.text([`Ambiente Gerador: ${d.ambGer}`, `Tipo de Ambiente: ${d.tpAmb}`], M + L - 40, y + 6);
  y += 12;

  // chave + QR
  const qr = await QR.toDataURL(urlConsultaPublica(d.chave), { margin: 0, width: 220, errorCorrectionLevel: "M" });
  doc.addImage(qr, "PNG", M + L - 33, y + 1, 18, 18);
  doc.setFontSize(6); doc.text(doc.splitTextToSize("A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e", COL + 2) as string[], M + 3 * COL - 2, y + 22);
  rotulo("CHAVE DE ACESSO DA NFS-e", M + 1, y + 2.6); valor(d.chave, M + 1, y + 5.4, 3 * COL); y += 7;
  const topo = y;
  linha([{ r: "NÚMERO DA NFS-e", v: d.numero }, { r: "COMPETÊNCIA DA NFS-e", v: d.competencia }, { r: "DATA E HORA DA EMISSÃO DA NFS-e", v: d.emissaoNFSe }]);
  linha([{ r: "NÚMERO DA DPS", v: d.numeroDPS }, { r: "SÉRIE DA DPS", v: d.serieDPS }, { r: "DATA E HORA DA EMISSÃO DA DPS", v: d.emissaoDPS }]);
  linha([{ r: "EMITENTE DA NFS-e", v: d.emitente }, { r: "SITUAÇÃO DA NFS-e", v: d.situacao }, { r: "FINALIDADE", v: VAZIO }]);
  y = Math.max(y, topo + 22);

  const p = d.prestador;
  secao("PRESTADOR / FORNECEDOR", [{ r: "CNPJ / CPF / NIF", v: p.documento }, { r: "Indicador Municipal (Inscrição)", v: p.im }, { r: "Telefone", v: p.fone }]);
  linha([{ r: "Nome / Nome Empresarial", v: p.nome, span: 2 }, { r: "Município / Sigla UF", v: p.municipio }, { r: "Código IBGE / CEP", v: p.ibgeCep }]);
  linha([{ r: "Endereço", v: p.endereco, span: 2 }, { r: "E-mail", v: p.email, span: 2 }]);
  linha([{ r: "Simples Nacional na Data de Competência", v: p.simples }, { r: "Regime de Apuração Tributária pelo SN", v: p.regimeSN, span: 3 }]);

  const t = d.tomador;
  secao("TOMADOR / ADQUIRENTE", [{ r: "CNPJ / CPF / NIF", v: t.documento }, { r: "Indicador Municipal (Inscrição)", v: t.im }, { r: "Telefone", v: t.fone }]);
  linha([{ r: "Nome / Nome Empresarial", v: t.nome, span: 2 }, { r: "Município / Sigla UF", v: t.municipio }, { r: "Código IBGE / CEP", v: t.ibgeCep }]);
  linha([{ r: "Endereço", v: t.endereco, span: 2 }, { r: "E-mail", v: t.email, span: 2 }]);

  faixa("DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");
  faixa("INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");

  const s = d.servico;
  secao("SERVIÇO PRESTADO", [{ r: "Código de Tributação Nacional/Municipal", v: s.codTrib }, { r: "Código da NBS", v: s.nbs }, { r: "Local da Prestação / Sigla UF / País", v: s.local }]);
  if (s.tributacaoNacional) { valor(s.tributacaoNacional, M + 1, y + 2, L); y += 4.5; }
  linha([{ r: "Descrição do Serviço", v: s.descricao, span: 4 }]);

  const i = d.issqn;
  secao("TRIBUTAÇÃO MUNICIPAL (ISSQN)", [{ r: "Tipo de Tributação do ISSQN", v: i.tipo }, { r: "Município / Sigla UF / País de Incidência do ISSQN", v: i.incidencia, span: 2 }]);
  linha([{ r: "BC ISSQN", v: i.bc }, { r: "Alíquota Aplicada", v: i.aliquota }, { r: "Retenção do ISSQN", v: i.retencao }, { r: "ISSQN Apurado", v: i.apurado }]);

  const v = d.valores;
  secao("VALOR TOTAL DA NFS-e", [{ r: "VALOR DA OPERAÇÃO / SERVIÇO", v: v.servico }, { r: "Desconto Incondicionado", v: v.descIncond }, { r: "Desconto Condicionado", v: v.descCond }]);
  linha([{ r: "Total das Retenções (ISSQN / Federais)", v: v.retencoes }, { r: "VALOR LÍQUIDO DA NFS-e", v: v.liquido }]);

  doc.setDrawColor(0); doc.line(M, y, M + L, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("INFORMAÇÕES COMPLEMENTARES", M + 1, y + 3.5); y += 7;
  if (d.complementares) { y += 3.2 * valor(d.complementares, M + 1, y, L); }
  doc.setFont("helvetica", "italic"); doc.setFontSize(6.5); doc.setTextColor(90);
  doc.text(doc.splitTextToSize("DANFSe gerado pelo sistema a partir do XML autorizado da NFS-e (o serviço de PDF do portal nacional estava indisponível). Confira a autenticidade pela chave de acesso ou pelo código QR.", L - 8) as string[], M + 1, y + 2);
  doc.setTextColor(0);

  // rodapé de cientificação, como no oficial
  const yr = 297 - M - 12;
  doc.setDrawColor(0); doc.rect(M + 2, yr, L - 4, 9);
  doc.line(M + 2 + COL, yr, M + 2 + COL, yr + 9); doc.line(M + 2 + 2 * COL, yr, M + 2 + 2 * COL, yr + 9);
  rotulo("DATA CIENTIFICAÇÃO:", M + 3, yr + 3); rotulo("IDENTIFICAÇÃO E ASSINATURA", M + 3 + COL, yr + 3);
  rotulo("N° NFS-e / CHAVE NFS-e", M + 3 + 2 * COL, yr + 3); valor(`${d.numero} / ${d.chave}`, M + 3 + 2 * COL, yr + 6, 2 * COL);

  return doc.output("blob");
}
