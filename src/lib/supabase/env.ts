import { servidorSalvo } from "@/lib/plataforma";

/** Variáveis públicas do Supabase; null quando o .env.local ainda não foi preenchido. No app comercial, o servidor escolhido no aparelho vem primeiro. */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const salvo = servidorSalvo();
  if (salvo) return salvo;
  const metaEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {} as Record<string, string>;
  const procEnv = typeof process !== "undefined" && process.env ? process.env : {} as Record<string, string>;

  const url = (
    metaEnv.VITE_SUPABASE_URL ||
    metaEnv.NEXT_PUBLIC_SUPABASE_URL ||
    procEnv.VITE_SUPABASE_URL ||
    procEnv.NEXT_PUBLIC_SUPABASE_URL
  )?.trim();

  const anonKey = (
    metaEnv.VITE_SUPABASE_ANON_KEY ||
    metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    procEnv.VITE_SUPABASE_ANON_KEY ||
    procEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!url || !anonKey || !/^https?:\/\//.test(url)) return null;
  return { url, anonKey };
}

export function exigirSupabaseEnv(): { url: string; anonKey: string } {
  const env = supabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase não configurado: preencha NEXT_PUBLIC_SUPABASE_URL (ou VITE_SUPABASE_URL) e NEXT_PUBLIC_SUPABASE_ANON_KEY (ou VITE_SUPABASE_ANON_KEY) no .env.local."
    );
  }
  return env;
}
