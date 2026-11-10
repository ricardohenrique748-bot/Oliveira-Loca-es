-- =====================================================================
-- 0073 Usuário que só vê faturas avulsas
-- usuarios_perfil.so_faturas_avulsas = true esconde do usuário as faturas
-- com contrato (medicoes.contrato_id não nulo) em todas as telas:
-- receber, faturamento, dashboard, relatórios (as views são security_invoker).
-- Policies RESTRICTIVE: somam (AND) às policies por perfil já existentes.
-- =====================================================================

alter table public.usuarios_perfil add column if not exists so_faturas_avulsas boolean not null default false;

-- true = pode ver faturas com contrato (admin sempre pode)
create or replace function app.ve_faturas_contrato()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not up.so_faturas_avulsas or up.perfil = 'admin'
                     from public.usuarios_perfil up where up.user_id = auth.uid()), true)
$$;

-- recebimentos, nfse_tentativas e boletos usam isto: herdam o bloqueio
create or replace function app.medicao_visivel(p_medicao uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.medicoes m where m.id = p_medicao and app.tem_empresa(m.empresa_id)
                   and (m.contrato_id is null or app.ve_faturas_contrato()))
$$;

drop policy if exists medicoes_so_avulsas on public.medicoes;
create policy medicoes_so_avulsas on public.medicoes as restrictive for all to authenticated
  using (contrato_id is null or app.ve_faturas_contrato())
  with check (contrato_id is null or app.ve_faturas_contrato());

drop policy if exists boletos_so_avulsas on public.boletos;
create policy boletos_so_avulsas on public.boletos as restrictive for select to authenticated
  using (app.medicao_visivel(medicao_id));

grant execute on function app.ve_faturas_contrato() to authenticated, service_role;

notify pgrst, 'reload schema';
