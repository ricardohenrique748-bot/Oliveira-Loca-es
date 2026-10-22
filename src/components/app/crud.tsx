"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import type { DefaultValues, FieldValues, Path } from "react-hook-form";
import type { ZodType, ZodTypeDef } from "zod";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { DataTable, type OpcoesExport } from "./data-table";
import { FormularioDialog, type Campo } from "./formulario";
import { Cabecalho, Confirmar, rodarAcao } from "./comuns";
import { BarraFiltros, BuscaUrl } from "./url";

type Res = { ok: true; mensagem?: string; dados?: unknown } | { ok: false; erro: string };

export interface CrudProps<T extends { id: string }, V extends FieldValues> {
  titulo: string;
  descricao?: React.ReactNode;
  entidade: string;
  linhas: T[];
  total?: number;
  pagina?: number;
  tamanho?: number;
  colunas: ColumnDef<T, unknown>[];
  campos: Campo<V>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: ZodType<V, ZodTypeDef, any>;
  novo: DefaultValues<V>;
  paraForm: (r: T) => DefaultValues<V>;
  salvar: (id: string | null, dados: V) => Promise<Res>;
  excluir?: (id: string) => Promise<Res>;
  /** texto do diálogo de exclusão (padrão: "Esta ação não pode ser desfeita.") */
  avisoExcluir?: (r: T) => React.ReactNode;
  podeEditar: boolean;
  exportar?: OpcoesExport<T>;
  filtros?: React.ReactNode;
  busca?: string | false;
  acoesLinha?: (r: T) => React.ReactNode;
  hrefLinha?: (r: T) => string;
  cartaoMobile?: (r: T) => React.ReactNode;
  tamanhoForm?: "sm" | "md" | "lg" | "xl";
  semCabecalho?: boolean;
  /** abre o formulário de novo automaticamente quando ?novo=1 */
  abrirNovo?: boolean;
  /** repassados ao formulário */
  extraForm?: (valores: V) => React.ReactNode;
  rotuloAvancado?: string;
  aoAlterar?: (campo: string, valores: V) => Partial<Record<Path<V>, unknown>> | void;
}

export function CrudSimples<T extends { id: string }, V extends FieldValues>(p: CrudProps<T, V>) {
  const router = useRouter();
  const [editando, setEditando] = React.useState<T | null>(null);
  const [aberto, setAberto] = React.useState(!!p.abrirNovo);
  const [excluindo, setExcluindo] = React.useState<T | null>(null);

  const abrir = (r: T | null) => { setEditando(r); setAberto(true); };

  const colunas = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!p.podeEditar && !p.acoesLinha) return p.colunas;
    return [
      ...p.colunas,
      {
        id: "_acoes",
        header: () => <span className="sr-only">Ações</span>,
        meta: { classe: "w-10 text-right", ocultarMobile: false },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {p.acoesLinha?.(row.original)}
            {p.podeEditar && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Ações"><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => abrir(row.original)}><Pencil /> Editar</DropdownMenuItem>
                  {p.excluir && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setExcluindo(row.original)}><Trash2 /> Excluir</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.colunas, p.podeEditar]);

  return (
    <div className="space-y-4">
      {!p.semCabecalho && (
        <Cabecalho titulo={p.titulo} descricao={p.descricao}
          acoes={p.podeEditar && <Button onClick={() => abrir(null)}><Plus /> Novo {p.entidade}</Button>} />
      )}
      {(p.busca !== false || p.filtros) && (
        <BarraFiltros>
          {p.busca !== false && <BuscaUrl placeholder={p.busca || "Buscar…"} />}
          {p.filtros}
          {p.semCabecalho && p.podeEditar && <Button className="ml-auto" size="sm" onClick={() => abrir(null)}><Plus /> Novo {p.entidade}</Button>}
        </BarraFiltros>
      )}
      <DataTable
        colunas={colunas}
        dados={p.linhas}
        getId={(r) => r.id}
        total={p.total}
        pagina={p.pagina}
        tamanho={p.tamanho}
        exportar={p.exportar}
        cartaoMobile={p.cartaoMobile}
        aoClicarLinha={p.hrefLinha ? (r) => router.push(p.hrefLinha!(r)) : p.podeEditar ? (r) => abrir(r) : undefined}
      />
      <FormularioDialog<V>
        aberto={aberto}
        onOpenChange={setAberto}
        titulo={editando ? `Editar ${p.entidade}` : `Novo ${p.entidade}`}
        tamanho={p.tamanhoForm}
        campos={p.campos}
        schema={p.schema}
        valores={editando ? p.paraForm(editando) : p.novo}
        onSalvar={(v) => p.salvar(editando?.id ?? null, v) as Promise<{ ok: true; mensagem?: string } | { ok: false; erro: string }>}
        onSucesso={() => router.refresh()}
        extra={p.extraForm} rotuloAvancado={p.rotuloAvancado} aoAlterar={p.aoAlterar}
      />
      <Confirmar aberto={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)} titulo={`Excluir ${p.entidade}?`}
        descricao={(excluindo && p.avisoExcluir?.(excluindo)) ?? "Esta ação não pode ser desfeita."} rotulo="Excluir" destrutivo
        onConfirmar={async () => {
          if (!excluindo || !p.excluir) return;
          const r = await rodarAcao(p.excluir(excluindo.id) as never);
          if (r.ok) router.refresh();
        }} />
    </div>
  );
}
