-- =====================================================================
-- 0092 Corrige "DELETE requires a WHERE clause" ao registrar recebimento
-- A 0091 limpava a tabela temporária com "delete from _placas_avulsa;" e o
-- Supabase (safeupdate) bloqueia DELETE sem WHERE. Troca por truncate,
-- como as outras funções já fazem com _pend.
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

notify pgrst, 'reload schema';
