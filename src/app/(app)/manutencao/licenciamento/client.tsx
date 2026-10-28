"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Loader2 } from "lucide-react";
import { Badge, Card, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { Cabecalho, rodarAcao } from "@/components/app/comuns";
import { DataTable } from "@/components/app/data-table";
import { CampoAnexo } from "@/components/app/anexo";
import { hojeSP } from "@/lib/calculos";
import { formatData, formatPlaca } from "@/lib/format";
import { ROTULOS } from "@/lib/schemas/cadastros";
import { confirmarLicenciamento, definirCalendarioVeiculo, salvarCalendarioLicenciamento } from "../actions";

export type LinhaLicenciamento = {
  veiculo_id: string; empresa_apelido: string; placa: string; renavam: string | null; tipo: keyof typeof ROTULOS.tipoVeiculo;
  calendario_licenciamento: "pesado" | "leve"; licenciado_exercicio: number | null; licenciamento_verificado_em: string | null;
  licenciamento_fonte: string | null; exercicio: number; final: number | null; vencimento: string | null; calendario_fonte: string | null;
  situacao: "licenciado" | "vencido" | "vencendo" | "a_vencer" | "sem_calendario" | "placa_invalida"; dias_para_vencer: number | null;
};
export type LinhaCalendario = { ano: number; grupo: "pesado" | "leve"; final: number; vencimento: string; fonte: string | null };

const SITUACAO: Record<LinhaLicenciamento["situacao"], { rotulo: string; variante: "ok" | "critico" | "alerta" | "info" | "neutro" }> = {
  licenciado: { rotulo: "Licenciado (CRLV conferido)", variante: "ok" },
  vencido: { rotulo: "Vencido (previsto)", variante: "critico" },
  vencendo: { rotulo: "Vence em até 30 dias", variante: "alerta" },
  a_vencer: { rotulo: "A vencer", variante: "info" },
  sem_calendario: { rotulo: "Calendário do ano não cadastrado", variante: "neutro" },
  placa_invalida: { rotulo: "Placa sem final numérico", variante: "neutro" },
};
const GRUPOS: Opcao[] = [{ value: "pesado", label: "Caminhões e tratores" }, { value: "leve", label: "Demais veículos" }];
const FINAIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/**
 * Licenciamento por veículo. Sem API oficial gratuita: o vencimento é previsto pelo calendário oficial de SP
 * (final da placa) e o "licenciado" só vale com o CRLV-e do exercício conferido pelo usuário.
 */
export function LicenciamentoCliente({ linhas, calendario, ano, podeEditar }: {
  linhas: LinhaLicenciamento[]; calendario: LinhaCalendario[]; ano: number; podeEditar: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = React.useState<LinhaLicenciamento | null>(null);
  const [editandoAno, setEditandoAno] = React.useState<number | null>(null);

  const colunas = React.useMemo<ColumnDef<LinhaLicenciamento, unknown>[]>(() => [
    { accessorKey: "placa", header: "Placa", meta: { tituloMobile: true }, cell: ({ row: { original: l } }) => (
      <span><span className="font-mono font-semibold">{formatPlaca(l.placa)}</span><span className="block text-xs text-muted-foreground">{ROTULOS.tipoVeiculo[l.tipo] ?? l.tipo} · {l.empresa_apelido}</span></span>
    ) },
    { accessorKey: "renavam", header: "RENAVAM", cell: ({ getValue }) => <span className="font-mono text-sm">{(getValue() as string | null) ?? "—"}</span> },
    { id: "calendario", header: "Calendário", cell: ({ row: { original: l } }) => podeEditar ? (
      <SelectSimples aria-label={`Calendário de ${l.placa}`} className="h-8 w-48" value={l.calendario_licenciamento} opcoes={GRUPOS}
        onChange={async (v) => { if (v && v !== l.calendario_licenciamento) { const r = await rodarAcao(definirCalendarioVeiculo(l.veiculo_id, v)); if (r.ok) router.refresh(); } }} />
    ) : GRUPOS.find((g) => g.value === l.calendario_licenciamento)?.label },
    { id: "vencimento", header: `Vencimento ${ano}`, cell: ({ row: { original: l } }) => l.vencimento
      ? <span>{formatData(l.vencimento)}<span className="block text-xs text-muted-foreground">final {l.final} · previsto</span></span>
      : <span className="text-muted-foreground">—</span> },
    { accessorKey: "situacao", header: "Situação", cell: ({ row: { original: l } }) => (
      <span><Badge variant={SITUACAO[l.situacao].variante}>{SITUACAO[l.situacao].rotulo}</Badge>
        {(l.situacao === "vencendo" || l.situacao === "a_vencer") && l.dias_para_vencer != null &&
          <span className="block text-xs text-muted-foreground">{l.dias_para_vencer === 0 ? "vence hoje" : `faltam ${l.dias_para_vencer} dias`}</span>}</span>
    ) },
    { id: "confirmado", header: "Último exercício confirmado", cell: ({ row: { original: l } }) => l.licenciado_exercicio
      ? <span>{l.licenciado_exercicio}<span className="block text-xs text-muted-foreground">{[l.licenciamento_fonte, l.licenciamento_verificado_em && `em ${formatData(l.licenciamento_verificado_em)}`].filter(Boolean).join(" · ")}</span></span>
      : <span className="text-muted-foreground">Não verificado</span> },
    { id: "acoes", header: () => <span className="sr-only">Ações</span>, meta: { classe: "text-right" }, cell: ({ row: { original: l } }) =>
      podeEditar && l.situacao !== "licenciado"
        ? <Button size="xs" variant="outline" onClick={() => setConfirmando(l)}><CheckCircle2 /> Confirmar {l.exercicio}</Button> : null },
  ], [ano, podeEditar, router]);

  const pendentes = linhas.filter((l) => l.situacao === "vencido" || l.situacao === "vencendo");
  const anos = [ano, ano + 1];

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Licenciamento" descricao="Vencimento previsto pelo calendário oficial de SP (final da placa). Só fica “Licenciado” quando o CRLV-e do exercício é conferido. Alertas a partir de 30 dias do vencimento." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3"><p className="text-xs text-muted-foreground">Veículos</p><p className="text-lg font-semibold">{linhas.length}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Licenciados {ano}</p><p className="text-lg font-semibold text-status-ok">{linhas.filter((l) => l.situacao === "licenciado").length}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Vencidos ou vencendo</p><p className="text-lg font-semibold text-status-critico">{pendentes.length}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Calendário</p>
          <div className="mt-1 flex flex-wrap gap-1">{anos.map((a) => (
            <Button key={a} size="xs" variant="outline" disabled={!podeEditar && !calendario.some((c) => c.ano === a)} onClick={() => setEditandoAno(a)}>
              <CalendarDays /> {a}{calendario.some((c) => c.ano === a) ? "" : " (cadastrar)"}
            </Button>
          ))}</div></Card>
      </div>
      <DataTable colunas={colunas} dados={linhas} getId={(l) => l.veiculo_id}
        classeLinha={(l) => (l.situacao === "vencido" ? "border-l-2 border-l-status-critico" : undefined)}
        exportar={{ nome: `licenciamento_${ano}`, titulo: `Licenciamento ${ano}`, colunas: [
          { titulo: "Placa", valor: (l) => l.placa }, { titulo: "RENAVAM", valor: (l) => l.renavam }, { titulo: "Empresa", valor: (l) => l.empresa_apelido },
          { titulo: "Calendário", valor: (l) => GRUPOS.find((g) => g.value === l.calendario_licenciamento)?.label },
          { titulo: "Vencimento previsto", valor: (l) => l.vencimento, tipo: "data" }, { titulo: "Situação", valor: (l) => SITUACAO[l.situacao].rotulo },
          { titulo: "Último exercício confirmado", valor: (l) => l.licenciado_exercicio }, { titulo: "Verificado em", valor: (l) => l.licenciamento_verificado_em, tipo: "data" },
        ] }} />
      <DialogoConfirmar linha={confirmando} onOpenChange={(v) => !v && setConfirmando(null)} onFeito={() => { setConfirmando(null); router.refresh(); }} />
      <DialogoCalendario ano={editandoAno} calendario={calendario.filter((c) => c.ano === editandoAno)} podeEditar={podeEditar}
        onOpenChange={(v) => !v && setEditandoAno(null)} onFeito={() => { setEditandoAno(null); router.refresh(); }} />
    </div>
  );
}

/** Confirma o exercício a partir do CRLV-e (o usuário confere o ano impresso no documento). */
function DialogoConfirmar({ linha, onOpenChange, onFeito }: { linha: LinhaLicenciamento | null; onOpenChange: (v: boolean) => void; onFeito: () => void }) {
  const [exercicio, setExercicio] = React.useState("");
  const [data, setData] = React.useState(hojeSP());
  const [anexo, setAnexo] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  React.useEffect(() => { if (linha) { setExercicio(String(linha.exercicio)); setData(hojeSP()); setAnexo(null); } }, [linha]);

  const salvar = async () => {
    if (!linha) return;
    setSalvando(true);
    const r = await rodarAcao(confirmarLicenciamento({ veiculo_id: linha.veiculo_id, exercicio: Number(exercicio), verificado_em: data, fonte: "CRLV-e conferido", anexo_url: anexo }));
    setSalvando(false);
    if (r.ok) onFeito();
  };

  return (
    <Dialog open={!!linha} onOpenChange={onOpenChange}>
      <DialogContent tamanho="md">
        <DialogHeader>
          <DialogTitle>Confirmar licenciamento · <span className="font-mono">{linha ? formatPlaca(linha.placa) : ""}</span></DialogTitle>
          <DialogDescription>Confira o exercício impresso no CRLV-e (Detran-SP, Carteira Digital de Trânsito ou portal da SENATRAN). Anexe o CRLV-e para guardar nos documentos do veículo.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="lic-exercicio">Exercício do CRLV-e</Label>
            <Input id="lic-exercicio" type="number" min={2000} max={2100} value={exercicio} onChange={(e) => setExercicio(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="lic-data">Conferido em</Label>
            <Input id="lic-data" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>CRLV-e (PDF) <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <CampoAnexo bucket="anexos" pasta="crlv" valor={anexo} onChange={setAnexo} rotulo="Anexar CRLV-e" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!/^\d{4}$/.test(exercicio) || !data || salvando} onClick={salvar}>{salvando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Calendário oficial de um ano (Detran-SP publica uma vez por ano): 10 finais × caminhões / demais. */
function DialogoCalendario({ ano, calendario, podeEditar, onOpenChange, onFeito }: {
  ano: number | null; calendario: LinhaCalendario[]; podeEditar: boolean; onOpenChange: (v: boolean) => void; onFeito: () => void;
}) {
  const chave = (g: string, f: number) => `${g}-${f}`;
  const [datas, setDatas] = React.useState<Record<string, string>>({});
  const [fonte, setFonte] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  React.useEffect(() => {
    if (ano == null) return;
    setDatas(Object.fromEntries(calendario.map((c) => [chave(c.grupo, c.final), c.vencimento])));
    setFonte(calendario[0]?.fonte ?? `Detran-SP ${ano}`);
  }, [ano, calendario]);

  const completo = ["pesado", "leve"].every((g) => FINAIS.every((f) => datas[chave(g, f)]));
  const salvar = async () => {
    if (ano == null) return;
    setSalvando(true);
    const linhas = (["pesado", "leve"] as const).flatMap((grupo) => FINAIS.map((final) => ({ grupo, final, vencimento: datas[chave(grupo, final)] })));
    const r = await rodarAcao(salvarCalendarioLicenciamento({ ano, fonte, linhas }));
    setSalvando(false);
    if (r.ok) onFeito();
  };

  return (
    <Dialog open={ano != null} onOpenChange={onOpenChange}>
      <DialogContent tamanho="lg">
        <DialogHeader>
          <DialogTitle>Calendário de licenciamento SP {ano}</DialogTitle>
          <DialogDescription>Último dia para licenciar, por final da placa, conforme o calendário oficial publicado pelo Detran-SP para o ano.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
          <span className="font-medium">Final</span><span className="font-medium">Caminhões e tratores</span><span className="font-medium">Demais veículos</span>
          {FINAIS.map((f) => (
            <React.Fragment key={f}>
              <span className="text-center font-mono">{f}</span>
              {(["pesado", "leve"] as const).map((g) => (
                <Input key={g} type="date" aria-label={`Final ${f} ${g === "pesado" ? "caminhões" : "demais"}`} className="h-8" disabled={!podeEditar}
                  value={datas[chave(g, f)] ?? ""} onChange={(e) => setDatas((d) => ({ ...d, [chave(g, f)]: e.target.value }))} />
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="space-y-1.5"><Label htmlFor="cal-fonte">Fonte</Label>
          <Input id="cal-fonte" value={fonte} disabled={!podeEditar} onChange={(e) => setFonte(e.target.value)} placeholder="Ex.: Detran-SP — calendário 2027" /></div>
        {podeEditar && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            <Button disabled={!completo || !fonte.trim() || salvando} onClick={salvar}>{salvando && <Loader2 className="animate-spin" />} Salvar calendário</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
