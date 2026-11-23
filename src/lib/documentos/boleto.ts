"use client";
/**
 * Boleto em PDF desenhado no navegador, para bancos cuja API não devolve o PDF (Itaú) ou quando o banco recusa (Sicredi).
 * Layout Febraban simplificado: recibo do pagador + ficha de compensação com código de barras
 * (intercalado 2 de 5) e, quando houver, o QR Code PIX (BoleCode).
 * Os dados vêm prontos da Edge Function (acao "pdf" → { dados }).
 */
import { formatBRL, formatData, maskCpfCnpj } from "@/lib/format";
import { entregarArquivo } from "@/lib/plataforma";

export interface DadosBoletoPDF {
  banco: string;
  ambiente: "sandbox" | "producao";
  beneficiario: { nome: string; documento: string; endereco: string };
  agencia_conta: string;
  carteira: string | null;
  pagador: { nome: string; documento: string; endereco: string };
  nosso_numero: string;
  seu_numero: string;
  valor: number;
  vencimento: string;
  emissao: string;
  linha_digitavel: string;
  codigo_barras: string | null;
  pix_copia_cola: string | null;
  instrucoes: string[];
}

const CODIGO_BANCO: Record<string, string> = { "Itaú": "341-7", Sicredi: "748-X" };

/** 47 dígitos → "34191.09008 00000.123456 ..." */
export function formatarLinhaDigitavel(l: string) {
  const d = l.replace(/\D/g, "");
  if (d.length !== 47) return l;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
}

/** código de barras (44) a partir da linha digitável (47): banco+moeda, DV, fator+valor, campo livre */
export function barrasDaLinha(linha: string): string {
  const d = linha.replace(/\D/g, "");
  if (d.length !== 47) return "";
  return d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
}

// intercalado 2 de 5: n = estreita, w = larga
const I25 = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];

/** larguras alternadas barra/espaço (em unidades estreitas), começando por barra */
export function barrasI25(codigo: string, larga = 3): number[] {
  if (!/^\d+$/.test(codigo) || codigo.length % 2) return [];
  const w = (c: string) => (c === "w" ? larga : 1);
  const r = [1, 1, 1, 1]; // início: barra, espaço, barra, espaço estreitos
  for (let i = 0; i < codigo.length; i += 2) {
    const barras = I25[Number(codigo[i])], espacos = I25[Number(codigo[i + 1])];
    for (let k = 0; k < 5; k++) r.push(w(barras[k]), w(espacos[k]));
  }
  r.push(larga, 1, 1); // fim: barra larga, espaço, barra
  return r;
}

export async function gerarBoletoPDF(d: DadosBoletoPDF): Promise<Blob> {
  const [{ jsPDF }, QR] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 10, L = 190;
  const codBanco = CODIGO_BANCO[d.banco] ?? "";
  const linha = formatarLinhaDigitavel(d.linha_digitavel);
  const docFmt = (s: string) => (s ? maskCpfCnpj(s) : "");

  const caixa = (x: number, y: number, w: number, h: number, rotulo: string, valor: string, opts: { direita?: boolean; negrito?: boolean } = {}) => {
    doc.setDrawColor(0); doc.setLineWidth(0.2); doc.rect(x, y, w, h);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.text(rotulo, x + 1, y + 2.5);
    doc.setFont("helvetica", opts.negrito ? "bold" : "normal"); doc.setFontSize(8.5);
    const linhas = doc.splitTextToSize(valor, w - 2) as string[];
    doc.text(linhas.slice(0, Math.max(1, Math.floor((h - 3) / 3.4))), opts.direita ? x + w - 1 : x + 1, y + 6, { align: opts.direita ? "right" : "left" });
  };
  const cabecalhoBanco = (y: number, direita: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(d.banco, M, y + 6);
    doc.setLineWidth(0.5); doc.line(M + 30, y, M + 30, y + 8); doc.line(M + 52, y, M + 52, y + 8);
    doc.setFontSize(13); doc.text(codBanco, M + 41, y + 6, { align: "center" });
    doc.setFontSize(direita === linha ? 10 : 9); doc.text(direita, M + L, y + 6, { align: "right" });
    doc.setLineWidth(0.5); doc.line(M, y + 8, M + L, y + 8);
  };

  let y = M;
  if (d.ambiente === "sandbox") {
    doc.setTextColor(200, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("AMBIENTE DE TESTES — ESTE BOLETO NÃO VALE PARA PAGAMENTO", M + L / 2, y + 3, { align: "center" });
    doc.setTextColor(0); y += 6;
  }

  // ---------- recibo do pagador ----------
  cabecalhoBanco(y, "Recibo do Pagador");
  y += 10;
  caixa(M, y, 120, 9, "Beneficiário", `${d.beneficiario.nome}  ${docFmt(d.beneficiario.documento)}`);
  caixa(M + 120, y, 35, 9, "Agência / Código do beneficiário", d.agencia_conta);
  caixa(M + 155, y, 35, 9, "Vencimento", formatData(d.vencimento), { direita: true, negrito: true });
  y += 9;
  caixa(M, y, 120, 9, "Pagador", `${d.pagador.nome}  ${docFmt(d.pagador.documento)}`);
  caixa(M + 120, y, 35, 9, "Nosso número", `${d.carteira ?? ""}/${d.nosso_numero}`);
  caixa(M + 155, y, 35, 9, "Valor do documento", formatBRL(d.valor), { direita: true, negrito: true });
  y += 9;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(`Linha digitável: ${linha}`, M, y + 4);
  y += 8;
  doc.setLineDashPattern([1, 1], 0); doc.setLineWidth(0.2); doc.line(M, y, M + L, y); doc.setLineDashPattern([], 0);
  doc.setFontSize(6); doc.text("Corte na linha pontilhada", M + L, y - 1, { align: "right" });
  y += 6;

  // ---------- ficha de compensação ----------
  cabecalhoBanco(y, linha);
  y += 10;
  const W1 = 145, W2 = L - W1;
  caixa(M, y, W1, 9, "Local de pagamento", `Pagável em qualquer banco ou correspondente até o vencimento. Após o vencimento, no ${d.banco} ou pelo app.`);
  caixa(M + W1, y, W2, 9, "Vencimento", formatData(d.vencimento), { direita: true, negrito: true });
  y += 9;
  caixa(M, y, W1, 9, "Beneficiário", `${d.beneficiario.nome}  ${docFmt(d.beneficiario.documento)}${d.beneficiario.endereco ? ` - ${d.beneficiario.endereco}` : ""}`);
  caixa(M + W1, y, W2, 9, "Agência / Código do beneficiário", d.agencia_conta, { direita: true });
  y += 9;
  caixa(M, y, 30, 9, "Data do documento", formatData(d.emissao));
  caixa(M + 30, y, 40, 9, "Nº do documento", d.seu_numero);
  caixa(M + 70, y, 25, 9, "Espécie doc.", "DM");
  caixa(M + 95, y, 15, 9, "Aceite", "N");
  caixa(M + 110, y, 35, 9, "Data processamento", formatData(d.emissao));
  caixa(M + W1, y, W2, 9, "Nosso número", `${d.carteira ?? ""}/${d.nosso_numero}`, { direita: true });
  y += 9;
  caixa(M, y, 30, 9, "Uso do banco", "");
  caixa(M + 30, y, 20, 9, "Carteira", d.carteira ?? "");
  caixa(M + 50, y, 20, 9, "Espécie", "R$");
  caixa(M + 70, y, 40, 9, "Quantidade", "");
  caixa(M + 110, y, 35, 9, "Valor", "");
  caixa(M + W1, y, W2, 9, "(=) Valor do documento", formatBRL(d.valor), { direita: true, negrito: true });
  y += 9;
  const hInstr = 36;
  caixa(M, y, W1, hInstr, "Instruções (texto de responsabilidade do beneficiário)", d.instrucoes.join("\n"));
  const rotulos = ["(-) Desconto / Abatimento", "(+) Mora / Multa", "(=) Valor cobrado"];
  rotulos.forEach((r, i) => caixa(M + W1, y + i * (hInstr / 3), W2, hInstr / 3, r, ""));
  y += hInstr;
  caixa(M, y, L, 14, "Pagador", `${d.pagador.nome}  ${docFmt(d.pagador.documento)}\n${d.pagador.endereco}`);
  y += 16;

  // código de barras Febraban: 44 dígitos = 405 unidades ≈ 103 mm, 13 mm de altura
  const barras = barrasI25(d.codigo_barras && d.codigo_barras.length === 44 ? d.codigo_barras : barrasDaLinha(d.linha_digitavel));
  let x = M;
  const u = 0.254;
  doc.setFillColor(0, 0, 0);
  barras.forEach((largura, i) => { if (i % 2 === 0) doc.rect(x, y, largura * u, 13, "F"); x += largura * u; });
  doc.setFontSize(6); doc.text("Autenticação mecânica - Ficha de Compensação", M + L, y + 16, { align: "right" });

  // QR Code PIX abaixo da ficha (BoleCode)
  if (d.pix_copia_cola) {
    const img = await QR.toDataURL(d.pix_copia_cola, { margin: 0, width: 300 });
    const q = 32, qy = y + 22;
    doc.addImage(img, "PNG", M, qy, q, q);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Pague com PIX", M + q + 5, qy + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text("Aponte a câmera do app do seu banco para o QR Code ou use o PIX copia e cola:", M + q + 5, qy + 11);
    doc.setFontSize(6.5);
    doc.text(doc.splitTextToSize(d.pix_copia_cola, L - q - 5) as string[], M + q + 5, qy + 15);
  }

  return doc.output("blob");
}

export async function baixarBoletoPDF(d: DadosBoletoPDF) {
  await entregarArquivo(await gerarBoletoPDF(d), `boleto-${d.nosso_numero}.pdf`);
}
