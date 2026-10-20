/** Números e valores por extenso para o texto dos contratos ("cento e oitenta", "nove mil reais"). */

const UNID = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze",
  "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEM[c]);
  if (r) partes.push(r < 20 ? UNID[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UNID[r % 10]}` : ""));
  return partes.join(" e ");
}

const ESCALAS: [string, string][] = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];

/** Inteiro ≥ 0 por extenso: 180 → "cento e oitenta", 2026 → "dois mil e vinte e seis". */
export function numeroPorExtenso(valor: number): string {
  let n = Math.floor(Math.abs(valor));
  if (n === 0) return "zero";
  const grupos: number[] = [];
  while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
  const altos: string[] = [];
  for (let i = grupos.length - 1; i >= 1; i--) {
    const g = grupos[i];
    if (!g) continue;
    const [sing, plur] = ESCALAS[i];
    altos.push(i === 1 && g === 1 ? "mil" : `${ate999(g)} ${g === 1 ? sing : plur}`);
  }
  const u = grupos[0];
  if (!u) return altos.join(" ");
  if (!altos.length) return ate999(u);
  // "e" antes das unidades quando < 100 ou centena redonda: dois mil e vinte; mil e quinhentos; mil duzentos e trinta
  return `${altos.join(" ")}${u < 100 || u % 100 === 0 ? " e " : " "}${ate999(u)}`;
}

/** 9000 → "nove mil reais"; 1500.5 → "mil e quinhentos reais e cinquenta centavos". */
export function valorPorExtenso(valor: number): string {
  const centavosTotal = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(centavosTotal / 100), cent = centavosTotal % 100;
  const partes: string[] = [];
  if (reais) {
    const t = numeroPorExtenso(reais);
    // milhão/bilhão redondo pede "de reais"
    partes.push(`${t}${/(milhão|milhões|bilhão|bilhões)$/.test(t) ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (cent) partes.push(`${numeroPorExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ") || "zero reais";
}
