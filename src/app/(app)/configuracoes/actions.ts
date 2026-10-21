"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const parametrosSchema = z.object({
  base_dias_mes: z.number().int().min(28).max(31),
  alerta_dias_fatura: z.number().int().min(0).max(60),
  alerta_dias_os_aberta: z.number().int().min(0).max(60),
  alerta_dias_pagar: z.number().int().min(1).max(60),
  preventiva_pct_alerta: z.number().min(0.5).max(0.99),
  template_cobranca_email: z.string().max(4000),
  template_cobranca_whatsapp: z.string().max(1000),
});

export async function salvarParametros(dados: unknown) {
  return executar(async () => {
    await exigirEscrita("configuracoes");
    const p = parametrosSchema.parse(dados);
    const supabase = await createClient();
    for (const [chave, valor] of Object.entries(p)) {
      checar(await supabase.from("configuracoes").upsert({ chave, valor: valor as Json }));
    }
    return null;
  }, ["/configuracoes", "/medicoes", "/receber", "/dashboard"], "Parâmetros salvos");
}

export async function rodarJobs() {
  return executar(async () => {
    await exigirEscrita("configuracoes");
    const supabase = await createClient();
    return checar(await supabase.rpc("fn_rodar_jobs")) as Record<string, number>;
  }, ["/", "/dashboard", "/medicoes", "/pagar", "/manutencao"]);
}

const perfil = z.enum(["admin", "financeiro", "faturamento", "manutencao", "consulta", "comercial"]);
const usuarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(6, "Senha com no mínimo 6 caracteres").nullish(),
  perfil,
  ativo: z.boolean().default(true),
  empresas: z.array(z.string().uuid()).default([]),
});

export async function salvarUsuario(userId: string | null, dados: unknown) {
  return executar(async () => {
    await exigirEscrita("configuracoes");
    const u = usuarioSchema.parse(dados);
    const senhaFinal = (!userId && (!u.senha || u.senha.trim() === "")) ? "123456" : (u.senha || null);

    const supabase = await createClient();
    const { data: id, error } = await supabase.rpc("fn_admin_salvar_usuario" as any, {
      p_user_id: userId,
      p_email: u.email,
      p_senha: senhaFinal,
      p_nome: u.nome,
      p_perfil: u.perfil,
      p_ativo: u.ativo,
      p_empresas: u.empresas,
    });

    if (error) {
      try {
        const admin = createAdminClient();
        let fallbackId = userId;
        if (!fallbackId) {
          const { data, error: errCreate } = await admin.auth.admin.createUser({
            email: u.email,
            password: senhaFinal || "123456",
            email_confirm: true,
            user_metadata: { nome: u.nome, perfil: u.perfil },
          });
          if (errCreate) throw errCreate;
          fallbackId = data.user.id;
        } else {
          const { error: errUpdate } = await admin.auth.admin.updateUserById(fallbackId, {
            email: u.email,
            ...(senhaFinal ? { password: senhaFinal } : {}),
            ban_duration: u.ativo ? "none" : "876000h",
          });
          if (errUpdate) throw errUpdate;
        }
        checar(await admin.from("usuarios_perfil").upsert({ user_id: fallbackId, nome: u.nome, perfil: u.perfil, ativo: u.ativo }));
        checar(await admin.from("usuario_empresas").delete().eq("user_id", fallbackId));
        if (u.empresas.length) {
          checar(await admin.from("usuario_empresas").insert(u.empresas.map((empresa_id) => ({ user_id: fallbackId!, empresa_id }))));
        }
        return { id: fallbackId };
      } catch (errFallback) {
        throw new Error(error.message || (errFallback as Error).message);
      }
    }

    return { id };
  }, ["/configuracoes"], userId ? "Usuário atualizado" : "Usuário criado! Senha temporária: 123456");
}
