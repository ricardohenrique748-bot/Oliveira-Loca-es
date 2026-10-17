import { createClient as getClient } from "./client";

export async function createClient(_opcoes?: { lembrar?: boolean }) {
  return getClient();
}

export type SupabaseServer = ReturnType<typeof getClient>;
