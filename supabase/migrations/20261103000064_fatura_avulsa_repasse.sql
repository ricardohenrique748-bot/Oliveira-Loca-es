-- =====================================================================
-- 0064 Fatura avulsa com repasse
-- Item da fatura avulsa com placa de veículo sublocado pode ter "repasse ao locador" (valor digitado).
-- medicoes.repasses_avulsos: [{ veiculo_id, valor }] (um por placa, soma dos itens dela).
-- Cada placa vira um repasse (medicao_id + veiculo_id), que segue a fatura como no contrato:
-- previsto → liberado quando recebida; cancelado se a fatura for cancelada.
-- Antes: um repasse por fatura e só com contrato (0040 / 0041).
-- =====================================================================

alter table public.medicoes add column if not exists repasses_avulsos jsonb not null default '[]'::jsonb;
alter table public.medicoes drop constraint if exists medicoes_repasses_avulsos_ck;
alter table public.medicoes add constraint medicoes_repasses_avulsos_ck check (jsonb_typeof(repasses_avulsos) = 'array');

-- um repasse por fatura e placa (contrato continua com um só)
drop index if exists public.repasses_medicao_uk;
create unique index if not exists repasses_medicao_veiculo_uk on public.repasses (medicao_id, veiculo_id) where status <> 'cancelado';

-- ---------- repasses da fatura avulsa ----------
create or replace function app.sincronizar_repasses_avulsos(p_medicao uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.medicoes;
  v public.veiculos;
  rp public.repasses;
  it record;
  st public.status_repasse;
begin
  select * into m from public.medicoes where id = p_medicao;
  st := case when m.status = 'recebido' then 'liberado' else 'previsto' end;

  -- fatura cancelada ou placa que saiu da lista: cancela o repasse ainda não pago
  for rp in select * from public.repasses where medicao_id = m.id and status in ('previsto','liberado') loop
    if m.status = 'cancelado' or not exists (
         select 1 from jsonb_array_elements(m.repasses_avulsos) x
          where (x->>'veiculo_id')::uuid = rp.veiculo_id and coalesce((x->>'valor')::numeric, 0) > 0) then
      update public.repasses set status = 'cancelado' where id = rp.id;
      perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);
    end if;
  end loop;
  if m.status = 'cancelado' then return; end if;

  for it in
    select (x->>'veiculo_id')::uuid as veiculo_id, sum((x->>'valor')::numeric) as valor
      from jsonb_array_elements(m.repasses_avulsos) x
     where coalesce((x->>'valor')::numeric, 0) > 0
     group by 1
  loop
    select * into v from public.veiculos where id = it.veiculo_id;
    if not found or v.proprietario <> 'locador' or v.locador_id is null then continue; end if;
    select * into rp from public.repasses where medicao_id = m.id and veiculo_id = v.id and status <> 'cancelado';
    if not found then
      -- valor digitado no item: é o bruto (sem proporção de dias)
      insert into public.repasses (medicao_id, locador_id, empresa_id, veiculo_id, valor_repasse_mensal, valor_bruto,
                                   valor_liquido, data_prevista, status)
      values (m.id, v.locador_id, m.empresa_id, v.id, it.valor, it.valor, it.valor, m.data_vencimento, st);
    elsif rp.status <> 'pago' then
      -- valor fica como está (pode ter sido ajustado na tela de Repasses); acompanha vencimento e status
      update public.repasses set data_prevista = coalesce(m.data_vencimento, rp.data_prevista), status = st where id = rp.id;
    end if;
    perform app.recalcular_abatimentos_veiculo(v.id);
  end loop;
end $$;

-- ---------- repasse: contrato como antes; sem contrato, os repasses dos itens ----------
create or replace function app.sincronizar_repasse(p_medicao uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.medicoes;
  c public.contratos;
  v public.veiculos;
  rp public.repasses;
  bruto numeric;
begin
  select * into m from public.medicoes where id = p_medicao;
  if m.contrato_id is null then
    perform app.sincronizar_repasses_avulsos(p_medicao);
    return;
  end if;
  select * into c from public.contratos where id = m.contrato_id;
  select * into v from public.veiculos where id = c.veiculo_id;
  if v.proprietario <> 'locador' or c.valor_repasse_mensal is null then return; end if;

  select * into rp from public.repasses where medicao_id = m.id and status <> 'cancelado';
  if m.status = 'cancelado' then
    if found and rp.status <> 'pago' then
      update public.repasses set status = 'cancelado' where id = rp.id;
    end if;
  elsif not found then
    bruto := app.valor_proporcional(c.valor_repasse_mensal, m.dias, app.base_cobranca(c.tipo_cobranca));
    insert into public.repasses (medicao_id, locador_id, empresa_id, veiculo_id, valor_repasse_mensal, valor_bruto,
                                 valor_liquido, data_prevista, status)
    values (m.id, v.locador_id, m.empresa_id, v.id, c.valor_repasse_mensal, bruto, bruto, m.data_vencimento,
            case when m.status = 'recebido' then 'liberado' else 'previsto' end::public.status_repasse);
  elsif rp.status <> 'pago' then
    update public.repasses set
      valor_bruto = app.valor_proporcional(rp.valor_repasse_mensal, m.dias, app.base_cobranca(c.tipo_cobranca)),
      data_prevista = coalesce(m.data_vencimento, rp.data_prevista),
      status = case when m.status = 'recebido' then 'liberado' else 'previsto' end::public.status_repasse
    where id = rp.id;
  end if;
  perform app.recalcular_abatimentos_veiculo(v.id);
end $$;

-- o gatilho também roda quando os repasses dos itens mudam
create or replace function app.medicao_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.dias is distinct from old.dias or new.status is distinct from old.status
     or new.data_vencimento is distinct from old.data_vencimento or new.repasses_avulsos is distinct from old.repasses_avulsos then
    perform app.sincronizar_repasse(new.id);
  end if;
  return null;
end $$;

-- ---------- valor digitado na tela de Repasses: na avulsa o valor é o bruto ----------
create or replace function public.fn_alterar_valor_repasse(p_repasse uuid, p_valor_mensal numeric)
returns public.repasses language plpgsql security definer set search_path = public as $$
declare
  rp public.repasses;
  m public.medicoes;
  c public.contratos;
begin
  perform app.exigir_perfil('admin','financeiro');
  if p_valor_mensal is null or p_valor_mensal < 0 then raise exception 'Informe um valor válido'; end if;
  select * into rp from public.repasses where id = p_repasse for update;
  if not found then raise exception 'Repasse não encontrado'; end if;
  perform app.exigir_empresa(rp.empresa_id);
  if rp.status not in ('previsto','liberado') then raise exception 'Repasse pago ou cancelado não pode ser alterado'; end if;

  select * into m from public.medicoes where id = rp.medicao_id;
  select * into c from public.contratos where id = m.contrato_id;
  update public.repasses set
    valor_repasse_mensal = p_valor_mensal,
    valor_bruto = case when m.contrato_id is null then p_valor_mensal
                       else app.valor_proporcional(p_valor_mensal, m.dias, app.base_cobranca(c.tipo_cobranca)) end
  where id = rp.id;
  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);

  select * into rp from public.repasses where id = p_repasse;
  return rp;
end $$;
grant execute on function public.fn_alterar_valor_repasse to authenticated, service_role;

-- ---------- repasses_v: fatura avulsa também aparece (cliente da própria fatura) ----------
create or replace view public.repasses_v with (security_invoker = true) as
select
  r.*,
  l.nome as locador_nome,
  v.placa,
  e.apelido as empresa_apelido,
  m.periodo_inicio, m.periodo_fim, m.dias, m.numero_nf, m.valor_final as medicao_valor,
  m.status as medicao_status, m.data_vencimento as medicao_vencimento,
  date_trunc('month', m.periodo_fim)::date as competencia,
  coalesce(cl.nome_fantasia, cl.razao_social) as cliente_nome,
  (r.status in ('previsto','liberado') and m.status <> 'recebido') as seria_adiantado,
  o.nome as obra_nome,
  m.data_emissao as medicao_emissao,
  c.numero as contrato_numero,
  ct.nome as responsavel_nome,
  ct.whatsapp as responsavel_whatsapp,
  ct.email as responsavel_email
from public.repasses r
join public.locadores l on l.id = r.locador_id
join public.veiculos v on v.id = r.veiculo_id
join public.empresas e on e.id = r.empresa_id
join public.medicoes m on m.id = r.medicao_id
left join public.contratos c on c.id = m.contrato_id
join public.clientes cl on cl.id = coalesce(c.cliente_id, m.cliente_id)
left join public.obras o on o.id = c.obra_id
left join lateral (
  select x.nome, x.whatsapp, x.email
    from public.contatos x
   where x.cliente_id = coalesce(c.cliente_id, m.cliente_id) and (x.obra_id is null or x.obra_id = c.obra_id)
   order by (x.obra_id = c.obra_id) desc nulls last, x.recebe_fatura desc, x.created_at
   limit 1
) ct on true;

-- ---------- medicoes_v: soma os repasses da fatura (avulsa pode ter um por placa) ----------
create or replace view public.medicoes_v with (security_invoker = true) as
select
  m.id, m.contrato_id, m.empresa_id, m.periodo_inicio, m.periodo_fim, m.dias, m.valor_base, m.acrescimos, m.descontos,
  m.valor_final, m.numero_nf, m.data_emissao, m.data_vencimento, m.status, m.final, m.observacoes, m.created_at,
  m.updated_at, m.created_by, m.valor_mensal,
  date_trunc('month', m.periodo_fim)::date as competencia,
  c.numero as contrato_numero,
  cl.id as cliente_id, cl.razao_social as cliente_nome, coalesce(cl.nome_fantasia, cl.razao_social) as cliente_fantasia,
  c.obra_id, o.nome as obra_nome,
  v.id as veiculo_id, v.placa, v.tipo as veiculo_tipo, v.proprietario,
  v.locador_id, c.prazo_pagamento_dias, c.dia_corte_inicio,
  e.apelido as empresa_apelido,
  coalesce(rc.total, 0)::numeric(14,2) as valor_recebido,
  greatest(m.valor_final - coalesce(rc.total, 0), 0)::numeric(14,2) as saldo,
  rc.ultima_data as data_ultimo_recebimento,
  case when m.status in ('faturado','recebido_parcial') and m.data_vencimento < app.hoje() then 'vencido'
       else m.status::text end as status_exibicao,
  case when m.data_vencimento is not null then greatest(app.hoje() - m.data_vencimento, 0) end as dias_atraso,
  rp.id as repasse_id, rp.status as repasse_status, rp.valor_bruto as repasse_bruto, rp.valor_liquido as repasse_liquido,
  (m.valor_final - coalesce(rp.valor_liquido, 0))::numeric(14,2) as margem,
  coalesce(c.tipo_cobranca, 'avulsa') as tipo_cobranca,
  m.forma_pagamento,
  m.descricao,
  m.acrescimos_itens,
  m.descontos_itens,
  m.unidade,
  m.itens,
  m.numero_os
from public.medicoes m
left join public.contratos c on c.id = m.contrato_id
join public.clientes cl on cl.id = coalesce(c.cliente_id, m.cliente_id)
left join public.obras o on o.id = c.obra_id
left join public.veiculos v on v.id = coalesce(c.veiculo_id, m.veiculo_id)
join public.empresas e on e.id = m.empresa_id
left join lateral (select sum(r.valor) as total, max(r.data) as ultima_data from public.recebimentos r where r.medicao_id = m.id) rc on true
left join lateral (
  select (array_agg(r.id order by r.created_at))[1] as id,
         (array_agg(r.status order by r.created_at))[1] as status,
         sum(r.valor_bruto)::numeric(14,2) as valor_bruto,
         sum(r.valor_liquido)::numeric(14,2) as valor_liquido
    from public.repasses r
   where r.medicao_id = m.id and r.status <> 'cancelado'
) rp on true;

notify pgrst, 'reload schema';
