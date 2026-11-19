-- =====================================================================
-- 0088 Repasse puxa o valor da FATURA (não do contrato)
-- Na fatura com placas, cada placa guarda o seu "valor_repasse_mensal" e os
-- seus dias. O repasse passa a seguir sempre esse valor (antes ficava com o
-- valor do contrato de quando foi criado). Valor digitado na tela de Repasses
-- também grava na fatura, para os dois ficarem iguais.
-- O gatilho do contrato não mexe mais nos repasses de faturas com placas
-- (essas acompanham a fatura via atualizar_placas_faturas).
-- =====================================================================

create or replace function app.sincronizar_repasses_placas(p_medicao uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.medicoes;
  c public.contratos;
  v public.veiculos;
  rp public.repasses;
  it record;
  st public.status_repasse;
  base int;
  bruto numeric;
begin
  select * into m from public.medicoes where id = p_medicao;
  select * into c from public.contratos where id = m.contrato_id;
  base := app.base_cobranca(c.tipo_cobranca);
  st := case when m.status = 'recebido' then 'liberado' else 'previsto' end;

  for rp in select * from public.repasses where medicao_id = m.id and status in ('previsto','liberado') loop
    if m.status = 'cancelado' or not exists (
         select 1 from jsonb_array_elements(m.placas) x
          where (x->>'veiculo_id')::uuid = rp.veiculo_id and nullif(x->>'valor_repasse_mensal', '') is not null) then
      update public.repasses set status = 'cancelado' where id = rp.id;
      perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);
    end if;
  end loop;
  if m.status = 'cancelado' then return; end if;

  for it in
    select (x->>'veiculo_id')::uuid as veiculo_id, (x->>'valor_repasse_mensal')::numeric as repasse, (x->>'dias')::int as dias
      from jsonb_array_elements(m.placas) x
     where nullif(x->>'valor_repasse_mensal', '') is not null
  loop
    select * into v from public.veiculos where id = it.veiculo_id;
    if not found or v.proprietario <> 'locador' or v.locador_id is null then continue; end if;
    bruto := app.valor_proporcional(it.repasse, it.dias, base);
    select * into rp from public.repasses where medicao_id = m.id and veiculo_id = v.id and status <> 'cancelado';
    if not found then
      insert into public.repasses (medicao_id, locador_id, empresa_id, veiculo_id, valor_repasse_mensal, valor_bruto,
                                   valor_liquido, data_prevista, status)
      values (m.id, v.locador_id, m.empresa_id, v.id, it.repasse, bruto, bruto, m.data_vencimento, st);
    elsif rp.status <> 'pago' then
      -- o valor do repasse é o da fatura
      update public.repasses set
        valor_repasse_mensal = it.repasse,
        valor_bruto = bruto,
        data_prevista = coalesce(m.data_vencimento, rp.data_prevista),
        status = st
      where id = rp.id;
    end if;
    perform app.recalcular_abatimentos_veiculo(v.id);
  end loop;
end $$;

-- valor digitado na tela de Repasses: na fatura com placas, grava também na placa da fatura
create or replace function public.fn_alterar_valor_repasse(p_repasse uuid, p_valor_mensal numeric)
returns public.repasses language plpgsql security definer set search_path = public as $$
declare
  rp public.repasses;
  m public.medicoes;
  c public.contratos;
  v_dias int;
begin
  perform app.exigir_perfil('admin','financeiro');
  if p_valor_mensal is null or p_valor_mensal < 0 then raise exception 'Informe um valor válido'; end if;
  select * into rp from public.repasses where id = p_repasse for update;
  if not found then raise exception 'Repasse não encontrado'; end if;
  perform app.exigir_empresa(rp.empresa_id);
  if rp.status not in ('previsto','liberado') then raise exception 'Repasse pago ou cancelado não pode ser alterado'; end if;

  select * into m from public.medicoes where id = rp.medicao_id;
  select * into c from public.contratos where id = m.contrato_id;
  select (x->>'dias')::int into v_dias from jsonb_array_elements(m.placas) x where (x->>'veiculo_id')::uuid = rp.veiculo_id limit 1;
  update public.repasses set
    valor_repasse_mensal = p_valor_mensal,
    valor_bruto = case when m.contrato_id is null then p_valor_mensal
                       else app.valor_proporcional(p_valor_mensal, coalesce(v_dias, m.dias), app.base_cobranca(c.tipo_cobranca)) end
  where id = rp.id;

  if jsonb_array_length(m.placas) > 0 then
    update public.medicoes set placas = (
      select jsonb_agg(case when (x->>'veiculo_id')::uuid = rp.veiculo_id
                            then jsonb_set(x, '{valor_repasse_mensal}', to_jsonb(p_valor_mensal)) else x end order by o)
        from jsonb_array_elements(m.placas) with ordinality as t(x, o))
     where id = m.id;
  end if;
  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);

  select * into rp from public.repasses where id = p_repasse;
  return rp;
end $$;
grant execute on function public.fn_alterar_valor_repasse to authenticated, service_role;

-- contrato mudou o repasse: só a fatura de uma placa usa o valor do contrato direto
create or replace function app.contrato_valor_para_faturas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.valor_mensal is distinct from old.valor_mensal then
    update public.medicoes set valor_mensal = new.valor_mensal
     where contrato_id = new.id and status = 'a_faturar' and valor_mensal = old.valor_mensal
       and jsonb_array_length(placas) = 0;
  end if;

  if new.valor_repasse_mensal is distinct from old.valor_repasse_mensal and new.valor_repasse_mensal is not null then
    update public.repasses r set
      valor_repasse_mensal = new.valor_repasse_mensal,
      valor_bruto = app.valor_proporcional(new.valor_repasse_mensal, m.dias, app.base_cobranca(new.tipo_cobranca))
      from public.medicoes m
     where r.medicao_id = m.id and m.contrato_id = new.id and m.status = 'a_faturar' and jsonb_array_length(m.placas) = 0
       and r.status in ('previsto', 'liberado') and r.valor_repasse_mensal is not distinct from old.valor_repasse_mensal;
    if found then perform app.recalcular_abatimentos_veiculo(new.veiculo_id); end if;
  end if;
  return null;
end $$;
revoke execute on function app.contrato_valor_para_faturas() from public, anon, authenticated;

-- acerta os repasses abertos que estão diferentes da fatura (pagos não mudam)
with alvo as (
  select r.id, r.veiculo_id, (x->>'valor_repasse_mensal')::numeric as valor, (x->>'dias')::int as dias, c.tipo_cobranca
    from public.repasses r
    join public.medicoes m on m.id = r.medicao_id
    join public.contratos c on c.id = m.contrato_id
    cross join lateral jsonb_array_elements(m.placas) x
   where r.status in ('previsto', 'liberado') and m.status <> 'cancelado'
     and (x->>'veiculo_id')::uuid = r.veiculo_id and nullif(x->>'valor_repasse_mensal', '') is not null
)
update public.repasses r set
  valor_repasse_mensal = a.valor,
  valor_bruto = app.valor_proporcional(a.valor, a.dias, app.base_cobranca(a.tipo_cobranca))
  from alvo a
 where r.id = a.id
   and (r.valor_repasse_mensal is distinct from a.valor
        or r.valor_bruto is distinct from app.valor_proporcional(a.valor, a.dias, app.base_cobranca(a.tipo_cobranca)));

select app.recalcular_abatimentos_veiculo(v.id) from public.veiculos v where v.proprietario = 'locador';

-- repasses_v: dias da placa na fatura (na fatura com placas, cada placa tem os seus dias)
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
  ct.email as responsavel_email,
  (select (x->>'dias')::int from jsonb_array_elements(m.placas) x
    where (x->>'veiculo_id')::uuid = r.veiculo_id limit 1) as dias_placa
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

notify pgrst, 'reload schema';
