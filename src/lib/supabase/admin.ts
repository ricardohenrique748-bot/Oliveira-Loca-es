import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { exigirSupabaseEnv } from "./env";

/** Cliente service_role — ignora RLS. Usar somente em scripts ou operações administrativas locais. */
export function createAdminClient() {
  const metaEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {} as Record<string, string>;
  const procEnv = typeof process !== "undefined" && process.env ? process.env : {} as Record<string, string>;
  const key = metaEnv.SUPABASE_SERVICE_ROLE_KEY || procEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createClient<Database>(exigirSupabaseEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
