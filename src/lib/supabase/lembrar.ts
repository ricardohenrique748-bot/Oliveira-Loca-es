/* "Lembrar de mim": sem ele, os cookies de sessão do Supabase viram cookies de sessão do navegador */

export const COOKIE_LEMBRAR = "lembrar-sessao";

/** Padrão é lembrar (comportamento anterior); só "0" desliga. */
export const deveLembrar = (valor: string | undefined) => valor !== "0";

/** Remove a validade do cookie para ele expirar ao fechar o navegador. Exclusões (maxAge 0) passam intactas. */
export function opcoesSessao<T extends { maxAge?: number; expires?: Date }>(options: T, lembrar: boolean): T {
  if (lembrar || options.maxAge === 0) return options;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxAge, expires, ...resto } = options;
  return resto as T;
}
