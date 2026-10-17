import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { podeEscrever, podeLer, type Modulo, type Perfil } from "@/lib/permissoes";

export interface Empresa {
  id: string;
  apelido: string;
  razao_social: string;
}

export interface Sessao {
  userId: string;
  email: string;
  nome: string;
  perfil: Perfil;
  empresas: Empresa[];
  /** empresa selecionada no topo (null = todas) */
  empresaId: string | null;
}

export const COOKIE_EMPRESA = "ol_empresa";

let cachedSessao: Sessao | null = null;

export async function getSessao(forceRefresh = false): Promise<Sessao | null> {
  if (cachedSessao && !forceRefresh) return cachedSessao;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    cachedSessao = null;
    return null;
  }
  const [{ data: perfil }, { data: empresas }] = await Promise.all([
    supabase.from("usuarios_perfil").select("nome, perfil, ativo").eq("user_id", user.id).maybeSingle(),
    supabase.from("empresas").select("id, apelido, razao_social").eq("ativo", true).order("apelido"),
  ]);
  if (!perfil || !perfil.ativo) {
    cachedSessao = null;
    return null;
  }
  const lista = empresas ?? [];
  const escolhida = typeof window !== "undefined" ? localStorage.getItem(COOKIE_EMPRESA) : null;
  cachedSessao = {
    userId: user.id,
    email: user.email ?? "",
    nome: perfil.nome,
    perfil: perfil.perfil,
    empresas: lista,
    empresaId: lista.some((e) => e.id === escolhida) ? escolhida : null,
  };
  return cachedSessao;
}

/** Troca a empresa selecionada: grava a escolha, atualiza a sessão em memória e avisa as telas para recarregar. */
export function selecionarEmpresa(empresaId: string | null) {
  if (typeof window === "undefined") return;
  if (empresaId) localStorage.setItem(COOKIE_EMPRESA, empresaId);
  else localStorage.removeItem(COOKIE_EMPRESA);
  // antes do evento: quem recarrega ao ouvi-lo já lê a empresa nova via getSessao()
  if (cachedSessao) cachedSessao.empresaId = empresaId;
  window.dispatchEvent(new CustomEvent("oliveira:empresa", { detail: empresaId }));
}

export class ErroPermissao extends Error {}

/** Para checagem de permissão de escrita antes de salvar/excluir. */
export async function exigirEscrita(modulo: Modulo): Promise<Sessao> {
  const s = await getSessao();
  if (!s) throw new ErroPermissao("Sessão expirada. Entre novamente.");
  if (!podeEscrever(s.perfil, modulo)) throw new ErroPermissao("Seu perfil não permite esta operação.");
  return s;
}

export async function exigirSessao(modulo?: Modulo): Promise<Sessao> {
  const s = await getSessao();
  if (!s) throw new ErroPermissao("Sessão expirada.");
  if (modulo && !podeLer(s.perfil, modulo)) throw new ErroPermissao("Sem permissão.");
  return s;
}

interface AuthContextType {
  sessao: Sessao | null;
  loading: boolean;
  trocarEmpresa: (empresaId: string | null) => void;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  sessao: null,
  loading: true,
  trocarEmpresa: () => {},
  sair: async () => {},
  recarregar: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async (force = false) => {
    try {
      const s = await getSessao(force);
      setSessao(s);
    } catch {
      setSessao(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        await carregar(true);
      } else if (event === "SIGNED_OUT") {
        cachedSessao = null;
        setSessao(null);
        setLoading(false);
      }
    });
    // troca de empresa feita em qualquer lugar (cabeçalho, filtros): o estado do contexto acompanha
    const aoTrocarEmpresa = (e: Event) => {
      const empresaId = (e as CustomEvent<string | null>).detail ?? null;
      setSessao((ant) => (ant && ant.empresaId !== empresaId ? { ...ant, empresaId } : ant));
    };
    window.addEventListener("oliveira:empresa", aoTrocarEmpresa);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("oliveira:empresa", aoTrocarEmpresa);
    };
  }, [carregar]);

  const trocarEmpresa = useCallback((empresaId: string | null) => selecionarEmpresa(empresaId), []);

  const sair = useCallback(async () => {
    cachedSessao = null;
    const supabase = createClient();
    await supabase.auth.signOut();
    setSessao(null);
  }, []);

  return (
    <AuthContext.Provider value={{ sessao, loading, trocarEmpresa, sair, recarregar: () => carregar(true) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
