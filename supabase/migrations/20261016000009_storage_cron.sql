-- =====================================================================
-- 0009 Storage (anexos) e jobs pg_cron
-- Blocos protegidos: só executam se storage/pg_cron existirem (Supabase).
-- =====================================================================

-- ---------- Storage ----------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage não disponível — pulando buckets';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values
    ('comprovantes', 'comprovantes', false, 10485760),
    ('anexos', 'anexos', false, 10485760),
    ('fotos', 'fotos', false, 10485760)
  on conflict (id) do nothing;

  -- leitura para qualquer usuário autenticado ativo; escrita para perfis operacionais
  execute $p$
    create policy "arquivos_select" on storage.objects for select to authenticated
    using (bucket_id in ('comprovantes','anexos','fotos') and app.perfil_atual() is not null)
  $p$;
  execute $p$
    create policy "arquivos_insert" on storage.objects for insert to authenticated
    with check (bucket_id in ('comprovantes','anexos','fotos')
      and app.tem_perfil('admin','financeiro','faturamento','manutencao'))
  $p$;
  execute $p$
    create policy "arquivos_update" on storage.objects for update to authenticated
    using (bucket_id in ('comprovantes','anexos','fotos') and app.tem_perfil('admin','financeiro','faturamento','manutencao'))
  $p$;
  execute $p$
    create policy "arquivos_delete" on storage.objects for delete to authenticated
    using (bucket_id in ('comprovantes','anexos','fotos') and app.tem_perfil('admin','financeiro'))
  $p$;
end $$;

-- ---------- pg_cron ----------
-- Horários em UTC (pg_cron no Supabase): 09:00 UTC = 06:00 America/Sao_Paulo
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron não disponível — jobs não agendados';
    return;
  end if;
  create extension if not exists pg_cron;

  perform cron.schedule('gerar_medicoes', '0 9 * * *', 'select app.job_gerar_medicoes()');
  perform cron.schedule('gerar_recorrentes', '0 9 1 * *', 'select app.job_gerar_recorrentes()');
  perform cron.schedule('atualizar_preventivas', '0 9 * * *', 'select app.job_atualizar_preventivas()');
  perform cron.schedule('gerar_alertas', '0 10 * * *', 'select app.job_atualizar_preventivas(); select app.job_gerar_alertas()');
end $$;
