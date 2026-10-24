"use client";
/**
 * Histórico de envios da NFS-e de uma fatura (tabela nfse_tentativas): XML exato enviado e resposta bruta da Sefin.
 * Só para diagnóstico. A leitura passa pelo RLS (admin/financeiro/faturamento da empresa da fatura).
 */
import * as React from "react";
import { toast } from "sonner";
import { Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Tentativa = {
  id: string; criado_em: string; ambiente: string; numero_dps: number | null;
  xml_enviado: string; http_status: number | null; resposta_corpo: string | null; erro: string | null;
};

const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
/** resumo para a lista: código de erro da Sefin (ex.: E0084), status HTTP ou erro de conexão */
function resumo(t: Tentativa) {
  if (t.erro) return `sem resposta: ${t.erro}`;
  const codigos = [...(t.resposta_corpo ?? "").matchAll(/"codigo"\s*:\s*"([^"]+)"/gi)].map((c) => c[1]);
  return `HTTP ${t.http_status}${codigos.length ? ` · ${codigos.join(", ")}` : ""}`;
}

async function copiar(texto: string, oque: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${oque} copiado`);
  } catch {
    toast.error("Não foi possível copiar: selecione o texto e use Ctrl+C");
  }
}

function baixar(texto: string, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  a.click();
  URL.revokeObjectURL(url);
}

function Bloco({ titulo, texto, acoes }: { titulo: string; texto: string; acoes: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{titulo}</p>
        <div className="flex gap-2">{acoes}</div>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-3 font-mono text-[11px] leading-snug">{texto}</pre>
    </div>
  );
}

export function DialogoTentativasNFSe({ medicaoId, rotulo, aberto, onOpenChange }: {
  medicaoId: string; rotulo: string; aberto: boolean; onOpenChange: (v: boolean) => void;
}) {
  const [lista, setLista] = React.useState<Tentativa[] | null>(null);
  const [sel, setSel] = React.useState(0);

  React.useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setLista(null);
    setSel(0);
    createClient().from("nfse_tentativas")
      .select("id, criado_em, ambiente, numero_dps, xml_enviado, http_status, resposta_corpo, erro")
      .eq("medicao_id", medicaoId).order("criado_em", { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) toast.error(`Não foi possível carregar o histórico: ${error.message}`);
        setLista((data as Tentativa[] | null) ?? []);
      });
    return () => { vivo = false; };
  }, [aberto, medicaoId]);

  const t = lista?.[sel];
  const base = t ? `nfse_${rotulo.replace(/[^\w-]+/g, "_")}_${t.criado_em.slice(0, 19).replace(/[:T]/g, "-")}` : "";
  const resposta = t ? (t.erro ? `(sem resposta HTTP)\n${t.erro}` : `HTTP ${t.http_status}\n\n${t.resposta_corpo ?? ""}`) : "";

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho="xl">
        <DialogHeader>
          <DialogTitle>Envios da NFS-e · {rotulo}</DialogTitle>
          <DialogDescription>XML exatamente como foi enviado ao Emissor Nacional e a resposta completa recebida. Mais recente primeiro.</DialogDescription>
        </DialogHeader>
        {lista === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum envio registrado para esta fatura. O registro começa a partir dos envios feitos depois desta atualização.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
            <ol className="max-h-[28rem] space-y-1 overflow-y-auto">
              {lista.map((x, i) => (
                <li key={x.id}>
                  <button type="button" onClick={() => setSel(i)}
                    className={cn("w-full rounded-md border px-2 py-1.5 text-left text-xs", i === sel ? "border-primary bg-accent" : "hover:bg-muted")}>
                    <span className="block font-medium">{i === 0 ? "Último · " : ""}{quando(x.criado_em)}</span>
                    <span className="block text-muted-foreground">{x.ambiente} · DPS {x.numero_dps ?? "—"}</span>
                    <span className="block text-muted-foreground">{resumo(x)}</span>
                  </button>
                </li>
              ))}
            </ol>
            {t && (
              <div className="min-w-0 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Enviado em {quando(t.criado_em)} · ambiente <b>{t.ambiente}</b> · DPS nº {t.numero_dps ?? "—"} · {resumo(t)}
                </p>
                <Bloco titulo="XML enviado (assinado)" texto={t.xml_enviado} acoes={<>
                  <Button size="xs" variant="outline" onClick={() => copiar(t.xml_enviado, "XML")}><Copy /> Copiar</Button>
                  <Button size="xs" variant="outline" onClick={() => baixar(t.xml_enviado, `${base}_enviado.xml`, "application/xml")}><Download /> Baixar</Button>
                </>} />
                <Bloco titulo="Resposta recebida" texto={resposta} acoes={<>
                  <Button size="xs" variant="outline" onClick={() => copiar(resposta, "Resposta")}><Copy /> Copiar</Button>
                  <Button size="xs" variant="outline" onClick={() => baixar(resposta, `${base}_resposta.txt`, "text/plain")}><Download /> Baixar</Button>
                </>} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
