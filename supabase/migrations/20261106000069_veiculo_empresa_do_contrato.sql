-- =====================================================================
-- 0069 Veículo: a empresa vem do contrato
-- O cadastro do veículo não escolhe mais a empresa. Ao salvar um contrato ativo
-- (novo, troca de placa, troca de empresa ou reativado), a placa passa para a
-- empresa do contrato — manutenção, contas a pagar e espelho continuam usando
-- veiculos.empresa_id. security definer: quem lança contrato (faturamento) nem
-- sempre pode editar veículos.
-- =====================================================================

create or replace function app.contrato_empresa_veiculo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ativo' and (tg_op = 'INSERT'
      or new.veiculo_id is distinct from old.veiculo_id
      or new.empresa_id is distinct from old.empresa_id
      or new.status is distinct from old.status) then
    update public.veiculos set empresa_id = new.empresa_id
     where id = new.veiculo_id and empresa_id is distinct from new.empresa_id;
  end if;
  return null;
end $$;

revoke execute on function app.contrato_empresa_veiculo() from public, anon, authenticated;

drop trigger if exists trg_contrato_empresa_veiculo on public.contratos;
create trigger trg_contrato_empresa_veiculo after insert or update on public.contratos
  for each row execute function app.contrato_empresa_veiculo();

-- acerta já as placas com contrato ativo de outra empresa (o contrato mais recente vale)
update public.veiculos v set empresa_id = c.empresa_id
  from (select distinct on (veiculo_id) veiculo_id, empresa_id
          from public.contratos where status = 'ativo'
         order by veiculo_id, data_inicio desc, created_at desc) c
 where c.veiculo_id = v.id and v.empresa_id is distinct from c.empresa_id;

notify pgrst, 'reload schema';
