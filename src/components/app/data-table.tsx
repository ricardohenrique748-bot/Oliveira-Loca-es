"use client";
import * as React from "react";
import {
  flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState, type Row,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow, Checkbox, Card } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlays";
import { SelectSimples } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { exportarCSV, exportarPDF, exportarXLSX, type ColunaExport } from "@/lib/exportar";
import { TAMANHOS_PAGINA } from "@/lib/consulta";
import { useUrlParams } from "./url";
import { toast } from "sonner";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** campo para ordenação no servidor (?ordem=) */
    ordem?: string;
    direita?: boolean;
    classe?: string;
    /** não mostrar no cartão mobile */
    ocultarMobile?: boolean;
    /** destaque no topo do cartão mobile */
    tituloMobile?: boolean;
  }
}

export interface OpcoesExport<T> {
  nome: string;
  titulo?: string;
  colunas: ColunaExport<T>[];
  /** busca todas as linhas (ignorando paginação) — senão exporta as da página */
  buscarTodos?: () => Promise<T[]>;
  paisagem?: boolean;
}

export interface DataTableProps<T> {
  colunas: ColumnDef<T, unknown>[];
  dados: T[];
  getId: (r: T) => string;
  /** total no servidor → mostra paginação */
  total?: number;
  pagina?: number;
  tamanho?: number;
  selecionavel?: boolean;
  acoesLote?: (selecionados: T[], limpar: () => void) => React.ReactNode;
  cartaoMobile?: (r: T) => React.ReactNode;
  vazio?: React.ReactNode;
  exportar?: OpcoesExport<T>;
  classeLinha?: (r: T) => string | undefined;
  aoClicarLinha?: (r: T) => void;
  rodape?: boolean;
  /** barra extra à direita do topo (filtros, botões) */
  topo?: React.ReactNode;
}

export function DataTable<T>({
  colunas, dados, getId, total, pagina = 1, tamanho = 50, selecionavel, acoesLote, cartaoMobile, vazio = "Nenhum registro encontrado.",
  exportar, classeLinha, aoClicarLinha, rodape, topo,
}: DataTableProps<T>) {
  const url = useUrlParams();
  const [selecao, setSelecao] = React.useState<RowSelectionState>({});
  React.useEffect(() => setSelecao({}), [dados]);

  const colunasFinal = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selecionavel) return colunas;
    return [
      {
        id: "_sel",
        header: ({ table }) => (
          <Checkbox aria-label="Selecionar todos"
            checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)} />
        ),
        cell: ({ row }) => (
          <Checkbox aria-label="Selecionar linha" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()} />
        ),
        meta: { classe: "w-8", ocultarMobile: true },
      },
      ...colunas,
    ];
  }, [colunas, selecionavel]);

  const table = useReactTable({
    data: dados,
    columns: colunasFinal,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => getId(r),
    state: { rowSelection: selecao },
    onRowSelectionChange: setSelecao,
    enableRowSelection: !!selecionavel,
  });

  const selecionados = table.getSelectedRowModel().rows.map((r) => r.original);
  const ordemAtual = url.get("ordem");
  const descAtual = url.get("desc") === "1";
  const paginas = total !== undefined ? Math.max(1, Math.ceil(total / tamanho)) : 1;

  const alternarOrdem = (campo: string) => {
    if (ordemAtual === campo) url.set({ ordem: campo, desc: descAtual ? null : "1" });
    else url.set({ ordem: campo, desc: null });
  };

  return (
    <div className="space-y-3">
      {(exportar || topo || (selecionavel && selecionados.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {selecionavel && selecionados.length > 0 && acoesLote && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand-yellow bg-accent px-3 py-1.5 text-sm">
              <span className="font-medium">{selecionados.length} selecionado(s)</span>
              {acoesLote(selecionados, () => setSelecao({}))}
            </div>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {topo}
            {exportar && <BotaoExportar exportar={exportar} linhasPagina={dados} />}
          </div>
        </div>
      )}

      {/* desktop */}
      <Card className={cn("hidden overflow-hidden md:block", url.pendente && "opacity-60 transition-opacity")}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta;
                  const campo = meta?.ordem;
                  const ativo = campo && ordemAtual === campo;
                  return (
                    <TableHead key={h.id} className={cn(meta?.direita && "text-right", meta?.classe)}
                      aria-sort={ativo ? (descAtual ? "descending" : "ascending") : undefined}>
                      {h.isPlaceholder ? null : campo ? (
                        <button type="button" onClick={() => alternarOrdem(campo)}
                          className={cn("inline-flex items-center gap-1 uppercase hover:text-foreground", meta?.direita && "flex-row-reverse")}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {ativo ? (descAtual ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunasFinal.length} className="h-24 text-center text-muted-foreground">{vazio}</TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(aoClicarLinha && "cursor-pointer", classeLinha?.(row.original))}
                  onClick={aoClicarLinha ? () => aoClicarLinha(row.original) : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.direita && "num text-right", cell.column.columnDef.meta?.classe)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
          {rodape && dados.length > 0 && (
            <TableFooter>
              {table.getFooterGroups().map((fg) => (
                <TableRow key={fg.id}>
                  {fg.headers.map((h) => (
                    <TableCell key={h.id} className={cn(h.column.columnDef.meta?.direita && "num text-right", h.column.columnDef.meta?.classe)}>
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.footer, h.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableFooter>
          )}
        </Table>
      </Card>

      {/* mobile: cartões */}
      <div className={cn("space-y-2 md:hidden", url.pendente && "opacity-60")}>
        {dados.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">{vazio}</Card>}
        {table.getRowModel().rows.map((row) => (
          <Card key={row.id} className={cn("p-3", classeLinha?.(row.original), row.getIsSelected() && "border-brand-yellow")}
            onClick={aoClicarLinha ? () => aoClicarLinha(row.original) : undefined}>
            {selecionavel && (
              <div className="mb-2 flex justify-end">
                <Checkbox aria-label="Selecionar" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} onClick={(e) => e.stopPropagation()} />
              </div>
            )}
            {cartaoMobile ? cartaoMobile(row.original) : <CartaoPadrao row={row} />}
          </Card>
        ))}
      </div>

      {total !== undefined && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {total === 0 ? "0 registros" : `${(pagina - 1) * tamanho + 1}–${Math.min(pagina * tamanho, total)} de ${total.toLocaleString("pt-BR")}`}
          </span>
          <div className="flex items-center gap-2">
            <SelectSimples aria-label="Itens por página" className="h-8 w-20" value={String(tamanho)}
              opcoes={TAMANHOS_PAGINA.map((t) => ({ value: String(t), label: String(t) }))}
              onChange={(v) => url.set({ tamanho: v })} />
            <Button variant="outline" size="icon-sm" disabled={pagina <= 1} aria-label="Página anterior"
              onClick={() => url.set({ pagina: String(pagina - 1) })}><ChevronLeft /></Button>
            <span className="num">{pagina} / {paginas}</span>
            <Button variant="outline" size="icon-sm" disabled={pagina >= paginas} aria-label="Próxima página"
              onClick={() => url.set({ pagina: String(pagina + 1) })}><ChevronRight /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CartaoPadrao<T>({ row }: { row: Row<T> }) {
  const celulas = row.getVisibleCells().filter((c) => !c.column.columnDef.meta?.ocultarMobile && c.column.id !== "_sel");
  const titulo = celulas.find((c) => c.column.columnDef.meta?.tituloMobile) ?? celulas[0];
  const resto = celulas.filter((c) => c !== titulo);
  return (
    <div className="space-y-1.5">
      {titulo && <div className="font-semibold">{flexRender(titulo.column.columnDef.cell, titulo.getContext())}</div>}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {resto.map((c) => {
          const h = c.column.columnDef.header;
          return (
            <React.Fragment key={c.id}>
              <dt className="text-xs text-muted-foreground">{typeof h === "string" ? h : c.column.id}</dt>
              <dd className={cn("min-w-0 break-words", c.column.columnDef.meta?.direita && "num text-right")}>
                {flexRender(c.column.columnDef.cell, c.getContext())}
              </dd>
            </React.Fragment>
          );
        })}
      </dl>
    </div>
  );
}

function BotaoExportar<T>({ exportar, linhasPagina }: { exportar: OpcoesExport<T>; linhasPagina: T[] }) {
  const [carregando, setCarregando] = React.useState(false);
  const rodar = async (tipo: "csv" | "xlsx" | "pdf") => {
    setCarregando(true);
    try {
      const linhas = exportar.buscarTodos ? await exportar.buscarTodos() : linhasPagina;
      if (tipo === "csv") exportarCSV(exportar.nome, exportar.colunas, linhas);
      else if (tipo === "xlsx") await exportarXLSX(exportar.nome, exportar.colunas, linhas);
      else await exportarPDF(exportar.nome, exportar.titulo ?? exportar.nome, exportar.colunas, linhas, { paisagem: exportar.paisagem ?? true });
    } catch (e) {
      toast.error("Falha ao exportar: " + (e as Error).message);
    } finally {
      setCarregando(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={carregando}>
          {carregando ? <Loader2 className="animate-spin" /> : <Download />} Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => rodar("xlsx")}><FileSpreadsheet /> Excel (XLSX)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => rodar("csv")}><FileText /> CSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => rodar("pdf")}><FileText /> PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
