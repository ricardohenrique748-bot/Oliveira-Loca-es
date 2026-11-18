"use server";
import { z } from "zod";
import { exigirEscrita } from "@/lib/auth";
import { checar, executar } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/server";
import { separarPerfis } from "@/lib/permissoes";
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
  /** ao editar, vazio = mantém o e-mail atual */
  email: z.string().trim().email("E-mail inválido").or(z.literal("")).nullish().transform((v) => v || null),
  senha: z.string().trim().min(8, "Senha com no mínimo 8 caracteres")
    .regex(/[A-Za-z]/, "A senha precisa ter letras").regex(/\d/, "A senha precisa ter números").nullish(),
  /** setores marcados (um ou mais); o de mais acesso vira o principal */
  perfis: z.array(perfil).min(1, "Marque pelo menos um setor"),
  ativo: z.boolean().default(true),
  soAvulsas: z.boolean().default(false),
  ocultaPagar: z.boolean().default(false),
  empresas: z.array(z.string().uuid()).default([]),
});

export async function salvarUsuario(userId: string | null, dados: unknown) {
  return executar(async () => {
    await exigirEscrita("configuracoes");
    const u = usuarioSchema.parse(dados);
    if (!userId && !u.senha) throw new Error("Informe a senha inicial do usuário");
    if (!userId && !u.email) throw new Error("Informe o e-mail do usuário");

    const { perfil: principal, extras } = separarPerfis(u.perfis);
    const supabase = await createClient();
    const id = checar(await supabase.rpc("fn_admin_salvar_usuario" as any, {
      p_user_id: userId,
      p_email: u.email,
      p_senha: u.senha || null,
      p_nome: u.nome,
      p_perfil: principal,
      p_ativo: u.ativo,
      p_empresas: u.empresas,
    }));
    // uma coluna por vez: se uma migration ainda não foi aplicada no Supabase, só trava quando o valor importa
    const alvo = (id as string | null) ?? userId!;
    const gravar = async (coluna: string, valor: unknown, importa: boolean, migration: string) => {
      const r = await supabase.from("usuarios_perfil").update({ [coluna]: valor } as never).eq("user_id", alvo);
      if (!r.error) return;
      const semColuna = r.error.message.includes(coluna);
      if (!semColuna) throw new Error(r.error.message);
      if (importa) throw new Error(`O banco ainda não tem a coluna ${coluna}: rode a migration ${migration} no Supabase (SQL Editor).`);
    };
    await gravar("so_faturas_avulsas", u.soAvulsas, u.soAvulsas, "0073");
    await gravar("oculta_contas_pagar", u.ocultaPagar, u.ocultaPagar, "0074");
    await gravar("perfis_extras", extras, extras.length > 0, "0080");
    return { id };
  }, ["/configuracoes"], userId ? "Usuário atualizado" : "Usuário criado. Passe a senha inicial ao usuário.");
}
