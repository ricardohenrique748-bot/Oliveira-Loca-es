"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, Pencil, Save, Send, Trash2, Wand2, XCircle } from "lucide-react";
import { Card, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Cabecalho, Confirmar, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { InputNumero } from "@/components/app/campos";
import { formatCompetencia, formatDataHora, formatHoras, formatPlaca } from "@/lib/format";
import { calcularHorasDia, dataDaLinha, totalHoras, type LinhaEspelho } from "@/lib/calculos/espelho";
import { cn } from "@/lib/utils";
import { excluirEspelho, salvarEspelho } from "../actions";
import { EnviarEspelhoDialog, EspelhoDadosDialog, type OpcoesEspelho } from "../client";

export interface EspelhoDetalhe {
  id: string;
  veiculo_id: string;
  cliente_id: string;
  obra_id: string | null;
  competencia: string;
  linhas: LinhaEspelho[];
  total_horas: number;
  observacoes: string | null;
  status: string;
  token: string;
  enviado_em: string | null;
  respondido_em: string | null;
  respondido_por: string | null;
  motivo_recusa: string | null;
  placa: string;
  modelo: string | null;
  cliente: string;
  cliente_whatsapp: string | null;
  cliente_email: string | null;
  obra: string | null;
  contrato: string | null;
  empresa: string | null;
}

/** Preenche de uma vez os dias de semana ainda vazios com o mesmo horário. */
function PreencherLote({ onAplicar }: { onAplicar: (inicio: string, fim: string, intervalo: number | null, sabado: boolean) => void }) {
  const [inicio, setInicio] = React.useState("07:00");
  const [fim, setFim] = React.useState("17:00");
  const [intervalo, setIntervalo] = React.useState<number | null>(1);
  const [sabado, setSabado] = React.useState(false);
  const horas = calcularHorasDia(inicio, fim, intervalo);
  return (
    <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="lote-ini" className="text-xs text-muted-foreground">Início</Label>
        <Input id="lote-ini" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9 w-28" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="lote-fim" className="text-xs text-muted-foreground">Fim</Label>
        <Input id="lote-fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} className="h-9 w-28" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="lote-int" className="text-xs text-muted-foreground">Intervalo (h)</Label>
        <InputNumero id="lote-int" casas={2} value={intervalo} onChange={setIntervalo} className="num h-9 w-24" />
      </div>
      <label className="flex h-9 items-center gap-2 text-sm">
        <input type="checkbox" checked={sabado} onChange={(e) => setSabado(e.target.checked)} className="h-4 w-4 accent-primary" />
        Incluir sábados
      </label>
      <Button variant="outline" size="sm" disabled={!inicio || !fim} onClick={() => onAplicar(inicio, fim, intervalo, sabado)}>
        <Wand2 /> Preencher dias vazios {horas != null && `(${formatHoras(horas)}/dia)`}
      </Button>
    </Card>
  );
}

export function EditorEspelho({ espelho, podeEditar, opcoes }: { espelho: EspelhoDetalhe; podeEditar: boolean; opcoes: OpcoesEspelho | null }) {
  const [editandoDados, setEditandoDados] = React.useState(false);
  const router = useRouter();
  const [linhas, setLinhas] = React.useState<LinhaEspelho[]>(espelho.linhas);
  const [obs, setObs] = React.useState(espelho.observacoes ?? "");
  const [salvos, setSalvos] = React.useState(() => JSON.stringify([espelho.linhas, espelho.observacoes ?? ""]));
  const [salvando, setSalvando] = React.useState(false);
  const [enviar, setEnviar] = React.useState(false);
  const [excluir, setExcluir] = React.useState(false);
  const [lote, setLote] = React.useState(false);

  const travado = espelho.status === "aprovado";
  const editavel = podeEditar && !travado;
  const alterado = JSON.stringify([linhas, obs]) !== salvos;
  const total = totalHoras(linhas);
  const mes = formatCompetencia(espelho.competencia, true);
  const diasLancados = linhas.filter((l) => (l.horas ?? 0) > 0).length;

  // avisa antes de sair da página com alterações não salvas
  React.useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  const mudar = (dia: number, campo: keyof LinhaEspelho, valor: string | number | null) => {
    setLinhas((ls) => ls.map((l) => {
      if (l.dia !== dia) return l;
      const n = { ...l, [campo]: valor === "" ? null : valor } as LinhaEspelho;
      // início/fim/intervalo recalculam as horas; horas digitadas direto ficam como estão
      if (campo === "inicio" || campo === "fim" || campo === "intervalo") {
        const h = calcularHorasDia(n.inicio, n.fim, n.intervalo);
        if (h != null) n.horas = h;
      }
      return n;
    }));
  };

  const preencherLote = (inicio: string, fim: string, intervalo: number | null, sabado: boolean) => {
    const horas = calcularHorasDia(inicio, fim, intervalo);
    setLinhas((ls) => ls.map((l) => {
      const d = dataDaLinha(espelho.competencia, l.dia);
      const vazio = !l.inicio && !l.fim && l.horas == null;
      if (!d || !vazio) return l;
      if (d.semana === "dom" || (d.semana === "sáb" && !sabado)) return l;
      return { ...l, inicio, fim, intervalo, horas };
    }));
    setLote(false);
  };

  const salvar = async (): Promise<boolean> => {
    setSalvando(true);
    const r = await rodarAcao(salvarEspelho(espelho.id, linhas, obs || null));
    setSalvando(false);
    if (r.ok) {
      setSalvos(JSON.stringify([linhas, obs]));
      router.refresh();
    }
    return r.ok;
  };

  const voltar = `/espelho?comp=${espelho.competencia.slice(0, 7)}`;

  return (
    <div className="pb-24">
      <Cabecalho
        titulo={`Espelho ${formatPlaca(espelho.placa)}`}
        descricao={<>{espelho.cliente}{espelho.obra && ` · ${espelho.obra}`} · {mes}</>}
        voltar={{ href: voltar, rotulo: "Espelhos" }}
        acoes={<>
          <StatusBadge status={espelho.status} />
          {editavel && opcoes && <Button variant="outline" size="sm" onClick={() => setEditandoDados(true)}><Pencil /> Editar dados</Button>}
          {editavel && <Button variant="outline" size="sm" onClick={() => setLote((v) => !v)}><Wand2 /> Preencher em lote</Button>}
          {editavel && <Button variant="outline" size="sm" onClick={() => setExcluir(true)}><Trash2 /> Excluir</Button>}
          {(podeEditar || espelho.status !== "rascunho") && (
            <Button size="sm" variant={espelho.status === "rascunho" || espelho.status === "recusado" ? "default" : "outline"}
              disabled={espelho.status === "rascunho" && !total} onClick={() => setEnviar(true)}
              title={!total ? "Lance as horas antes de enviar" : undefined}>
              <Send /> {espelho.status === "rascunho" ? "Enviar ao cliente" : espelho.status === "recusado" ? "Reenviar ao cliente" : "Link do cliente"}
            </Button>
          )}
        </>}
      />

      {/* situação da aprovação */}
      {espelho.status === "enviado" && (
        <Card className="mb-4 flex items-start gap-3 border-status-alerta/40 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-status-alerta" />
          <div>Aguardando o cliente desde {formatDataHora(espelho.enviado_em)}. {editavel && "Se você salvar alterações agora, o cliente já vê a versão nova no link."}</div>
        </Card>
      )}
      {espelho.status === "aprovado" && (
        <Card className="mb-4 flex items-start gap-3 border-status-ok/40 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-ok" />
          <div>Aprovado por <strong>{espelho.respondido_por}</strong> em {formatDataHora(espelho.respondido_em)}. O espelho está travado.</div>
        </Card>
      )}
      {espelho.status === "recusado" && (
        <Card className="mb-4 flex items-start gap-3 border-status-critico/40 p-3 text-sm">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-critico" />
          <div>
            Recusado por <strong>{espelho.respondido_por}</strong> em {formatDataHora(espelho.respondido_em)}.
            <div className="mt-1 whitespace-pre-wrap">Motivo: {espelho.motivo_recusa}</div>
            {editavel && <div className="mt-1 text-muted-foreground">Corrija as horas, salve e reenvie ao cliente.</div>}
          </div>
        </Card>
      )}

      {lote && editavel && <PreencherLote onAplicar={preencherLote} />}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="w-12 px-3 py-2">Dia</th>
              <th className="w-24 px-2 py-2">Data</th>
              <th className="w-32 px-2 py-2">Início</th>
              <th className="w-32 px-2 py-2">Fim</th>
              <th className="w-28 px-2 py-2">Intervalo (h)</th>
              <th className="w-28 px-2 py-2 text-right">Horas</th>
              <th className="px-2 py-2">Observação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const d = dataDaLinha(espelho.competencia, l.dia);
              const desabilitado = !editavel || !d;
              return (
                <tr key={l.dia} className={cn("border-b last:border-0", d?.fimDeSemana && "bg-muted/40", !d && "opacity-40")}>
                  <td className="num px-3 py-1 font-semibold">{l.dia}</td>
                  <td className="px-2 py-1 text-xs text-muted-foreground">{d ? <>{d.rotulo} <span className="uppercase">{d.semana}</span></> : "não existe"}</td>
                  <td className="px-2 py-1">
                    <Input type="time" aria-label={`Início dia ${l.dia}`} className="h-8" disabled={desabilitado}
                      value={l.inicio ?? ""} onChange={(e) => mudar(l.dia, "inicio", e.target.value || null)} />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="time" aria-label={`Fim dia ${l.dia}`} className="h-8" disabled={desabilitado}
                      value={l.fim ?? ""} onChange={(e) => mudar(l.dia, "fim", e.target.value || null)} />
                  </td>
                  <td className="px-2 py-1">
                    <InputNumero casas={2} aria-label={`Intervalo dia ${l.dia}`} className="num h-8 text-right" disabled={desabilitado}
                      value={l.intervalo} onChange={(n) => mudar(l.dia, "intervalo", n)} />
                  </td>
                  <td className="px-2 py-1">
                    <InputNumero casas={2} aria-label={`Horas dia ${l.dia}`} className="num h-8 text-right font-semibold" disabled={desabilitado}
                      value={l.horas} onChange={(n) => mudar(l.dia, "horas", n)} />
                  </td>
                  <td className="px-2 py-1">
                    <Input aria-label={`Observação dia ${l.dia}`} className="h-8" maxLength={200} disabled={desabilitado}
                      value={l.obs ?? ""} onChange={(e) => mudar(l.dia, "obs", e.target.value)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td colSpan={5} className="px-3 py-3 text-right uppercase text-muted-foreground">Total ({diasLancados} dia(s))</td>
              <td className="num px-2 py-3 text-right text-base">{formatHoras(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="mt-4 space-y-1">
        <Label htmlFor="esp-obs">Observações para o cliente</Label>
        <Textarea id="esp-obs" value={obs} maxLength={1000} disabled={!editavel} onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: dias parados por chuva, horas extras combinadas…" />
      </div>

      {editavel && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-3 px-1 lg:px-8">
            <span className="text-sm">
              Total <strong className="num">{formatHoras(total)}</strong>
              {alterado && <span className="ml-2 text-status-alerta">· alterações não salvas</span>}
            </span>
            <Button disabled={!alterado || salvando} onClick={salvar}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          </div>
        </div>
      )}

      <EnviarEspelhoDialog
        aberto={enviar}
        onOpenChange={setEnviar}
        antesDeEnviar={async () => (alterado ? salvar() : true)}
        espelho={{
          id: espelho.id, token: espelho.token, status: espelho.status, placa: espelho.placa, competencia: espelho.competencia,
          cliente: espelho.cliente, cliente_whatsapp: espelho.cliente_whatsapp, cliente_email: espelho.cliente_email, total_horas: total,
        }}
      />
      {editavel && opcoes && (
        <EspelhoDadosDialog aberto={editandoDados} onOpenChange={setEditandoDados} comp={espelho.competencia.slice(0, 7)} opcoes={opcoes}
          editar={{ id: espelho.id, veiculo_id: espelho.veiculo_id, cliente_id: espelho.cliente_id, obra_id: espelho.obra_id, competencia: espelho.competencia, status: espelho.status }} />
      )}
      <Confirmar
        aberto={excluir}
        onOpenChange={setExcluir}
        titulo="Excluir este espelho?"
        descricao={`As horas lançadas de ${formatPlaca(espelho.placa)} em ${mes} serão apagadas e o link do cliente deixa de funcionar.`}
        rotulo="Excluir"
        destrutivo
        onConfirmar={async () => {
          const r = await rodarAcao(excluirEspelho(espelho.id));
          if (!r.ok) throw new Error(r.erro);
          setSalvos(JSON.stringify([linhas, obs]));
          router.push(voltar);
        }}
      />
    </div>
  );
}
