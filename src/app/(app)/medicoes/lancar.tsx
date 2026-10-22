"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { Moeda } from "@/components/app/comuns";
import { InputMoeda, InputNumero } from "@/components/app/campos";
import { baseCobranca, cobrancaAvulsa, calcularDiasCorridos, calcularDiasPeriodoLivre, calcularValorMedicao, periodoMensalDesde } from "@/lib/calculos";
import { formatPeriodo, formatPlaca } from "@/lib/format";
import { FORMAS_FATURA, type FormaFatura } from "@/lib/schemas/operacao";
import { dadosLancamento, lancarMedicao, type ContratoLancamento } from "./actions";

const OPCOES_FORMA: Opcao[] = Object.entries(FORMAS_FATURA).map(([value, label]) => ({ value, label }));

/**
 * Lançamento manual de medição: escolhe o contrato (ou vem fixo) e o período.
 * Sugere o mês seguinte à última medição; dias e valor são recalculados ao mudar o período.
 */
export function DialogoLancarMedicao({ aberto, onOpenChange, contratos, contratoId, baseDias, onLancado }: {
  aberto: boolean; onOpenChange: (v: boolean) => void;
  /** opções de contrato (quando não vem fixo) */
  contratos?: Opcao[];
  contratoId?: string;
  baseDias: number;
  onLancado: (competencia: string) => void;
}) {
  const [contrato, setContrato] = React.useState<string | null>(contratoId ?? null);
  const [info, setInfo] = React.useState<ContratoLancamento | null>(null);
  const [inicio, setInicio] = React.useState("");
  const [fim, setFim] = React.useState("");
  const [dias, setDias] = React.useState(0);
  const [diasManual, setDiasManual] = React.useState(false);
  const [acrescimos, setAcrescimos] = React.useState(0);
  const [descontos, setDescontos] = React.useState(0);
  const [observacoes, setObservacoes] = React.useState("");
  const [forma, setForma] = React.useState<FormaFatura>("boleto");
  const [carregando, setCarregando] = React.useState(false);

  React.useEffect(() => {
    if (!aberto) return;
    setContrato(contratoId ?? null); setInfo(null); setAcrescimos(0); setDescontos(0); setObservacoes(""); setForma("boleto"); setDiasManual(false);
  }, [aberto, contratoId]);

  React.useEffect(() => {
    if (!aberto || !contrato) return;
    let vivo = true;
    setCarregando(true);
    dadosLancamento(contrato).then((r) => {
      if (!vivo) return;
      setCarregando(false);
      if (!r.ok) return toast.error(r.erro);
      setInfo(r.dados); setInicio(r.dados.sugestao.inicio); setFim(r.dados.sugestao.fim); setDiasManual(false);
    });
    return () => { vivo = false; };
  }, [aberto, contrato]);

  // dias automáticos a partir do período (até o usuário editar à mão)
  React.useEffect(() => {
    if (!info || diasManual || !inicio || !fim || fim < inicio) return;
    const entrada = { periodo: { inicio, fim }, dataInicioContrato: info.data_inicio, dataFimEfetiva: info.data_fim_efetiva, baseDias };
    // por hora: as horas trabalhadas são digitadas
    setDias(info.tipo_cobranca === "hora" ? 0 : info.tipo_cobranca === "diaria" ? calcularDiasCorridos(entrada) : calcularDiasPeriodoLivre(entrada));
  }, [info, inicio, fim, diasManual, baseDias]);

  const valor = info ? calcularValorMedicao({ valorMensal: info.valor_mensal, dias, acrescimos, descontos, baseDias: baseCobranca(info.tipo_cobranca, baseDias) }).valorFinal : 0;
  const avulsa = cobrancaAvulsa(info?.tipo_cobranca);
  const invalido = !info || !inicio || !fim || fim < inicio || dias < 1;

  const lancar = async () => {
    if (!info) return;
    setCarregando(true);
    const r = await lancarMedicao({ contrato_id: info.id, periodo_inicio: inicio, periodo_fim: fim, dias, acrescimos, descontos, forma_pagamento: forma, observacoes: observacoes || null });
    setCarregando(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`Fatura ${formatPlaca(info.placa)} lançada (${formatPeriodo(inicio, fim)})`);
    onOpenChange(false);
    onLancado(r.dados.competencia);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho="md">
        <DialogHeader>
          <DialogTitle>Lançar fatura</DialogTitle>
          <DialogDescription>Escolha o contrato e o período. O sistema sugere o mês seguinte à última fatura do contrato; dias e valor são calculados automaticamente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!contratoId && (
            <div className="space-y-1.5">
              <Label htmlFor="lancar-contrato">Contrato</Label>
              <SelectSimples id="lancar-contrato" value={contrato} onChange={setContrato} opcoes={contratos ?? []} placeholder="Selecione o contrato…" />
            </div>
          )}
          {carregando && !info && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando contrato…</p>}
          {info && <>
            <div className="rounded-md bg-muted p-3 text-sm">
              <p><span className="font-mono font-semibold">{formatPlaca(info.placa)}</span> · {info.cliente}{info.obra ? ` · ${info.obra}` : ""}</p>
              <p className="text-xs text-muted-foreground">
                {({ mensal: "Mensal", diaria: "Diária", hora: "Hora" })[info.tipo_cobranca]} <Moeda valor={info.valor_mensal} /> · Última fatura: {info.ultimo_periodo ? formatPeriodo(info.ultimo_periodo.inicio, info.ultimo_periodo.fim) : "nenhuma"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {avulsa ? (
                // diária / hora: a fatura é de um dia só
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="lancar-inicio">Dia</Label>
                  <Input id="lancar-inicio" type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); setFim(e.target.value); setDiasManual(false); }} />
                </div>
              ) : <>
                <div className="space-y-1.5">
                  <Label htmlFor="lancar-inicio">Início do período</Label>
                  {/* mudar o início ajusta o fim para um mês depois */}
                  <Input id="lancar-inicio" type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); if (e.target.value) setFim(periodoMensalDesde(e.target.value).fim); setDiasManual(false); }} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lancar-fim">Fim do período</Label>
                  <Input id="lancar-fim" type="date" value={fim} min={inicio} onChange={(e) => { setFim(e.target.value); setDiasManual(false); }} />
                </div>
              </>}
              <div className="space-y-1.5">
                <Label htmlFor="lancar-dias">{info.tipo_cobranca === "hora" ? "Horas trabalhadas" : info.tipo_cobranca === "diaria" ? "Diárias" : "Dias"}</Label>
                <InputNumero id="lancar-dias" value={dias} onChange={(v) => { setDias(Math.min(31, v ?? 0)); setDiasManual(true); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor</Label>
                <p className="pt-2 text-lg font-semibold"><Moeda valor={valor} /></p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lancar-acr">Acréscimos</Label>
                <InputMoeda id="lancar-acr" permitirVazio={false} value={acrescimos} onChange={(v) => setAcrescimos(v ?? 0)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lancar-desc">Descontos</Label>
                <InputMoeda id="lancar-desc" permitirVazio={false} value={descontos} onChange={(v) => setDescontos(v ?? 0)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lancar-forma">Condição de pagamento</Label>
              <SelectSimples id="lancar-forma" value={forma} onChange={(v) => setForma((v as FormaFatura | null) ?? "boleto")} opcoes={OPCOES_FORMA} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lancar-obs">Observações</Label>
              <Input id="lancar-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">{info.tipo_cobranca === "hora"
              ? <>Por hora: fatura de um dia. Valor = hora × horas + acréscimos − descontos. Dia depois do último estende o contrato.</>
              : info.tipo_cobranca === "diaria"
              ? <>Diária: fatura de um dia. Valor = diária × diárias + acréscimos − descontos. Dia depois do último estende o contrato.</>
              : <>Mês cheio conta {baseDias} dias. Valor = (mensal ÷ {baseDias}) × dias + acréscimos − descontos.</>}</p>
          </>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={invalido || carregando} onClick={lancar}>{carregando && info ? <Loader2 className="animate-spin" /> : <Plus />} Lançar fatura</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
