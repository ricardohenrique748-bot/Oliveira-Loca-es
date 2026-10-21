/** Substitui `@/lib/supabase/admin` no build de demonstração: usa o mesmo cliente embutido. */
import { getSupabase } from "./client";

export function createAdminClient() {
  return getSupabase();
}
