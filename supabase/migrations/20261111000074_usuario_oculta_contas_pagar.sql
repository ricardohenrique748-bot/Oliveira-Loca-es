-- =====================================================================
-- 0074 Ocultar contas a pagar por usuário
-- usuarios_perfil.oculta_contas_pagar = true esconde do usuário todas as
-- contas a pagar (tela, dashboard e relatórios: views são security_invoker).
-- As duas marcações por usuário passam a valer também para admin.
-- =====================================================================

alter table public.usuarios_perfil add column if not exists oculta_contas_pagar boolean not null default false;

-- agora vale para qualquer perfil, inclusive admin
create or replace function app.ve_faturas_contrato()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not up.so_faturas_avulsas
                     from public.usuarios_perfil up where up.user_id = auth.uid()), true)
$$;

create or replace function app.ve_contas_pagar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not up.oculta_contas_pagar
                     from public.usuarios_perfil up where up.user_id = auth.uid()), true)
$$;

drop policy if exists contas_pagar_oculta on public.contas_pagar;
create policy contas_pagar_oculta on public.contas_pagar as restrictive for all to authenticated
  using (app.ve_contas_pagar())
  with check (app.ve_contas_pagar());

grant execute on function app.ve_contas_pagar() to authenticated, service_role;

notify pgrst, 'reload schema';
