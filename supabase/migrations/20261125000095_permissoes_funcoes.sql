-- =====================================================================
-- 0095 Permissões e search_path das funções (Security Advisor do Supabase)
-- Só permissões e configuração de funções: nenhum dado muda.
--
-- 1) RPCs de repasse e proposta executáveis pelo "anon" (visitante sem login).
--    Elas já recusavam (exigir_perfil), mas não precisam nem estar expostas.
--    Ficam abertas ao anon, de propósito, só as do link público do espelho:
--    fn_espelho_publico e fn_responder_espelho (cliente aprova sem login).
-- 2) Funções novas no schema public deixam de nascer executáveis pelo anon.
--    Quem precisar de anon (como o espelho) concede explicitamente.
-- 3) search_path fixo nas funções que não tinham (lint 0011). Valor =
--    public, extensions: o mesmo que elas já enxergavam na prática.
-- Fora daqui: public.rls_auto_enable (do próprio Supabase) e
-- public.trava_aprovacao_liberacao (não é deste sistema; aguarda decisão).
-- =====================================================================

-- 1) anon fora das RPCs internas
do $$
declare f text;
begin
  foreach f in array array[
    'public.fn_alterar_valor_repasse(uuid,numeric)',
    'public.fn_definir_descontos_repasse(uuid,uuid[])',
    'public.fn_escolher_desconto_repasse(uuid,uuid,boolean)',
    'public.fn_proposta_gerar_contrato(uuid)',
    'public.fn_salvar_ajustes_repasse(uuid,jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
end $$;

-- 2) funções futuras no public não nascem abertas ao anon
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- 3) search_path fixo
do $$
declare f text;
begin
  foreach f in array array[
    'app.add_updated_at_trigger(regclass)',
    'app.aplicar_rls(text,text[],text[],text)',
    'app.base_cobranca(text)',
    'app.base_dias()',
    'app.calcular_dias(date,date,date,date,integer)',
    'app.calcular_preventiva(numeric,numeric,integer,numeric,numeric,date,numeric,numeric,date,numeric)',
    'app.calcular_vencimento(date,integer,integer)',
    'app.cfg_int(text,integer)',
    'app.dias_cobranca(text,date,date,date,date)',
    'app.espelho_antes_salvar()',
    'app.hoje()',
    'app.is_admin()',
    'app.normalizar_placa()',
    'app.pct_alerta_preventiva()',
    'app.periodo_competencia(integer,date)',
    'app.periodo_contendo(integer,date)',
    'app.set_updated_at()',
    'app.ultimo_dia(date)',
    'app.validar_senha(text)',
    'app.valor_proporcional(numeric,integer,integer)',
    'app.veiculo_bloqueia_exclusao()',
    'app.veiculo_calendario_por_tipo()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = public, extensions', f);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
