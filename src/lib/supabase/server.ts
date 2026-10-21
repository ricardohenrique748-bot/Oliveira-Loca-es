import { createClient as getClient } from "@/lib/supabase/client";

export async function createClient(_opcoes?: { lembrar?: boolean }) {
  return getClient();
}

export type SupabaseServer = ReturnType<typeof getClient>;
