-- =====================================================================
-- 0048 Fatura avulsa também deixa o veículo "locado"
-- Contrato ativo já marca a placa como locada (0007/0033). A fatura avulsa
-- (sem contrato) agora também: enquanto hoje estiver dentro do período da
-- fatura (ou do item da placa, quando a fatura tem vários itens), a placa
-- fica "locado"; terminado o período, volta a "disponível" — a não ser que
-- ainda tenha contrato ativo (trg_veiculo_mantem_locado).
-- veiculos.locado_avulsa_ate marca quem foi locado pela avulsa: só esses
-- voltam sozinhos; "locado" escolhido à mão não é mexido.
-- =====================================================================

alter table public.veiculos add column if not exists locado_avulsa_ate date;

-- períodos de locação de cada placa nas faturas avulsas (sem contrato, não canceladas)
-- fatura com itens: cada item com placa, com o seu período (itens antigos sem datas usam o da fatura)
create or replace view app.locacoes_avulsas as
select m.id as medicao_id, m.veiculo_id, m.periodo_inicio as inicio, m.periodo_fim as fim
  from public.medicoes m
 where m.contrato_id is null and m.status <> 'cancelado' and m.veiculo_id is not null and jsonb_array_length(m.itens) = 0
union all
select m.id, (i->>'veiculo_id')::uuid, coalesce((i->>'periodo_inicio')::date, m.periodo_inicio), coalesce((i->>'periodo_fim')::date, m.periodo_fim)
  from public.medicoes m cross join lateral jsonb_array_elements(m.itens) i
 where m.contrato_id is null and m.status <> 'cancelado' and nullif(i->>'veiculo_id', '') is not null;

-- acerta o status de uma placa conforme as avulsas que cobrem hoje
create or replace function app.sincronizar_locacao_avulsa(p_veiculo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  ate date;
begin
  if p_veiculo is null then return; end if;
  select max(l.fim) into ate from app.locacoes_avulsas l
   where l.veiculo_id = p_veiculo and l.inicio <= app.hoje() and l.fim >= app.hoje();

  if ate is not null then
    -- disponível vira locado; já locado (contrato ou à mão) só guarda até quando; manutenção/parado/vendido não mudam
    update public.veiculos set status = case when status = 'disponivel' then 'locado'::public.status_veiculo else status end,
           locado_avulsa_ate = case when status in ('disponivel','locado') then ate else locado_avulsa_ate end
     where id = p_veiculo and status in ('disponivel','locado');
  else
    -- acabou (ou a fatura foi cancelada/excluída): volta a disponível só o que a avulsa locou
    update public.veiculos set status = case when status = 'locado' then 'disponivel'::public.status_veiculo else status end,
           locado_avulsa_ate = null
     where id = p_veiculo and locado_avulsa_ate is not null;
  end if;
end $$;

-- ao lançar, alterar, cancelar ou excluir uma avulsa: acerta as placas envolvidas (antes e depois)
create or replace function app.medicao_avulsa_status_veiculo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v uuid;
begin
  for v in
    select x from (
      select case when tg_op <> 'DELETE' and new.contrato_id is null then new.veiculo_id end as x
      union select (i->>'veiculo_id')::uuid from jsonb_array_elements(case when tg_op <> 'DELETE' and new.contrato_id is null then new.itens else '[]'::jsonb end) i
       where nullif(i->>'veiculo_id', '') is not null
      union select case when tg_op <> 'INSERT' and old.contrato_id is null then old.veiculo_id end
      union select (i->>'veiculo_id')::uuid from jsonb_array_elements(case when tg_op <> 'INSERT' and old.contrato_id is null then old.itens else '[]'::jsonb end) i
       where nullif(i->>'veiculo_id', '') is not null
    ) s where x is not null
  loop
    perform app.sincronizar_locacao_avulsa(v);
  end loop;
  return null;
end $$;

drop trigger if exists trg_medicao_avulsa_status_veiculo on public.medicoes;
create trigger trg_medicao_avulsa_status_veiculo after insert or update or delete on public.medicoes
  for each row execute function app.medicao_avulsa_status_veiculo();

-- todo dia: começa as avulsas do dia e encerra as que terminaram ontem
create or replace function app.job_status_avulsas()
returns int language plpgsql security definer set search_path = public as $$
declare
  v uuid;
  n int := 0;
begin
  for v in
    select veiculo_id from app.locacoes_avulsas where inicio <= app.hoje() and fim >= app.hoje()
    union select id from public.veiculos where locado_avulsa_ate is not null
  loop
    perform app.sincronizar_locacao_avulsa(v);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function app.sincronizar_locacao_avulsa(uuid), app.job_status_avulsas() from public, anon, authenticated;
revoke all on app.locacoes_avulsas from public, anon, authenticated;

-- acerta já as avulsas em andamento
select app.job_status_avulsas();

-- 03:05 UTC = 00:05 em São Paulo
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron não disponível — job_status_avulsas não agendado';
    return;
  end if;
  perform cron.schedule('status_avulsas', '5 3 * * *', 'select app.job_status_avulsas()');
end $$;

notify pgrst, 'reload schema';
