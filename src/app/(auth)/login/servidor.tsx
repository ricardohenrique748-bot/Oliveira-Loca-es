import { useState } from "react";
import { Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/basicos";
import { MODO_COMERCIAL, salvarServidor, servidorSalvo } from "@/lib/plataforma";
import { supabaseEnv } from "@/lib/supabase/env";

/** App comercial: mostra a qual servidor o aparelho conecta e deixa trocar (ex.: quando o Supabase for para a nuvem). */
export function ServidorApp() {
  const [aberto, setAberto] = useState(false);
  const atual = supabaseEnv();
  const [url, setUrl] = useState(atual?.url ?? "");
  const [chave, setChave] = useState(atual?.anonKey ?? "");
  if (!MODO_COMERCIAL) return null;

  const valido = /^https?:\/\/\S+$/.test(url.trim()) && chave.trim().length > 20;
  const aplicar = (s: { url: string; anonKey: string } | null) => {
    salvarServidor(s);
    // o cliente do Supabase é criado uma vez: recarrega para conectar no novo endereço
    window.location.reload();
  };

  return (
    <div className="mt-6 space-y-3 text-xs text-muted-foreground">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex items-center gap-1.5 hover:text-foreground">
        <Server className="size-3.5" />
        Servidor: {atual ? new URL(atual.url).host : "não configurado"}{servidorSalvo() ? " (alterado)" : ""} · {aberto ? "fechar" : "trocar"}
      </button>
      {aberto && (
        <div className="space-y-3 rounded-xl border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="srv-url">Endereço (Project URL)</Label>
            <Input id="srv-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" inputMode="url" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="srv-chave">Chave pública (anon / publishable)</Label>
            <Input id="srv-chave" value={chave} onChange={(e) => setChave(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!valido} onClick={() => aplicar({ url: url.trim().replace(/\/+$/, ""), anonKey: chave.trim() })}>Salvar e conectar</Button>
            {servidorSalvo() && <Button type="button" size="sm" variant="outline" onClick={() => aplicar(null)}>Voltar ao padrão do app</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
