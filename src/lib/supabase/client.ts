import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { exigirSupabaseEnv } from "./env";

let clientInstance: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!clientInstance) {
    const { url, anonKey } = exigirSupabaseEnv();
    clientInstance = createSupabaseClient<Database>(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return clientInstance;
}

export function createClient() {
  return getSupabase();
}
