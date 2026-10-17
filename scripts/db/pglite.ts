/**
 * Banco PostgreSQL em memória (PGlite/WASM) com stubs mínimos do Supabase
 * (schema auth, roles anon/authenticated/service_role) para validar migrations,
 * seed e funções SQL sem Docker.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..", "..");
const MIGRATIONS = path.join(RAIZ, "supabase", "migrations");
const SEED = path.join(RAIZ, "supabase", "seed.sql");

const STUB_SUPABASE = /* sql */ `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create schema if not exists extensions;
  create table auth.users (
    instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text,
    encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz,
    confirmation_token text, email_change text, email_change_token_new text, recovery_token text
  );
  create table auth.identities (
    id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
    identity_data jsonb, provider text, provider_id text, last_sign_in_at timestamptz,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export function arquivosMigration(): string[] {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
}

export async function criarBanco(opts: { seed?: boolean; hoje?: string; log?: (msg: string) => void } = {}): Promise<PGlite> {
  const log = opts.log ?? (() => {});
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(STUB_SUPABASE);
  for (const f of arquivosMigration()) {
    const sql = readFileSync(path.join(MIGRATIONS, f), "utf8");
    try {
      await db.exec(sql);
      log(`✓ ${f}`);
    } catch (e) {
      throw new Error(`Falha na migration ${f}: ${(e as Error).message}`);
    }
  }
  if (opts.hoje) {
    // congela "hoje" (testes determinísticos)
    await db.exec(`create or replace function app.hoje() returns date language sql stable as $$ select '${opts.hoje}'::date $$`);
  }
  if (opts.seed) {
    try {
      await db.exec(readFileSync(SEED, "utf8"));
      log("✓ seed.sql");
    } catch (e) {
      throw new Error(`Falha no seed: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Executa como um usuário autenticado (simula o JWT do PostgREST). */
export async function comoUsuario<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);
                 select set_config('request.jwt.claim.role', '${userId ? "authenticated" : ""}', false);`);
  if (userId) await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);");
  }
}
