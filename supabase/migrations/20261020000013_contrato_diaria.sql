-- =====================================================================
-- 0013 Contrato por diária
-- tipo_cobranca = 'diaria': valor_mensal e valor_repasse_mensal passam a
-- guardar o valor POR DIA; a medição cobra valor × dias corridos (sem a
-- base de 30 dias). Espelho em src/lib/calculos/medicao.ts (baseCobranca,
-- calcularDiasCobranca).
-- =====================================================================
alter table public.contratos add column tipo_cobranca text not null default 'mensal'
  check (tipo_cobranca in ('mensal', 'diaria'));

-- divisor do valor: diária = 1 (valor × dias), mensal = base de dias do mês
create or replace function app.base_cobranca(p_tipo text)
returns int language sql stable as $$
  select case when p_tipo = 'diaria' then 1 else app.base_dias() end
$$;

-- dias a cobrar: diária conta os dias corridos dentro da vigência
create or replace function app.dias_cobranca(p_tipo text, p_inicio date, p_fim date, p_data_inicio date, p_data_fim_efetiva date)
returns int language plpgsql stable as $$
begin
  if p_tipo = 'diaria' then
    return greatest(0, least(p_fim, coalesce(p_data_fim_efetiva, p_fim)) - greatest(p_inicio, p_data_inicio) + 1);
  end if;
  return app.calcular_dias(p_inicio, p_fim, p_data_inicio, p_data_fim_efetiva, app.base_dias());
end $$;

-- ---------- medição: valor com o divisor do tipo de cobrança ----------
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
    new.valor_base := app.valor_proporcional(new.valor_mensal, new.dias, app.base_cobranca(c.tipo_cobranca));
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

-- ---------- repasse: mesmo divisor ----------
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

-- ---------- geração automática (versão 0011 + tipo de cobrança) ----------
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
    dias := v_dias; valor_mensal := c.valor_mensal;
    valor_final := app.valor_proporcional(c.valor_mensal, v_dias, v_base);
    valor_repasse_bruto := case when c.proprietario = 'locador' and c.valor_repasse_mensal is not null
                                then app.valor_proporcional(c.valor_repasse_mensal, v_dias, v_base) end;
    medicao_id := v_id;
    return next;
  end loop;
end $$;

-- ---------- desmobilização: dias pelo tipo de cobrança ----------
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
  v_dias := app.dias_cobranca(c.tipo_cobranca, per.inicio, per.fim, c.data_inicio, least(c.data_fim, p_data));

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

-- ---------- medicoes_v: expõe o tipo de cobrança (coluna nova no fim) ----------
create or replace view public.medicoes_v with (security_invoker = true) as
select
  m.*,
  date_trunc('month', m.periodo_fim)::date as competencia,
  c.numero as contrato_numero,
  c.cliente_id, cl.razao_social as cliente_nome, coalesce(cl.nome_fantasia, cl.razao_social) as cliente_fantasia,
  c.obra_id, o.nome as obra_nome,
  c.veiculo_id, v.placa, v.tipo as veiculo_tipo, v.proprietario,
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
  c.tipo_cobranca
from public.medicoes m
join public.contratos c on c.id = m.contrato_id
join public.clientes cl on cl.id = c.cliente_id
left join public.obras o on o.id = c.obra_id
join public.veiculos v on v.id = c.veiculo_id
join public.empresas e on e.id = m.empresa_id
left join lateral (select sum(r.valor) as total, max(r.data) as ultima_data from public.recebimentos r where r.medicao_id = m.id) rc on true
left join public.repasses rp on rp.medicao_id = m.id and rp.status <> 'cancelado';

