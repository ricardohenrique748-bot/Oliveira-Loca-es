-- =====================================================================
-- 0040 Fatura avulsa (sem contrato)
-- Fatura lançada direto para um cliente: contrato_id fica nulo e o cliente
-- vai em medicoes.cliente_id. Cobra valor unitário × quantidade (valor_mensal
-- guarda o valor unitário e dias a quantidade, divisor 1). Sem veículo, sem
-- repasse. Na medicoes_v aparece com tipo_cobranca = 'avulsa'.
-- Espelho em src/lib/calculos/medicao.ts (cobrancaAvulsa, baseCobranca).
-- =====================================================================

alter table public.medicoes alter column contrato_id drop not null;
alter table public.medicoes add column if not exists cliente_id uuid references public.clientes(id);
create index if not exists medicoes_cliente_id_idx on public.medicoes (cliente_id);
alter table public.medicoes add constraint medicoes_contrato_ou_cliente_ck
  check (contrato_id is not null or cliente_id is not null);

-- quantidade: com contrato continua até 31 (dias / diárias / horas do dia); avulsa só precisa ser >= 0
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.medicoes'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%dias%31%'
  loop
    execute format('alter table public.medicoes drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.medicoes add constraint medicoes_dias_check
  check (dias >= 0 and (contrato_id is null or dias <= 31));

-- divisor: avulsa também é valor × quantidade
create or replace function app.base_cobranca(p_tipo text)
returns int language sql stable as $$
  select case when p_tipo in ('diaria', 'hora', 'avulsa') then 1 else app.base_dias() end
$$;

-- ---------- medição: sem contrato usa a empresa informada e divisor 1 ----------
create or replace function app.medicao_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.contratos;
begin
  if new.contrato_id is not null then
    select * into c from public.contratos where id = new.contrato_id;
  end if;
  if tg_op = 'INSERT' and new.contrato_id is not null then
    new.empresa_id := c.empresa_id;
    if coalesce(new.valor_mensal, 0) = 0 then new.valor_mensal := c.valor_mensal; end if;
  end if;

  if tg_op = 'INSERT' or new.dias is distinct from old.dias or new.acrescimos is distinct from old.acrescimos
     or new.descontos is distinct from old.descontos or new.valor_mensal is distinct from old.valor_mensal then
    new.valor_base := app.valor_proporcional(new.valor_mensal, new.dias, app.base_cobranca(coalesce(c.tipo_cobranca, 'avulsa')));
    new.valor_final := greatest(0, new.valor_base + new.acrescimos - new.descontos);
  end if;

  -- vencimento = emissão + prazo do contrato (avulsa: sem prazo, o vencimento é digitado)
  if new.contrato_id is not null and new.data_emissao is not null and (
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

-- ---------- repasse: fatura avulsa não tem veículo nem repasse ----------
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
  if m.contrato_id is null then return; end if;
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

-- ---------- medicoes_v: contrato/veículo opcionais, cliente do contrato ou da fatura ----------
create or replace view public.medicoes_v with (security_invoker = true) as
select
  m.id, m.contrato_id, m.empresa_id, m.periodo_inicio, m.periodo_fim, m.dias, m.valor_base, m.acrescimos, m.descontos,
  m.valor_final, m.numero_nf, m.data_emissao, m.data_vencimento, m.status, m.final, m.observacoes, m.created_at,
  m.updated_at, m.created_by, m.valor_mensal,
  date_trunc('month', m.periodo_fim)::date as competencia,
  c.numero as contrato_numero,
  cl.id as cliente_id, cl.razao_social as cliente_nome, coalesce(cl.nome_fantasia, cl.razao_social) as cliente_fantasia,
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
  coalesce(c.tipo_cobranca, 'avulsa') as tipo_cobranca,
  m.forma_pagamento,
  m.descricao,
  m.acrescimos_itens,
  m.descontos_itens
from public.medicoes m
left join public.contratos c on c.id = m.contrato_id
join public.clientes cl on cl.id = coalesce(c.cliente_id, m.cliente_id)
left join public.obras o on o.id = c.obra_id
left join public.veiculos v on v.id = c.veiculo_id
join public.empresas e on e.id = m.empresa_id
left join lateral (select sum(r.valor) as total, max(r.data) as ultima_data from public.recebimentos r where r.medicao_id = m.id) rc on true
left join public.repasses rp on rp.medicao_id = m.id and rp.status <> 'cancelado';

-- ---------- alertas: as faturas avulsas também avisam (o job original só vê as de contrato) ----------
alter function app.job_gerar_alertas() rename to job_gerar_alertas_contratos;
create or replace function app.job_gerar_alertas()
returns int language plpgsql security definer set search_path = public as $$
declare
  h date := app.hoje();
  n int := app.job_gerar_alertas_contratos();
  k int;
begin
  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select 'medicao_a_faturar', 'medicoes', m.id, m.empresa_id, 'alerta',
         'Fatura avulsa a faturar: ' || coalesce(cl.nome_fantasia, cl.razao_social),
         coalesce(m.descricao || ' — ', '') || 'período ' || to_char(m.periodo_inicio, 'DD/MM') || ' a ' || to_char(m.periodo_fim, 'DD/MM/YYYY'),
         '/medicoes?status=a_faturar', h
    from public.medicoes m join public.clientes cl on cl.id = m.cliente_id
   where m.contrato_id is null and m.status = 'a_faturar' and m.periodo_fim < h
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select case when m.data_vencimento < h then 'fatura_vencida' else 'fatura_vencendo' end, 'medicoes', m.id, m.empresa_id,
         case when m.data_vencimento < h then 'critico' else 'info' end::public.severidade_alerta,
         case when m.data_vencimento < h then 'Fatura vencida: ' else 'Fatura vence em breve: ' end
           || coalesce('NF ' || m.numero_nf, coalesce(cl.nome_fantasia, cl.razao_social)),
         cl.razao_social || ' — vencimento ' || to_char(m.data_vencimento, 'DD/MM/YYYY'),
         '/receber?id=' || m.id, h
    from public.medicoes m join public.clientes cl on cl.id = m.cliente_id
   where m.contrato_id is null and m.status in ('faturado','recebido_parcial')
     and m.data_vencimento <= h + app.cfg_int('alerta_dias_fatura', 5)
  on conflict do nothing;
  get diagnostics k = row_count;
  return n + k;
end $$;
revoke execute on function app.job_gerar_alertas(), app.job_gerar_alertas_contratos() from public, anon, authenticated;

notify pgrst, 'reload schema';
