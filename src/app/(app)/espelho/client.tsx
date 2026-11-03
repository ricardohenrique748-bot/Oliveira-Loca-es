"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ClipboardList, Copy, History, Loader2, Mail, MessageCircle, Pencil, Plus, Save, Send, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Input } from "@/components/ui/input";
import { SelectBusca } from "@/components/ui/select-busca";
import { SelectSimples } from "@/components/ui/select";
import { BotaoCopiar, Cabecalho, Confirmar, StatusBadge, Vazio, rodarAcao } from "@/components/app/comuns";
import { SeletorMes } from "@/components/app/seletor-mes";
import { BarraFiltros, FiltroSelectUrl, useUrlParams } from "@/components/app/url";
import { formatCompetencia, formatDataHora, formatHoras, formatPlaca, linkEmail, linkWhatsApp } from "@/lib/format";
import { MODO_DEMO } from "@/lib/plataforma";
import { criarEspelho, editarDadosEspelho, enviarEspelho, excluirEspelho } from "./actions";

export interface EspelhoLista {
  id: string;
  veiculo_id: string;
  cliente_id: string;
  obra_id: string | null;
  competencia: string;
  total_horas: number;
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
}

export interface OpcoesEspelho {
  veiculos: { id: string; placa: string; modelo: string | null }[];
  clientes: { id: string; nome: string }[];
  contratos: { id: string; numero: string | null; veiculo_id: string; cliente_id: string; obra_id: string | null }[];
  obras: { id: string; nome: string; cliente_id: string }[];
}

/** Endereço público que o cliente abre para aprovar (sem login). */
export function linkEspelho(token: string): string {
  if (typeof window === "undefined") return `/aprovacao/espelho/${token}`;
  // demonstração usa HashRouter (abre do arquivo)
  if (MODO_DEMO) return `${window.location.href.split("#")[0]}#/aprovacao/espelho/${token}`;
  return `${window.location.origin}/aprovacao/espelho/${token}`;
}

// ---------- envio do link ----------

export interface EspelhoEnvio {
  id: string;
  token: string;
  status: string;
  placa: string;
  competencia: string;
  cliente: string;
  cliente_whatsapp: string | null;
  cliente_email: string | null;
  total_horas: number;
}

/**
 * Libera o link (status "enviado") e mostra como mandar: copiar, WhatsApp ou e-mail.
 * Rascunho e recusado precisam ser (re)enviados; enviado e aprovado só mostram o link.
 */
export function EnviarEspelhoDialog({ espelho, aberto, onOpenChange, antesDeEnviar }: {
  espelho: EspelhoEnvio | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  /** ex.: salvar alterações pendentes do editor antes de liberar o link */
  antesDeEnviar?: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = React.useState(false);
  const [liberado, setLiberado] = React.useState(false);

  React.useEffect(() => {
    if (aberto) setLiberado(espelho?.status === "enviado" || espelho?.status === "aprovado");
  }, [aberto, espelho?.status]);

  if (!espelho) return null;
  const url = linkEspelho(espelho.token);
  const mes = formatCompetencia(espelho.competencia, true);
  const mensagem = `Olá! Segue o espelho de horas da placa ${formatPlaca(espelho.placa)} referente a ${mes} (${formatHoras(espelho.total_horas)}). `
    + `Por favor, confira e aprove pelo link: ${url}`;
  const whats = linkWhatsApp(espelho.cliente_whatsapp, mensagem);
  const email = linkEmail(espelho.cliente_email, `Espelho de horas ${formatPlaca(espelho.placa)} - ${mes}`, mensagem);
  const reenvio = espelho.status === "recusado";

  const liberar = async () => {
    setEnviando(true);
    try {
      if (antesDeEnviar && !(await antesDeEnviar())) return;
      const r = await rodarAcao(enviarEspelho(espelho.id), reenvio ? "Espelho reenviado ao cliente" : "Link liberado para o cliente");
      if (r.ok) {
        setLiberado(true);
        router.refresh();
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho="sm">
        <DialogHeader>
          <DialogTitle>Enviar para aprovação</DialogTitle>
          <DialogDescription>
            {formatPlaca(espelho.placa)} · {espelho.cliente} · {mes}
          </DialogDescription>
        </DialogHeader>

        {!liberado ? (
          <div className="space-y-3 text-sm">
            <p>
              {reenvio
                ? "O cliente recusou este espelho. Depois de corrigir as horas, reenvie: o link volta a aceitar resposta e a recusa anterior é apagada."
                : "Ao liberar, o cliente consegue abrir o espelho pelo link, conferir as horas e aprovar ou recusar."}
            </p>
            <p className="text-muted-foreground">Total lançado: <strong className="text-foreground">{formatHoras(espelho.total_horas)}</strong></p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="link-espelho">Link do cliente</Label>
              <div className="flex gap-2">
                <Input id="link-espelho" readOnly value={url} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
                <BotaoCopiar texto={url} className="h-10" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {whats
                ? <Button variant="outline" asChild><a href={whats} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>
                : <Button variant="outline" disabled><MessageCircle /> WhatsApp</Button>}
              {email
                ? <Button variant="outline" asChild><a href={email}><Mail /> E-mail</a></Button>
                : <Button variant="outline" disabled><Mail /> E-mail</Button>}
            </div>
            {(!whats || !email) && (
              <p className="text-xs text-muted-foreground">
                {!whats && !email ? "O cliente não tem WhatsApp nem e-mail no cadastro: copie o link e envie." : !whats ? "O cliente não tem WhatsApp no cadastro." : "O cliente não tem e-mail no cadastro."}
              </p>
            )}
            <BotaoCopiar texto={mensagem} rotulo="Copiar mensagem com o link" className="w-full" />
            {espelho.status === "aprovado" && <p className="text-xs text-status-ok">Este espelho já foi aprovado pelo cliente.</p>}
          </div>
        )}

        <DialogFooter>
          {!liberado ? (
            <Button onClick={liberar} disabled={enviando}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />} {reenvio ? "Reenviar ao cliente" : "Liberar link"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- novo espelho / editar dados ----------

/** Dados de um espelho existente para o modo edição. */
export interface EspelhoEdicao {
  id: string;
  veiculo_id: string;
  cliente_id: string;
  obra_id: string | null;
  competencia: string;
  status: string;
}

/** Sem `editar`: cria um espelho e abre as 30 linhas. Com `editar`: troca placa, cliente, obra ou mês. */
export function EspelhoDadosDialog({ aberto, onOpenChange, comp, opcoes, editar }: {
  aberto: boolean; onOpenChange: (v: boolean) => void; comp: string; opcoes: OpcoesEspelho; editar?: EspelhoEdicao | null;
}) {
  const router = useRouter();
  const [veiculo, setVeiculo] = React.useState<string | null>(null);
  const [cliente, setCliente] = React.useState<string | null>(null);
  const [obra, setObra] = React.useState<string | null>(null);
  const [competencia, setCompetencia] = React.useState(comp);
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => {
    if (!aberto) return;
    setVeiculo(editar?.veiculo_id ?? null);
    setCliente(editar?.cliente_id ?? null);
    setObra(editar?.obra_id ?? null);
    setCompetencia(editar ? editar.competencia.slice(0, 7) : comp);
    // só ao abrir (ou trocar de espelho): o objeto `editar` pode ser recriado a cada render da tela de trás
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, comp, editar?.id]);

  // contrato ativo da placa: já traz cliente e obra
  const contrato = React.useMemo(
    () => opcoes.contratos.find((c) => c.veiculo_id === veiculo && (!cliente || c.cliente_id === cliente)) ?? null,
    [opcoes.contratos, veiculo, cliente],
  );
  const escolherVeiculo = (v: string | null) => {
    setVeiculo(v);
    const c = opcoes.contratos.find((x) => x.veiculo_id === v);
    if (c) { setCliente(c.cliente_id); setObra(c.obra_id); }
  };
  const obrasCliente = opcoes.obras.filter((o) => o.cliente_id === cliente);

  const salvar = async () => {
    if (!veiculo || !cliente) return;
    setSalvando(true);
    const dados = {
      veiculo_id: veiculo, cliente_id: cliente, obra_id: obra, competencia,
      contrato_id: contrato && contrato.cliente_id === cliente ? contrato.id : null,
    };
    if (editar) {
      const r = await rodarAcao(editarDadosEspelho(editar.id, dados));
      setSalvando(false);
      if (r.ok) {
        onOpenChange(false);
        router.refresh();
      }
      return;
    }
    const r = await rodarAcao(criarEspelho(dados));
    setSalvando(false);
    if (r.ok && r.dados) {
      onOpenChange(false);
      router.push(`/espelho/${r.dados}`);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho="sm">
        <DialogHeader>
          <DialogTitle>{editar ? "Editar espelho" : "Novo espelho de horas"}</DialogTitle>
          <DialogDescription>
            {editar
              ? "Troque a placa, o cliente, a obra ou o mês. As horas já lançadas continuam."
              : "Escolha a placa e o mês. As 30 linhas para lançar as horas aparecem em seguida."}
          </DialogDescription>
        </DialogHeader>
        {editar && editar.status !== "rascunho" && (
          <p className="rounded-lg border border-status-alerta/40 p-2 text-xs">
            Este espelho já foi enviado. O link continua o mesmo e o cliente passa a ver os dados novos.
          </p>
        )}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="esp-placa">Placa</Label>
            <SelectBusca id="esp-placa" value={veiculo} onChange={escolherVeiculo} placeholder="Escolha a placa" busca="Buscar placa…"
              opcoes={opcoes.veiculos.map((v) => ({ value: v.id, label: `${formatPlaca(v.placa)}${v.modelo ? ` · ${v.modelo}` : ""}` }))} />
            {veiculo && contrato && <p className="text-xs text-muted-foreground">Contrato ativo {contrato.numero ?? ""}: cliente e obra preenchidos.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="esp-cliente">Cliente</Label>
            <SelectBusca id="esp-cliente" value={cliente} onChange={(v) => { setCliente(v); setObra(null); }} placeholder="Escolha o cliente" busca="Buscar cliente…"
              opcoes={opcoes.clientes.map((c) => ({ value: c.id, label: c.nome }))} />
          </div>
          {obrasCliente.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="esp-obra">Obra (opcional)</Label>
              <SelectSimples id="esp-obra" value={obra} onChange={setObra} vazio="Sem obra" opcoes={obrasCliente.map((o) => ({ value: o.id, label: o.nome }))} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="esp-mes">Mês</Label>
            <SeletorMes id="esp-mes" value={competencia} onChange={setCompetencia} className="w-56 whitespace-nowrap" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={!veiculo || !cliente || salvando}>
            {salvando ? <Loader2 className="animate-spin" /> : editar ? <Save /> : <Plus />} {editar ? "Salvar" : "Criar e lançar horas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- lista ----------

/** Filtro de lista longa (placa, cliente) com barra de busca, gravado na URL. */
function FiltroBuscaUrl({ param, rotulo, vazio, busca, opcoes, className }: {
  param: string; rotulo: string; vazio: string; busca: string; opcoes: { value: string; label: string }[]; className?: string;
}) {
  const { get, set } = useUrlParams();
  const id = `f-${param}`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{rotulo}</Label>
      <SelectBusca id={id} aria-label={rotulo} className={cn("h-9 w-52", className)} value={get(param)} vazio={vazio} placeholder={vazio}
        busca={busca} opcoes={opcoes} onChange={(v) => set({ [param]: v })} />
    </div>
  );
}

const STATUS_ESPELHO = [
  { value: "rascunho", label: "Rascunho" },
  { value: "enviado", label: "Aguardando cliente" },
  { value: "aprovado", label: "Aprovado" },
  { value: "recusado", label: "Recusado" },
];

export function EspelhosCliente({ comp, historico, espelhos, opcoes, podeEditar }: {
  comp: string; historico: boolean; espelhos: EspelhoLista[]; opcoes: OpcoesEspelho; podeEditar: boolean;
}) {
  const { get, set } = useUrlParams();
  const router = useRouter();
  const [novo, setNovo] = React.useState(false);
  const [envio, setEnvio] = React.useState<EspelhoLista | null>(null);
  const [editando, setEditando] = React.useState<EspelhoLista | null>(null);
  const [excluindo, setExcluindo] = React.useState<EspelhoLista | null>(null);
  const total = espelhos.reduce((s, e) => s + Number(e.total_horas || 0), 0);
  const aguardando = espelhos.filter((e) => e.status === "enviado").length;
  // placa e cliente continuam ao trocar de aba; status só existe no Histórico
  const aba = (h: boolean) => set({ aba: h ? "historico" : null, status: null });
  const filtrando = !!(get("placa") || get("cliente") || (historico && get("status")));
  const filtrosBusca = (
    <>
      <FiltroBuscaUrl param="placa" rotulo="Placa" vazio="Todas" busca="Buscar placa…"
        opcoes={opcoes.veiculos.map((v) => ({ value: v.id, label: `${formatPlaca(v.placa)}${v.modelo ? ` · ${v.modelo}` : ""}` }))} />
      <FiltroBuscaUrl param="cliente" rotulo="Cliente" vazio="Todos" busca="Buscar cliente…" className="w-60"
        opcoes={opcoes.clientes.map((c) => ({ value: c.id, label: c.nome }))} />
    </>
  );

  return (
    <>
      <Cabecalho
        titulo="Espelho de horas"
        descricao="Horas dos veículos lançadas à mão e aprovadas pelo cliente por link"
        acoes={podeEditar && <Button onClick={() => setNovo(true)}><Plus /> Novo espelho</Button>}
      />

      <div className="mb-4 inline-flex rounded-xl border border-foreground/15 p-1" role="tablist" aria-label="Visão">
        <Button role="tab" aria-selected={!historico} size="sm" variant={historico ? "ghost" : "default"} onClick={() => aba(false)}>
          <CalendarDays /> Mês
        </Button>
        <Button role="tab" aria-selected={historico} size="sm" variant={historico ? "default" : "ghost"} onClick={() => aba(true)}>
          <History /> Histórico
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <BarraFiltros>
          {!historico && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="esp-comp" className="text-xs text-muted-foreground">Mês</Label>
              <SeletorMes id="esp-comp" value={comp} onChange={(v) => set({ comp: v })} className="w-56 whitespace-nowrap" />
            </div>
          )}
          {filtrosBusca}
          {historico && <FiltroSelectUrl param="status" rotulo="Status" vazio="Todos" opcoes={STATUS_ESPELHO} />}
          {filtrando && (
            <Button variant="ghost" size="sm" onClick={() => set({ placa: null, cliente: null, status: null })}>
              <X /> Limpar filtros
            </Button>
          )}
        </BarraFiltros>
        {espelhos.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {espelhos.length} espelho(s) · <strong className="text-foreground">{formatHoras(total)}</strong>
            {aguardando > 0 && <> · {aguardando} aguardando o cliente</>}
          </p>
        )}
      </div>

      {espelhos.length === 0 ? (
        historico || filtrando ? (
          <Vazio icone={History} titulo="Nenhum espelho encontrado"
            descricao={filtrando ? "Nenhum espelho com esses filtros. Tente limpar a placa, o cliente ou o status." : "Ainda não há espelhos cadastrados."} />
        ) : (
          <Vazio icone={ClipboardList} titulo={`Nenhum espelho em ${formatCompetencia(comp, true)}`}
            descricao="Crie um espelho por placa para lançar as horas do mês e mandar o link para o cliente aprovar."
            acao={podeEditar && <Button className="mt-2" onClick={() => setNovo(true)}><Plus /> Novo espelho</Button>} />
        )
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {historico && <TableHead>Mês</TableHead>}
                <TableHead>Placa</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Resposta</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {espelhos.map((e) => (
                <TableRow key={e.id}>
                  {historico && <TableCell className="whitespace-nowrap capitalize">{formatCompetencia(e.competencia)}</TableCell>}
                  <TableCell>
                    <Link href={`/espelho/${e.id}`} className="font-mono font-bold hover:underline">{formatPlaca(e.placa)}</Link>
                    {e.modelo && <div className="text-xs text-muted-foreground">{e.modelo}</div>}
                  </TableCell>
                  <TableCell>
                    {e.cliente}
                    {e.obra && <div className="text-xs text-muted-foreground">{e.obra}</div>}
                  </TableCell>
                  <TableCell className="num text-right">{formatHoras(e.total_horas)}</TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell className="hidden max-w-xs text-xs text-muted-foreground md:table-cell">
                    {e.respondido_em ? (
                      <>
                        {e.respondido_por} · {formatDataHora(e.respondido_em)}
                        {e.motivo_recusa && <div className="truncate text-status-critico" title={e.motivo_recusa}>{e.motivo_recusa}</div>}
                      </>
                    ) : e.enviado_em ? `Enviado ${formatDataHora(e.enviado_em)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="outline" size="xs" asChild><Link href={`/espelho/${e.id}`}>{podeEditar && e.status !== "aprovado" ? "Lançar horas" : "Abrir"}</Link></Button>
                      {podeEditar && e.status !== "aprovado" && (
                        <Button variant="outline" size="xs" onClick={() => setEditando(e)}><Pencil /> Editar</Button>
                      )}
                      {(podeEditar || e.status === "enviado" || e.status === "aprovado") && e.status !== "rascunho" ? (
                        <Button variant="outline" size="xs" onClick={() => setEnvio(e)}><Copy /> Link</Button>
                      ) : podeEditar ? (
                        <Button variant="outline" size="xs" onClick={() => setEnvio(e)} disabled={!Number(e.total_horas)}
                          title={!Number(e.total_horas) ? "Lance as horas antes de enviar" : undefined}><Send /> Enviar</Button>
                      ) : null}
                      {podeEditar && e.status !== "aprovado" && (
                        <Button variant="outline" size="xs" onClick={() => setExcluindo(e)} aria-label={`Excluir espelho ${formatPlaca(e.placa)}`}
                          className="text-status-critico hover:text-status-critico"><Trash2 /> Excluir</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {podeEditar && <EspelhoDadosDialog aberto={novo} onOpenChange={setNovo} comp={comp} opcoes={opcoes} />}
      {podeEditar && (
        <EspelhoDadosDialog aberto={!!editando} onOpenChange={(v) => !v && setEditando(null)} comp={comp} opcoes={opcoes} editar={editando} />
      )}
      <EnviarEspelhoDialog espelho={envio} aberto={!!envio} onOpenChange={(v) => !v && setEnvio(null)} />
      <Confirmar
        aberto={!!excluindo}
        onOpenChange={(v) => !v && setExcluindo(null)}
        titulo="Excluir este espelho?"
        descricao={excluindo && (
          <>
            As horas lançadas de <strong>{formatPlaca(excluindo.placa)}</strong> ({excluindo.cliente}, {formatCompetencia(excluindo.competencia, true)}) serão apagadas.
            {excluindo.status !== "rascunho" && " O link que o cliente recebeu deixa de funcionar."}
          </>
        )}
        rotulo="Excluir"
        destrutivo
        onConfirmar={async () => {
          if (!excluindo) return;
          const r = await rodarAcao(excluirEspelho(excluindo.id));
          if (!r.ok) throw new Error(r.erro);
          router.refresh();
        }}
      />
    </>
  );
}
