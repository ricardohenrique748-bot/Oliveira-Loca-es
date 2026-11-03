"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { InputMoeda, InputNumero } from "@/components/app/campos";
import { formatBRL } from "@/lib/calculos/dinheiro";
import { formatHoras } from "@/lib/format";
import { DESCONTOS_FECHAMENTO, calcularFechamento, type FechamentoEspelho } from "@/lib/calculos/espelho";

type Chave = keyof FechamentoEspelho;

const fmtDias = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** linha da planilha: rótulo com pontilhado, "R$" e valor à direita (fora do componente: os campos não perdem o foco) */
function Linha({ rotulo, valor, destaque, forte, rs = true }: { rotulo: React.ReactNode; valor: React.ReactNode; destaque?: boolean; forte?: boolean; rs?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[1fr_auto_9.5rem] items-center gap-2 border-b px-3 py-1 text-xs uppercase last:border-0", forte && "text-sm font-bold")}>
      <span className={cn("flex min-w-0 items-baseline gap-1", destaque && "font-semibold text-status-critico")}>
        <span className="shrink-0">{rotulo}</span>
        <span className="mb-1 min-w-4 flex-1 border-b border-dotted border-muted-foreground/50" />
      </span>
      <span className={cn("w-6 italic", destaque && "text-status-critico")}>{rs ? "R$" : ""}</span>
      <span className="flex justify-end text-right">{valor}</span>
    </div>
  );
}

/**
 * Fechamento do espelho no formato da planilha: valor mensal / valor hora, descontos, horas excedentes,
 * mobilização, dias em reparo, totais. Editável na tela interna; só leitura na página do cliente.
 */
export function QuadroFechamento({ totalHoras, valorMensal, franquia, fechamento, editavel, onValorMensal, onFranquia, onFechamento }: {
  totalHoras: number;
  valorMensal: number | null;
  franquia: number | null;
  fechamento: FechamentoEspelho;
  editavel?: boolean;
  onValorMensal?: (v: number | null) => void;
  onFranquia?: (v: number | null) => void;
  onFechamento?: (f: FechamentoEspelho) => void;
}) {
  const r = calcularFechamento(totalHoras, valorMensal, franquia, fechamento);
  const mudar = (k: Chave, v: number | null) => onFechamento?.({ ...fechamento, [k]: v });

  /** valor digitado (editável) ou mostrado */
  const campoValor = (k: Chave) => editavel
    ? <InputMoeda aria-label={k} className="h-7 w-36 text-sm" value={fechamento[k] ?? null} onChange={(v) => mudar(k, v)} />
    : <span className="num">{fechamento[k] ? formatBRL(fechamento[k]).replace("R$", "").trim() : "-"}</span>;
  const calculado = (v: number | null | undefined) => <span className="num">{v ? formatBRL(v).replace("R$", "").trim() : "-"}</span>;

  return (
    <div className="overflow-hidden rounded-md border text-sm">
      {/* cabeçalho: total de horas, valor mensal e valor hora */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b-2 bg-muted/40 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-widest">Total:</span>
        <span className="num rounded bg-yellow-300 px-2 py-0.5 font-bold text-black">{formatHoras(totalHoras).toUpperCase()}</span>
        <span className="ml-auto text-xs font-bold uppercase tracking-[0.3em]">Valor mensal</span>
        {editavel
          ? <InputMoeda aria-label="Valor mensal" className="h-8 w-40" value={valorMensal} onChange={(v) => onValorMensal?.(v)} placeholder="0,00" />
          : <span className="num font-semibold">{formatBRL(valorMensal)}</span>}
        <span className="flex items-center gap-1 text-xs uppercase text-muted-foreground">
          por
          {editavel
            ? <InputNumero aria-label="Horas do mês" casas={2} className="num h-8 w-20 text-right" value={franquia} onChange={(v) => onFranquia?.(v)} />
            : <span className="num">{franquia ?? "-"}</span>}
          h
        </span>
        <span className="text-xs uppercase">valor hora</span>
        <span className="num rounded bg-yellow-300 px-2 py-0.5 font-bold text-black">{r ? formatBRL(r.valorHora).replace("R$", "").trim() : "-"}</span>
      </div>

      {!r && editavel && <p className="border-b px-3 py-2 text-xs text-muted-foreground">Informe o valor mensal para calcular o fechamento.</p>}

      <div>
        {DESCONTOS_FECHAMENTO.map(([k, rotulo]) => <Linha key={k} rotulo={rotulo} valor={campoValor(k)} />)}
        <Linha destaque rotulo={<>Pagamento horas excedente{r && r.horasExcedentes > 0 ? ` ${formatHoras(r.horasExcedentes).toUpperCase()}` : ""}</>}
          valor={calculado(r?.valorExcedente)} />
        <Linha rotulo="Mobilização" valor={campoValor("mobilizacao")} />
        <Linha rotulo="Desmobilização" valor={campoValor("desmobilizacao")} />
        <Linha rs={false} rotulo="Dias em reparo mecânico" valor={
          <span className="flex items-center gap-2">
            {editavel
              ? <InputNumero aria-label="Dias em reparo mecânico" casas={1} className="num h-7 w-20 text-right" value={fechamento.dias_reparo ?? null} onChange={(v) => mudar("dias_reparo", v)} />
              : <span className="num">{fechamento.dias_reparo ? fmtDias(fechamento.dias_reparo) : ""}</span>}
            <span className="font-bold italic">DIAS</span>
          </span>} />
        <Linha rs={false} rotulo="Dias trabalhados" valor={
          <span className="flex items-center gap-2"><span className="num">{r ? fmtDias(r.diasTrabalhados) : "-"}</span><span className="font-bold italic">DIAS</span></span>} />
        <Linha forte rotulo="Valor dias em reparo mecânico" valor={calculado(r?.valorDiasReparo)} />
        <Linha rotulo="Valor total dos dias trabalhados" valor={calculado(r?.valorDiasTrabalhados)} />
        <Linha destaque rotulo="Valor total dos descontos" valor={calculado(r?.totalDescontos)} />
        <Linha forte rotulo="Total líquido" valor={<span className="font-bold">{calculado(r?.totalLiquido)}</span>} />
        <Linha rotulo="Total bruto" valor={calculado(r?.totalBruto)} />
      </div>
    </div>
  );
}
