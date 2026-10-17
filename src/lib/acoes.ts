import { ZodError, type ZodType } from "zod";
import { ErroPermissao } from "@/lib/auth";

export type Resultado<T = undefined> = { ok: true; dados: T; mensagem?: string } | { ok: false; erro: string; codigo?: string };

interface ErroPg {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/** Traduz erros do PostgreSQL/PostgREST para mensagens em português. */
export function traduzirErro(e: unknown): { erro: string; codigo?: string } {
  if (e instanceof ErroPermissao) return { erro: e.message, codigo: "PERMISSAO" };
  if (e instanceof ZodError) return { erro: e.issues.map((i) => i.message).join("; "), codigo: "VALIDACAO" };
  const pg = e as ErroPg;
  const msg = pg?.message ?? String(e);
  if (pg?.hint && /^[A-Z_]+$/.test(pg.hint)) return { erro: msg, codigo: pg.hint };
  switch (pg?.code) {
    case "23505": {
      if (/contratos_veiculo_ativo_uk/.test(msg)) return { erro: "Este veículo já tem um contrato ativo.", codigo: pg.code };
      if (/placa/.test(msg)) return { erro: "Já existe um veículo com esta placa.", codigo: pg.code };
      if (/medicoes_contrato_periodo_uk/.test(msg)) return { erro: "Já existe medição deste contrato neste período.", codigo: pg.code };
      if (/cnpj/.test(msg)) return { erro: "CNPJ já cadastrado.", codigo: pg.code };
      return { erro: "Registro duplicado.", codigo: pg.code };
    }
    case "23503":
      return { erro: "Este registro está em uso por outros lançamentos e não pode ser excluído.", codigo: pg.code };
    case "23514": {
      if (/conta_veiculo_ck|conta_descontar_ck/.test(msg)) return { erro: "Despesa de veículo exige a placa.", codigo: pg.code };
      if (/veiculo_locador_ck/.test(msg)) return { erro: "Veículo de locador exige o locador (e próprio não pode ter locador).", codigo: pg.code };
      if (/placa_check/.test(msg)) return { erro: "Placa inválida (use ABC1D23 ou ABC1234).", codigo: pg.code };
      if (/contrato_datas_ck/.test(msg)) return { erro: "Datas do contrato inconsistentes.", codigo: pg.code };
      return { erro: "Valor fora das regras permitidas.", codigo: pg.code };
    }
    case "42501":
      return { erro: msg.includes("row-level security") ? "Seu perfil não tem permissão para esta operação." : msg, codigo: pg.code };
    case "P0001":
      return { erro: msg, codigo: pg.hint ?? pg.code };
    default:
      return { erro: msg || "Erro inesperado", codigo: pg?.code };
  }
}

/** Executa uma ação, captura erros e dispara evento de revalidação. */
export async function executar<T>(fn: () => Promise<T>, _revalidar: string[] = [], mensagem?: string): Promise<Resultado<T>> {
  try {
    const dados = await fn();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oliveira:revalidar", { detail: { caminhos: _revalidar } }));
    }
    return { ok: true, dados, mensagem };
  } catch (e) {
    console.error("[acao]", e);
    return { ok: false, ...traduzirErro(e) };
  }
}

/** Lança o erro do Supabase (para usar dentro de executar). */
export function checar<T>(r: { data: T; error: ErroPg | null }): T {
  if (r.error) throw r.error;
  return r.data;
}

export function validar<T>(schema: ZodType<T>, dados: unknown): T {
  return schema.parse(dados);
}
