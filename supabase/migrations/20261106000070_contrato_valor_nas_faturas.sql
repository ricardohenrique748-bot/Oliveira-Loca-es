-- =====================================================================
-- 0070 Valor do contrato alterado chega às faturas pendentes
-- A fatura guarda o valor do contrato de quando foi gerada. Ao mudar o valor
-- (ou o repasse) do contrato, as faturas ainda "a faturar" dele passam a usar
-- o novo valor — e os repasses delas (previstos/liberados) também.
-- Só muda o que ainda está com o valor antigo do contrato: valor digitado à mão
-- na fatura ou no repasse continua como está. Faturada, recebida ou paga não muda.
-- O medicao_before recalcula valor_base / valor_final.
-- =====================================================================

create or replace function app.contrato_valor_para_faturas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.valor_mensal is distinct from old.valor_mensal then
    update public.medicoes set valor_mensal = new.valor_mensal
     where contrato_id = new.id and status = 'a_faturar' and valor_mensal = old.valor_mensal;
  end if;

  if new.valor_repasse_mensal is distinct from old.valor_repasse_mensal and new.valor_repasse_mensal is not null then
    update public.repasses r set
      valor_repasse_mensal = new.valor_repasse_mensal,
      valor_bruto = app.valor_proporcional(new.valor_repasse_mensal, m.dias, app.base_cobranca(new.tipo_cobranca))
      from public.medicoes m
     where r.medicao_id = m.id and m.contrato_id = new.id and m.status = 'a_faturar'
       and r.status in ('previsto', 'liberado') and r.valor_repasse_mensal is not distinct from old.valor_repasse_mensal;
    if found then perform app.recalcular_abatimentos_veiculo(new.veiculo_id); end if;
  end if;
  return null;
end $$;

revoke execute on function app.contrato_valor_para_faturas() from public, anon, authenticated;

drop trigger if exists trg_contrato_valor_para_faturas on public.contratos;
create trigger trg_contrato_valor_para_faturas after update of valor_mensal, valor_repasse_mensal on public.contratos
  for each row execute function app.contrato_valor_para_faturas();

-- acerta já as faturas pendentes de contratos alterados depois que a fatura foi mexida pela última vez
update public.medicoes m set valor_mensal = c.valor_mensal
  from public.contratos c
 where m.contrato_id = c.id and m.status = 'a_faturar'
   and m.valor_mensal is distinct from c.valor_mensal and c.updated_at > m.updated_at;

-- e os repasses delas
with alvo as (
  select r.id, c.valor_repasse_mensal as valor, m.dias, c.tipo_cobranca, r.veiculo_id
    from public.repasses r
    join public.medicoes m on m.id = r.medicao_id
    join public.contratos c on c.id = m.contrato_id
   where m.status = 'a_faturar' and r.status in ('previsto', 'liberado') and c.valor_repasse_mensal is not null
     and r.valor_repasse_mensal is distinct from c.valor_repasse_mensal and c.updated_at > r.updated_at
)
update public.repasses r set
  valor_repasse_mensal = a.valor,
  valor_bruto = app.valor_proporcional(a.valor, a.dias, app.base_cobranca(a.tipo_cobranca))
  from alvo a where r.id = a.id;

select app.recalcular_abatimentos_veiculo(v.id) from public.veiculos v where v.proprietario = 'locador';

notify pgrst, 'reload schema';
