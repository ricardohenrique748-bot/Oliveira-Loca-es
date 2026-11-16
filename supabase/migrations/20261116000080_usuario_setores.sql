-- =====================================================================
-- 0080 Vários setores (perfis) por usuário
-- usuarios_perfil.perfil continua sendo o setor principal (obrigatório);
-- usuarios_perfil.perfis_extras guarda os outros setores marcados.
-- Todas as policies passam por app.tem_perfil(): basta ela olhar o
-- conjunto (principal + extras) para cada regra valer com vários setores.
-- Também desfaz o rascunho "cuida_frota" (quem tinha vira setor Manutenção).
-- =====================================================================

alter table public.usuarios_perfil
  add column if not exists perfis_extras public.perfil_usuario[] not null default '{}';

-- todos os setores do usuário logado (vazio se inativo)
create or replace function app.perfis_atuais()
returns public.perfil_usuario[] language sql stable security definer set search_path = public as $$
  select coalesce((select array[up.perfil] || up.perfis_extras
                     from public.usuarios_perfil up where up.user_id = auth.uid() and up.ativo), '{}')
$$;

create or replace function app.tem_perfil(variadic perfis public.perfil_usuario[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.perfis_atuais() && perfis, false)
$$;

-- admin como setor extra também vê todas as empresas
create or replace function app.tem_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_empresa is null
      or app.tem_perfil('admin')
      or exists (select 1 from public.usuario_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = p_empresa)
$$;

-- "só faturas avulsas" não vale para quem tem o setor admin
create or replace function app.ve_faturas_contrato()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not up.so_faturas_avulsas or 'admin' = any(array[up.perfil] || up.perfis_extras)
                     from public.usuarios_perfil up where up.user_id = auth.uid()), true)
$$;

grant execute on function app.perfis_atuais() to authenticated, service_role;

-- ---------- desfaz o rascunho "cuida_frota", se tiver sido aplicado ----------
do $$
declare
  t text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'usuarios_perfil' and column_name = 'cuida_frota') then
    update public.usuarios_perfil
       set perfis_extras = perfis_extras || 'manutencao'::public.perfil_usuario
     where cuida_frota and perfil not in ('admin', 'manutencao') and not ('manutencao' = any(perfis_extras));
  end if;
  foreach t in array array['veiculos','fornecedores','planos_manutencao','ordens_servico','os_itens','pneus',
                           'pneus_historico','documentos_veiculo','leituras','calendario_licenciamento','multas'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_frota', t);
    end if;
  end loop;
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "arquivos_insert_frota" on storage.objects';
    execute 'drop policy if exists "arquivos_update_frota" on storage.objects';
  end if;
end $$;
drop function if exists app.cuida_frota();
alter table public.usuarios_perfil drop column if exists cuida_frota;

notify pgrst, 'reload schema';
