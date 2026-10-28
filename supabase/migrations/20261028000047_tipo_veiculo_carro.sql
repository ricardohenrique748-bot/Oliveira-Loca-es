-- =====================================================================
-- 0047 Tipo de veículo "carro"
-- Carro segue o calendário de licenciamento de veículos leves (SP).
-- =====================================================================

alter type public.tipo_veiculo add value if not exists 'carro' before 'outro';

-- carro novo (ou que passou a ser carro) entra no calendário "leve";
-- comparação por texto: o valor novo do enum não pode ser usado na mesma transação
create or replace function app.veiculo_calendario_por_tipo()
returns trigger language plpgsql as $$
begin
  if new.tipo::text = 'carro' and (tg_op = 'INSERT' or old.tipo is distinct from new.tipo) then
    new.calendario_licenciamento := 'leve';
  end if;
  return new;
end $$;

drop trigger if exists trg_veiculo_calendario_por_tipo on public.veiculos;
create trigger trg_veiculo_calendario_por_tipo before insert or update of tipo on public.veiculos
  for each row execute function app.veiculo_calendario_por_tipo();

notify pgrst, 'reload schema';
