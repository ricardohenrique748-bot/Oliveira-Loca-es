-- =====================================================================
-- 0065 Contrato: vencimento por dia fixo
-- dia_pagamento (1–31): a fatura vence nesse dia do mês seguinte ao da emissão
-- (emissão 31/10 ou 03/10 → dia 10/11; dia 31 em mês curto = último dia do mês).
-- Vazio: vale o prazo em dias (emissão + prazo_pagamento_dias), como antes.
-- Espelho em src/lib/calculos/medicao.ts (calcularVencimento).
-- =====================================================================

alter table public.contratos add column if not exists dia_pagamento smallint
  check (dia_pagamento is null or dia_pagamento between 1 and 31);

create or replace function app.calcular_vencimento(p_emissao date, p_prazo int, p_dia int)
returns date language sql immutable as $$
  select case
    when p_emissao is null then null
    when p_dia is null then p_emissao + coalesce(p_prazo, 0)
    else (date_trunc('month', p_emissao) + interval '1 month')::date
         + (least(p_dia, extract(day from (date_trunc('month', p_emissao) + interval '2 months' - interval '1 day'))::int) - 1)
  end
$$;

-- ---------- medição: vencimento pelo dia fixo ou pelo prazo (resto igual à 0040) ----------
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

-- ---------- medicoes_v: expõe o dia de pagamento (coluna nova no fim; resto igual à 0064) ----------
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
  c.dia_pagamento
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
