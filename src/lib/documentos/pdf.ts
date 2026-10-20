"use client";
/**
 * Renderiza documentos (proposta, contrato) descritos como lista de blocos.
 * O conteúdo é montado por funções puras (proposta.ts, contrato.ts) e só aqui vira PDF (jsPDF + autotable), no navegador.
 */
import type { jsPDF as JsPDF } from "jspdf";

export type Bloco =
  | { t: "titulo"; texto: string; sub?: string }
  | { t: "secao"; texto: string }
  | { t: "paragrafo"; texto: string; rotulo?: string; alinhar?: "esquerda" | "centro" | "direita"; negrito?: boolean }
  | { t: "lista"; itens: string[]; marcador?: "letra" | "ponto" }
  | { t: "tabela"; cabecalho?: string[]; linhas: string[][]; direita?: number[]; larguras?: number[]; negritoPrimeira?: boolean }
  /** `preencher`: valores vazios ficam em branco e as linhas ganham altura para escrever à mão (checklist) */
  | { t: "campos"; pares: [string, string][]; colunas?: 1 | 2; preencher?: boolean }
  | { t: "assinaturas"; partes: { titulo: string; linhas: string[] }[] }
  | { t: "espaco"; mm: number }
  | { t: "quebra" };

export interface Documento {
  arquivo: string;
  /** texto à direita do logo no topo de cada página (ex.: "Proposta Comercial Nº PR-001/26") */
  cabecalho: string;
  /** linhas centralizadas no rodapé de cada página (empresa, CNPJ, contato) */
  rodape: string[];
  blocos: Bloco[];
}

// marca: preto e amarelo
const PRETO: [number, number, number] = [11, 11, 11];
const AMARELO: [number, number, number] = [245, 217, 10];
const CINZA: [number, number, number] = [110, 110, 110];

const MARGEM = 18;
const TOPO = 40;
const BASE = 22;
const CORPO = 9.5;
const ENTRELINHA = 4.4;

/** fontes padrão do PDF só têm o alfabeto latino: troca símbolos que sairiam como lixo (o espaço não separável fica: segura "nº" junto do número) */
export function limparTexto(s: string): string {
  return s.replace(/[⬤●◆■▪]/g, "•").replace(/[≤]/g, "<=").replace(/[≥]/g, ">=");
}

let logo: Promise<string | null> | null = null;
/** logo da marca sem a margem branca do arquivo original (1366×768) */
function carregarLogo(): Promise<string | null> {
  logo ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const [x, y, w, h] = [150, 70, 1070, 620].map((v, i) => Math.round(v * (i % 2 ? img.height / 768 : img.width / 1366)));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => resolve(null);
    img.src = "/marca/logo-documento.jpg";
  });
  return logo;
}

export async function baixarDocumentoPDF(d: Documento) {
  const doc = await renderizarPDF(d, await carregarLogo());
  doc.save(`${d.arquivo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_")}.pdf`);
}

/** desenha o documento; `imgLogo` é um data URL JPEG (sem ele, sai o nome da marca em texto) */
export async function renderizarPDF(d: Documento, imgLogo: string | null): Promise<JsPDF> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc: JsPDF = new jsPDF({ unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  const util = larg - 2 * MARGEM;
  const limite = alt - BASE;
  let y = TOPO;

  const fonte = (estilo: "normal" | "bold" = "normal", tam = CORPO, cor: [number, number, number] = [25, 25, 25]) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
  };
  const garantir = (h: number) => {
    if (y + h > limite) { doc.addPage(); y = TOPO; }
  };
  const linhas = (texto: string, w: number) => doc.splitTextToSize(limparTexto(texto), w) as string[];
  const fimTabela = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const tabelaBase = { margin: { left: MARGEM, right: MARGEM, top: TOPO, bottom: BASE }, styles: { fontSize: 8.5, cellPadding: 1.8, textColor: 25, lineColor: 190, lineWidth: 0.2 } };

  for (const b of d.blocos) {
    switch (b.t) {
      case "titulo": {
        garantir(14);
        fonte("bold", 13, PRETO);
        for (const l of linhas(b.texto, util)) { doc.text(l, larg / 2, y, { align: "center" }); y += 6; }
        if (b.sub) { fonte("normal", 8.5, CINZA); doc.text(limparTexto(b.sub), larg / 2, y, { align: "center" }); y += 5; }
        y += 2;
        break;
      }
      case "secao": {
        garantir(16); // não deixa o título sozinho no pé da página
        y += 1.5;
        doc.setFillColor(...PRETO);
        doc.rect(MARGEM, y - 4.2, util, 6.2, "F");
        fonte("bold", 9.5, AMARELO);
        doc.text(limparTexto(b.texto.toUpperCase()), MARGEM + 2, y);
        y += 6;
        break;
      }
      case "paragrafo": {
        const x = b.alinhar === "centro" ? larg / 2 : b.alinhar === "direita" ? larg - MARGEM : MARGEM;
        if (b.rotulo) {
          // rótulo em negrito na mesma linha; o resto quebra na largura que sobrar
          fonte("bold");
          const rot = limparTexto(b.rotulo) + " ";
          const wRot = doc.getTextWidth(rot);
          fonte();
          const [primeira = "", ...resto] = linhas(b.texto, util - wRot);
          const demais = resto.length ? linhas(resto.join(" "), util) : [];
          garantir(ENTRELINHA * (1 + Math.min(demais.length, 2)));
          fonte("bold");
          doc.text(rot, MARGEM, y);
          fonte();
          doc.text(primeira, MARGEM + wRot, y);
          y += ENTRELINHA;
          for (const l of demais) { garantir(ENTRELINHA); doc.text(l, MARGEM, y); y += ENTRELINHA; }
        } else {
          fonte(b.negrito ? "bold" : "normal");
          const ls = linhas(b.texto, util);
          garantir(ENTRELINHA * Math.min(ls.length, 3));
          for (const l of ls) {
            garantir(ENTRELINHA);
            doc.text(l, x, y, { align: b.alinhar === "centro" ? "center" : b.alinhar === "direita" ? "right" : "left" });
            y += ENTRELINHA;
          }
        }
        y += 1.6;
        break;
      }
      case "lista": {
        fonte();
        b.itens.forEach((item, i) => {
          const marca = b.marcador === "letra" ? `${String.fromCharCode(65 + i)} –` : "•";
          const ls = linhas(item, util - 8);
          garantir(ENTRELINHA * Math.min(ls.length, 2));
          fonte("bold");
          doc.text(marca, MARGEM + 1, y);
          fonte();
          for (const l of ls) { garantir(ENTRELINHA); doc.text(l, MARGEM + 8, y); y += ENTRELINHA; }
          y += 0.8;
        });
        y += 1;
        break;
      }
      case "tabela": {
        autoTable(doc, {
          ...tabelaBase,
          startY: y - 3, // y é a linha de base do próximo texto; a tabela começa no topo
          theme: "grid",
          head: b.cabecalho ? [b.cabecalho.map(limparTexto)] : undefined,
          body: b.linhas.map((l) => l.map(limparTexto)),
          headStyles: { fillColor: PRETO, textColor: AMARELO, fontStyle: "bold" },
          columnStyles: Object.fromEntries(Array.from({ length: Math.max(b.cabecalho?.length ?? 0, ...b.linhas.map((l) => l.length)) }, (_, i) => [i, {
            halign: b.direita?.includes(i) ? "right" : "left",
            ...(b.larguras?.[i] ? { cellWidth: b.larguras[i] } : {}),
            ...(i === 0 && b.negritoPrimeira ? { fontStyle: "bold" } : {}),
          }])),
        });
        y = fimTabela() + 4;
        break;
      }
      case "campos": {
        const cols = b.colunas ?? 1;
        const corpo: string[][] = [];
        for (let i = 0; i < b.pares.length; i += cols) {
          corpo.push(b.pares.slice(i, i + cols).flatMap(([k, v]) => [limparTexto(k), limparTexto(v || (b.preencher ? "" : "—"))]));
        }
        autoTable(doc, {
          ...tabelaBase,
          startY: y - 3, // y é a linha de base do próximo texto; a tabela começa no topo
          theme: "grid",
          body: corpo,
          bodyStyles: b.preencher ? { minCellHeight: 8, valign: "middle" } : undefined,
          columnStyles: cols === 2
            ? { 0: { fontStyle: "bold", fillColor: [244, 244, 244], cellWidth: 30 }, 2: { fontStyle: "bold", fillColor: [244, 244, 244], cellWidth: 30 } }
            : { 0: { fontStyle: "bold", fillColor: [244, 244, 244], cellWidth: 48 } },
        });
        y = fimTabela() + 4;
        break;
      }
      case "assinaturas": {
        const porLinha = 2;
        const w = (util - 10) / porLinha;
        for (let i = 0; i < b.partes.length; i += porLinha) {
          const grupo = b.partes.slice(i, i + porLinha);
          const h = 16 + 4 * Math.max(...grupo.map((p) => p.linhas.length + 1));
          garantir(h);
          y += 12;
          grupo.forEach((p, j) => {
            const x = MARGEM + j * (w + 10);
            doc.setDrawColor(60);
            doc.setLineWidth(0.3);
            doc.line(x, y, x + w, y);
            fonte("bold", 8.5);
            doc.text(limparTexto(p.titulo), x + w / 2, y + 4, { align: "center" });
            fonte("normal", 8);
            p.linhas.forEach((l, k) => doc.text(limparTexto(l), x + w / 2, y + 8 + 4 * k, { align: "center" }));
          });
          y += h - 12;
        }
        break;
      }
      case "espaco":
        y += b.mm;
        break;
      case "quebra":
        doc.addPage();
        y = TOPO;
        break;
    }
  }

  // cabeçalho e rodapé em todas as páginas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (imgLogo) doc.addImage(imgLogo, "JPEG", MARGEM, 8, 34, 20);
    else { fonte("bold", 14, PRETO); doc.text("OLIVEIRA LOCAÇÕES", MARGEM, 20); }
    fonte("bold", 10, PRETO);
    doc.text(limparTexto(d.cabecalho), larg - MARGEM, 20, { align: "right" });
    doc.setFillColor(...AMARELO);
    doc.rect(MARGEM, 29.5, util, 1.2, "F");

    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(MARGEM, alt - 17, larg - MARGEM, alt - 17);
    fonte("normal", 7.5, CINZA);
    d.rodape.forEach((l, i) => doc.text(limparTexto(l), larg / 2, alt - 13 + 3.6 * i, { align: "center" }));
    doc.text(`Página ${p} de ${total}`, larg - MARGEM, alt - 6, { align: "right" });
  }
  return doc;
}
