-- =====================================================================
-- 0016 Multas (infrações de trânsito) por veículo
-- Lançamento manual (o portal da SENATRAN não tem integração aberta);
-- a estrutura já serve para uma consulta automática futura (placa + RENAVAM).
-- =====================================================================
alter table public.veiculos add column renavam text;

create table public.multas (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id),
  -- contrato vigente na data da infração (preenchido automaticamente)
  contrato_id uuid references public.contratos(id) on delete set null,
  auto_infracao text,
  data_infracao date not null,
  orgao text,
  descricao text,
  codigo text,
  pontos int check (pontos is null or pontos between 0 and 40),
  valor numeric(14,2) not null default 0 check (valor >= 0),
  vencimento date,
  status text not null default 'pendente' check (status in ('pendente','recurso','paga','cancelada')),
  -- quem arca com a multa
  responsavel text not null default 'empresa' check (responsavel in ('empresa','cliente','locador')),
  pago_em date,
  anexo_url text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.multas (veiculo_id);
create index on public.multas (empresa_id);
create index on public.multas (status);
create index on public.multas (vencimento);
create unique index multas_auto_uk on public.multas (auto_infracao) where auto_infracao is not null;

create or replace function app.multa_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select empresa_id into new.empresa_id from public.veiculos where id = new.veiculo_id;
  if new.contrato_id is null or (tg_op = 'UPDATE' and (new.data_infracao is distinct from old.data_infracao or new.veiculo_id is distinct from old.veiculo_id)
                                 and new.contrato_id is not distinct from old.contrato_id) then
    select c.id into new.contrato_id from public.contratos c
     where c.veiculo_id = new.veiculo_id and c.data_inicio <= new.data_infracao
       and new.data_infracao <= coalesce(least(c.data_fim, c.data_desmobilizacao), 'infinity'::date)
     order by c.data_inicio desc limit 1;
  end if;
  if new.pago_em is not null and new.status in ('pendente','recurso') then new.status := 'paga'; end if;
  return new;
end $$;
create trigger trg_multas_before before insert or update on public.multas
  for each row execute function app.multa_before();
create trigger trg_multas_updated_at before update on public.multas
  for each row execute function app.set_updated_at();
create trigger trg_multas_auditoria after insert or update or delete on public.multas
  for each row execute function app.auditar();

select app.aplicar_rls('multas', array['admin','financeiro','faturamento','manutencao','consulta'],
  array['admin','financeiro','manutencao'], 'app.tem_empresa(empresa_id)');

-- vencida = pendente com vencimento passado
create view public.multas_v with (security_invoker = true) as
select mu.*,
  case when mu.status = 'pendente' and mu.vencimento < app.hoje() then 'vencida' else mu.status end as status_exibicao,
  v.placa, v.renavam, e.apelido as empresa_apelido,
  coalesce(cl.nome_fantasia, cl.razao_social) as cliente_nome, c.numero as contrato_numero
from public.multas mu
join public.veiculos v on v.id = mu.veiculo_id
join public.empresas e on e.id = mu.empresa_id
left join public.contratos c on c.id = mu.contrato_id
left join public.clientes cl on cl.id = c.cliente_id;
grant select on public.multas_v to authenticated;

-- alertas: mantém o job original e acrescenta as multas
alter function app.job_gerar_alertas() rename to job_gerar_alertas_base;
create or replace function app.job_gerar_alertas()
returns int language plpgsql security definer set search_path = public as $$
declare
  h date := app.hoje();
  n int := app.job_gerar_alertas_base();
  k int;
begin
  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select case when mu.vencimento < h then 'multa_vencida' else 'multa_vencendo' end, 'multas', mu.id, mu.empresa_id,
         case when mu.vencimento <= h then 'critico' else 'alerta' end::public.severidade_alerta,
         'Multa ' || v.placa || case when mu.vencimento < h then ' vencida' when mu.vencimento = h then ' vence hoje'
                                     else ' vence em ' || (mu.vencimento - h) || ' dias' end,
         coalesce(mu.descricao, 'Infração') || ' — ' || to_char(mu.valor, 'FM999G999G990D00') || ' · venc. ' || to_char(mu.vencimento, 'DD/MM/YYYY'),
         '/manutencao/multas?status=pendente', h
    from public.multas mu join public.veiculos v on v.id = mu.veiculo_id
   where mu.status = 'pendente' and mu.vencimento is not null and mu.vencimento <= h + 10
  on conflict do nothing;
  get diagnostics k = row_count;
  return n + k;
end $$;
revoke execute on function app.job_gerar_alertas(), app.job_gerar_alertas_base() from public, anon, authenticated;
grant execute on function app.multa_before() to authenticated, service_role;
