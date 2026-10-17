-- =====================================================================
-- 0007 regras de negócio (espelho de src/lib/calculos — manter em sincronia;
-- paridade verificada em supabase/tests/regras-sql.test.ts)
-- =====================================================================

-- snapshots dos valores mensais usados no cálculo (contrato pode mudar depois)
alter table public.medicoes add column valor_mensal numeric(14,2) not null default 0;
alter table public.repasses add column valor_repasse_mensal numeric(14,2) not null default 0;

-- ---------------------------------------------------------------------
-- Permissões em funções RPC (security definer)
-- ---------------------------------------------------------------------
-- Chamado sem usuário (pg_cron / service_role) = sistema.
create or replace function app.exigir_perfil(variadic perfis public.perfil_usuario[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    if coalesce(auth.role(), '') in ('', 'service_role') then return; end if;
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if not app.tem_perfil(variadic perfis) then
    raise exception 'Sem permissão para esta operação' using errcode = '42501';
  end if;
end $$;

create or replace function app.exigir_empresa(p_empresa uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not app.tem_empresa(p_empresa) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Cálculos (espelho de medicao.ts)
-- ---------------------------------------------------------------------
create or replace function app.ultimo_dia(p date)
returns date language sql immutable as $$
  select (date_trunc('month', p) + interval '1 month - 1 day')::date
$$;

-- competência = 1º dia do mês em que o período termina
create or replace function app.periodo_competencia(p_dia_corte int, p_competencia date, out inicio date, out fim date)
language plpgsql immutable as $$
declare c date := date_trunc('month', p_competencia)::date;
begin
  if p_dia_corte = 1 then
    inicio := c; fim := app.ultimo_dia(c);
  else
    inicio := (c - interval '1 month')::date + 20; fim := c + 19;
  end if;
end $$;

create or replace function app.periodo_contendo(p_dia_corte int, p_data date, out inicio date, out fim date)
language plpgsql immutable as $$
begin
  if p_dia_corte = 1 or extract(day from p_data) <= 20 then
    select * into inicio, fim from app.periodo_competencia(p_dia_corte, p_data);
  else
    select * into inicio, fim from app.periodo_competencia(21, (date_trunc('month', p_data) + interval '1 month')::date);
  end if;
end $$;

create or replace function app.calcular_dias(p_inicio date, p_fim date, p_data_inicio date, p_data_fim_efetiva date, p_base int)
returns int language plpgsql immutable as $$
declare
  ini date := greatest(p_inicio, p_data_inicio);
  fim date := least(p_fim, coalesce(p_data_fim_efetiva, p_fim));
begin
  if fim < ini then return 0; end if;
  if ini = p_inicio and fim = p_fim then return p_base; end if;
  return least((fim - ini) + 1, p_base);
end $$;

create or replace function app.valor_proporcional(p_valor numeric, p_dias int, p_base int)
returns numeric language sql immutable as $$
  select round(p_valor * p_dias / p_base, 2)
$$;

-- ---------------------------------------------------------------------
-- Medições: valores, vencimento, status (trigger)
-- ---------------------------------------------------------------------
create or replace function app.medicao_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.contratos;
begin
  select * into c from public.contratos where id = new.contrato_id;
  if tg_op = 'INSERT' then
    new.empresa_id := c.empresa_id;
    if coalesce(new.valor_mensal, 0) = 0 then new.valor_mensal := c.valor_mensal; end if;
  end if;

  if tg_op = 'INSERT' or new.dias is distinct from old.dias or new.acrescimos is distinct from old.acrescimos
     or new.descontos is distinct from old.descontos or new.valor_mensal is distinct from old.valor_mensal then
    new.valor_base := app.valor_proporcional(new.valor_mensal, new.dias, app.base_dias());
    new.valor_final := greatest(0, new.valor_base + new.acrescimos - new.descontos);
  end if;

  -- vencimento = emissão + prazo (editável: só recalcula se o usuário não mexeu no vencimento)
  if new.data_emissao is not null and (
       (tg_op = 'INSERT' and new.data_vencimento is null) or
       (tg_op = 'UPDATE' and new.data_emissao is distinct from old.data_emissao
          and new.data_vencimento is not distinct from old.data_vencimento)) then
    new.data_vencimento := new.data_emissao + c.prazo_pagamento_dias;
  end if;

  if new.status = 'faturado' and (tg_op = 'INSERT' or old.status = 'a_faturar') and new.data_emissao is null then
    raise exception 'Informe a data de emissão para faturar a medição';
  end if;
  return new;
end $$;
create trigger trg_medicoes_before before insert or update on public.medicoes
  for each row execute function app.medicao_before();

-- status a partir dos recebimentos (espelho de derivarStatusMedicao)
create or replace function app.atualizar_status_medicao(p_medicao uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.medicoes;
  rec numeric;
  novo public.status_medicao;
begin
  select * into m from public.medicoes where id = p_medicao for update;
  if not found or m.status = 'cancelado' then return; end if;
  select coalesce(sum(valor), 0) into rec from public.recebimentos where medicao_id = p_medicao;
  novo := case
    when rec > 0 and rec >= m.valor_final then 'recebido'
    when rec > 0 then 'recebido_parcial'
    when m.status in ('recebido','recebido_parcial') then 'faturado'
    else m.status end;
  if novo is distinct from m.status then
    update public.medicoes set status = novo where id = p_medicao;
  end if;
end $$;

create or replace function app.recebimento_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.atualizar_status_medicao(coalesce(new.medicao_id, old.medicao_id));
  if tg_op = 'UPDATE' and new.medicao_id <> old.medicao_id then
    perform app.atualizar_status_medicao(old.medicao_id);
  end if;
  return null;
end $$;
create trigger trg_recebimentos_after after insert or update or delete on public.recebimentos
  for each row execute function app.recebimento_after();

-- ---------------------------------------------------------------------
-- Repasses e abatimentos (espelho de repasse.ts)
-- ---------------------------------------------------------------------

-- Realoca pendências "Descontar do locador" nos repasses em aberto do veículo,
-- das despesas mais antigas para as mais novas e dos repasses mais antigos para os
-- mais novos. Repasses pagos ficam congelados.
create or replace function app.recalcular_abatimentos_veiculo(p_veiculo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  p record;
  disponivel numeric;
  usar numeric;
  total numeric;
begin
  if p_veiculo is null then return; end if;

  delete from public.repasse_abatimentos a using public.repasses rp
   where a.repasse_id = rp.id and rp.veiculo_id = p_veiculo and rp.status in ('previsto','liberado');

  create temp table if not exists _pend (conta_id uuid primary key, os_id uuid, descricao text, data date, saldo numeric) on commit drop;
  truncate _pend;
  insert into _pend
  select cp.id, cp.ordem_servico_id, cp.descricao, cp.vencimento,
         cp.valor - coalesce((select sum(a.valor) from public.repasse_abatimentos a
                                join public.repasses rp on rp.id = a.repasse_id
                               where a.conta_pagar_id = cp.id and rp.status <> 'cancelado'), 0)
    from public.contas_pagar cp
   where cp.veiculo_id = p_veiculo and cp.descontar_locador;
  delete from _pend where saldo <= 0;

  for r in
    select rp.id, rp.valor_bruto from public.repasses rp
      join public.medicoes m on m.id = rp.medicao_id
     where rp.veiculo_id = p_veiculo and rp.status in ('previsto','liberado')
     order by m.periodo_inicio, rp.created_at
  loop
    disponivel := r.valor_bruto;
    total := 0;
    for p in select * from _pend where saldo > 0 order by data, conta_id::text loop
      exit when disponivel <= 0;
      usar := least(p.saldo, disponivel);
      insert into public.repasse_abatimentos (repasse_id, conta_pagar_id, ordem_servico_id, descricao, valor)
      values (r.id, p.conta_id, p.os_id, p.descricao, usar);
      update _pend set saldo = saldo - usar where conta_id = p.conta_id;
      disponivel := disponivel - usar;
      total := total + usar;
    end loop;
    update public.repasses set valor_abatimentos = total, valor_liquido = valor_bruto - total where id = r.id;
  end loop;
end $$;

-- cria/atualiza o repasse da medição de veículo sublocado
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
  select * into c from public.contratos where id = m.contrato_id;
  select * into v from public.veiculos where id = c.veiculo_id;
  if v.proprietario <> 'locador' or c.valor_repasse_mensal is null then return; end if;

  select * into rp from public.repasses where medicao_id = m.id and status <> 'cancelado';
  if m.status = 'cancelado' then
    if found and rp.status <> 'pago' then
      update public.repasses set status = 'cancelado' where id = rp.id;
    end if;
  elsif not found then
    bruto := app.valor_proporcional(c.valor_repasse_mensal, m.dias, app.base_dias());
    insert into public.repasses (medicao_id, locador_id, empresa_id, veiculo_id, valor_repasse_mensal, valor_bruto,
                                 valor_liquido, data_prevista, status)
    values (m.id, v.locador_id, m.empresa_id, v.id, c.valor_repasse_mensal, bruto, bruto, m.data_vencimento,
            case when m.status = 'recebido' then 'liberado' else 'previsto' end::public.status_repasse);
  elsif rp.status <> 'pago' then
    update public.repasses set
      valor_bruto = app.valor_proporcional(rp.valor_repasse_mensal, m.dias, app.base_dias()),
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
     or new.data_vencimento is distinct from old.data_vencimento then
    perform app.sincronizar_repasse(new.id);
  end if;
  return null;
end $$;
create trigger trg_medicoes_after after insert or update on public.medicoes
  for each row execute function app.medicao_after();

create or replace function app.conta_pagar_abatimento_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') and new.descontar_locador then
    perform app.recalcular_abatimentos_veiculo(new.veiculo_id);
  end if;
  if tg_op in ('UPDATE','DELETE') and old.descontar_locador
     and (tg_op = 'DELETE' or old.veiculo_id is distinct from new.veiculo_id or not new.descontar_locador) then
    perform app.recalcular_abatimentos_veiculo(old.veiculo_id);
  end if;
  return null;
end $$;
create trigger trg_contas_pagar_abat_ins after insert on public.contas_pagar
  for each row when (new.descontar_locador) execute function app.conta_pagar_abatimento_after();
create trigger trg_contas_pagar_abat_upd after update of descontar_locador, valor, veiculo_id, vencimento on public.contas_pagar
  for each row when (old.descontar_locador or new.descontar_locador) execute function app.conta_pagar_abatimento_after();
create trigger trg_contas_pagar_abat_del after delete on public.contas_pagar
  for each row when (old.descontar_locador) execute function app.conta_pagar_abatimento_after();

-- Pagar repasse. Medição não recebida exige p_confirmar_adiantado (grava adiantado + aprovado_por).
create or replace function public.fn_pagar_repasse(
  p_repasse uuid, p_data date, p_comprovante_url text default null, p_confirmar_adiantado boolean default false
) returns public.repasses language plpgsql security definer set search_path = public as $$
declare
  rp public.repasses;
  st public.status_medicao;
  v_adiantado boolean;
begin
  perform app.exigir_perfil('admin','financeiro');
  select * into rp from public.repasses where id = p_repasse for update;
  if not found then raise exception 'Repasse não encontrado'; end if;
  perform app.exigir_empresa(rp.empresa_id);
  if rp.status = 'pago' then raise exception 'Repasse já pago' using errcode = 'P0001', hint = 'REPASSE_JA_PAGO'; end if;
  if rp.status = 'cancelado' then raise exception 'Repasse cancelado' using errcode = 'P0001', hint = 'REPASSE_CANCELADO'; end if;

  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);
  select * into rp from public.repasses where id = p_repasse;

  select status into st from public.medicoes where id = rp.medicao_id;
  v_adiantado := st <> 'recebido';
  if v_adiantado and not coalesce(p_confirmar_adiantado, false) then
    raise exception 'Medição ainda não recebida do cliente: confirme o pagamento adiantado'
      using errcode = 'P0001', hint = 'CONFIRMACAO_ADIANTAMENTO';
  end if;

  update public.repasses set
    status = 'pago', data_pagamento = coalesce(p_data, app.hoje()),
    comprovante_url = coalesce(p_comprovante_url, comprovante_url),
    adiantado = v_adiantado,
    aprovado_por = case when v_adiantado then auth.uid() else null end
  where id = p_repasse returning * into rp;

  -- contas totalmente abatidas passam a apontar para este repasse
  update public.contas_pagar cp set repasse_id = p_repasse
   where cp.id in (select conta_pagar_id from public.repasse_abatimentos where repasse_id = p_repasse)
     and cp.valor <= (select coalesce(sum(a.valor), 0) from public.repasse_abatimentos a
                        join public.repasses r2 on r2.id = a.repasse_id
                       where a.conta_pagar_id = cp.id and r2.status = 'pago');

  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);
  return rp;
end $$;

-- ---------------------------------------------------------------------
-- Geração de medições
-- ---------------------------------------------------------------------
-- Cria medições a_faturar para os contratos vigentes na competência que ainda não
-- têm medição no período. p_dry_run = true só devolve a prévia.
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
  v_base int := app.base_dias();
  v_id uuid;
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
    v_dias := app.calcular_dias(per.inicio, per.fim, c.data_inicio, least(c.data_fim, c.data_desmobilizacao), v_base);
    continue when v_dias <= 0;
    continue when exists (select 1 from public.medicoes m where m.contrato_id = c.id
                            and m.periodo_inicio = per.inicio and m.status <> 'cancelado');
    v_id := null;
    if not p_dry_run then
      insert into public.medicoes (contrato_id, empresa_id, periodo_inicio, periodo_fim, dias, valor_mensal, final)
      values (c.id, c.empresa_id, per.inicio, per.fim, v_dias, c.valor_mensal,
              c.data_desmobilizacao is not null and c.data_desmobilizacao between per.inicio and per.fim)
      returning id into v_id;
    end if;
    contrato_id := c.id; empresa_id := c.empresa_id; periodo_inicio := per.inicio; periodo_fim := per.fim;
    dias := v_dias; valor_mensal := c.valor_mensal;
    valor_final := app.valor_proporcional(c.valor_mensal, v_dias, v_base);
    valor_repasse_bruto := case when c.proprietario = 'locador' and c.valor_repasse_mensal is not null
                                then app.valor_proporcional(c.valor_repasse_mensal, v_dias, v_base) end;
    medicao_id := v_id;
    return next;
  end loop;
end $$;

-- Job: gera medições dos períodos que já terminaram
create or replace function app.job_gerar_medicoes()
returns int language plpgsql security definer set search_path = public as $$
declare
  h date := app.hoje();
  n int := 0;
  k int;
begin
  -- corte 1: o mês anterior terminou
  select count(*) into k from public.fn_gerar_medicoes((date_trunc('month', h) - interval '1 month')::date, 1);
  n := n + k;
  -- corte 21: período termina dia 20; a partir do dia 21 o período do mês corrente já fechou
  select count(*) into k from public.fn_gerar_medicoes(
    case when extract(day from h) >= 21 then date_trunc('month', h)::date
         else (date_trunc('month', h) - interval '1 month')::date end, 21);
  return n + k;
end $$;

-- ---------------------------------------------------------------------
-- Contratos: status do veículo e desmobilização
-- ---------------------------------------------------------------------
create or replace function app.contrato_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ativo' and (tg_op = 'INSERT' or old.status <> 'ativo') then
    update public.veiculos set status = 'locado' where id = new.veiculo_id and status in ('disponivel','parado');
  elsif tg_op = 'UPDATE' and old.status = 'ativo' and new.status <> 'ativo' then
    update public.veiculos set status = 'disponivel' where id = new.veiculo_id and status = 'locado';
  end if;
  return null;
end $$;
create trigger trg_contratos_after after insert or update of status on public.contratos
  for each row execute function app.contrato_after();

-- Desmobilizar: medição final proporcional, encerra contrato, veículo → disponível
create or replace function public.fn_desmobilizar_contrato(p_contrato uuid, p_data date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.contratos;
  per record;
  v_dias int;
  m public.medicoes;
  v_id uuid;
begin
  perform app.exigir_perfil('admin','financeiro','faturamento');
  select * into c from public.contratos where id = p_contrato for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  perform app.exigir_empresa(c.empresa_id);
  if c.status <> 'ativo' then raise exception 'Contrato não está ativo'; end if;
  if p_data < c.data_inicio then raise exception 'Desmobilização anterior ao início do contrato'; end if;

  select * into per from app.periodo_contendo(c.dia_corte_inicio, p_data);
  v_dias := app.calcular_dias(per.inicio, per.fim, c.data_inicio, least(c.data_fim, p_data), app.base_dias());

  update public.contratos set data_desmobilizacao = p_data, status = 'encerrado' where id = p_contrato;
  update public.veiculos set status = 'disponivel' where id = c.veiculo_id and status in ('locado','parado');

  -- períodos posteriores ainda não faturados deixam de existir
  update public.medicoes set status = 'cancelado', observacoes = coalesce(observacoes || ' | ', '') || 'Cancelada por desmobilização'
   where contrato_id = p_contrato and periodo_inicio > per.inicio and status = 'a_faturar';

  select * into m from public.medicoes where contrato_id = p_contrato and periodo_inicio = per.inicio and status <> 'cancelado';
  if found then
    if m.status = 'a_faturar' then
      update public.medicoes set dias = v_dias, final = true where id = m.id;
    else
      update public.medicoes set final = true,
        observacoes = coalesce(observacoes || ' | ', '') || format('Desmobilizado em %s (medição já faturada — revisar)', to_char(p_data, 'DD/MM/YYYY'))
       where id = m.id;
    end if;
    return m.id;
  end if;

  insert into public.medicoes (contrato_id, empresa_id, periodo_inicio, periodo_fim, dias, valor_mensal, final)
  values (c.id, c.empresa_id, per.inicio, per.fim, v_dias, c.valor_mensal, true)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Contas a pagar: recorrência (espelho de vencimentosRecorrentesFaltantes)
-- ---------------------------------------------------------------------
create or replace function app.job_gerar_recorrentes(p_meses int default 12)
returns int language plpgsql security definer set search_path = public as $$
declare
  g record;
  base public.contas_pagar;
  comp date;
  limite date := (date_trunc('month', app.hoje()) + make_interval(months => p_meses - 1))::date;
  dia int;
  n int := 0;
begin
  for g in
    select grupo_parcela_id, min(vencimento) as primeiro, max(vencimento) as ultimo
      from public.contas_pagar where recorrente and grupo_parcela_id is not null
     group by grupo_parcela_id
  loop
    -- a última conta do grupo define o modelo (valor/descrição atuais); se ela foi
    -- desmarcada como recorrente, a recorrência terminou
    select * into base from public.contas_pagar where grupo_parcela_id = g.grupo_parcela_id
      order by vencimento desc, created_at desc limit 1;
    continue when not base.recorrente;
    dia := extract(day from g.primeiro);
    comp := greatest(date_trunc('month', g.primeiro), date_trunc('month', app.hoje()))::date;
    while comp <= limite loop
      if not exists (select 1 from public.contas_pagar where grupo_parcela_id = g.grupo_parcela_id
                        and date_trunc('month', vencimento) = comp) then
        insert into public.contas_pagar (empresa_id, fornecedor_id, descricao, categoria_id, tipo, veiculo_id, vencimento,
          valor, grupo_parcela_id, recorrente, forma_pagamento, conta_bancaria_id, descontar_locador, observacoes, created_by)
        values (base.empresa_id, base.fornecedor_id, base.descricao, base.categoria_id, base.tipo, base.veiculo_id,
          make_date(extract(year from comp)::int, extract(month from comp)::int, least(dia, extract(day from app.ultimo_dia(comp))::int)),
          base.valor, base.grupo_parcela_id, true, base.forma_pagamento, base.conta_bancaria_id, base.descontar_locador,
          base.observacoes, base.created_by);
        n := n + 1;
      end if;
      comp := (comp + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Manutenção
-- ---------------------------------------------------------------------
-- espelho de calcularPreventiva (preventiva.ts)
create or replace function app.calcular_preventiva(
  p_intervalo_km numeric, p_intervalo_horas numeric, p_intervalo_dias int,
  p_ultima_km numeric, p_ultima_horas numeric, p_ultima_data date,
  p_km numeric, p_horas numeric, p_data date, p_pct_alerta numeric default 0.9,
  out status text, out pct numeric, out criterio text,
  out proxima_km numeric, out proxima_horas numeric, out proxima_data date, out restante numeric
) language plpgsql immutable as $$
declare
  c_pct numeric;
begin
  pct := null; criterio := null; restante := null;
  proxima_km := case when p_intervalo_km is not null and p_ultima_km is not null then p_ultima_km + p_intervalo_km end;
  proxima_horas := case when p_intervalo_horas is not null and p_ultima_horas is not null then p_ultima_horas + p_intervalo_horas end;
  proxima_data := case when p_intervalo_dias is not null and p_ultima_data is not null then p_ultima_data + p_intervalo_dias end;

  if proxima_km is not null and p_km is not null then
    c_pct := (p_km - p_ultima_km) / p_intervalo_km;
    if pct is null or c_pct > pct then pct := c_pct; criterio := 'km'; restante := proxima_km - p_km; end if;
  end if;
  if proxima_horas is not null and p_horas is not null then
    c_pct := (p_horas - p_ultima_horas) / p_intervalo_horas;
    if pct is null or c_pct > pct then pct := c_pct; criterio := 'horas'; restante := proxima_horas - p_horas; end if;
  end if;
  if proxima_data is not null then
    c_pct := (p_data - p_ultima_data)::numeric / p_intervalo_dias;
    if pct is null or c_pct > pct then pct := c_pct; criterio := 'dias'; restante := proxima_data - p_data; end if;
  end if;

  if pct is null then
    status := 'vencida'; pct := 1; return;
  end if;
  pct := greatest(0, pct);
  status := case when pct >= 1 then 'vencida' when pct >= p_pct_alerta then 'proxima' else 'em_dia' end;
end $$;

create or replace function app.pct_alerta_preventiva()
returns numeric language sql stable as $$
  select coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'preventiva_pct_alerta'), 0.9)
$$;

create or replace function app.job_atualizar_preventivas()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.planos_manutencao p set (status_calculado, pct_consumido) = (
    select x.status, round(x.pct, 4)
      from public.veiculos v,
           lateral app.calcular_preventiva(p.intervalo_km, p.intervalo_horas, p.intervalo_dias,
             p.ultima_execucao_km, p.ultima_execucao_horas, p.ultima_execucao_data,
             v.km_atual, v.horimetro_atual, app.hoje(), app.pct_alerta_preventiva()) x
     where v.id = p.veiculo_id)
   where p.ativo and p.veiculo_id is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Abrir OS: empresa do veículo; veículo → manutenção (exceto serviço rápido)
create or replace function app.os_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v public.veiculos;
begin
  select * into v from public.veiculos where id = new.veiculo_id;
  if new.empresa_id is null then new.empresa_id := v.empresa_id; end if;
  if new.km is null then new.km := v.km_atual; end if;
  if new.horimetro is null then new.horimetro := v.horimetro_atual; end if;
  if new.parar_veiculo then
    new.status_veiculo_anterior := v.status;
    update public.veiculos set status = 'manutencao' where id = v.id;
  end if;
  return new;
end $$;
create trigger trg_os_before_insert before insert on public.ordens_servico
  for each row execute function app.os_before_insert();

-- status que o veículo deve assumir ao sair da manutenção
create or replace function app.status_pos_manutencao(p_veiculo uuid, p_anterior public.status_veiculo, p_os_ignorar uuid)
returns public.status_veiculo language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.ordens_servico o where o.veiculo_id = p_veiculo and o.id <> p_os_ignorar
                   and o.parar_veiculo and o.status in ('aberta','em_execucao','aguardando_peca')) then 'manutencao'
    when p_anterior in ('locado','disponivel','parado') then p_anterior
    when exists (select 1 from public.contratos c where c.veiculo_id = p_veiculo and c.status = 'ativo') then 'locado'
    else 'disponivel' end::public.status_veiculo
$$;

create or replace function app.os_itens_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_os uuid := coalesce(new.ordem_servico_id, old.ordem_servico_id);
begin
  update public.ordens_servico set custo_total = coalesce((select sum(valor_total) from public.os_itens where ordem_servico_id = v_os), 0)
   where id = v_os and status <> 'fechada';
  return null;
end $$;
create trigger trg_os_itens_after after insert or update or delete on public.os_itens
  for each row execute function app.os_itens_after();

create or replace function app.os_cancelada_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parar_veiculo then
    update public.veiculos set status = app.status_pos_manutencao(new.veiculo_id, new.status_veiculo_anterior, new.id)
     where id = new.veiculo_id and status = 'manutencao';
  end if;
  return null;
end $$;
create trigger trg_os_cancelada after update of status on public.ordens_servico
  for each row when (new.status = 'cancelada' and old.status <> 'cancelada') execute function app.os_cancelada_after();

-- Fechar OS: soma itens; cria conta a pagar (tipo veículo) vinculada; atualiza plano
-- preventivo; registra leitura; veículo volta ao status anterior.
create or replace function public.fn_fechar_os(
  p_os uuid,
  p_data_fechamento date default null,
  p_km numeric default null,
  p_horimetro numeric default null,
  p_horas_parado numeric default null,
  p_gerar_conta boolean default true,
  p_vencimento date default null,
  p_forma_pagamento public.forma_pagamento default 'boleto',
  p_conta_bancaria uuid default null,
  p_categoria uuid default null,
  p_diagnostico text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  o public.ordens_servico;
  v public.veiculos;
  v_custo numeric;
  v_data date := coalesce(p_data_fechamento, app.hoje());
  v_conta uuid;
  v_categoria uuid := p_categoria;
  v_forn text;
begin
  perform app.exigir_perfil('admin','manutencao','financeiro');
  select * into o from public.ordens_servico where id = p_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  perform app.exigir_empresa(o.empresa_id);
  if o.status in ('fechada','cancelada') then raise exception 'OS já está %', o.status; end if;
  select * into v from public.veiculos where id = o.veiculo_id;

  select coalesce(sum(valor_total), 0) into v_custo from public.os_itens where ordem_servico_id = p_os;

  update public.ordens_servico set
    status = 'fechada', data_fechamento = v_data, custo_total = v_custo,
    km = coalesce(p_km, km), horimetro = coalesce(p_horimetro, horimetro),
    horas_parado = coalesce(p_horas_parado, horas_parado),
    diagnostico = coalesce(p_diagnostico, diagnostico)
  where id = p_os returning * into o;

  if p_gerar_conta and v_custo > 0 then
    if v_categoria is null then
      select id into v_categoria from public.categorias_despesa
       where tipo = 'veiculo' and lower(nome) = case when o.tipo = 'pneu' then 'pneus' else 'manutenção' end;
    end if;
    select nome into v_forn from public.fornecedores where id = o.fornecedor_id;
    insert into public.contas_pagar (empresa_id, fornecedor_id, descricao, categoria_id, tipo, veiculo_id, vencimento, valor,
      forma_pagamento, conta_bancaria_id, descontar_locador, ordem_servico_id)
    values (o.empresa_id, o.fornecedor_id,
      format('OS %s — %s %s%s', o.numero, initcap(o.tipo::text), v.placa, coalesce(' — ' || v_forn, '')),
      v_categoria, 'veiculo', o.veiculo_id, coalesce(p_vencimento, v_data + 30), v_custo,
      p_forma_pagamento, p_conta_bancaria, o.descontar_locador and v.proprietario = 'locador', o.id)
    returning id into v_conta;
  end if;

  if o.tipo = 'preventiva' and o.plano_id is not null then
    update public.planos_manutencao set
      ultima_execucao_data = v_data,
      ultima_execucao_km = coalesce(o.km, ultima_execucao_km),
      ultima_execucao_horas = coalesce(o.horimetro, ultima_execucao_horas)
    where id = o.plano_id;
  end if;

  if o.km is not null or o.horimetro is not null then
    insert into public.leituras (veiculo_id, data, km, horimetro, origem)
    values (o.veiculo_id, v_data, o.km, o.horimetro, 'os');
  end if;

  if o.parar_veiculo then
    update public.veiculos set status = app.status_pos_manutencao(o.veiculo_id, o.status_veiculo_anterior, o.id)
     where id = o.veiculo_id and status = 'manutencao';
  end if;

  perform app.job_atualizar_preventivas();
  return v_conta;
end $$;

-- Aplicar plano-modelo a todos os veículos do modelo (cópia por veículo)
create or replace function public.fn_aplicar_plano_modelo(p_plano uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  p public.planos_manutencao;
  n int;
begin
  perform app.exigir_perfil('admin','manutencao');
  select * into p from public.planos_manutencao where id = p_plano;
  if p.modelo is null then raise exception 'Plano não é de modelo'; end if;
  insert into public.planos_manutencao (veiculo_id, modelo, servico, intervalo_km, intervalo_horas, intervalo_dias,
    ultima_execucao_data, ultima_execucao_km, ultima_execucao_horas)
  select v.id, p.modelo, p.servico, p.intervalo_km, p.intervalo_horas, p.intervalo_dias,
         app.hoje(), v.km_atual, v.horimetro_atual
    from public.veiculos v
   where lower(v.modelo) = lower(p.modelo) and v.status <> 'vendido' and app.tem_empresa(v.empresa_id)
     and not exists (select 1 from public.planos_manutencao x where x.veiculo_id = v.id and lower(x.servico) = lower(p.servico));
  get diagnostics n = row_count;
  perform app.job_atualizar_preventivas();
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Alertas (painel "Hoje" e sininho)
-- ---------------------------------------------------------------------
create or replace function app.cfg_int(p_chave text, p_default int)
returns int language sql stable as $$
  select coalesce((select (valor #>> '{}')::int from public.configuracoes where chave = p_chave), p_default)
$$;

create or replace function app.job_gerar_alertas()
returns int language plpgsql security definer set search_path = public as $$
declare
  h date := app.hoje();
  n int := 0;
  k int;
begin
  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select 'medicao_a_faturar', 'medicoes', m.id, m.empresa_id, 'alerta',
         'Medição a faturar: ' || v.placa, cl.razao_social || ' — período ' || to_char(m.periodo_inicio, 'DD/MM') || ' a ' || to_char(m.periodo_fim, 'DD/MM/YYYY'),
         '/medicoes?status=a_faturar', h
    from public.medicoes m join public.contratos c on c.id = m.contrato_id
    join public.veiculos v on v.id = c.veiculo_id join public.clientes cl on cl.id = c.cliente_id
   where m.status = 'a_faturar' and m.periodo_fim < h
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select case when m.data_vencimento < h then 'fatura_vencida' else 'fatura_vencendo' end, 'medicoes', m.id, m.empresa_id,
         case when m.data_vencimento < h then 'critico' else 'info' end::public.severidade_alerta,
         case when m.data_vencimento < h then 'Fatura vencida: ' else 'Fatura vence em breve: ' end || coalesce('NF ' || m.numero_nf, v.placa),
         cl.razao_social || ' — vencimento ' || to_char(m.data_vencimento, 'DD/MM/YYYY'),
         '/receber?id=' || m.id, h
    from public.medicoes m join public.contratos c on c.id = m.contrato_id
    join public.veiculos v on v.id = c.veiculo_id join public.clientes cl on cl.id = c.cliente_id
   where m.status in ('faturado','recebido_parcial')
     and m.data_vencimento <= h + app.cfg_int('alerta_dias_fatura', 5)
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select 'repasse_liberado', 'repasses', r.id, r.empresa_id, 'info', 'Repasse liberado: ' || l.nome,
         v.placa || ' — ' || to_char(r.valor_liquido, 'FM999G999G990D00'), '/repasses?status=liberado', h
    from public.repasses r join public.locadores l on l.id = r.locador_id join public.veiculos v on v.id = r.veiculo_id
   where r.status = 'liberado'
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select case when cp.vencimento < h then 'conta_vencida' else 'conta_hoje' end, 'contas_pagar', cp.id, cp.empresa_id,
         case when cp.vencimento < h then 'critico' else 'alerta' end::public.severidade_alerta,
         case when cp.vencimento < h then 'Conta vencida: ' else 'Pagar hoje: ' end || cp.descricao,
         'Vencimento ' || to_char(cp.vencimento, 'DD/MM/YYYY'), '/pagar?id=' || cp.id, h
    from public.contas_pagar cp
   where cp.pago_em is null and cp.vencimento <= h
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select 'os_aberta', 'ordens_servico', o.id, o.empresa_id, 'alerta', 'OS ' || o.numero || ' aberta há ' || (h - o.data_abertura) || ' dias',
         v.placa || ' — ' || left(o.descricao_problema, 80), '/manutencao/ordens/' || o.id, h
    from public.ordens_servico o join public.veiculos v on v.id = o.veiculo_id
   where o.status in ('aberta','em_execucao','aguardando_peca') and h - o.data_abertura > app.cfg_int('alerta_dias_os_aberta', 3)
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select 'documento_vencendo', 'documentos_veiculo', d.id, v.empresa_id,
         case when d.validade <= h then 'critico' when d.validade <= h + 15 then 'alerta' else 'info' end::public.severidade_alerta,
         initcap(replace(d.tipo::text, '_', ' ')) || ' ' || v.placa ||
           case when d.validade < h then ' vencido' when d.validade = h then ' vence hoje' else ' vence em ' || (d.validade - h) || ' dias' end,
         'Validade ' || to_char(d.validade, 'DD/MM/YYYY'), '/manutencao/documentos', h
    from public.documentos_veiculo d join public.veiculos v on v.id = d.veiculo_id
   where d.validade is not null and d.validade <= h + 30 and v.status <> 'vendido'
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select 'preventiva_' || p.status_calculado, 'planos_manutencao', p.id, v.empresa_id,
         case when p.status_calculado = 'vencida' then 'critico' else 'alerta' end::public.severidade_alerta,
         'Preventiva ' || case when p.status_calculado = 'vencida' then 'vencida' else 'próxima' end || ': ' || v.placa,
         p.servico || ' — ' || round(p.pct_consumido * 100) || '% do intervalo', '/manutencao/planos', h
    from public.planos_manutencao p join public.veiculos v on v.id = p.veiculo_id
   where p.ativo and p.status_calculado in ('vencida','proxima')
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;

  -- limpa alertas lidos antigos
  delete from public.alertas where data_ref < h - 60;
  return n;
end $$;

-- RPCs: só usuários autenticados (e service_role); nunca anon
revoke execute on function public.fn_pagar_repasse(uuid, date, text, boolean) from public, anon;
revoke execute on function public.fn_gerar_medicoes(date, int, uuid[], boolean) from public, anon;
revoke execute on function public.fn_desmobilizar_contrato(uuid, date) from public, anon;
revoke execute on function public.fn_fechar_os(uuid, date, numeric, numeric, numeric, boolean, date, public.forma_pagamento, uuid, uuid, text) from public, anon;
revoke execute on function public.fn_aplicar_plano_modelo(uuid) from public, anon;
grant execute on function public.fn_pagar_repasse(uuid, date, text, boolean) to authenticated, service_role;
grant execute on function public.fn_gerar_medicoes(date, int, uuid[], boolean) to authenticated, service_role;
grant execute on function public.fn_desmobilizar_contrato(uuid, date) to authenticated, service_role;
grant execute on function public.fn_fechar_os(uuid, date, numeric, numeric, numeric, boolean, date, public.forma_pagamento, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.fn_aplicar_plano_modelo(uuid) to authenticated, service_role;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
-- jobs só para o sistema
revoke execute on function app.job_gerar_medicoes(), app.job_gerar_recorrentes(int), app.job_atualizar_preventivas(),
  app.job_gerar_alertas() from authenticated;
