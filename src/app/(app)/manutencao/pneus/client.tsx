"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import type { Opcao } from "@/components/ui/select";
import { CrudSimples } from "@/components/app/crud";
import { FiltroSelectUrl } from "@/components/app/url";
import type { Campo } from "@/components/app/formulario";
import { pneuSchema, type PneuForm } from "@/lib/schemas/manutencao";
import { formatData, formatKm, formatPlaca } from "@/lib/format";
import { excluirPneu, historicoPneu, salvarPneu } from "../actions";

export type LinhaPneu = {
  id: string; veiculo_id: string | null; placa: string | null; posicao: string | null; marca: string | null; medida: string | null; numero_fogo: string;
  data_compra: string | null; km_instalacao: number | null; ressolagens: number; status: PneuForm["status"]; observacoes: string | null; km_rodado: number | null;
};
const STATUS: Record<string, { rotulo: string; v: "ok" | "info" | "alerta" | "neutro" }> = {
  em_uso: { rotulo: "Em uso", v: "ok" }, estoque: { rotulo: "Estoque", v: "info" }, ressolagem: { rotulo: "Na ressolagem", v: "alerta" }, descartado: { rotulo: "Descartado", v: "neutro" },
};
const EVENTOS: Record<string, string> = { instalacao: "Instalação", remocao: "Remoção", rodizio: "Rodízio", ressolagem: "Ressolagem", descarte: "Descarte" };

export function PneusCliente({ linhas, veiculos, podeEditar }: { linhas: LinhaPneu[]; veiculos: Opcao[]; podeEditar: boolean }) {
  const [hist, setHist] = React.useState<{ pneu: LinhaPneu; itens: { id: string; data: string; evento: string; posicao: string | null; km: number | null; placa: string | null }[] } | null>(null);
  const colunas: ColumnDef<LinhaPneu, unknown>[] = [
    { accessorKey: "numero_fogo", header: "Nº de fogo", meta: { tituloMobile: true }, cell: ({ getValue }) => <span className="font-mono font-semibold">{getValue() as string}</span> },
    { accessorKey: "placa", header: "Veículo", cell: ({ getValue }) => (getValue() ? <span className="font-mono">{formatPlaca(getValue() as string)}</span> : "—") },
    { accessorKey: "posicao", header: "Posição" },
    { id: "pneu", header: "Marca / medida", cell: ({ row }) => [row.original.marca, row.original.medida].filter(Boolean).join(" · ") },
    { accessorKey: "ressolagens", header: "Ressolagens", meta: { direita: true } },
    { accessorKey: "km_rodado", header: "Km rodados", meta: { direita: true }, cell: ({ getValue }) => formatKm(getValue() as number | null) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={STATUS[row.original.status].v}>{STATUS[row.original.status].rotulo}</Badge> },
  ];
  const campos: Campo<PneuForm>[] = [
    { nome: "numero_fogo", rotulo: "Número de fogo", obrigatorio: true, col: 2 },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.rotulo })), col: 2 },
    { nome: "ressolagens", rotulo: "Ressolagens", tipo: "numero", col: 2 },
    { nome: "veiculo_id", rotulo: "Veículo", tipo: "select", vazio: "Estoque", opcoes: veiculos, col: 3 },
    { nome: "posicao", rotulo: "Posição", col: 3, placeholder: "DE, DD, T1E…" },
    { nome: "marca", rotulo: "Marca", col: 2 },
    { nome: "medida", rotulo: "Medida", col: 2, placeholder: "295/80R22.5" },
    { nome: "data_compra", rotulo: "Compra", tipo: "data", col: 2 },
    { nome: "km_instalacao", rotulo: "Km na instalação", tipo: "numero", col: 3 },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", col: 6 },
  ];
  return (
    <>
      <CrudSimples<LinhaPneu, PneuForm>
        titulo="Pneus" entidade="pneu" busca="Nº de fogo…" tamanhoForm="lg"
        descricao="Controle por número de fogo. Trocas de veículo/posição, ressolagens e descarte ficam no histórico."
        linhas={linhas} colunas={colunas} campos={campos} schema={pneuSchema as never}
        filtros={<>
          <FiltroSelectUrl param="veiculo" rotulo="Veículo" opcoes={veiculos} />
          <FiltroSelectUrl param="status" rotulo="Status" opcoes={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.rotulo }))} />
        </>}
        novo={{ veiculo_id: null, posicao: null, marca: null, medida: null, numero_fogo: "", data_compra: null, km_instalacao: null, ressolagens: 0, status: "estoque", observacoes: null }}
        paraForm={(n) => ({ veiculo_id: n.veiculo_id, posicao: n.posicao, marca: n.marca, medida: n.medida, numero_fogo: n.numero_fogo, data_compra: n.data_compra, km_instalacao: n.km_instalacao, ressolagens: n.ressolagens, status: n.status, observacoes: n.observacoes })}
        salvar={salvarPneu} excluir={excluirPneu} podeEditar={podeEditar}
        acoesLinha={(n) => (
          <Button size="icon-sm" variant="ghost" aria-label="Histórico" onClick={async () => { const r = await historicoPneu(n.id); if (r.ok) setHist({ pneu: n, itens: r.dados }); }}><History /></Button>
        )}
        exportar={{ nome: "pneus", colunas: [
          { titulo: "Nº fogo", valor: (n) => n.numero_fogo }, { titulo: "Placa", valor: (n) => n.placa }, { titulo: "Posição", valor: (n) => n.posicao },
          { titulo: "Marca", valor: (n) => n.marca }, { titulo: "Medida", valor: (n) => n.medida }, { titulo: "Ressolagens", valor: (n) => n.ressolagens, tipo: "numero" },
          { titulo: "Km rodados", valor: (n) => n.km_rodado, tipo: "numero" }, { titulo: "Status", valor: (n) => STATUS[n.status].rotulo },
        ] }}
      />
      <Dialog open={!!hist} onOpenChange={(v) => !v && setHist(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Histórico do pneu {hist?.pneu.numero_fogo}</DialogTitle><DialogDescription>Instalações, rodízios, ressolagens e descarte.</DialogDescription></DialogHeader>
          {hist && (hist.itens.length === 0 ? <p className="text-sm text-muted-foreground">Sem eventos registrados.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Evento</TableHead><TableHead>Veículo</TableHead><TableHead>Posição</TableHead><TableHead className="text-right">Km</TableHead></TableRow></TableHeader>
              <TableBody>{hist.itens.map((h) => (
                <TableRow key={h.id}><TableCell>{formatData(h.data)}</TableCell><TableCell>{EVENTOS[h.evento] ?? h.evento}</TableCell>
                  <TableCell className="font-mono">{h.placa ? formatPlaca(h.placa) : "—"}</TableCell><TableCell>{h.posicao ?? "—"}</TableCell><TableCell className="text-right">{formatKm(h.km)}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
