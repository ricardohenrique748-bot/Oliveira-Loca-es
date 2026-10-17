-- =====================================================================
-- 0005 RLS: perfis × empresas
--
-- Matriz de acesso (L = leitura, E = escrita)
-- tabela                 admin  financeiro  faturamento  manutencao  consulta
-- empresas               LE     L           L            L           L
-- contas_bancarias       LE     LE          L            -           L
-- clientes/obras/contat. LE     LE          LE           L           L
-- locadores (PII)        LE     LE          -            -           -   (demais usam vw_locadores_publico)
-- fornecedores           LE     LE          L            LE          L
-- veiculos               LE     LE          L            LE          L
-- categorias_despesa     LE     LE          L            L           L
-- contratos              LE     LE          LE           -           L
-- medicoes/recebimentos  LE     LE          LE           -           L
-- repasses/abatimentos   LE     LE          -            -           L
-- contas_pagar           LE     LE          -            L(veículo)  L
-- manutenção (planos…)   LE     L           L            LE          L
-- alertas                L/E(lida) para todos (filtrado por empresa)
-- configuracoes          LE     L           L            L           L
-- usuarios_perfil/empr.  LE     próprio     próprio      próprio     próprio
-- =====================================================================

create or replace function app.perfil_atual()
returns public.perfil_usuario language sql stable security definer set search_path = public as $$
  select perfil from public.usuarios_perfil where user_id = auth.uid() and ativo
$$;

create or replace function app.tem_perfil(variadic perfis public.perfil_usuario[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.perfil_atual() = any(perfis), false)
$$;

create or replace function app.is_admin()
returns boolean language sql stable as $$ select app.tem_perfil('admin') $$;

-- Admin vê todas as empresas; demais só as vinculadas em usuario_empresas
create or replace function app.tem_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_empresa is null
      or app.perfil_atual() = 'admin'
      or exists (select 1 from public.usuario_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = p_empresa)
$$;

create or replace function app.empresas_visiveis()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.empresas where app.tem_empresa(id)
$$;

create or replace function app.veiculo_visivel(p_veiculo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_veiculo is null or exists (
    select 1 from public.veiculos v where v.id = p_veiculo and app.tem_empresa(v.empresa_id))
$$;

create or replace function app.medicao_visivel(p_medicao uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.medicoes m where m.id = p_medicao and app.tem_empresa(m.empresa_id))
$$;

create or replace function app.repasse_visivel(p_repasse uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.repasses r where r.id = p_repasse and app.tem_empresa(r.empresa_id))
$$;

create or replace function app.os_visivel(p_os uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ordens_servico o where o.id = p_os and app.tem_empresa(o.empresa_id))
$$;

-- Gera as 4 policies (select/insert/update/delete) de uma tabela
create or replace function app.aplicar_rls(
  p_tabela text, p_leitura text[], p_escrita text[], p_filtro text default 'true'
) returns void language plpgsql as $$
declare
  l text := format('app.tem_perfil(variadic %L::public.perfil_usuario[])', p_leitura);
  e text := format('app.tem_perfil(variadic %L::public.perfil_usuario[])', p_escrita);
begin
  execute format('alter table public.%I enable row level security', p_tabela);
  execute format('create policy %I on public.%I for select to authenticated using (%s and %s)',
    p_tabela || '_select', p_tabela, l, p_filtro);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s and %s)',
    p_tabela || '_insert', p_tabela, e, p_filtro);
  execute format('create policy %I on public.%I for update to authenticated using (%s and %s) with check (%s and %s)',
    p_tabela || '_update', p_tabela, e, p_filtro, e, p_filtro);
  execute format('create policy %I on public.%I for delete to authenticated using (%s and %s)',
    p_tabela || '_delete', p_tabela, e, p_filtro);
end $$;

do $$
declare
  todos text[] := array['admin','financeiro','faturamento','manutencao','consulta'];
  fin_fat_cons text[] := array['admin','financeiro','faturamento','consulta'];
begin
  perform app.aplicar_rls('empresas', todos, array['admin'], 'app.tem_empresa(id)');
  perform app.aplicar_rls('contas_bancarias', fin_fat_cons, array['admin','financeiro'], 'app.tem_empresa(empresa_id)');
  perform app.aplicar_rls('clientes', todos, array['admin','financeiro','faturamento']);
  perform app.aplicar_rls('obras', todos, array['admin','financeiro','faturamento']);
  perform app.aplicar_rls('contatos', todos, array['admin','financeiro','faturamento']);
  perform app.aplicar_rls('locadores', array['admin','financeiro'], array['admin','financeiro']);
  perform app.aplicar_rls('fornecedores', todos, array['admin','financeiro','manutencao']);
  perform app.aplicar_rls('veiculos', todos, array['admin','financeiro','manutencao'], 'app.tem_empresa(empresa_id)');
  perform app.aplicar_rls('categorias_despesa', todos, array['admin','financeiro']);
  perform app.aplicar_rls('contratos', fin_fat_cons, array['admin','financeiro','faturamento'], 'app.tem_empresa(empresa_id)');
  perform app.aplicar_rls('medicoes', fin_fat_cons, array['admin','financeiro','faturamento'], 'app.tem_empresa(empresa_id)');
  perform app.aplicar_rls('recebimentos', fin_fat_cons, array['admin','financeiro','faturamento'], 'app.medicao_visivel(medicao_id)');
  perform app.aplicar_rls('repasses', array['admin','financeiro','consulta'], array['admin','financeiro'], 'app.tem_empresa(empresa_id)');
  perform app.aplicar_rls('repasse_abatimentos', array['admin','financeiro','consulta'], array['admin','financeiro'], 'app.repasse_visivel(repasse_id)');
  perform app.aplicar_rls('contas_pagar', array['admin','financeiro','consulta'], array['admin','financeiro'], 'app.tem_empresa(empresa_id)');
  perform app.aplicar_rls('planos_manutencao', todos, array['admin','manutencao'], 'app.veiculo_visivel(veiculo_id)');
  perform app.aplicar_rls('ordens_servico', todos, array['admin','manutencao'], 'app.tem_empresa(empresa_id)');
  perform app.aplicar_rls('os_itens', todos, array['admin','manutencao'], 'app.os_visivel(ordem_servico_id)');
  perform app.aplicar_rls('pneus', todos, array['admin','manutencao'], 'app.veiculo_visivel(veiculo_id)');
  perform app.aplicar_rls('pneus_historico', todos, array['admin','manutencao'], 'app.veiculo_visivel(veiculo_id)');
  perform app.aplicar_rls('documentos_veiculo', todos, array['admin','manutencao'], 'app.veiculo_visivel(veiculo_id)');
  perform app.aplicar_rls('leituras', todos, array['admin','manutencao','financeiro'], 'app.veiculo_visivel(veiculo_id)');
  perform app.aplicar_rls('configuracoes', todos, array['admin']);
  perform app.aplicar_rls('alertas', todos, todos, 'app.tem_empresa(empresa_id)');
end $$;

-- manutenção enxerga contas a pagar de veículo (custos), sem receitas
create policy contas_pagar_select_manutencao on public.contas_pagar for select to authenticated
  using (app.tem_perfil('manutencao') and tipo = 'veiculo' and app.tem_empresa(empresa_id));

-- usuários: cada um lê o próprio; admin gerencia todos
alter table public.usuarios_perfil enable row level security;
create policy usuarios_perfil_select on public.usuarios_perfil for select to authenticated
  using (user_id = auth.uid() or app.is_admin());
create policy usuarios_perfil_admin on public.usuarios_perfil for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

alter table public.usuario_empresas enable row level security;
create policy usuario_empresas_select on public.usuario_empresas for select to authenticated
  using (user_id = auth.uid() or app.is_admin());
create policy usuario_empresas_admin on public.usuario_empresas for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- LGPD: visão sem CPF/CNPJ/PIX para perfis que não são admin/financeiro
create view public.vw_locadores_publico as
  select id, nome, telefone, ativo from public.locadores
  where app.tem_perfil('admin','financeiro','faturamento','manutencao','consulta');

grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
revoke all on public.vw_locadores_publico from anon;
grant select on public.vw_locadores_publico to authenticated;
