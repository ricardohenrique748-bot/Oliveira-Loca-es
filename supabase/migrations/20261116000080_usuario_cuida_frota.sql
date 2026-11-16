-- =====================================================================
-- 0080 "Também cuida da frota" por usuário
-- usuarios_perfil.cuida_frota = true dá ao usuário, além do próprio perfil,
-- o que o perfil Manutenção edita: veículos, fornecedores e o módulo de
-- manutenção (documentos, OS, planos, pneus, leituras, licenciamento, multas),
-- e o envio de anexos/fotos. Não libera nada financeiro.
-- As policies abaixo são permissivas: somam às que já existem por perfil.
-- =====================================================================

alter table public.usuarios_perfil add column if not exists cuida_frota boolean not null default false;

create or replace function app.cuida_frota()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select up.cuida_frota and up.ativo
                     from public.usuarios_perfil up where up.user_id = auth.uid()), false)
$$;
grant execute on function app.cuida_frota() to authenticated, service_role;

do $$
declare
  t record;
begin
  for t in select * from (values
    ('veiculos',                 'app.tem_empresa(empresa_id)'),
    ('fornecedores',             'true'),
    ('planos_manutencao',        'app.veiculo_visivel(veiculo_id)'),
    ('ordens_servico',           'app.tem_empresa(empresa_id)'),
    ('os_itens',                 'app.os_visivel(ordem_servico_id)'),
    ('pneus',                    'app.veiculo_visivel(veiculo_id)'),
    ('pneus_historico',          'app.veiculo_visivel(veiculo_id)'),
    ('documentos_veiculo',       'app.veiculo_visivel(veiculo_id)'),
    ('leituras',                 'app.veiculo_visivel(veiculo_id)'),
    ('calendario_licenciamento', 'true'),
    ('multas',                   'app.tem_empresa(empresa_id)')
  ) as x(tabela, filtro) loop
    execute format('drop policy if exists %I on public.%I', t.tabela || '_frota', t.tabela);
    execute format('create policy %I on public.%I for all to authenticated using (app.cuida_frota() and %s) with check (app.cuida_frota() and %s)',
      t.tabela || '_frota', t.tabela, t.filtro, t.filtro);
  end loop;
end $$;

-- anexos e fotos (documentos, OS): envio e substituição, como os perfis operacionais
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists "arquivos_insert_frota" on storage.objects';
    execute $p$
      create policy "arquivos_insert_frota" on storage.objects for insert to authenticated
      with check (bucket_id in ('anexos','fotos') and app.cuida_frota())
    $p$;
    execute 'drop policy if exists "arquivos_update_frota" on storage.objects';
    execute $p$
      create policy "arquivos_update_frota" on storage.objects for update to authenticated
      using (bucket_id in ('anexos','fotos') and app.cuida_frota())
    $p$;
  end if;
end $$;

notify pgrst, 'reload schema';
