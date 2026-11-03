/**
 * Página pública (sem login) em /aprovacao/espelho/:token: o cliente confere o espelho
 * de horas e aprova ou recusa. Lê e responde só pelas funções fn_espelho_publico e
 * fn_responder_espelho (0057_espelho_horas.sql); a tabela não fica exposta.
 */
import React from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, FileQuestion, Loader2, Printer, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { traduzirErro } from "@/lib/acoes";
import { formatCompetencia, formatDataHora, formatHoras, formatPlaca, maskCNPJ } from "@/lib/format";
import { dataDaLinha, horasEmRelogio, normalizarLinhas, type LinhaEspelho } from "@/lib/calculos/espelho";
import { cn } from "@/lib/utils";

interface EspelhoPublico {
  competencia: string;
  status: "enviado" | "aprovado" | "recusado";
  linhas: LinhaEspelho[];
  total_horas: number;
  observacoes: string | null;
  enviado_em: string | null;
  respondido_em: string | null;
  respondido_por: string | null;
  motivo_recusa: string | null;
  empresa: string;
  empresa_cnpj: string | null;
  cliente: string;
  obra: string | null;
  contrato: string | null;
  placa: string;
  modelo: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ler(r: unknown): EspelhoPublico | null {
  if (!r || typeof r !== "object") return null;
  const e = r as EspelhoPublico;
  return { ...e, linhas: normalizarLinhas(e.linhas), total_horas: Number(e.total_horas) || 0 };
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center gap-3 print:mb-3">
          <img src="/logo-oliveira.svg" alt="" className="logo-marca h-10 w-auto" />
        </div>
        {children}
      </main>
    </div>
  );
}

export default function AprovacaoEspelhoPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [espelho, setEspelho] = React.useState<EspelhoPublico | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [falhou, setFalhou] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [recusando, setRecusando] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const [enviando, setEnviando] = React.useState<"aprovar" | "recusar" | null>(null);

  React.useEffect(() => {
    document.title = "Espelho de horas · Aprovação";
    if (!UUID_RE.test(token)) { setCarregando(false); return; }
    let ativo = true;
    createClient().rpc("fn_espelho_publico", { p_token: token }).then(({ data, error }) => {
      if (!ativo) return;
      if (error) setFalhou(true);
      else setEspelho(ler(data));
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [token]);

  const responder = async (aprovado: boolean) => {
    setEnviando(aprovado ? "aprovar" : "recusar");
    const { data, error } = await createClient().rpc("fn_responder_espelho", {
      p_token: token, p_aprovado: aprovado, p_nome: nome, p_motivo: aprovado ? undefined : motivo,
    });
    setEnviando(null);
    if (error) return toast.error(traduzirErro(error).erro);
    setEspelho(ler(data));
    toast.success(aprovado ? "Espelho aprovado. Obrigado!" : "Recusa registrada. Vamos revisar e reenviar.");
  };

  if (carregando) {
    return <Moldura><div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando espelho…</div></Moldura>;
  }
  if (!espelho) {
    return (
      <Moldura>
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <FileQuestion className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-semibold">{falhou ? "Não foi possível abrir o espelho" : "Espelho não encontrado"}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {falhou ? "Verifique sua conexão e tente de novo em instantes." : "O link pode estar incompleto ou o espelho foi retirado. Peça um link novo para quem enviou."}
          </p>
        </Card>
      </Moldura>
    );
  }

  const mes = formatCompetencia(espelho.competencia, true);
  const dias = espelho.linhas.filter((l) => dataDaLinha(espelho.competencia, l.dia));
  const diasLancados = dias.filter((l) => (l.horas ?? 0) > 0).length;
  const podeResponder = espelho.status === "enviado";

  return (
    <Moldura>
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{espelho.empresa}{espelho.empresa_cnpj && ` · CNPJ ${maskCNPJ(espelho.empresa_cnpj)}`}</p>
        <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">Espelho de horas</h1>
        <p className="text-sm text-muted-foreground">{mes.charAt(0).toUpperCase() + mes.slice(1)}</p>
      </div>

      <Card className="mb-4 grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><div className="text-xs text-muted-foreground">Cliente</div><div className="font-semibold">{espelho.cliente}</div></div>
        <div><div className="text-xs text-muted-foreground">Veículo</div><div className="font-mono font-semibold">{formatPlaca(espelho.placa)}</div>{espelho.modelo && <div className="text-xs text-muted-foreground">{espelho.modelo}</div>}</div>
        <div><div className="text-xs text-muted-foreground">Obra</div><div className="font-semibold">{espelho.obra ?? "—"}</div></div>
        <div><div className="text-xs text-muted-foreground">Contrato</div><div className="font-semibold">{espelho.contrato ?? "—"}</div></div>
      </Card>

      {espelho.status === "aprovado" && (
        <Card className="mb-4 flex items-start gap-3 border-status-ok/50 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-ok" />
          <div><strong>Aprovado</strong> por {espelho.respondido_por} em {formatDataHora(espelho.respondido_em)}.</div>
        </Card>
      )}
      {espelho.status === "recusado" && (
        <Card className="mb-4 flex items-start gap-3 border-status-critico/50 p-4 text-sm">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-status-critico" />
          <div>
            <strong>Recusado</strong> por {espelho.respondido_por} em {formatDataHora(espelho.respondido_em)}.
            <div className="mt-1 whitespace-pre-wrap">Motivo: {espelho.motivo_recusa}</div>
            <div className="mt-1 text-muted-foreground">Quando o espelho for corrigido, este mesmo link volta a aceitar resposta.</div>
          </div>
        </Card>
      )}

      {/* no celular: dia, horário e horas (intervalo e observação embaixo do horário) */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2">Dia</th>
              <th className="px-2 py-2">Horário</th>
              <th className="hidden px-2 py-2 text-right sm:table-cell">Intervalo</th>
              <th className="px-3 py-2 text-right">Horas</th>
              <th className="hidden px-2 py-2 sm:table-cell">Observação</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((l) => {
              const d = dataDaLinha(espelho.competencia, l.dia)!;
              const horario = l.inicio && l.fim ? `${l.inicio} – ${l.fim}` : l.inicio ?? l.fim ?? "—";
              return (
                <tr key={l.dia} className={cn("border-b align-top last:border-0", d.fimDeSemana && "bg-muted/40")}>
                  <td className="whitespace-nowrap px-3 py-1.5"><span className="num font-semibold">{d.rotulo}</span> <span className="text-xs uppercase text-muted-foreground">{d.semana}</span></td>
                  <td className="px-2 py-1.5">
                    <span className="num whitespace-nowrap">{horario}</span>
                    {(l.intervalo != null || l.obs) && (
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {l.intervalo != null && `intervalo ${horasEmRelogio(l.intervalo)}`}{l.intervalo != null && l.obs && " · "}{l.obs}
                      </div>
                    )}
                  </td>
                  <td className="num hidden px-2 py-1.5 text-right sm:table-cell">{l.intervalo != null ? horasEmRelogio(l.intervalo) : "—"}</td>
                  <td className="num px-3 py-1.5 text-right font-semibold">{l.horas != null ? horasEmRelogio(l.horas) : "—"}</td>
                  <td className="hidden px-2 py-1.5 text-xs text-muted-foreground sm:table-cell">{l.obs}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2">
              <td colSpan={2} className="px-3 py-3 text-xs font-semibold uppercase text-muted-foreground">
                Total · {diasLancados} dia(s) <span className="normal-case">({formatHoras(espelho.total_horas)})</span>
              </td>
              <td className="hidden sm:table-cell" />
              <td className="num px-3 py-3 text-right text-base font-bold">{horasEmRelogio(espelho.total_horas)}</td>
              <td className="hidden sm:table-cell" />
            </tr>
          </tfoot>
        </table>
      </Card>

      {espelho.observacoes && (
        <Card className="mt-4 p-4 text-sm">
          <div className="mb-1 text-xs text-muted-foreground">Observações</div>
          <div className="whitespace-pre-wrap">{espelho.observacoes}</div>
        </Card>
      )}

      {podeResponder && (
        <Card className="mt-6 space-y-4 p-4 print:hidden">
          <div className="flex items-start gap-2 text-sm">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-status-alerta" />
            <p>Confira as horas acima e registre sua resposta. Ela fica gravada com seu nome, data e hora.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="apr-nome">Seu nome</Label>
            <Input id="apr-nome" value={nome} maxLength={120} autoComplete="name" onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem está aprovando" />
          </div>
          {recusando && (
            <div className="space-y-1">
              <Label htmlFor="apr-motivo">O que está errado?</Label>
              <Textarea id="apr-motivo" value={motivo} maxLength={1000} autoFocus onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: dia 12 o equipamento ficou parado; dia 15 foram 6 horas, não 9." />
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {!recusando ? (
              <>
                <Button variant="outline" onClick={() => setRecusando(true)} disabled={!!enviando}><ThumbsDown /> Recusar</Button>
                <Button onClick={() => responder(true)} disabled={nome.trim().length < 3 || !!enviando}>
                  {enviando === "aprovar" ? <Loader2 className="animate-spin" /> : <ThumbsUp />} Aprovar espelho
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setRecusando(false)} disabled={!!enviando}>Voltar</Button>
                <Button variant="destructive" onClick={() => responder(false)} disabled={nome.trim().length < 3 || !motivo.trim() || !!enviando}>
                  {enviando === "recusar" ? <Loader2 className="animate-spin" /> : <ThumbsDown />} Enviar recusa
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between gap-3 text-xs text-muted-foreground print:hidden">
        <span>Enviado em {formatDataHora(espelho.enviado_em)}</span>
        <Button variant="ghost" size="sm" onClick={() => window.print()}><Printer /> Imprimir</Button>
      </div>
    </Moldura>
  );
}
