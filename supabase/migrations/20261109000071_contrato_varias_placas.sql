-- =====================================================================
-- 0071 Contrato com várias placas
-- A placa principal continua em contratos.veiculo_id (valor e repasse do
-- próprio contrato). As outras ficam em contrato_placas, cada uma com o seu
-- valor, repasse (sublocada) e, se quiser, início/fim próprios (vazio = as
-- datas do contrato).
-- A fatura do contrato continua uma só: medicoes.placas guarda uma linha por
-- placa (valor mensal, dias, repasse). Com placas, valor_mensal = soma e
-- valor_base = soma do proporcional de cada placa. Os dias de cada placa
-- podem ser ajustados à mão na fatura (dias_manual).
-- Cada placa sublocada tem o seu repasse (medicao_id + veiculo_id).
-- Contrato com uma placa só: medicoes.placas fica vazio e nada muda.
-- =====================================================================

-- ---------- placas extras do contrato ----------
create table if not exists public.contrato_placas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id),
  valor_mensal numeric(14,2) not null check (valor_mensal >= 0),
  valor_repasse_mensal numeric(14,2) check (valor_repasse_mensal >= 0),
  data_inicio date,
  data_fim date,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint contrato_placas_datas_ck check (data_fim is null or data_inicio is null or data_fim >= data_inicio),
  constraint contrato_placas_uk unique (contrato_id, veiculo_id)
);
create index if not exists contrato_placas_veiculo_idx on public.contrato_placas (veiculo_id);

drop trigger if exists trg_contrato_placas_updated_at on public.contrato_placas;
select app.add_updated_at_trigger('public.contrato_placas');

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'contrato_placas' and policyname = 'contrato_placas_select') then
    perform app.aplicar_rls('contrato_placas', array['admin','financeiro','faturamento','consulta'], array['admin','financeiro','faturamento'],
      'exists (select 1 from public.contratos c where c.id = contrato_id and app.tem_empresa(c.empresa_id))');
  end if;
end $$;
grant select, insert, update, delete on public.contrato_placas to authenticated;

drop trigger if exists trg_contrato_placas_auditoria on public.contrato_placas;
create trigger trg_contrato_placas_auditoria after insert or update or delete on public.contrato_placas
  for each row execute function app.auditar();

-- ---------- fatura: uma linha por placa ----------
alter table public.medicoes add column if not exists placas jsonb not null default '[]'::jsonb;
alter table public.medicoes drop constraint if exists medicoes_placas_ck;
alter table public.medicoes add constraint medicoes_placas_ck check (jsonb_typeof(placas) = 'array');

-- linhas das placas de um contrato num período. p_atual: as linhas que a fatura já tem
-- (dias digitados à mão na fatura — dias_manual — são mantidos). Sem placas extras: '[]'.
create or replace function app.placas_da_medicao(p_contrato uuid, p_inicio date, p_fim date, p_dias int, p_atual jsonb default '[]'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.contratos;
  x record;
  ant jsonb;
  v public.veiculos;
  v_dias int;
  r jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.contrato_placas where contrato_id = p_contrato) then return '[]'::jsonb; end if;
  select * into c from public.contratos where id = p_contrato;
  for x in
    select * from (
      select 0 as ordem, now() as criado, true as principal, c.veiculo_id as veiculo_id, c.valor_mensal as valor_mensal,
             c.valor_repasse_mensal as valor_repasse_mensal, null::date as data_inicio, null::date as data_fim
      union all
      select 1 + cp.ordem, cp.created_at, false, cp.veiculo_id, cp.valor_mensal, cp.valor_repasse_mensal, cp.data_inicio, cp.data_fim
        from public.contrato_placas cp where cp.contrato_id = p_contrato and cp.veiculo_id <> c.veiculo_id
    ) t order by ordem, criado
  loop
    -- placa com datas próprias (só no mensal): dias dela no período; sem datas: os mesmos dias da fatura
    if x.principal or (x.data_inicio is null and x.data_fim is null) or c.tipo_cobranca <> 'mensal' then
      v_dias := p_dias;
    else
      v_dias := app.dias_cobranca(c.tipo_cobranca, p_inicio, p_fim,
        greatest(c.data_inicio, coalesce(x.data_inicio, c.data_inicio)),
        nullif(least(coalesce(x.data_fim, 'infinity'::date), coalesce(c.data_fim, 'infinity'::date), coalesce(c.data_desmobilizacao, 'infinity'::date)), 'infinity'::date));
      continue when v_dias <= 0;
    end if;
    select y.value into ant from jsonb_array_elements(p_atual) y where (y.value->>'veiculo_id')::uuid = x.veiculo_id limit 1;
    if ant is not null and coalesce((ant->>'dias_manual')::boolean, false) then v_dias := (ant->>'dias')::int; end if;
    select * into v from public.veiculos where id = x.veiculo_id;
    r := r || jsonb_build_object(
      'veiculo_id', x.veiculo_id, 'placa', v.placa, 'tipo', v.tipo, 'proprietario', v.proprietario,
      'principal', x.principal, 'valor_mensal', x.valor_mensal, 'valor_repasse_mensal', x.valor_repasse_mensal,
      'dias', v_dias, 'dias_manual', ant is not null and coalesce((ant->>'dias_manual')::boolean, false),
      'periodo_inicio', greatest(p_inicio, coalesce(x.data_inicio, p_inicio)),
      'periodo_fim', least(p_fim, coalesce(x.data_fim, p_fim)));
    ant := null;
  end loop;
  return r;
end $$;

-- antes de gravar a fatura: monta as placas e soma os valores
create or replace function app.medicao_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.contratos;
  princ int;
begin
  if new.contrato_id is not null then
    select * into c from public.contratos where id = new.contrato_id;
  end if;
  if tg_op = 'INSERT' and new.contrato_id is not null then
    new.empresa_id := c.empresa_id;
    if coalesce(new.valor_mensal, 0) = 0 then new.valor_mensal := c.valor_mensal; end if;
  end if;

  if new.contrato_id is not null then
    if tg_op = 'INSERT' then
      if jsonb_array_length(coalesce(new.placas, '[]'::jsonb)) = 0 then
        new.placas := app.placas_da_medicao(new.contrato_id, new.periodo_inicio, new.periodo_fim, new.dias);
      end if;
    elsif jsonb_array_length(old.placas) > 0 then
      if new.placas is distinct from old.placas then
        -- placas editadas na fatura: os dias da principal são os dias da fatura
        select (x->>'dias')::int into princ from jsonb_array_elements(new.placas) x where coalesce((x->>'principal')::boolean, false) limit 1;
        if princ is not null then new.dias := princ; end if;
      elsif new.dias is distinct from old.dias then
        -- dias da fatura mudaram (grade, desmobilização): as placas sem dias próprios acompanham
        new.placas := app.placas_da_medicao(new.contrato_id, new.periodo_inicio, new.periodo_fim, new.dias, old.placas);
      end if;
    end if;
  end if;

  if jsonb_array_length(coalesce(new.placas, '[]'::jsonb)) > 0 then
    -- várias placas: soma de cada uma (valor mensal × dias dela, proporcional)
    select coalesce(sum((x->>'valor_mensal')::numeric), 0),
           coalesce(sum(app.valor_proporcional((x->>'valor_mensal')::numeric, (x->>'dias')::int, app.base_cobranca(coalesce(c.tipo_cobranca, 'mensal')))), 0)
      into new.valor_mensal, new.valor_base
      from jsonb_array_elements(new.placas) x;
    new.valor_final := greatest(0, new.valor_base + new.acrescimos - new.descontos);
  elsif tg_op = 'INSERT' or new.dias is distinct from old.dias or new.acrescimos is distinct from old.acrescimos
     or new.descontos is distinct from old.descontos or new.valor_mensal is distinct from old.valor_mensal
     or new.placas is distinct from old.placas then
    new.valor_base := app.valor_proporcional(new.valor_mensal, new.dias, app.base_cobranca(coalesce(c.tipo_cobranca, 'avulsa')));
    new.valor_final := greatest(0, new.valor_base + new.acrescimos - new.descontos);
  end if;

  -- vencimento: dia fixo do mês seguinte à emissão, ou emissão + prazo (avulsa: o vencimento é digitado)
  if new.contrato_id is not null and new.data_emissao is not null and (
       (tg_op = 'INSERT' and new.data_vencimento is null) or
       (tg_op = 'UPDATE' and new.data_emissao is distinct from old.data_emissao
          and new.data_vencimento is not distinct from old.data_vencimento)) then
    new.data_vencimento := app.calcular_vencimento(new.data_emissao, c.prazo_pagamento_dias, c.dia_pagamento);
  end if;

  if new.status = 'faturado' and (tg_op = 'INSERT' or old.status = 'a_faturar') and new.data_emissao is null then
    raise exception 'Informe a data de emissão para faturar a medição';
  end if;
  return new;
end $$;

-- ---------- repasses: um por placa sublocada ----------
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

  -- fatura cancelada ou placa que saiu (ou ficou sem repasse): cancela o repasse ainda não pago
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
    select * into rp from public.repasses where medicao_id = m.id and veiculo_id = v.id and status <> 'cancelado';
    if not found then
      bruto := app.valor_proporcional(it.repasse, it.dias, base);
      insert into public.repasses (medicao_id, locador_id, empresa_id, veiculo_id, valor_repasse_mensal, valor_bruto,
                                   valor_liquido, data_prevista, status)
      values (m.id, v.locador_id, m.empresa_id, v.id, it.repasse, bruto, bruto, m.data_vencimento, st);
    elsif rp.status <> 'pago' then
      -- valor mensal do repasse fica como está (pode ter sido ajustado na tela de Repasses)
      update public.repasses set
        valor_bruto = app.valor_proporcional(rp.valor_repasse_mensal, it.dias, base),
        data_prevista = coalesce(m.data_vencimento, rp.data_prevista),
        status = st
      where id = rp.id;
    end if;
    perform app.recalcular_abatimentos_veiculo(v.id);
  end loop;
end $$;

create or replace function app.sincronizar_repasse(p_medicao uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.medicoes;
  c public.contratos;
  v public.veiculos;
  rp public.repasses;
  bruto numeric;
begin
  select * into m from public.medicoes where id = p_medicao;
  if m.contrato_id is null then
    perform app.sincronizar_repasses_avulsos(p_medicao);
    return;
  end if;
  if jsonb_array_length(m.placas) > 0 then
    perform app.sincronizar_repasses_placas(p_medicao);
    return;
  end if;
  select * into c from public.contratos where id = m.contrato_id;
  select * into v from public.veiculos where id = c.veiculo_id;
  if v.proprietario <> 'locador' or c.valor_repasse_mensal is null then return; end if;

  select * into rp from public.repasses where medicao_id = m.id and status <> 'cancelado';
  if m.status = 'cancelado' then
    if found and rp.status <> 'pago' then
      update public.repasses set status = 'cancelado' where id = rp.id;
    end if;
  elsif not found then
    bruto := app.valor_proporcional(c.valor_repasse_mensal, m.dias, app.base_cobranca(c.tipo_cobranca));
    insert into public.repasses (medicao_id, locador_id, empresa_id, veiculo_id, valor_repasse_mensal, valor_bruto,
                                 valor_liquido, data_prevista, status)
    values (m.id, v.locador_id, m.empresa_id, v.id, c.valor_repasse_mensal, bruto, bruto, m.data_vencimento,
            case when m.status = 'recebido' then 'liberado' else 'previsto' end::public.status_repasse);
  elsif rp.status <> 'pago' then
    update public.repasses set
      valor_bruto = app.valor_proporcional(rp.valor_repasse_mensal, m.dias, app.base_cobranca(c.tipo_cobranca)),
      data_prevista = coalesce(m.data_vencimento, rp.data_prevista),
      status = case when m.status = 'recebido' then 'liberado' else 'previsto' end::public.status_repasse
    where id = rp.id;
  end if;
  perform app.recalcular_abatimentos_veiculo(v.id);
end $$;

create or replace function app.medicao_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.dias is distinct from old.dias or new.status is distinct from old.status
     or new.data_vencimento is distinct from old.data_vencimento or new.repasses_avulsos is distinct from old.repasses_avulsos
     or new.placas is distinct from old.placas then
    perform app.sincronizar_repasse(new.id);
  end if;
  return null;
end $$;

-- valor digitado na tela de Repasses: na fatura com placas, os dias são os da placa
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
  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);

  select * into rp from public.repasses where id = p_repasse;
  return rp;
end $$;
grant execute on function public.fn_alterar_valor_repasse to authenticated, service_role;

-- ---------- contrato mudou: as faturas a faturar dele acompanham ----------
create or replace function app.atualizar_placas_faturas(p_contrato uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.contratos;
  m public.medicoes;
  novo jsonb;
  x jsonb;
  ant jsonb;
begin
  select * into c from public.contratos where id = p_contrato;
  if not found then return; end if;
  for m in select * from public.medicoes where contrato_id = p_contrato and status = 'a_faturar' loop
    novo := app.placas_da_medicao(p_contrato, m.periodo_inicio, m.periodo_fim, m.dias, m.placas);
    continue when novo = m.placas;
    if jsonb_array_length(novo) = 0 then
      -- voltou a ter uma placa só: os repasses das outras placas saem
      update public.repasses set status = 'cancelado'
       where medicao_id = m.id and veiculo_id <> c.veiculo_id and status in ('previsto','liberado');
      update public.medicoes set placas = '[]'::jsonb, valor_mensal = c.valor_mensal where id = m.id;
    else
      -- repasse do contrato mudou: o repasse da placa acompanha (se ninguém mexeu nele à mão)
      for x in select value from jsonb_array_elements(novo) loop
        select y.value into ant from jsonb_array_elements(m.placas) y where y.value->>'veiculo_id' = x->>'veiculo_id' limit 1;
        if ant is not null and (ant->'valor_repasse_mensal') is distinct from (x->'valor_repasse_mensal')
           and nullif(x->>'valor_repasse_mensal', '') is not null then
          update public.repasses set valor_repasse_mensal = (x->>'valor_repasse_mensal')::numeric
           where medicao_id = m.id and veiculo_id = (x->>'veiculo_id')::uuid and status in ('previsto','liberado')
             and valor_repasse_mensal is not distinct from nullif(ant->>'valor_repasse_mensal', '')::numeric;
        end if;
        ant := null;
      end loop;
      update public.medicoes set placas = novo where id = m.id;
    end if;
  end loop;
end $$;

-- 0070 só mexe no repasse da placa principal (a fatura com placas tem um repasse por placa)
create or replace function app.contrato_valor_para_faturas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.valor_mensal is distinct from old.valor_mensal then
    update public.medicoes set valor_mensal = new.valor_mensal
     where contrato_id = new.id and status = 'a_faturar' and valor_mensal = old.valor_mensal and jsonb_array_length(placas) = 0;
  end if;

  if new.valor_repasse_mensal is distinct from old.valor_repasse_mensal and new.valor_repasse_mensal is not null then
    update public.repasses r set
      valor_repasse_mensal = new.valor_repasse_mensal,
      valor_bruto = app.valor_proporcional(new.valor_repasse_mensal, m.dias, app.base_cobranca(new.tipo_cobranca))
      from public.medicoes m
     where r.medicao_id = m.id and m.contrato_id = new.id and m.status = 'a_faturar' and jsonb_array_length(m.placas) = 0
       and r.veiculo_id = new.veiculo_id
       and r.status in ('previsto', 'liberado') and r.valor_repasse_mensal is not distinct from old.valor_repasse_mensal;
    if found then perform app.recalcular_abatimentos_veiculo(new.veiculo_id); end if;
  end if;
  return null;
end $$;

-- ---------- status do veículo e empresa das placas extras ----------
-- placa extra "em uso": contrato ativo e o fim dela (se tiver) ainda não passou
create or replace function app.veiculo_mantem_locado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'locado' and new.status = 'disponivel'
     and (exists (select 1 from public.contratos c where c.veiculo_id = new.id and c.status = 'ativo')
       or exists (select 1 from public.contrato_placas cp join public.contratos c on c.id = cp.contrato_id
                   where cp.veiculo_id = new.id and c.status = 'ativo' and (cp.data_fim is null or cp.data_fim >= app.hoje()))) then
    new.status := 'locado';
  end if;
  return new;
end $$;

create or replace function app.contrato_placas_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.contratos;
begin
  -- placa que saiu (ou trocou, ou terminou): volta a disponível, se não tiver outro contrato
  if tg_op in ('UPDATE','DELETE') then
    update public.veiculos set status = 'disponivel' where id = old.veiculo_id and status = 'locado';
  end if;
  if tg_op in ('INSERT','UPDATE') then
    select * into c from public.contratos where id = new.contrato_id;
    if c.status = 'ativo' and (new.data_fim is null or new.data_fim >= app.hoje()) then
      update public.veiculos set status = 'locado' where id = new.veiculo_id and status in ('disponivel','parado');
      update public.veiculos set empresa_id = c.empresa_id where id = new.veiculo_id and empresa_id is distinct from c.empresa_id;
    end if;
  end if;
  perform app.atualizar_placas_faturas(coalesce(new.contrato_id, old.contrato_id));
  return null;
end $$;

drop trigger if exists trg_contrato_placas_after on public.contrato_placas;
create trigger trg_contrato_placas_after after insert or update or delete on public.contrato_placas
  for each row execute function app.contrato_placas_after();

-- contrato encerrado/reativado/de outra empresa: as placas extras acompanham; valores e datas: as faturas pendentes
create or replace function app.contrato_placas_do_contrato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.contrato_placas where contrato_id = new.id)
     and not exists (select 1 from public.medicoes where contrato_id = new.id and status = 'a_faturar' and jsonb_array_length(placas) > 0) then
    return null;
  end if;
  if old.status = 'ativo' and new.status <> 'ativo' then
    update public.veiculos set status = 'disponivel'
     where status = 'locado' and id in (select veiculo_id from public.contrato_placas where contrato_id = new.id);
  elsif new.status = 'ativo' and (old.status <> 'ativo' or new.empresa_id is distinct from old.empresa_id) then
    update public.veiculos v set status = case when v.status in ('disponivel','parado') then 'locado'::public.status_veiculo else v.status end,
           empresa_id = new.empresa_id
      from public.contrato_placas cp
     where cp.contrato_id = new.id and cp.veiculo_id = v.id and (cp.data_fim is null or cp.data_fim >= app.hoje());
  end if;
  if new.valor_mensal is distinct from old.valor_mensal or new.valor_repasse_mensal is distinct from old.valor_repasse_mensal
     or new.veiculo_id is distinct from old.veiculo_id or new.data_inicio is distinct from old.data_inicio
     or new.data_fim is distinct from old.data_fim or new.data_desmobilizacao is distinct from old.data_desmobilizacao
     or new.tipo_cobranca is distinct from old.tipo_cobranca then
    perform app.atualizar_placas_faturas(new.id);
  end if;
  return null;
end $$;

drop trigger if exists trg_contrato_placas_do_contrato on public.contratos;
create trigger trg_contrato_placas_do_contrato after update on public.contratos
  for each row execute function app.contrato_placas_do_contrato();

-- todo dia: placa extra cujo fim passou volta a disponível
create or replace function app.job_placas_contrato()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.veiculos set status = 'disponivel'
   where status = 'locado' and id in (select cp.veiculo_id from public.contrato_placas cp where cp.data_fim < app.hoje());
end $$;

revoke execute on function app.placas_da_medicao(uuid, date, date, int, jsonb), app.sincronizar_repasses_placas(uuid),
  app.atualizar_placas_faturas(uuid), app.contrato_placas_after(), app.contrato_placas_do_contrato(), app.job_placas_contrato()
  from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron não disponível — job_placas_contrato não agendado';
    return;
  end if;
  perform cron.schedule('placas_contrato', '10 3 * * *', 'select app.job_placas_contrato()');
end $$;

-- ---------- prévia de "Gerar faturas do período": soma as placas ----------
create or replace function public.fn_gerar_medicoes(
  p_competencia date,
  p_dia_corte int default null,
  p_contratos uuid[] default null,
  p_dry_run boolean default false
) returns table (
  contrato_id uuid, empresa_id uuid, periodo_inicio date, periodo_fim date, dias int,
  valor_mensal numeric, valor_final numeric, valor_repasse_bruto numeric, medicao_id uuid
) language plpgsql security definer set search_path = public as $$
declare
  c record;
  per record;
  v_dias int;
  v_base int;
  v_id uuid;
  v_placas jsonb;
begin
  perform app.exigir_perfil('admin','financeiro','faturamento');
  for c in
    select ct.*, v.proprietario from public.contratos ct join public.veiculos v on v.id = ct.veiculo_id
     where ct.status in ('ativo','encerrado')
       and (p_dia_corte is null or ct.dia_corte_inicio = p_dia_corte)
       and (p_contratos is null or ct.id = any(p_contratos))
       and (auth.uid() is null or app.tem_empresa(ct.empresa_id))
     order by ct.empresa_id, ct.data_inicio
  loop
    select * into per from app.periodo_competencia(c.dia_corte_inicio, p_competencia);
    v_base := app.base_cobranca(c.tipo_cobranca);
    v_dias := app.dias_cobranca(c.tipo_cobranca, per.inicio, per.fim, c.data_inicio, least(c.data_fim, c.data_desmobilizacao));
    continue when v_dias <= 0;
    continue when exists (select 1 from public.medicoes m where m.contrato_id = c.id
                            and m.periodo_inicio <= per.fim and m.periodo_fim >= per.inicio
                            and m.status <> 'cancelado');
    v_id := null;
    if not p_dry_run then
      insert into public.medicoes (contrato_id, empresa_id, periodo_inicio, periodo_fim, dias, valor_mensal, final)
      values (c.id, c.empresa_id, per.inicio, per.fim, v_dias, c.valor_mensal,
              c.data_desmobilizacao is not null and c.data_desmobilizacao between per.inicio and per.fim)
      returning id into v_id;
    end if;
    contrato_id := c.id; empresa_id := c.empresa_id; periodo_inicio := per.inicio; periodo_fim := per.fim;
    dias := v_dias;
    v_placas := app.placas_da_medicao(c.id, per.inicio, per.fim, v_dias);
    if jsonb_array_length(v_placas) > 0 then
      select sum((x->>'valor_mensal')::numeric),
             sum(app.valor_proporcional((x->>'valor_mensal')::numeric, (x->>'dias')::int, v_base)),
             sum(app.valor_proporcional((x->>'valor_repasse_mensal')::numeric, (x->>'dias')::int, v_base))
               filter (where x->>'proprietario' = 'locador' and nullif(x->>'valor_repasse_mensal', '') is not null)
        into valor_mensal, valor_final, valor_repasse_bruto
        from jsonb_array_elements(v_placas) x;
    else
      valor_mensal := c.valor_mensal;
      valor_final := app.valor_proporcional(c.valor_mensal, v_dias, v_base);
      valor_repasse_bruto := case when c.proprietario = 'locador' and c.valor_repasse_mensal is not null
                                  then app.valor_proporcional(c.valor_repasse_mensal, v_dias, v_base) end;
    end if;
    medicao_id := v_id;
    return next;
  end loop;
end $$;

-- ---------- medicoes_v: as placas da fatura (colunas novas no fim; resto igual à 0065) ----------
create or replace view public.medicoes_v with (security_invoker = true) as
select
  m.id, m.contrato_id, m.empresa_id, m.periodo_inicio, m.periodo_fim, m.dias, m.valor_base, m.acrescimos, m.descontos,
  m.valor_final, m.numero_nf, m.data_emissao, m.data_vencimento, m.status, m.final, m.observacoes, m.created_at,
  m.updated_at, m.created_by, m.valor_mensal,
  date_trunc('month', m.periodo_fim)::date as competencia,
  c.numero as contrato_numero,
  cl.id as cliente_id, cl.razao_social as cliente_nome, coalesce(cl.nome_fantasia, cl.razao_social) as cliente_fantasia,
  c.obra_id, o.nome as obra_nome,
  v.id as veiculo_id, v.placa, v.tipo as veiculo_tipo, v.proprietario,
  v.locador_id, c.prazo_pagamento_dias, c.dia_corte_inicio,
  e.apelido as empresa_apelido,
  coalesce(rc.total, 0)::numeric(14,2) as valor_recebido,
  greatest(m.valor_final - coalesce(rc.total, 0), 0)::numeric(14,2) as saldo,
  rc.ultima_data as data_ultimo_recebimento,
  case when m.status in ('faturado','recebido_parcial') and m.data_vencimento < app.hoje() then 'vencido'
       else m.status::text end as status_exibicao,
  case when m.data_vencimento is not null then greatest(app.hoje() - m.data_vencimento, 0) end as dias_atraso,
  rp.id as repasse_id, rp.status as repasse_status, rp.valor_bruto as repasse_bruto, rp.valor_liquido as repasse_liquido,
  (m.valor_final - coalesce(rp.valor_liquido, 0))::numeric(14,2) as margem,
  coalesce(c.tipo_cobranca, 'avulsa') as tipo_cobranca,
  m.forma_pagamento,
  m.descricao,
  m.acrescimos_itens,
  m.descontos_itens,
  m.unidade,
  m.itens,
  m.numero_os,
  c.dia_pagamento,
  m.placas,
  -- todas as placas da fatura, para a busca por placa
  (select string_agg(x->>'placa', ' ') from jsonb_array_elements(m.placas) x) as placas_texto
from public.medicoes m
left join public.contratos c on c.id = m.contrato_id
join public.clientes cl on cl.id = coalesce(c.cliente_id, m.cliente_id)
left join public.obras o on o.id = c.obra_id
left join public.veiculos v on v.id = coalesce(c.veiculo_id, m.veiculo_id)
join public.empresas e on e.id = m.empresa_id
left join lateral (select sum(r.valor) as total, max(r.data) as ultima_data from public.recebimentos r where r.medicao_id = m.id) rc on true
left join lateral (
  select (array_agg(r.id order by r.created_at))[1] as id,
         (array_agg(r.status order by r.created_at))[1] as status,
         sum(r.valor_bruto)::numeric(14,2) as valor_bruto,
         sum(r.valor_liquido)::numeric(14,2) as valor_liquido
    from public.repasses r
   where r.medicao_id = m.id and r.status <> 'cancelado'
) rp on true;

notify pgrst, 'reload schema';
