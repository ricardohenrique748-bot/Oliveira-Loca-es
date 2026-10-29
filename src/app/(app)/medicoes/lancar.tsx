"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { SelectBusca } from "@/components/ui/select-busca";
import { Moeda } from "@/components/app/comuns";
import { InputMoeda, InputNumero } from "@/components/app/campos";
import { baseCobranca, cobrancaAvulsa, diffDias, hojeSP, calcularDiasCorridos, calcularDiasPeriodoLivre, calcularValorMedicao, periodoMensalDesde, somar } from "@/lib/calculos";
import { formatPeriodo, formatPlaca } from "@/lib/format";
import { FORMAS_FATURA, UNIDADES_AVULSA, type FormaFatura, type UnidadeAvulsa } from "@/lib/schemas/operacao";
import { clienteSchema } from "@/lib/schemas/cadastros";
import { FormularioDialog } from "@/components/app/formulario";
import { salvarCliente } from "../cadastros/actions";
import { CAMPOS_CLIENTE, CLIENTE_NOVO } from "../cadastros/clientes/campos";
import { dadosLancamento, lancarFaturaAvulsa, lancarMedicao, type ContratoLancamento } from "./actions";

const OPCOES_FORMA: Opcao[] = Object.entries(FORMAS_FATURA).map(([value, label]) => ({ value, label }));
const OPCOES_UNIDADE: Opcao[] = Object.entries(UNIDADES_AVULSA).map(([value, label]) => ({ value, label }));
const VALOR_POR: Record<UnidadeAvulsa, string> = { mes: "Valor por mês", semana: "Valor por semana", dia: "Valor da diária", hora: "Valor da hora", km: "Valor por km" };

/** Linha da fatura avulsa na tela; qtdManual = quantidade digitada (não segue mais o período);
 *  km × valorKm (opcional) vira um item a mais na fatura, em km */
type ItemTela = { descricao: string; veiculo: string | null; inicio: string; fim: string; quantidade: number; unidade: UnidadeAvulsa; qtdManual: boolean; valorUnitario: number; km: number; valorKm: number };
const itemNovo = (inicio = hojeSP(), fim = inicio, unidade: UnidadeAvulsa = "mes"): ItemTela =>
  ({ descricao: "", veiculo: null, inicio, fim, quantidade: 1, unidade, qtdManual: false, valorUnitario: 0, km: 0, valorKm: 0 });
const multiplicar = (valor: number, qtd: number) => calcularValorMedicao({ valorMensal: valor, dias: qtd, acrescimos: 0, descontos: 0, baseDias: 1 }).valorBase;
const subtotalKm = (i: ItemTela) => (i.km > 0 ? multiplicar(i.valorKm, i.km) : 0);
const subtotal = (i: ItemTela) => somar([multiplicar(i.valorUnitario, i.quantidade), subtotalKm(i)]);

/** Quantidade sugerida pelo período (hora e km: digitados, sem sugestão). */
function quantidadePeriodo(unidade: UnidadeAvulsa, inicio: string, fim: string): number | null {
  if (unidade === "hora" || unidade === "km" || !inicio || !fim || fim < inicio) return null;
  const dias = diffDias(inicio, fim) + 1;
  return unidade === "dia" ? dias : unidade === "semana" ? Math.ceil(dias / 7) : Math.max(1, Math.round(dias / 30));
}

/**
 * Lançamento manual de medição: escolhe o contrato (ou vem fixo) e o período.
 * Sugere o mês seguinte à última medição; dias e valor são recalculados ao mudar o período.
 * Sem contrato (fatura avulsa): cliente e um ou mais itens (descrição, placa, período, quantidade × valor unitário).
 */
export function DialogoLancarMedicao({ aberto, onOpenChange, contratos, contratoId, clientes, veiculos, empresas, empresaPadrao, baseDias, onLancado }: {
  aberto: boolean; onOpenChange: (v: boolean) => void;
  /** opções de contrato (quando não vem fixo) */
  contratos?: Opcao[];
  contratoId?: string;
  /** clientes e empresas da fatura avulsa (sem eles, só com contrato) */
  clientes?: Opcao[];
  /** placas (opcional na avulsa) */
  veiculos?: Opcao[];
  empresas?: Opcao[];
  empresaPadrao?: string | null;
  baseDias: number;
  onLancado: (competencia: string) => void;
}) {
  const podeAvulsa = !contratoId && !!clientes && !!empresas?.length;
  const [semContrato, setSemContrato] = React.useState(false);
  const [empresa, setEmpresa] = React.useState<string | null>(null);
  const [cliente, setCliente] = React.useState<string | null>(null);
  const [numeroOS, setNumeroOS] = React.useState("");
  const [itens, setItens] = React.useState<ItemTela[]>(() => [itemNovo()]);
  // "+ Novo cliente": cadastra sem sair do lançamento; o novo entra na lista e já fica escolhido
  const [novoCliente, setNovoCliente] = React.useState(false);
  const [clientesNovos, setClientesNovos] = React.useState<Opcao[]>([]);
  const opcoesCliente = React.useMemo(
    () => [...(clientes ?? []), ...clientesNovos.filter((n) => !clientes?.some((c) => c.value === n.value))].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [clientes, clientesNovos]);
  const [vencimento, setVencimento] = React.useState("");
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
  // incrementa para recarregar a sugestão do contrato ao reabrir
  const [recarga, setRecarga] = React.useState(0);

  const limpar = React.useCallback(() => {
    setContrato(contratoId ?? null); setInfo(null); setAcrescimos(0); setDescontos(0); setObservacoes(""); setForma("boleto"); setDiasManual(false);
    setRecarga((n) => n + 1);
    // avulsa: mantém o modo e a empresa; o resto volta ao padrão
    setCliente(null); setNumeroOS(""); setItens([itemNovo()]); setVencimento("");
  }, [contratoId]);

  React.useEffect(() => {
    if (aberto) { setSemContrato(false); setEmpresa(empresaPadrao ?? (empresas?.length === 1 ? empresas[0].value : null)); }
  }, [aberto, empresaPadrao, empresas]);

  React.useEffect(() => {
    if (aberto) limpar();
  }, [aberto, limpar]);

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
  }, [aberto, contrato, recarga]);

  // dias automáticos a partir do período (até o usuário editar à mão)
  React.useEffect(() => {
    if (!info || diasManual || !inicio || !fim || fim < inicio) return;
    const entrada = { periodo: { inicio, fim }, dataInicioContrato: info.data_inicio, dataFimEfetiva: info.data_fim_efetiva, baseDias };
    // por hora: as horas trabalhadas são digitadas
    setDias(info.tipo_cobranca === "hora" ? 0 : info.tipo_cobranca === "diaria" ? calcularDiasCorridos(entrada) : calcularDiasPeriodoLivre(entrada));
  }, [info, inicio, fim, diasManual, baseDias]);

  // avulsa: quantidade sugerida pelo período e unidade de cada item (até o usuário editar à mão)
  const sugerir = (i: ItemTela): ItemTela => {
    if (i.qtdManual) return i;
    const q = quantidadePeriodo(i.unidade, i.inicio, i.fim);
    return q == null || q === i.quantidade ? i : { ...i, quantidade: Math.min(99_999, q) };
  };
  const editarItem = (k: number, campos: Partial<ItemTela>) => setItens((lista) => lista.map((i, j) => (j === k ? sugerir({ ...i, ...campos }) : i)));

  const totalItens = somar(itens.map(subtotal));
  const valorAvulsa = Math.max(0, somar([totalItens, acrescimos, -descontos]));
  // avulsa: o que falta para lançar (o botão fica ativo e avisa, em vez de só ficar apagado)
  const faltaAvulsa = (() => {
    if (!empresa) return "Selecione a empresa";
    if (!cliente) return "Selecione o cliente";
    for (const [k, i] of itens.entries()) {
      const n = itens.length > 1 ? ` do item ${k + 1}` : "";
      if (!i.descricao.trim()) return `Descreva o serviço${n}`;
      if (!i.inicio || !i.fim) return `Informe o início e o fim${n}`;
      if (i.fim < i.inicio) return `O fim${n} está antes do início`;
      if (i.quantidade <= 0) return `Informe a quantidade${n}`;
      if (i.valorUnitario <= 0) return `Informe o valor${n}`;
      if (i.km > 0 && i.valorKm <= 0) return `Informe o valor por km${n}`;
    }
    return null;
  })();
  const valor = info ? calcularValorMedicao({ valorMensal: info.valor_mensal, dias, acrescimos, descontos, baseDias: baseCobranca(info.tipo_cobranca, baseDias) }).valorFinal : 0;
  const avulsa = cobrancaAvulsa(info?.tipo_cobranca);
  const invalido = !info || !inicio || !fim || fim < inicio || dias < 1;

  const lancar = async () => {
    if (semContrato) return lancarAvulsa();
    if (!info) return;
    setCarregando(true);
    const r = await lancarMedicao({ contrato_id: info.id, periodo_inicio: inicio, periodo_fim: fim, dias, acrescimos, descontos, forma_pagamento: forma, observacoes: observacoes || null });
    setCarregando(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`Fatura ${formatPlaca(info.placa)} lançada (${formatPeriodo(inicio, fim)})`);
    onOpenChange(false);
    onLancado(r.dados.competencia);
  };

  const lancarAvulsa = async () => {
    if (faltaAvulsa) return toast.error(faltaAvulsa);
    setCarregando(true);
    const r = await lancarFaturaAvulsa({
      empresa_id: empresa, cliente_id: cliente, numero_os: numeroOS.trim() || null,
      itens: itens.flatMap((i) => {
        const base = { veiculo_id: i.veiculo, periodo_inicio: i.inicio, periodo_fim: i.fim };
        const servico = { ...base, descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade, valor_unitario: i.valorUnitario };
        return i.km > 0 ? [servico, { ...base, descricao: `${i.descricao.trim()} - KM rodado`, quantidade: i.km, unidade: "km" as const, valor_unitario: i.valorKm }] : [servico];
      }),
      acrescimos, descontos, data_vencimento: vencimento || null, forma_pagamento: forma, observacoes: observacoes || null,
    });
    setCarregando(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`Fatura avulsa lançada (${opcoesCliente.find((c) => c.value === cliente)?.label ?? ""})`);
    onOpenChange(false);
    onLancado(r.dados.competencia);
  };
  const bloqueado = semContrato ? false : invalido;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent tamanho={semContrato ? "lg" : "md"}>
        <DialogHeader>
          <DialogTitle>Lançar fatura</DialogTitle>
          <DialogDescription>{semContrato
            ? "Fatura direto para o cliente, sem contrato. Inclua um ou mais itens: descreva o serviço, escolha a placa se houver, o período e informe a quantidade (por mês, semana, diária ou hora) e o valor. Se cobrar km rodado, informe os km e o valor por km no próprio item."
            : "Escolha o contrato e o período. O sistema sugere o mês seguinte à última fatura do contrato; dias e valor são calculados automaticamente."}</DialogDescription>
        </DialogHeader>
        {podeAvulsa && (
          <div className="flex gap-1 rounded-md bg-muted p-1" role="group" aria-label="Tipo de fatura">
            <Button size="sm" className="flex-1" variant={semContrato ? "ghost" : "default"} aria-pressed={!semContrato} onClick={() => setSemContrato(false)}>Com contrato</Button>
            <Button size="sm" className="flex-1" variant={semContrato ? "default" : "ghost"} aria-pressed={semContrato} onClick={() => setSemContrato(true)}>Sem contrato (avulsa)</Button>
          </div>
        )}
        {semContrato ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {(empresas?.length ?? 0) > 1 && (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="avulsa-empresa">Empresa</Label>
                  <SelectSimples id="avulsa-empresa" value={empresa} onChange={setEmpresa} opcoes={empresas ?? []} placeholder="Selecione a empresa…" />
                </div>
              )}
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label htmlFor="avulsa-cliente">Cliente</Label>
                <SelectBusca id="avulsa-cliente" busca="Buscar cliente…" value={cliente} onChange={setCliente} opcoes={opcoesCliente} placeholder="Selecione o cliente…"
                  novo={{ rotulo: "Novo cliente", onNovo: () => setNovoCliente(true) }} />
              </div>
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label htmlFor="avulsa-os">Nº da OS <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="avulsa-os" value={numeroOS} maxLength={30} placeholder="Ex.: 1234" onChange={(e) => setNumeroOS(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Itens da fatura</Label>
                <span className="text-sm text-muted-foreground">{itens.length} {itens.length === 1 ? "item" : "itens"} · <Moeda valor={totalItens} /></span>
              </div>
              {itens.map((it, k) => (
                <div key={k} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-xs font-medium text-muted-foreground">{k + 1}.</span>
                    <Input aria-label={`Descrição do item ${k + 1}`} className="flex-1" value={it.descricao} maxLength={500}
                      placeholder="Ex.: frete de máquina, serviço de munck…" onChange={(e) => editarItem(k, { descricao: e.target.value })} />
                    {itens.length > 1 && <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label={`Remover item ${k + 1}`}
                      onClick={() => setItens((lista) => lista.filter((_, j) => j !== k))}><Trash2 /></Button>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`avulsa-inicio-${k}`} className="text-xs">Início</Label>
                      <Input id={`avulsa-inicio-${k}`} type="date" value={it.inicio}
                        onChange={(e) => editarItem(k, { inicio: e.target.value, ...(!it.fim || it.fim < e.target.value ? { fim: e.target.value } : {}) })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`avulsa-fim-${k}`} className="text-xs">Fim</Label>
                      <Input id={`avulsa-fim-${k}`} type="date" value={it.fim} min={it.inicio} onChange={(e) => editarItem(k, { fim: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.3fr_1fr_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label htmlFor={`avulsa-placa-${k}`} className="text-xs">Placa <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                      <SelectBusca id={`avulsa-placa-${k}`} busca="Buscar placa…" value={it.veiculo} onChange={(v) => editarItem(k, { veiculo: v })} opcoes={veiculos ?? []} vazio="Sem placa" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`avulsa-qtd-${k}`} className="text-xs">Quantidade</Label>
                      <div className="flex gap-2">
                        {/* aceita fração (7,5 h); apagado fica vazio em vez de virar 0 */}
                        <InputNumero id={`avulsa-qtd-${k}`} className="w-20 shrink-0" casas={2} value={it.quantidade || null} placeholder={it.unidade === "hora" ? "h" : it.unidade === "km" ? "km" : "0"}
                          onChange={(v) => editarItem(k, { quantidade: Math.max(0, Math.min(99_999, Math.round((v ?? 0) * 100) / 100)), qtdManual: true })} />
                        <SelectSimples aria-label={`Unidade do item ${k + 1}`} className="min-w-0 flex-1" value={it.unidade}
                          onChange={(v) => editarItem(k, { unidade: (v as UnidadeAvulsa | null) ?? "mes", qtdManual: false })} opcoes={OPCOES_UNIDADE} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`avulsa-valor-${k}`} className="text-xs">{VALOR_POR[it.unidade]}</Label>
                      <InputMoeda id={`avulsa-valor-${k}`} permitirVazio={false} value={it.valorUnitario} onChange={(v) => editarItem(k, { valorUnitario: v ?? 0 })} />
                    </div>
                    <p className="pb-2 text-right text-sm font-semibold sm:min-w-24"><Moeda valor={multiplicar(it.valorUnitario, it.quantidade)} /></p>
                  </div>
                  {it.unidade !== "km" && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.3fr_1fr_auto] sm:items-end">
                      <p className="hidden pb-2 text-xs text-muted-foreground sm:block">Cobrar km rodado <span className="font-normal">(opcional)</span></p>
                      <div className="space-y-1">
                        <Label htmlFor={`avulsa-km-${k}`} className="text-xs">KM rodado</Label>
                        <InputNumero id={`avulsa-km-${k}`} casas={2} value={it.km || null} placeholder="km"
                          onChange={(v) => editarItem(k, { km: Math.max(0, Math.min(99_999, Math.round((v ?? 0) * 100) / 100)) })} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`avulsa-valorkm-${k}`} className="text-xs">Valor por km</Label>
                        <InputMoeda id={`avulsa-valorkm-${k}`} permitirVazio={false} value={it.valorKm} onChange={(v) => editarItem(k, { valorKm: v ?? 0 })} />
                      </div>
                      <p className="pb-2 text-right text-sm font-semibold sm:min-w-24"><Moeda valor={subtotalKm(it)} /></p>
                    </div>
                  )}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setItens((lista) => { const u = lista[lista.length - 1]; return [...lista, sugerir(itemNovo(u?.inicio || undefined, u?.fim || undefined, u?.unidade))]; })}>
                <Plus /> Adicionar item
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="avulsa-acr">Acréscimos</Label>
                <InputMoeda id="avulsa-acr" permitirVazio={false} value={acrescimos} onChange={(v) => setAcrescimos(v ?? 0)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avulsa-desc">Descontos</Label>
                <InputMoeda id="avulsa-desc" permitirVazio={false} value={descontos} onChange={(v) => setDescontos(v ?? 0)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avulsa-forma">Condição de pagamento</Label>
                <SelectSimples id="avulsa-forma" value={forma} onChange={(v) => setForma((v as FormaFatura | null) ?? "boleto")} opcoes={OPCOES_FORMA} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avulsa-venc">Vencimento <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="avulsa-venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avulsa-obs">Observações</Label>
              <Input id="avulsa-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm">
              <span className="text-muted-foreground">Valor = soma dos itens (valor × quantidade) + acréscimos − descontos</span>
              <span className="text-lg font-semibold"><Moeda valor={valorAvulsa} /></span>
            </div>
          </div>
        ) : (
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
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={bloqueado || carregando} onClick={lancar}>{carregando && (info || semContrato) ? <Loader2 className="animate-spin" /> : <Plus />} Lançar fatura</Button>
        </DialogFooter>
      </DialogContent>
      <FormularioDialog aberto={novoCliente} onOpenChange={setNovoCliente} titulo="Novo cliente" tamanho="lg"
        descricao="Cadastra o cliente e já escolhe na fatura. Obras e contatos de faturamento se completam depois em Cadastros → Clientes."
        campos={CAMPOS_CLIENTE} schema={clienteSchema} valores={CLIENTE_NOVO} rotuloSalvar="Cadastrar cliente"
        onSalvar={async (v) => {
          const r = await salvarCliente(null, v);
          if (r.ok) {
            setClientesNovos((l) => [...l, { value: r.dados.id, label: v.nome_fantasia || v.razao_social }]);
            setCliente(r.dados.id);
          }
          return r;
        }} />
    </Dialog>
  );
}
