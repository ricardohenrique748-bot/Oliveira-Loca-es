-- =====================================================================
-- 0041 Fatura avulsa: placa opcional
-- medicoes.veiculo_id só é usado na fatura sem contrato (com contrato o
-- veículo vem do contrato). Continua sem repasse; a receita entra na margem
-- da placa.
-- =====================================================================

alter table public.medicoes add column if not exists veiculo_id uuid references public.veiculos(id);
create index if not exists medicoes_veiculo_id_idx on public.medicoes (veiculo_id);

-- ---------- medicoes_v: veículo do contrato ou da fatura avulsa ----------
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
  m.descontos_itens
from public.medicoes m
left join public.contratos c on c.id = m.contrato_id
join public.clientes cl on cl.id = coalesce(c.cliente_id, m.cliente_id)
left join public.obras o on o.id = c.obra_id
left join public.veiculos v on v.id = coalesce(c.veiculo_id, m.veiculo_id)
join public.empresas e on e.id = m.empresa_id
left join lateral (select sum(r.valor) as total, max(r.data) as ultima_data from public.recebimentos r where r.medicao_id = m.id) rc on true
left join public.repasses rp on rp.medicao_id = m.id and rp.status <> 'cancelado';

-- ---------- margem por placa: receita da fatura avulsa com placa também conta ----------
create or replace view public.vw_margem_placa_mes with (security_invoker = true) as
with lanc as (
  select m.empresa_id, coalesce(c.veiculo_id, m.veiculo_id) as veiculo_id, date_trunc('month', m.periodo_fim)::date as mes,
         m.valor_final as receita, 0::numeric as repasse, 0::numeric as manutencao, 0::numeric as outras
    from public.medicoes m left join public.contratos c on c.id = m.contrato_id
   where m.status <> 'cancelado' and coalesce(c.veiculo_id, m.veiculo_id) is not null
  union all
  select r.empresa_id, r.veiculo_id, date_trunc('month', m.periodo_fim)::date, 0, r.valor_bruto, 0, 0
    from public.repasses r join public.medicoes m on m.id = r.medicao_id
   where r.status <> 'cancelado'
  union all
  select o.empresa_id, o.veiculo_id, date_trunc('month', o.data_fechamento)::date, 0, 0, o.custo_total, 0
    from public.ordens_servico o
   where o.status = 'fechada' and not o.descontar_locador
  union all
  select cp.empresa_id, cp.veiculo_id, date_trunc('month', cp.vencimento)::date, 0, 0, 0, cp.valor
    from public.contas_pagar cp
   where cp.tipo = 'veiculo' and cp.ordem_servico_id is null and not cp.descontar_locador
)
select l.empresa_id, e.apelido as empresa_apelido, l.veiculo_id, v.placa, v.tipo, v.proprietario, l.mes,
       sum(l.receita)::numeric(14,2) as receita,
       sum(l.repasse)::numeric(14,2) as repasse,
       sum(l.manutencao)::numeric(14,2) as manutencao,
       sum(l.outras)::numeric(14,2) as outras_despesas,
       (sum(l.receita) - sum(l.repasse) - sum(l.manutencao) - sum(l.outras))::numeric(14,2) as margem,
       case when sum(l.receita) > 0
            then round((sum(l.receita) - sum(l.repasse) - sum(l.manutencao) - sum(l.outras)) / sum(l.receita) * 100, 1) end as margem_pct
  from lanc l
  join public.veiculos v on v.id = l.veiculo_id
  join public.empresas e on e.id = l.empresa_id
 group by l.empresa_id, e.apelido, l.veiculo_id, v.placa, v.tipo, v.proprietario, l.mes;

notify pgrst, 'reload schema';
