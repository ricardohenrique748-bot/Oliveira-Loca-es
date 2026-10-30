/**
 * Leitura de multas a partir do PDF "Detalhes da Infração" (Carteira Digital de Trânsito / SENATRAN).
 * PDF com texto (Chrome "Salvar como PDF") é lido direto; PDF só com desenho/imagem
 * ("Microsoft Print to PDF", escaneado) passa por OCR em português (tesseract.js, carregado sob demanda).
 */

export type MultaLida = {
  placa: string | null;
  descricao: string | null;
  orgao: string | null;
  local: string | null;
  data_infracao: string | null;
  hora: string | null;
  auto_infracao: string | null;
  codigo: string | null;
  renainf: string | null;
  valor: number | null;
  pontos: number | null;
  notificacao_autuacao: string | null;
  limite_defesa: string | null;
  limite_condutor: string | null;
  notificacao_penalidade: string | null;
  limite_recurso: string | null;
  vencimento_desconto: string | null;
};

// ---------- interpretação do texto (puro, testável) ----------

const DATA = String.raw`(\d{2})\s*/\s*(\d{2})\s*/\s*(\d{4})`;

function iso(d: string, m: string, a: string) {
  return `${a}-${m}-${d}`;
}

/** primeira data depois do rótulo (aceita quebra de linha entre os dois) */
function dataApos(texto: string, rotulo: string): string | null {
  const r = new RegExp(rotulo + String.raw`[^\d]{0,60}?` + DATA, "i").exec(texto);
  return r ? iso(r[1], r[2], r[3]) : null;
}

/** resto da linha do rótulo */
function linhaApos(texto: string, rotulo: string): string | null {
  const r = new RegExp(rotulo + String.raw`\s*:?\s*(.+)`, "i").exec(texto);
  return r ? r[1].trim() || null : null;
}

/** letras que o OCR confunde com dígitos, em campos que só têm número */
const PARA_DIGITO: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", "|": "1", Z: "2", S: "5", B: "8", G: "6" };
const PARA_LETRA: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G" };
const digitos = (s: string) => s.toUpperCase().split("").map((c) => PARA_DIGITO[c] ?? c).join("");

/** placa antiga (ABC1234) ou Mercosul (ABC1D23), corrigindo trocas do OCR por posição */
export function normalizarPlaca(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const s = bruto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 7) return null;
  const letra = (c: string) => PARA_LETRA[c] ?? c;
  const dig = (c: string) => PARA_DIGITO[c] ?? c;
  const p = [letra(s[0]), letra(s[1]), letra(s[2]), dig(s[3]), s[4], dig(s[5]), dig(s[6])].join("");
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) ? p : null;
}

/** auto de infração: prefixo de letras (série) + número; dígitos lidos como letra são corrigidos */
function normalizarAuto(bruto: string | null): string | null {
  if (!bruto) return null;
  const s = bruto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^([A-Z]{1,3}?)([A-Z0-9]{5,})$/.exec(s);
  if (!m) return s || null;
  // o número depois da série é só dígitos; "NOO4944747" → "N004944747"
  const corpo = digitos(m[2]);
  return /^\d+$/.test(corpo) ? m[1] + corpo : s;
}

/** "R$ 880,41", "880.41", e "88041" (OCR que perde a vírgula: os 2 últimos dígitos são centavos) */
function lerValor(bruto: string | null): number | null {
  if (!bruto) return null;
  const s = bruto.replace(/\s/g, "");
  const m = /(\d{1,3}(?:\.\d{3})*|\d+)[,.](\d{2})(?!\d)/.exec(s);
  if (m) return Number(m[1].replace(/\./g, "") + "." + m[2]);
  const d = s.replace(/\D/g, "");
  return d.length >= 3 ? Number(d) / 100 : null;
}

/** valores base do CTB (art. 258) por gravidade; multas com fator (×2, ×3, ×5, ×10…) mantêm os pontos da gravidade */
const BASE_PONTOS: [number, number][] = [[88.38, 3], [130.16, 4], [195.23, 5], [293.47, 7]];
export function pontosPorValor(valor: number | null): number | null {
  if (!valor) return null;
  for (const [base, pontos] of BASE_PONTOS) {
    const fator = valor / base;
    const inteiro = Math.round(fator);
    if (inteiro >= 1 && Math.abs(valor - base * inteiro) < 0.05) return pontos;
  }
  return null;
}

export function interpretarMulta(texto: string): MultaLida | null {
  const t = texto.replace(/\r/g, "");
  if (!/Auto\s+de\s+Infra/i.test(t) && !/RENAINF/i.test(t)) return null;

  // descrição: entre o título e a "Placa à época" (o ícone vira 1 letra solta no OCR)
  let descricao: string | null = null;
  const bloco = /Detalhes\s+da\s+Infra[çc][ãa]o([\s\S]*?)Placa\s+[àa]\s+[ée]poca/i.exec(t)?.[1] ?? "";
  const linhas = bloco.split("\n").map((l) => l.trim().replace(/^[^A-Za-zÀ-ú]*(?:[A-Za-z]\s+(?=[A-ZÀ-Ú]{3}))?/, "").trim()).filter((l) => l.length > 3);
  if (linhas.length) descricao = linhas.join(" ").replace(/\s+/g, " ");

  const placaBruta = /Placa\s+[àa]\s+[ée]poca\s+da\s+infra[çc][ãa]o\s*:?\s*([A-Z0-9][A-Z0-9 -]{5,8})/i.exec(t)?.[1] ?? null;
  const orgaoBruto = linhaApos(t, String.raw`[ÓO]rg[ãa]o\s+Autuador`);
  // "000100 - POLICIA RODOVIARIA FEDERAL" → código com OCR corrigido
  const orgao = orgaoBruto ? orgaoBruto.replace(/^([A-Z0-9]{4,8})(\s*-\s*)/i, (_, c: string, sep: string) => digitos(c) + sep) : null;
  const cometimento = new RegExp(String.raw`Cometimento\s+da\s+Infra[çc][ãa]o[^\d]{0,20}` + DATA + String.raw`(?:\s+(\d{2}:\d{2}))?`, "i").exec(t);
  const autoBruto = /Auto\s+de\s+Infra[çc][ãa]o\s*:?\s*([^\s\n]+)/i.exec(t)?.[1] ?? null;
  const codigoBruto = /C[óo]digo\s+da\s+Infra[çc][ãa]o\s*:?\s*([0-9OIl|SB]{3,4})\s*-?\s*([0-9OIl|SB])/i.exec(t);
  const renainf = /RENAINF\s*:?\s*([0-9OIl|]{6,})/i.exec(t)?.[1] ?? null;
  const valor = lerValor(/Valor\s+Original[^\d]{0,15}([\d.,\s]+\d)/i.exec(t)?.[1] ?? null);

  return {
    placa: normalizarPlaca(placaBruta),
    descricao,
    orgao,
    local: linhaApos(t, String.raw`Local\s+da\s+Infra[çc][ãa]o`),
    data_infracao: cometimento ? iso(cometimento[1], cometimento[2], cometimento[3]) : null,
    hora: cometimento?.[4] ?? null,
    auto_infracao: normalizarAuto(autoBruto),
    codigo: codigoBruto ? `${digitos(codigoBruto[1])}-${digitos(codigoBruto[2])}` : null,
    renainf: renainf ? digitos(renainf) : null,
    valor,
    pontos: pontosPorValor(valor),
    notificacao_autuacao: dataApos(t, String.raw`Notifica[çc][ãa]o\s+de\s+Autua[çc][ãa]o`),
    limite_defesa: dataApos(t, String.raw`Defesa(?:\s+Pr[ée]via)?`),
    limite_condutor: dataApos(t, String.raw`Identifica[çc][ãa]o\s+do(?:\s+Condutor(?:\s+Infrator)?)?`),
    notificacao_penalidade: dataApos(t, String.raw`Notifica[çc][ãa]o\s+de\s+Penalidade`),
    limite_recurso: dataApos(t, String.raw`Interposi[çc][ãa]o\s+de\s+Recurso`),
    vencimento_desconto: dataApos(t, String.raw`Vencimento\s+do\s+Desconto`),
  };
}

// ---------- extração do PDF (navegador) ----------

type ItemTexto = { str: string; transform: number[] };

/** texto de cada página; páginas sem texto (impressão em desenho/escaneado) passam por OCR */
export async function textoDasPaginas(arquivo: File, aoProgredir?: (msg: string) => void): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;

  const paginas: string[] = [];
  let ocr: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const conteudo = await pagina.getTextContent();
      const texto = juntarLinhas(conteudo.items as ItemTexto[]);
      if (texto.replace(/\s/g, "").length > 40) { paginas.push(texto); continue; }

      aoProgredir?.(`Lendo imagem da página ${n}/${doc.numPages}…`);
      const vp = pagina.getViewport({ scale: 3 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
      if (!ocr) {
        aoProgredir?.("Preparando leitura (OCR)…");
        const { createWorker } = await import("tesseract.js");
        ocr = await createWorker("por");
      }
      const { data } = await ocr.recognize(canvas);
      paginas.push(data.text);
    }
  } finally {
    await ocr?.terminate();
    await doc.destroy();
  }
  return paginas;
}

/** junta os pedaços de texto do pdf.js em linhas (mesma altura = mesma linha) */
function juntarLinhas(itens: ItemTexto[]): string {
  const linhas: { y: number; partes: { x: number; s: string }[] }[] = [];
  for (const it of itens) {
    if (!it.str?.trim()) continue;
    const [x, y] = [it.transform[4], it.transform[5]];
    const l = linhas.find((l) => Math.abs(l.y - y) < 3);
    if (l) l.partes.push({ x, s: it.str }); else linhas.push({ y, partes: [{ x, s: it.str }] });
  }
  return linhas.sort((a, b) => b.y - a.y).map((l) => l.partes.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ")).join("\n");
}
