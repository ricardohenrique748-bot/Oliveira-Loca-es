/**
 * Substitui `@/lib/supabase/client` no build de demonstração (alias no vite.config.ts):
 * mesmo supabase-js, mas as requisições vão para o Postgres embutido e o login é automático (admin).
 */
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { banco, USUARIO_DEMO } from "./banco";

type Evento = "SIGNED_IN" | "SIGNED_OUT";
type Ouvinte = (evento: Evento, sessao: unknown) => void;

const URL_DEMO = "https://demo.oliveira.local";
const ouvintes = new Set<Ouvinte>();
let logado = true;

const usuario = {
  id: USUARIO_DEMO.id,
  email: USUARIO_DEMO.email,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const sessao = () => ({ access_token: "demo", refresh_token: "demo", token_type: "bearer", expires_in: 3600, user: usuario });
const emitir = (e: Evento) => ouvintes.forEach((o) => setTimeout(() => o(e, e === "SIGNED_IN" ? sessao() : null)));

async function fetchDemo(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(entrada, init);
  const url = new URL(req.url);
  if (!url.pathname.includes("/rest/v1/")) {
    return new Response(JSON.stringify({ message: "Indisponível na demonstração" }), { status: 400 });
  }
  const { rest } = await banco();
  const corpo = req.method === "GET" || req.method === "HEAD" ? null : await req.text();
  return rest.atender(req.method, url, req.headers, corpo);
}

// anexos ficam só na memória do navegador
const arquivos = new Map<string, Blob>();
const storage = {
  from: (bucket: string) => ({
    upload: async (caminho: string, arquivo: Blob) => {
      arquivos.set(`${bucket}/${caminho}`, arquivo);
      return { data: { path: caminho }, error: null };
    },
    createSignedUrl: async (caminho: string) => {
      const arq = arquivos.get(`${bucket}/${caminho}`);
      if (!arq) return { data: null, error: { message: "Arquivo de exemplo: anexos não estão disponíveis na demonstração" } };
      return { data: { signedUrl: URL.createObjectURL(arq) }, error: null };
    },
    remove: async (caminhos: string[]) => {
      caminhos.forEach((c) => arquivos.delete(`${bucket}/${c}`));
      return { data: [], error: null };
    },
  }),
};

/** Operações de auth.admin (tela de usuários em Configurações) direto no schema auth. */
const admin = {
  listUsers: async () => {
    const { db } = await banco();
    const r = await db.query<{ id: string; email: string; last_sign_in_at: string | null }>(
      "select id::text, email, last_sign_in_at::text from auth.users order by email");
    return { data: { users: r.rows }, error: null };
  },
  createUser: async (p: { email: string; user_metadata?: Record<string, unknown> }) => {
    const { db } = await banco();
    const existe = await db.query("select 1 from auth.users where email = $1", [p.email]);
    if (existe.rows.length) return { data: { user: null }, error: { message: "User already registered" } };
    const r = await db.query<{ id: string }>(
      "insert into auth.users (email, aud, role, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2::jsonb) returning id::text",
      [p.email, JSON.stringify(p.user_metadata ?? {})]);
    return { data: { user: { id: r.rows[0].id, email: p.email } }, error: null };
  },
  updateUserById: async (id: string, p: { email?: string }) => {
    const { db } = await banco();
    if (p.email) await db.query("update auth.users set email = $1 where id = $2", [p.email, id]);
    return { data: { user: { id } }, error: null };
  },
  deleteUser: async (id: string) => {
    const { db } = await banco();
    await db.query("delete from auth.users where id = $1", [id]);
    return { data: {}, error: null };
  },
};

const auth = {
  getUser: async () => {
    await banco();
    return { data: { user: logado ? usuario : null }, error: null };
  },
  getSession: async () => ({ data: { session: logado ? sessao() : null }, error: null }),
  onAuthStateChange: (cb: Ouvinte) => {
    ouvintes.add(cb);
    return { data: { subscription: { unsubscribe: () => ouvintes.delete(cb) } } };
  },
  // qualquer e-mail/senha entra como administrador
  signInWithPassword: async () => {
    logado = true;
    emitir("SIGNED_IN");
    return { data: { user: usuario, session: sessao() }, error: null };
  },
  signOut: async () => {
    logado = false;
    emitir("SIGNED_OUT");
    return { error: null };
  },
  updateUser: async () => ({ data: { user: usuario }, error: null }),
  resetPasswordForEmail: async () => ({ data: {}, error: null }),
  admin,
};

let clientInstance: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!clientInstance) {
    const c = createSupabaseClient<Database>(URL_DEMO, "demo", {
      accessToken: async () => "demo",
      global: { fetch: fetchDemo },
    });
    Object.defineProperty(c, "auth", { value: auth });
    Object.defineProperty(c, "storage", { value: storage });
    clientInstance = c;
  }
  return clientInstance;
}

export function createClient() {
  return getSupabase();
}
