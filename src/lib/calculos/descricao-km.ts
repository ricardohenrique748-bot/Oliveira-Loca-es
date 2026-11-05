/**
 * Descrição do item de km da fatura avulsa, a partir da descrição do serviço:
 * "LOCAÇÃO MUNCK- 07:00h as 13:30h" → "DESLOCAMENTO MUNCK- 07:00h as 13:30h - KM rodado".
 * Troca "locação" (com ou sem acento) por "deslocamento", no mesmo caso; sem a palavra, começa com "Deslocamento".
 */
export function descricaoKm(servico: string): string {
  const s = servico.trim();
  const re = /loca[cç][aã]o/i;
  const m = s.match(re);
  let base: string;
  if (!m) base = s ? `Deslocamento - ${s}` : "Deslocamento";
  else {
    const palavra = m[0] === m[0].toUpperCase() ? "DESLOCAMENTO" : m[0][0] === "L" ? "Deslocamento" : "deslocamento";
    base = s.replace(re, palavra);
  }
  return `${base} - KM rodado`;
}
