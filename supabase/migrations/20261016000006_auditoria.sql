-- =====================================================================
-- 0006 auditoria: trigger genérico em tabelas financeiras e de
-- manutenção (usuário, tabela, registro, antes, depois, data)
-- =====================================================================

create table public.auditoria (
  id bigint generated always as identity primary key,
  user_id uuid,
  tabela text not null,
  registro_id uuid,
  acao public.acao_auditoria not null,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);
create index on public.auditoria (tabela, registro_id);
create index on public.auditoria (criado_em desc);

alter table public.auditoria enable row level security;
create policy auditoria_select on public.auditoria for select to authenticated using (app.is_admin());
-- sem policies de escrita: só o trigger (security definer) grava

create or replace function app.auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
begin
  -- não registra updates que só mexem em updated_at
  if tg_op = 'UPDATE' and (v_antes - 'updated_at') = (v_depois - 'updated_at') then
    return new;
  end if;
  insert into public.auditoria (user_id, tabela, registro_id, acao, antes, depois)
  values (auth.uid(), tg_table_name, coalesce((v_depois->>'id')::uuid, (v_antes->>'id')::uuid),
          tg_op::public.acao_auditoria, v_antes, v_depois);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['contratos','medicoes','recebimentos','repasses','repasse_abatimentos','contas_pagar',
    'veiculos','planos_manutencao','ordens_servico','os_itens','pneus','documentos_veiculo','leituras',
    'locadores','contas_bancarias','usuarios_perfil','usuario_empresas','configuracoes']
  loop
    execute format('create trigger trg_%s_auditoria after insert or update or delete on public.%I
      for each row execute function app.auditar()', t, t);
  end loop;
end $$;
