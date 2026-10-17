"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Loader2, Play, Plus, Save, Settings, Users, Workflow } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Label } from "@/components/ui/basicos";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { SelectSimples, type Opcao } from "@/components/ui/select";
import { Cabecalho, StatusBadge, rodarAcao } from "@/components/app/comuns";
import { DataTable } from "@/components/app/data-table";
import { InputNumero } from "@/components/app/campos";
import { PERFIS, type Perfil } from "@/lib/permissoes";
import { formatDataHora } from "@/lib/format";
import { rodarJobs, salvarParametros, salvarUsuario } from "./actions";

export type Usuario = { id: string; email: string; nome: string; perfil: Perfil; ativo: boolean; empresas: string[]; ultimoAcesso: string | null };
type Parametros = {
  base_dias_mes: number; alerta_dias_fatura: number; alerta_dias_os_aberta: number; alerta_dias_pagar: number; preventiva_pct_alerta: number;
  template_cobranca_email: string; template_cobranca_whatsapp: string;
};

export function ConfiguracoesCliente({ parametros, usuarios, erroUsuarios, empresas }: { parametros: Parametros; usuarios: Usuario[]; erroUsuarios: string | null; empresas: Opcao[] }) {
  const router = useRouter();
  const [p, setP] = React.useState(parametros);
  const [salvando, setSalvando] = React.useState(false);
  const [rodando, setRodando] = React.useState(false);
  const [editando, setEditando] = React.useState<Usuario | "novo" | null>(null);
  const set = <K extends keyof Parametros>(k: K, v: Parametros[K]) => setP((x) => ({ ...x, [k]: v }));

  const colunas: ColumnDef<Usuario, unknown>[] = [
    { accessorKey: "nome", header: "Nome", meta: { tituloMobile: true } },
    { accessorKey: "email", header: "E-mail" },
    { accessorKey: "perfil", header: "Perfil", cell: ({ getValue }) => <Badge variant="secondary">{PERFIS.find((x) => x.valor === getValue())?.rotulo}</Badge> },
    { id: "empresas", header: "Empresas", cell: ({ row: { original: u } }) => u.perfil === "admin" ? "Todas" : u.empresas.map((e) => empresas.find((x) => x.value === e)?.label).join(", ") || <span className="text-status-critico">Nenhuma</span> },
    { accessorKey: "ultimoAcesso", header: "Último acesso", cell: ({ getValue }) => formatDataHora(getValue() as string | null) },
    { accessorKey: "ativo", header: "Situação", cell: ({ getValue }) => <StatusBadge status={getValue() ? "ativo" : "encerrado"} /> },
  ];

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Configurações" />
      <Tabs defaultValue="parametros">
        <TabsList>
          <TabsTrigger value="parametros"><Settings /> Parâmetros</TabsTrigger>
          <TabsTrigger value="usuarios"><Users /> Usuários e perfis</TabsTrigger>
          <TabsTrigger value="jobs"><Workflow /> Rotinas</TabsTrigger>
        </TabsList>

        <TabsContent value="parametros" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Cálculo e alertas</CardTitle><CardDescription>Base de dias usada no proporcional de medições e repasses, e antecedência dos alertas.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="cfg-base">Base de dias do mês</Label><InputNumero id="cfg-base" value={p.base_dias_mes} onChange={(v) => set("base_dias_mes", v ?? 30)} />
                <p className="text-xs text-muted-foreground">Padrão 30. Valor = (mensal ÷ base) × dias.</p></div>
              <div className="space-y-1.5"><Label htmlFor="cfg-fat">Alerta de fatura vencendo (dias)</Label><InputNumero id="cfg-fat" value={p.alerta_dias_fatura} onChange={(v) => set("alerta_dias_fatura", v ?? 5)} /></div>
              <div className="space-y-1.5"><Label htmlFor="cfg-pagar">Janela de contas a pagar (dias)</Label><InputNumero id="cfg-pagar" value={p.alerta_dias_pagar} onChange={(v) => set("alerta_dias_pagar", v ?? 7)} /></div>
              <div className="space-y-1.5"><Label htmlFor="cfg-os">OS aberta há mais de (dias)</Label><InputNumero id="cfg-os" value={p.alerta_dias_os_aberta} onChange={(v) => set("alerta_dias_os_aberta", v ?? 3)} /></div>
              <div className="space-y-1.5"><Label htmlFor="cfg-prev">Preventiva “próxima” a partir de (%)</Label>
                <InputNumero id="cfg-prev" value={Math.round(p.preventiva_pct_alerta * 100)} onChange={(v) => set("preventiva_pct_alerta", (v ?? 90) / 100)} /></div>
              <div className="space-y-1.5"><Label>Documentos</Label><p className="pt-2 text-sm text-muted-foreground">Alertas em 30, 15 e 0 dias.</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Templates de cobrança</CardTitle>
              <CardDescription>Variáveis: {"{contato} {nf} {placa} {periodo} {valor} {vencimento} {empresa}"}</CardDescription></CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="cfg-email">E-mail</Label><Textarea id="cfg-email" rows={9} value={p.template_cobranca_email} onChange={(e) => set("template_cobranca_email", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="cfg-zap">WhatsApp</Label><Textarea id="cfg-zap" rows={9} value={p.template_cobranca_whatsapp} onChange={(e) => set("template_cobranca_whatsapp", e.target.value)} /></div>
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={salvando} onClick={async () => { setSalvando(true); const r = await rodarAcao(salvarParametros(p)); setSalvando(false); if (r.ok) router.refresh(); }}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar parâmetros
            </Button>
            <Link className="text-sm underline" href="/cadastros/categorias">Categorias de despesa</Link>
            <Link className="text-sm underline" href="/cadastros/empresas">Empresas</Link>
          </div>
        </TabsContent>

        <TabsContent value="usuarios" className="space-y-3">
          {erroUsuarios ? (
            <Card className="p-4 text-sm text-status-critico">Não foi possível listar usuários: {erroUsuarios}. Configure SUPABASE_SERVICE_ROLE_KEY no servidor.</Card>
          ) : (
            <DataTable colunas={colunas} dados={usuarios} getId={(u) => u.id} aoClicarLinha={(u) => setEditando(u)}
              topo={<Button size="sm" onClick={() => setEditando("novo")}><Plus /> Novo usuário</Button>} />
          )}
          <Card><CardContent className="grid gap-2 pt-5 text-sm sm:grid-cols-2">
            {PERFIS.map((x) => <p key={x.valor}><strong>{x.rotulo}:</strong> <span className="text-muted-foreground">{x.descricao}</span></p>)}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader><CardTitle>Rotinas agendadas (pg_cron)</CardTitle>
              <CardDescription>Rodam automaticamente no Supabase. Use o botão para executar agora (ex.: após importar planilhas).</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                <li><strong className="text-foreground">gerar_medicoes</strong> — diário 06:00: períodos encerrados sem medição → “a faturar”</li>
                <li><strong className="text-foreground">gerar_recorrentes</strong> — dia 1, 06:00: mantém 12 meses de contas recorrentes</li>
                <li><strong className="text-foreground">atualizar_preventivas</strong> — diário 06:00: recalcula status dos planos</li>
                <li><strong className="text-foreground">gerar_alertas</strong> — diário 07:00: painel “Hoje” e sininho</li>
              </ul>
              <Button disabled={rodando} onClick={async () => {
                setRodando(true);
                const r = await rodarJobs();
                setRodando(false);
                if (r.ok) toast.success(`Concluído: ${r.dados.medicoes} medições, ${r.dados.recorrentes} contas recorrentes, ${r.dados.preventivas} planos, ${r.dados.alertas} alertas`);
                else toast.error(r.erro);
                router.refresh();
              }}>{rodando ? <Loader2 className="animate-spin" /> : <Play />} Executar rotinas agora</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <DialogoUsuario usuario={editando} empresas={empresas} onOpenChange={(v) => !v && setEditando(null)} onFeito={() => router.refresh()} />
    </div>
  );
}

function DialogoUsuario({ usuario, empresas, onOpenChange, onFeito }: { usuario: Usuario | "novo" | null; empresas: Opcao[]; onOpenChange: (v: boolean) => void; onFeito: () => void }) {
  const u = usuario === "novo" ? null : usuario;
  const [f, setF] = React.useState({ nome: "", email: "", senha: "", perfil: "consulta" as Perfil, ativo: true, empresas: [] as string[] });
  const [salvando, setSalvando] = React.useState(false);
  React.useEffect(() => {
    setF(u ? { nome: u.nome, email: u.email, senha: "", perfil: u.perfil, ativo: u.ativo, empresas: u.empresas } : { nome: "", email: "", senha: "", perfil: "consulta", ativo: true, empresas: empresas.map((e) => e.value) });
  }, [usuario, u, empresas]);
  return (
    <Dialog open={!!usuario} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{u ? "Editar usuário" : "Novo usuário"}</DialogTitle><DialogDescription>Perfil define os módulos; empresas limitam os dados visíveis (admin vê todas).</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="u-nome">Nome</Label><Input id="u-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="u-email">E-mail</Label><Input id="u-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="u-senha">{u ? "Nova senha (opcional)" : "Senha inicial"}</Label><Input id="u-senha" type="password" autoComplete="new-password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Perfil</Label><SelectSimples value={f.perfil} onChange={(v) => setF({ ...f, perfil: (v as Perfil) ?? "consulta" })} opcoes={PERFIS.map((x) => ({ value: x.valor, label: x.rotulo }))} /></div>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">Empresas</legend>
            {empresas.map((e) => (
              <label key={e.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.empresas.includes(e.value)} onCheckedChange={(v) => setF({ ...f, empresas: v ? [...f.empresas, e.value] : f.empresas.filter((x) => x !== e.value) })} /> {e.label}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: !!v })} /> Usuário ativo</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={salvando} onClick={async () => {
            setSalvando(true);
            const r = await rodarAcao(salvarUsuario(u?.id ?? null, { ...f, senha: f.senha || null }));
            setSalvando(false);
            if (r.ok) { onOpenChange(false); onFeito(); }
          }}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
