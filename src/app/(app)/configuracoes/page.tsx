import React from "react";
import { useAuth, exigirSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { CarregandoPagina } from "@/components/app/carregando";
import { useAsyncPage } from "@/lib/use-async-page";
import { ConfiguracoesCliente, type Usuario } from "./client";
import type { Perfil } from "@/lib/permissoes";

export default function ConfiguracoesPage() {
  const { sessao } = useAuth();

  const { data, loading } = useAsyncPage(async () => {
    const s = await exigirSessao("configuracoes");
    const cfg = await getConfig();
    let usuarios: Usuario[] = [];
    let erroUsuarios: string | null = null;

    try {
      const admin = createAdminClient();
      const [{ data: auth }, { data: perfis }, { data: vinculos }] = await Promise.all([
        admin.auth.admin.listUsers({ perPage: 500 }),
        admin.from("usuarios_perfil").select("*"),
        admin.from("usuario_empresas").select("user_id, empresa_id"),
      ]);
      usuarios = (auth?.users ?? []).map((u) => {
        const p = perfis?.find((x) => x.user_id === u.id);
        return {
          id: u.id,
          email: u.email ?? "",
          nome: p?.nome ?? u.email ?? "",
          perfil: p?.perfil ?? "consulta",
          ativo: p?.ativo ?? false,
          soAvulsas: p?.so_faturas_avulsas ?? false,
          ocultaPagar: p?.oculta_contas_pagar ?? false,
          perfisExtras: (p as { perfis_extras?: Perfil[] | null } | undefined)?.perfis_extras ?? [],
          empresas: (vinculos ?? []).filter((v) => v.user_id === u.id).map((v) => v.empresa_id),
          ultimoAcesso: u.last_sign_in_at ?? null,
        };
      }).sort((a, b) => a.nome.localeCompare(b.nome));
    } catch {
      // Fallback para cliente autenticado normal
      try {
        const supabase = createClient();
        const [{ data: perfis }, { data: vinculos }, { data: contas }] = await Promise.all([
          supabase.from("usuarios_perfil").select("*"),
          supabase.from("usuario_empresas").select("user_id, empresa_id"),
          // e-mail e último acesso (SQL 0084); sem a função, vem vazio e o e-mail fica opcional ao editar
          supabase.rpc("fn_admin_listar_usuarios" as never).then((r) => r, () => ({ data: null })),
        ]);
        const contaDe = new Map(((contas ?? []) as { user_id: string; email: string | null; ultimo_acesso: string | null }[]).map((c) => [c.user_id, c]));
        usuarios = (perfis ?? []).map((p) => ({
          id: p.user_id,
          email: contaDe.get(p.user_id)?.email ?? "",
          nome: p.nome,
          perfil: p.perfil,
          ativo: p.ativo,
          soAvulsas: p.so_faturas_avulsas ?? false,
          ocultaPagar: p.oculta_contas_pagar ?? false,
          perfisExtras: (p as { perfis_extras?: Perfil[] | null }).perfis_extras ?? [],
          empresas: (vinculos ?? []).filter((v) => v.user_id === p.user_id).map((v) => v.empresa_id),
          ultimoAcesso: contaDe.get(p.user_id)?.ultimo_acesso ?? null,
        })).sort((a, b) => a.nome.localeCompare(b.nome));
      } catch (err2) {
        erroUsuarios = (err2 as Error).message;
      }
    }

    return {
      parametros: {
        base_dias_mes: Number(cfg.base_dias_mes),
        alerta_dias_fatura: Number(cfg.alerta_dias_fatura),
        alerta_dias_os_aberta: Number(cfg.alerta_dias_os_aberta),
        alerta_dias_pagar: Number(cfg.alerta_dias_pagar),
        preventiva_pct_alerta: Number(cfg.preventiva_pct_alerta),
        template_cobranca_email: cfg.template_cobranca_email,
        template_cobranca_whatsapp: cfg.template_cobranca_whatsapp,
      },
      usuarios,
      erroUsuarios,
      empresas: s.empresas.map((e) => ({ value: e.id, label: e.apelido })),
    };
  }, [sessao?.empresaId]);

  if (loading || !data) return <CarregandoPagina />;
  return <ConfiguracoesCliente {...data} />;
}
