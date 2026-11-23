-- =====================================================================
-- 0091 Fatura avulsa com caminhão sublocado sempre aparece no Repasse
-- Antes (0064) o repasse da avulsa só nascia quando o item tinha o valor
-- "repasse ao locador" digitado; sem ele a fatura nunca chegava em Repasses.
-- Agora toda placa sublocada da fatura avulsa (medicoes.veiculo_id e os
-- veículos dos itens) vira repasse. Sem valor digitado, nasce ZERADO para ser
-- preenchido na tela de Repasses (que avisa "definir valor").
-- Valor digitado depois na fatura preenche o repasse que ainda está zerado.
-- =====================================================================

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

  -- placas da fatura: a da própria fatura, as dos itens e as dos repasses digitados
  create temp table if not exists _placas_avulsa (veiculo_id uuid, valor numeric) on commit drop;
  truncate _placas_avulsa;
  insert into _placas_avulsa (veiculo_id, valor)
  select veiculo_id, sum(valor) from (
    select m.veiculo_id as veiculo_id, 0::numeric as valor where m.veiculo_id is not null
    union all
    select nullif(x->>'veiculo_id', '')::uuid, 0 from jsonb_array_elements(coalesce(m.itens, '[]'::jsonb)) x
     where nullif(x->>'veiculo_id', '') is not null
    union all
    select nullif(x->>'veiculo_id', '')::uuid, coalesce((x->>'valor')::numeric, 0) from jsonb_array_elements(m.repasses_avulsos) x
     where nullif(x->>'veiculo_id', '') is not null
  ) t group by veiculo_id;

  -- fatura cancelada ou placa que saiu da fatura: cancela o repasse ainda não pago
  for rp in select * from public.repasses where medicao_id = m.id and status in ('previsto','liberado') loop
    if m.status = 'cancelado' or not exists (select 1 from _placas_avulsa p where p.veiculo_id = rp.veiculo_id) then
      update public.repasses set status = 'cancelado' where id = rp.id;
      perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);
    end if;
  end loop;
  if m.status = 'cancelado' then return; end if;

  for it in select * from _placas_avulsa loop
    select * into v from public.veiculos where id = it.veiculo_id;
    if not found or v.proprietario <> 'locador' or v.locador_id is null then continue; end if;
    select * into rp from public.repasses where medicao_id = m.id and veiculo_id = v.id and status <> 'cancelado';
    if not found then
      -- valor digitado no item é o bruto; sem valor, nasce zerado para definir em Repasses
      insert into public.repasses (medicao_id, locador_id, empresa_id, veiculo_id, valor_repasse_mensal, valor_bruto,
                                   valor_liquido, data_prevista, status)
      values (m.id, v.locador_id, m.empresa_id, v.id, it.valor, it.valor, it.valor, m.data_vencimento, st);
    elsif rp.status <> 'pago' then
      -- valor ajustado na tela de Repasses fica como está; repasse zerado pega o valor digitado na fatura
      update public.repasses set
        valor_repasse_mensal = case when coalesce(rp.valor_bruto, 0) = 0 and it.valor > 0 then it.valor else rp.valor_repasse_mensal end,
        valor_bruto = case when coalesce(rp.valor_bruto, 0) = 0 and it.valor > 0 then it.valor else rp.valor_bruto end,
        data_prevista = coalesce(m.data_vencimento, rp.data_prevista),
        status = st
      where id = rp.id;
    end if;
    perform app.recalcular_abatimentos_veiculo(v.id);
  end loop;
end $$;

-- o gatilho também roda quando os itens (placas) da avulsa mudam
create or replace function app.medicao_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.dias is distinct from old.dias or new.status is distinct from old.status
     or new.data_vencimento is distinct from old.data_vencimento or new.repasses_avulsos is distinct from old.repasses_avulsos
     or new.placas is distinct from old.placas
     or new.descontos_itens is distinct from old.descontos_itens or new.valor_base is distinct from old.valor_base
     or new.veiculo_id is distinct from old.veiculo_id or new.itens is distinct from old.itens then
    perform app.sincronizar_repasse(new.id);
  end if;
  return null;
end $$;

-- faturas avulsas já lançadas com caminhão sublocado e sem repasse
select app.sincronizar_repasse(m.id)
  from public.medicoes m
 where m.contrato_id is null and m.status <> 'cancelado';

notify pgrst, 'reload schema';
