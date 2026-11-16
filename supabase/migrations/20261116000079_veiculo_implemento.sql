-- =====================================================================
-- 0079 Tipo de veículo "implemento" (gaiola, carreta, prancha…)
-- Implemento não precisa de placa: o campo vira uma identificação livre
-- (ex.: "GAIOLA 01"). Se ficar vazio, o sistema gera IMP001, IMP002…
-- Os demais tipos continuam exigindo placa válida (ABC1D23 ou ABC1234).
-- =====================================================================

alter type public.tipo_veiculo add value if not exists 'implemento' before 'outro';

-- comparação por texto: o valor novo do enum não pode ser usado na mesma transação
alter table public.veiculos drop constraint if exists veiculos_placa_check;
alter table public.veiculos add constraint veiculos_placa_check
  check (tipo::text = 'implemento' or placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$');

create or replace function app.normalizar_placa()
returns trigger language plpgsql as $$
declare n int;
begin
  if new.tipo::text = 'implemento' then
    new.placa := nullif(upper(btrim(regexp_replace(coalesce(new.placa, ''), '\s+', ' ', 'g'))), '');
    if new.placa is null then
      select coalesce(max(substring(placa from '^IMP(\d+)$')::int), 0) + 1 into n
        from public.veiculos where placa ~ '^IMP\d+$';
      new.placa := 'IMP' || lpad(n::text, 3, '0');
    end if;
  else
    new.placa := upper(regexp_replace(new.placa, '[^A-Za-z0-9]', '', 'g'));
  end if;
  return new;
end $$;

drop trigger if exists trg_veiculos_placa on public.veiculos;
create trigger trg_veiculos_placa before insert or update of placa, tipo on public.veiculos
  for each row execute function app.normalizar_placa();

notify pgrst, 'reload schema';
