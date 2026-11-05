/**
 * Placa pode entrar numa fatura avulsa?
 * Livre (disponível / parado), ou "locada" só por outra fatura avulsa (locado_avulsa_ate preenchido) e sem contrato ativo.
 * Sem isso, cada avulsa travava a placa e a próxima avulsa exigia voltar o veículo a "disponível" à mão.
 * Contrato ativo, manutenção, vendido ou "locado" escolhido à mão continuam bloqueando.
 */
export function placaLivreParaAvulsa(v: { status: string; locado_avulsa_ate: string | null }, temContratoAtivo: boolean): boolean {
  if (v.status === "disponivel" || v.status === "parado") return true;
  return v.status === "locado" && !!v.locado_avulsa_ate && !temContratoAtivo;
}
