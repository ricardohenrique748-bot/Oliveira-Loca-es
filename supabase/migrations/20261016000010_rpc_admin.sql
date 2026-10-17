-- =====================================================================
-- 0010 RPC administrativa: executar os jobs sob demanda (Configurações)
-- =====================================================================
create or replace function public.fn_rodar_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  perform app.exigir_perfil('admin');
  r := jsonb_build_object(
    'medicoes', app.job_gerar_medicoes(),
    'recorrentes', app.job_gerar_recorrentes(),
    'preventivas', app.job_atualizar_preventivas(),
    'alertas', app.job_gerar_alertas()
  );
  return r;
end $$;

revoke execute on function public.fn_rodar_jobs() from public, anon;
grant execute on function public.fn_rodar_jobs() to authenticated, service_role;
