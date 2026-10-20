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
  senha: z.string().min(8, "Senha com no mínimo 8 caracteres").nullish(),
  perfil,
  ativo: z.boolean().default(true),
  empresas: z.array(z.string().uuid()).default([]),
});

export async function salvarUsuario(userId: string | null, dados: unknown) {
  return executar(async () => {
    await exigirEscrita("configuracoes");
    const u = usuarioSchema.parse(dados);
    const admin = createAdminClient();
    let id = userId;
    if (!id) {
      if (!u.senha) throw new Error("Informe a senha inicial");
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email, password: u.senha, email_confirm: true, user_metadata: { nome: u.nome, perfil: u.perfil },
      });
      if (error) throw new Error(error.message.includes("already") ? "E-mail já cadastrado" : error.message);
      id = data.user.id;
    } else {
      const { error } = await admin.auth.admin.updateUserById(id, { email: u.email, ...(u.senha ? { password: u.senha } : {}), ban_duration: u.ativo ? "none" : "876000h" });
      if (error) throw error;
    }
    checar(await admin.from("usuarios_perfil").upsert({ user_id: id, nome: u.nome, perfil: u.perfil, ativo: u.ativo }));
    checar(await admin.from("usuario_empresas").delete().eq("user_id", id));
    if (u.empresas.length) checar(await admin.from("usuario_empresas").insert(u.empresas.map((empresa_id) => ({ user_id: id!, empresa_id }))));
    return { id };
  }, ["/configuracoes"], userId ? "Usuário atualizado" : "Usuário criado");
}
