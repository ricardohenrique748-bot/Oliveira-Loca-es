-- =====================================================================
-- 0017 Modalidade da proposta
-- Frota própria = locação COM motorista; sublocado = SEM motorista.
-- Com veículo escolhido, a modalidade segue o dono do veículo; sem veículo
-- (só equipamento), vale a escolhida no formulário.
-- =====================================================================
alter table public.propostas add column modalidade text not null default 'com_motorista'
  check (modalidade in ('com_motorista', 'sem_motorista'));

create or replace function app.proposta_modalidade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.veiculo_id is not null then
    select case when proprietario = 'locador' then 'sem_motorista' else 'com_motorista' end
      into new.modalidade from public.veiculos where id = new.veiculo_id;
  end if;
  return new;
end $$;

create trigger trg_propostas_modalidade before insert or update of veiculo_id, modalidade on public.propostas
  for each row execute function app.proposta_modalidade();
