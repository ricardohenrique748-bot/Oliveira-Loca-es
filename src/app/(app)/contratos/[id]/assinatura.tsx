"use client";
/** Assinatura eletrônica do contrato pela Clicksign (a conversa com a Clicksign fica em api/assinatura.ts). */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Send, Signature } from "lucide-react";
import { toast } from "sonner";
import { Badge, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { LinkAnexo } from "@/components/app/anexo";
import { createClient } from "@/lib/supabase/client";
import { contratoPDFBase64 } from "@/lib/documentos/baixar";

export type DadosAssinatura = {
  id: string; cliente_id: string;
  assinatura_status: "enviado" | "assinado" | "cancelado" | null; assinatura_signatario: string | null;
  assinatura_enviada_em: string | null; assinatura_concluida_em: string | null; assinatura_arquivo: string | null;
};

async function chamar(corpo: Record<string, unknown>): Promise<{ ok?: boolean; erro?: string; status?: string; ambiente?: string }> {
  const { data } = await createClient().auth.getSession();
  const r = await fetch("/api/assinatura", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; erro?: string; status?: string; ambiente?: string };
  return r.ok ? j : { erro: j.erro ?? `HTTP ${r.status}` };
}

const dataHora = (s: string | null) => s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "";

/** Linha "Assinatura" no card de condições */
export function SituacaoAssinatura({ c }: { c: DadosAssinatura }) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState<"status" | "reenviar" | null>(null);
  const atualizar = React.useCallback(async (silencioso = false) => {
    setOcupado("status");
    const r = await chamar({ acao: "status", contratoId: c.id });
    setOcupado(null);
    if (r.erro) { if (!silencioso) toast.error(`Assinatura: ${r.erro}`, { duration: 15_000 }); return; }
    if (r.status !== c.assinatura_status) {
      if (r.status === "assinado") toast.success("Contrato assinado pelo cliente — PDF assinado guardado no contrato");
      router.refresh();
    } else if (!silencioso) toast.info(r.status === "enviado" ? "Ainda aguardando a assinatura do cliente" : "Sem novidades");
  }, [c.id, c.assinatura_status, router]);

  // ao abrir o contrato, confere sozinho se o cliente já assinou (ou se o PDF assinado ainda não foi guardado)
  React.useEffect(() => {
    if (c.assinatura_status === "enviado" || (c.assinatura_status === "assinado" && !c.assinatura_arquivo)) void atualizar(true);
  }, [c.assinatura_status, c.assinatura_arquivo, atualizar]);

  if (!c.assinatura_status) return null;
  return (
    <div className="col-span-2 sm:col-span-4">
      <dt className="text-xs text-muted-foreground">Assinatura eletrônica</dt>
      <dd className="flex flex-wrap items-center gap-2">
        {c.assinatura_status === "enviado" && <Badge variant="alerta">Aguardando cliente</Badge>}
        {c.assinatura_status === "assinado" && <Badge variant="ok">Assinado</Badge>}
        {c.assinatura_status === "cancelado" && <Badge variant="neutro">Cancelado</Badge>}
        <span className="text-sm">
          {c.assinatura_signatario}
          {c.assinatura_status === "assinado" && c.assinatura_concluida_em ? ` · assinado em ${dataHora(c.assinatura_concluida_em)}` : c.assinatura_enviada_em ? ` · enviado em ${dataHora(c.assinatura_enviada_em)}` : ""}
        </span>
        {c.assinatura_arquivo && <LinkAnexo referencia={c.assinatura_arquivo} rotulo="Contrato assinado (PDF)" />}
        {c.assinatura_status === "enviado" && <>
          <Button variant="ghost" size="sm" disabled={!!ocupado} onClick={() => void atualizar()}>
            {ocupado === "status" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar
          </Button>
          <Button variant="ghost" size="sm" disabled={!!ocupado} onClick={async () => {
            setOcupado("reenviar");
            const r = await chamar({ acao: "reenviar", contratoId: c.id });
            setOcupado(null);
            if (r.erro) toast.error(`Não reenviado: ${r.erro}`, { duration: 15_000 }); else toast.success("Convite de assinatura reenviado ao cliente");
          }}>
            {ocupado === "reenviar" ? <Loader2 className="animate-spin" /> : <Send />} Reenviar
          </Button>
        </>}
      </dd>
    </div>
  );
}

/** Botão + diálogo "Enviar para assinatura" */
export function BotaoEnviarAssinatura({ c }: { c: DadosAssinatura }) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [f, setF] = React.useState({ nome: "", email: "", whatsapp: "", canal: "email" as "email" | "whatsapp" });

  // sugere o contato do cliente (o que recebe fatura primeiro); sem contato, usa o e-mail/WhatsApp do cadastro do cliente
  React.useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    void (async () => {
      const sb = createClient();
      const [{ data: contatos }, { data: cli }] = await Promise.all([
        sb.from("contatos").select("nome, email, whatsapp, recebe_fatura").eq("cliente_id", c.cliente_id).order("recebe_fatura", { ascending: false }).limit(5),
        sb.from("clientes").select("email, whatsapp").eq("id", c.cliente_id).maybeSingle(),
      ]);
      if (!vivo) return;
      const k = contatos?.find((x) => x.email) ?? contatos?.[0];
      setF({ nome: k?.nome ?? "", email: k?.email ?? cli?.email ?? "", whatsapp: k?.whatsapp ?? cli?.whatsapp ?? "", canal: "email" });
    })();
    return () => { vivo = false; };
  }, [aberto, c.cliente_id]);

  if (c.assinatura_status === "enviado" || c.assinatura_status === "assinado") return null;

  const enviar = async () => {
    if (f.nome.trim().split(/\s+/).length < 2) return void toast.error("Informe nome e sobrenome de quem vai assinar");
    if (!f.email.trim()) return void toast.error("Informe o e-mail de quem vai assinar");
    if (f.canal === "whatsapp" && f.whatsapp.replace(/\D/g, "").length < 10) return void toast.error("Informe o WhatsApp com DDD");
    setEnviando(true);
    try {
      const pdfBase64 = await contratoPDFBase64(c.id);
      const r = await chamar({ acao: "enviar", contratoId: c.id, pdfBase64, signatario: { nome: f.nome, email: f.email, whatsapp: f.whatsapp || null, canal: f.canal } });
      if (r.erro) return void toast.error(`Não enviado: ${r.erro}`, { duration: 30_000 });
      toast.success(`Contrato enviado para assinatura${r.ambiente === "sandbox" ? " (Clicksign de TESTE)" : ""} — o cliente recebe o link por ${f.canal === "whatsapp" ? "WhatsApp" : "e-mail"}`, { duration: 10_000 });
      setAberto(false);
      router.refresh();
    } catch (e) {
      toast.error(`Falha ao enviar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}><Signature /> Enviar para assinatura</Button>
      <Dialog open={aberto} onOpenChange={(v) => !enviando && setAberto(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar contrato para assinatura</DialogTitle>
            <DialogDescription>O PDF do contrato vai para a Clicksign e o cliente recebe um link para assinar pelo celular ou computador. Quando ele assinar, o PDF assinado fica guardado aqui no contrato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ass-nome">Nome de quem assina</Label>
              <Input id="ass-nome" value={f.nome} placeholder="Nome e sobrenome" onChange={(e) => setF({ ...f, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ass-email">E-mail</Label>
              <Input id="ass-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ass-whats">WhatsApp {f.canal === "email" && <span className="text-muted-foreground">(opcional)</span>}</Label>
              <Input id="ass-whats" inputMode="tel" value={f.whatsapp} placeholder="(11) 99999-8888" onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Enviar o link por</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={f.canal === "email" ? "default" : "outline"} onClick={() => setF({ ...f, canal: "email" })}>E-mail</Button>
                <Button type="button" size="sm" variant={f.canal === "whatsapp" ? "default" : "outline"} onClick={() => setF({ ...f, canal: "whatsapp" })}>WhatsApp</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={enviando} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={enviando} onClick={() => void enviar()}>{enviando ? <Loader2 className="animate-spin" /> : <Send />} Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
