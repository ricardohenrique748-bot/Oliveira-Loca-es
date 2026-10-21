import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { COOKIE_LEMBRAR } from "@/lib/supabase/lembrar";
import { INICIO, MODO_DEMO } from "@/lib/plataforma";

export interface EstadoLogin {
  erro?: string;
  email?: string;
  sucesso?: boolean;
  next?: string;
}

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(6, "Senha muito curta"),
  next: z.string().optional(),
});

export async function entrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const dados = schema.safeParse(Object.fromEntries(form));
  if (!dados.success) return { erro: dados.error.issues[0].message, email: String(form.get("email") ?? "") };

  const lembrar = form.get("lembrar") === "on";
  if (typeof window !== "undefined") {
    localStorage.setItem(COOKIE_LEMBRAR, lembrar ? "1" : "0");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email, password: dados.data.senha });
  if (error) {
    const semConexao = !error.status || error.status >= 500 || /fetch|network|ECONNREFUSED/i.test(error.message);
    return { erro: semConexao ? "Não foi possível conectar ao servidor. Tente novamente em instantes." : "E-mail ou senha incorretos.", email: dados.data.email };
  }

  const next = dados.data.next && dados.data.next.startsWith("/") && !dados.data.next.startsWith("//") ? dados.data.next : INICIO;
  return { sucesso: true, next };
}

export async function sair() {
  const supabase = createClient();
  await supabase.auth.signOut();
  if (typeof window !== "undefined") {
    window.location.href = MODO_DEMO ? "#/login" : "/login";
  }
}
