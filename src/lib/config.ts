import { createClient } from "@/lib/supabase/client";

export interface Configuracoes {
  base_dias_mes: number;
  alerta_dias_fatura: number;
  alerta_dias_documento: number[];
  alerta_dias_os_aberta: number;
  alerta_dias_pagar: number;
  preventiva_pct_alerta: number;
  template_cobranca_email: string;
  template_cobranca_whatsapp: string;
}

const PADRAO: Configuracoes = {
  base_dias_mes: 30,
  alerta_dias_fatura: 5,
  alerta_dias_documento: [30, 15, 0],
  alerta_dias_os_aberta: 3,
  alerta_dias_pagar: 7,
  preventiva_pct_alerta: 0.9,
  template_cobranca_email: "",
  template_cobranca_whatsapp: "",
};

let cachedConfig: Configuracoes | null = null;
let lastFetch = 0;

export async function getConfig(forceRefresh = false): Promise<Configuracoes> {
  const now = Date.now();
  if (cachedConfig && !forceRefresh && now - lastFetch < 60000) {
    return cachedConfig;
  }
  const supabase = createClient();
  const { data } = await supabase.from("configuracoes").select("chave, valor");
  const cfg = { ...PADRAO } as Record<string, unknown>;
  for (const r of data ?? []) cfg[r.chave] = r.valor;
  cachedConfig = cfg as unknown as Configuracoes;
  lastFetch = now;
  return cachedConfig;
}
