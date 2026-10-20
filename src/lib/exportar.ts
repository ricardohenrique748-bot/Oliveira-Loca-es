"use client";
/** Exportação de listagens: CSV, XLSX (SheetJS) e PDF (jsPDF + autotable). Roda no navegador (no app Android, compartilha). */
import { entregarArquivo } from "@/lib/plataforma";

export interface ColunaExport<T> {
  titulo: string;
  valor: (linha: T) => string | number | null | undefined;
  /** formato numérico no XLSX */
  tipo?: "texto" | "moeda" | "numero" | "data";
  largura?: number;
}

function nomeArquivo(base: string, ext: string) {
  const d = new Date().toISOString().slice(0, 10);
  return `${base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_")}_${d}.${ext}`;
}

function baixar(blob: Blob, nome: string) {
  return entregarArquivo(blob, nome);
}

/** "2026-10-16" → Date local (para célula de data no Excel) */
function paraData(v: unknown): Date | unknown {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split("-").map(Number);
    return new Date(a, m - 1, d);
  }
  return v;
}

export function exportarCSV<T>(nome: string, colunas: ColunaExport<T>[], linhas: T[]) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? v.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 2 }) : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [colunas.map((c) => esc(c.titulo)).join(";"), ...linhas.map((l) => colunas.map((c) => esc(c.valor(l))).join(";"))].join("\r\n");
  baixar(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), nomeArquivo(nome, "csv"));
}

export async function exportarXLSX<T>(nome: string, colunas: ColunaExport<T>[], linhas: T[], abas?: { nome: string; linhas: T[] }[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const montar = (rows: T[]) => {
    const dados = rows.map((l) => colunas.map((c) => (c.tipo === "data" ? paraData(c.valor(l)) : c.valor(l)) ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([colunas.map((c) => c.titulo), ...dados], { cellDates: true });
    ws["!cols"] = colunas.map((c) => ({ wch: c.largura ?? Math.max(10, c.titulo.length + 2) }));
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    colunas.forEach((c, ci) => {
      const fmt = c.tipo === "moeda" ? '"R$" #,##0.00' : c.tipo === "numero" ? "#,##0.##" : c.tipo === "data" ? "dd/mm/yyyy" : null;
      if (!fmt) return;
      for (let r = 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
        if (cell && (cell.t === "n" || cell.t === "d")) cell.z = fmt;
      }
    });
    return ws;
  };
  if (abas?.length) abas.forEach((a) => XLSX.utils.book_append_sheet(wb, montar(a.linhas), a.nome.slice(0, 31)));
  else XLSX.utils.book_append_sheet(wb, montar(linhas), nome.slice(0, 31));
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  baixar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nomeArquivo(nome, "xlsx"));
}

export interface OpcoesPDF {
  subtitulo?: string;
  paisagem?: boolean;
  /** linhas de resumo exibidas antes da tabela */
  resumo?: [string, string][];
  rodape?: string[];
  totais?: (string | number)[];
}

export async function exportarPDF<T>(nome: string, titulo: string, colunas: ColunaExport<T>[], linhas: T[], op: OpcoesPDF = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: op.paisagem ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  // cabeçalho preto/amarelo da marca
  doc.setFillColor(11, 11, 11);
  doc.rect(0, 0, larg, 20, "F");
  doc.setTextColor(245, 217, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("OLIVEIRA LOCAÇÕES", 10, 9);
  doc.setFontSize(10);
  doc.text(titulo, 10, 15);
  doc.setTextColor(200, 200, 200);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, larg - 10, 15, { align: "right" });

  let y = 27;
  doc.setTextColor(20, 20, 20);
  if (op.subtitulo) {
    doc.setFontSize(10);
    doc.text(op.subtitulo, 10, y);
    y += 6;
  }
  if (op.resumo?.length) {
    doc.setFontSize(9);
    for (const [k, v] of op.resumo) {
      doc.setFont("helvetica", "bold");
      doc.text(`${k}:`, 10, y);
      doc.setFont("helvetica", "normal");
      doc.text(v, 52, y);
      y += 5;
    }
    y += 2;
  }
  const fmt = (c: ColunaExport<T>, v: unknown) => {
    if (v === null || v === undefined || v === "") return "";
    if (c.tipo === "moeda" && typeof v === "number") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (c.tipo === "numero" && typeof v === "number") return v.toLocaleString("pt-BR");
    if (c.tipo === "data" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10).split("-").reverse().join("/");
    // fontes padrão do PDF não têm o sinal de menos matemático
    return String(v).replace(/−/g, "-");
  };
  autoTable(doc, {
    startY: y,
    head: [colunas.map((c) => c.titulo)],
    body: linhas.map((l) => colunas.map((c) => fmt(c, c.valor(l)))),
    foot: op.totais ? [op.totais.map((t, i) => (typeof t === "number" ? fmt(colunas[i], t) : t))] : undefined,
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [11, 11, 11], textColor: [245, 217, 10] },
    footStyles: { fillColor: [245, 217, 10], textColor: [11, 11, 11], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 247, 247] },
    columnStyles: Object.fromEntries(colunas.map((c, i) => [i, { halign: c.tipo === "moeda" || c.tipo === "numero" ? "right" : "left" }])),
    margin: { left: 10, right: 10 },
  });
  if (op.rodape?.length) {
    // @ts-expect-error lastAutoTable é injetado pelo plugin
    let fy = (doc.lastAutoTable?.finalY ?? y) + 8;
    doc.setFontSize(9);
    for (const r of op.rodape) {
      doc.text(r, 10, fy);
      fy += 5;
    }
  }
  await baixar(doc.output("blob"), nomeArquivo(nome, "pdf"));
}
