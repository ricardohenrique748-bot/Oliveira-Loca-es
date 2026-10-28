-- =====================================================================
-- 0049 Trocar a placa de um contrato ativo acerta o status dos dois veículos
-- Antes o trigger só olhava a mudança de status do contrato: trocar a placa
-- deixava a antiga "locado" e a nova "disponível". Agora a nova vira
-- "locado" e a antiga volta a "disponível" (trg_veiculo_mantem_locado
-- segura a antiga se ela ainda tiver outro contrato ativo).
-- =====================================================================

create or replace function app.contrato_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ativo' and (tg_op = 'INSERT' or old.status <> 'ativo' or old.veiculo_id <> new.veiculo_id) then
    update public.veiculos set status = 'locado' where id = new.veiculo_id and status in ('disponivel','parado');
  end if;
  if tg_op = 'UPDATE' and old.status = 'ativo' and (new.status <> 'ativo' or old.veiculo_id <> new.veiculo_id) then
    update public.veiculos set status = 'disponivel' where id = old.veiculo_id and status = 'locado';
  end if;
  return null;
end $$;

drop trigger if exists trg_contratos_after on public.contratos;
create trigger trg_contratos_after after insert or update of status, veiculo_id on public.contratos
  for each row execute function app.contrato_after();

-- acerta as placas que têm contrato ativo e ficaram "disponível"
update public.veiculos v set status = 'locado'
 where v.status in ('disponivel','parado')
   and exists (select 1 from public.contratos c where c.veiculo_id = v.id and c.status = 'ativo');

notify pgrst, 'reload schema';
