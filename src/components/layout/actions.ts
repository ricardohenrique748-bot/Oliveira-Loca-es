import { COOKIE_EMPRESA, getSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

export async function definirEmpresa(empresaId: string | null) {
  if (typeof window !== "undefined") {
    if (empresaId) localStorage.setItem(COOKIE_EMPRESA, empresaId);
    else localStorage.removeItem(COOKIE_EMPRESA);
    window.dispatchEvent(new CustomEvent("oliveira:empresa", { detail: empresaId }));
  }
}

export async function marcarAlertasLidos(ids: string[]) {
  if (!(await getSessao()) || !ids.length) return;
  const supabase = createClient();
  await supabase.from("alertas").update({ lida: true }).in("id", ids);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("oliveira:refresh"));
  }
}
