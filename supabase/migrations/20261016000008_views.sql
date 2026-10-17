-- =====================================================================
-- 0008 views
--  * public.*_v e public.vw_*: security_invoker → respeitam RLS do usuário
--  * schema bi: mesmas views para Power BI via usuário somente leitura bi_reader
-- =====================================================================

-- ---------- Medições enriquecidas ----------
create view public.medicoes_v with (security_invoker = true) as
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
  (m.valor_final - coalesce(rp.valor_liquido, 0))::numeric(14,2) as margem
from public.medicoes m
join public.contratos c on c.id = m.contrato_id
join public.clientes cl on cl.id = c.cliente_id
left join public.obras o on o.id = c.obra_id
join public.veiculos v on v.id = c.veiculo_id
join public.empresas e on e.id = m.empresa_id
left join lateral (select sum(r.valor) as total, max(r.data) as ultima_data from public.recebimentos r where r.medicao_id = m.id) rc on true
left join public.repasses rp on rp.medicao_id = m.id and rp.status <> 'cancelado';

-- ---------- Contas a pagar com status calculado ----------
create view public.contas_pagar_v with (security_invoker = true) as
select
  cp.*,
  case when cp.pago_em is not null then 'pago' when cp.vencimento < app.hoje() then 'vencido' else 'a_vencer' end as status,
  e.apelido as empresa_apelido,
  f.nome as fornecedor_nome,
  cat.nome as categoria_nome,
  v.placa,
  cb.banco, cb.apelido as conta_apelido,
  coalesce((select sum(a.valor) from public.repasse_abatimentos a join public.repasses r on r.id = a.repasse_id
             where a.conta_pagar_id = cp.id and r.status <> 'cancelado'), 0)::numeric(14,2) as valor_abatido
from public.contas_pagar cp
join public.empresas e on e.id = cp.empresa_id
left join public.fornecedores f on f.id = cp.fornecedor_id
left join public.categorias_despesa cat on cat.id = cp.categoria_id
left join public.veiculos v on v.id = cp.veiculo_id
left join public.contas_bancarias cb on cb.id = cp.conta_bancaria_id;

-- ---------- Repasses enriquecidos ----------
create view public.repasses_v with (security_invoker = true) as
select
  r.*,
  l.nome as locador_nome,
  v.placa,
  e.apelido as empresa_apelido,
  m.periodo_inicio, m.periodo_fim, m.dias, m.numero_nf, m.valor_final as medicao_valor,
  m.status as medicao_status, m.data_vencimento as medicao_vencimento,
  date_trunc('month', m.periodo_fim)::date as competencia,
  coalesce(cl.nome_fantasia, cl.razao_social) as cliente_nome,
  (r.status in ('previsto','liberado') and m.status <> 'recebido') as seria_adiantado
from public.repasses r
join public.locadores l on l.id = r.locador_id
join public.veiculos v on v.id = r.veiculo_id
join public.empresas e on e.id = r.empresa_id
join public.medicoes m on m.id = r.medicao_id
join public.contratos c on c.id = m.contrato_id
join public.clientes cl on cl.id = c.cliente_id;

-- ---------- Margem por placa/mês (DRE por placa) ----------
-- receita − repasse bruto − manutenção − outras despesas do veículo.
-- Despesas "descontar do locador" não entram como custo (o locador arca com elas
-- via abatimento), por isso o repasse entra pelo bruto.
create view public.vw_margem_placa_mes with (security_invoker = true) as
with lanc as (
  select m.empresa_id, c.veiculo_id, date_trunc('month', m.periodo_fim)::date as mes,
         m.valor_final as receita, 0::numeric as repasse, 0::numeric as manutencao, 0::numeric as outras
    from public.medicoes m join public.contratos c on c.id = m.contrato_id
   where m.status <> 'cancelado'
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

-- ---------- DRE por cliente/mês ----------
create view public.vw_dre_cliente_mes with (security_invoker = true) as
select m.empresa_id, m.empresa_apelido, m.cliente_id, m.cliente_fantasia as cliente_nome, m.competencia as mes,
       sum(m.valor_final)::numeric(14,2) as receita,
       sum(coalesce(m.repasse_bruto, 0))::numeric(14,2) as repasse,
       sum(m.valor_recebido)::numeric(14,2) as recebido,
       (sum(m.valor_final) - sum(coalesce(m.repasse_bruto, 0)))::numeric(14,2) as margem,
       count(*) as medicoes
  from public.medicoes_v m
 where m.status <> 'cancelado'
 group by m.empresa_id, m.empresa_apelido, m.cliente_id, m.cliente_fantasia, m.competencia;

-- ---------- Aging do contas a receber ----------
create view public.vw_aging_receber with (security_invoker = true) as
select m.id as medicao_id, m.empresa_id, m.empresa_apelido, m.cliente_id, m.cliente_fantasia as cliente_nome,
       m.placa, m.numero_nf, m.data_emissao, m.data_vencimento, m.valor_final, m.valor_recebido, m.saldo,
       m.dias_atraso,
       case when m.data_vencimento is null or m.data_vencimento >= app.hoje() then 'a_vencer'
            when app.hoje() - m.data_vencimento <= 30 then '1-30'
            when app.hoje() - m.data_vencimento <= 60 then '31-60'
            when app.hoje() - m.data_vencimento <= 90 then '61-90'
            else '90+' end as faixa
  from public.medicoes_v m
 where m.status in ('faturado','recebido_parcial') and m.saldo > 0;

-- ---------- Repasses pendentes ----------
create view public.vw_repasses_pendentes with (security_invoker = true) as
select r.id as repasse_id, r.empresa_id, r.empresa_apelido, r.locador_id, r.locador_nome, r.placa,
       r.periodo_inicio, r.periodo_fim, r.dias, r.valor_bruto, r.valor_abatimentos, r.valor_liquido,
       r.data_prevista, r.status, r.medicao_status, r.seria_adiantado, r.cliente_nome
  from public.repasses_v r
 where r.status in ('previsto','liberado');

-- ---------- Contas a pagar por período ----------
create view public.vw_contas_pagar_periodo with (security_invoker = true) as
select cp.id, cp.empresa_id, cp.empresa_apelido, date_trunc('month', cp.vencimento)::date as mes, cp.vencimento,
       cp.descricao, cp.tipo, cp.categoria_nome, cp.fornecedor_nome, cp.placa, cp.banco, cp.forma_pagamento,
       cp.valor, cp.valor_pago, cp.pago_em, cp.status, cp.descontar_locador, cp.parcela_num, cp.parcela_total
  from public.contas_pagar_v cp;

-- ---------- Custos de manutenção ----------
create view public.vw_manutencao_custos with (security_invoker = true) as
select o.empresa_id, e.apelido as empresa_apelido, o.veiculo_id, v.placa, v.tipo as veiculo_tipo,
       date_trunc('month', o.data_fechamento)::date as mes, o.tipo,
       count(*) as qtd_os, sum(o.custo_total)::numeric(14,2) as custo, sum(o.horas_parado) as horas_parado,
       sum(o.custo_total) filter (where o.descontar_locador)::numeric(14,2) as custo_descontado_locador
  from public.ordens_servico o
  join public.veiculos v on v.id = o.veiculo_id
  join public.empresas e on e.id = o.empresa_id
 where o.status = 'fechada'
 group by o.empresa_id, e.apelido, o.veiculo_id, v.placa, v.tipo, date_trunc('month', o.data_fechamento), o.tipo;

-- ---------- Disponibilidade / ocupação da frota (últimos 12 meses) ----------
create view public.vw_disponibilidade_frota with (security_invoker = true) as
with meses as (
  select generate_series(date_trunc('month', app.hoje()) - interval '11 months', date_trunc('month', app.hoje()), interval '1 month')::date as mes
),
base as (
  select v.id as veiculo_id, v.placa, v.empresa_id, v.status as status_atual, v.tipo, mm.mes,
         (least(app.ultimo_dia(mm.mes), app.hoje()) - mm.mes + 1) as dias_periodo
    from public.veiculos v cross join meses mm
   where v.status <> 'vendido'
)
select b.veiculo_id, b.placa, b.empresa_id, b.tipo, b.status_atual, b.mes, b.dias_periodo,
       b.dias_periodo * 24 as horas_periodo,
       coalesce(os.horas_parado, 0) as horas_parado,
       round(greatest(0, (b.dias_periodo * 24 - coalesce(os.horas_parado, 0))) / (b.dias_periodo * 24)::numeric * 100, 1) as disponibilidade_pct,
       least(coalesce(md.dias, 0), b.dias_periodo) as dias_locados,
       round(least(coalesce(md.dias, 0), b.dias_periodo)::numeric / b.dias_periodo * 100, 1) as ocupacao_pct,
       coalesce(os.corretivas, 0) as qtd_corretivas
  from base b
  left join lateral (
    select sum(o.horas_parado) as horas_parado, count(*) filter (where o.tipo = 'corretiva') as corretivas
      from public.ordens_servico o
     where o.veiculo_id = b.veiculo_id and o.status = 'fechada' and date_trunc('month', o.data_fechamento) = b.mes
  ) os on true
  left join lateral (
    select sum(m.dias) as dias from public.medicoes m join public.contratos c on c.id = m.contrato_id
     where c.veiculo_id = b.veiculo_id and m.status <> 'cancelado' and date_trunc('month', m.periodo_fim) = b.mes
  ) md on true;

-- ---------- Status das preventivas (calculado ao vivo) ----------
create view public.vw_preventivas_status with (security_invoker = true) as
select p.id as plano_id, p.veiculo_id, v.placa, v.modelo, v.empresa_id, p.servico,
       p.intervalo_km, p.intervalo_horas, p.intervalo_dias,
       p.ultima_execucao_data, p.ultima_execucao_km, p.ultima_execucao_horas,
       v.km_atual, v.horimetro_atual,
       x.status, round(x.pct, 4) as pct, x.criterio, x.proxima_km, x.proxima_horas, x.proxima_data, x.restante
  from public.planos_manutencao p
  join public.veiculos v on v.id = p.veiculo_id
  cross join lateral app.calcular_preventiva(p.intervalo_km, p.intervalo_horas, p.intervalo_dias,
    p.ultima_execucao_km, p.ultima_execucao_horas, p.ultima_execucao_data,
    v.km_atual, v.horimetro_atual, app.hoje(), app.pct_alerta_preventiva()) x
 where p.ativo and v.status <> 'vendido';

-- ---------- Fluxo de caixa projetado ----------
create view public.vw_fluxo_caixa_projetado with (security_invoker = true) as
select m.empresa_id, coalesce(m.data_vencimento, m.periodo_fim + m.prazo_pagamento_dias) as data,
       'entrada'::text as tipo, m.saldo as valor, 'Medição ' || m.placa || ' — ' || m.cliente_fantasia as descricao
  from public.medicoes_v m
 where m.status in ('a_faturar','faturado','recebido_parcial') and m.saldo > 0
union all
select cp.empresa_id, cp.vencimento, 'saida', cp.valor, cp.descricao
  from public.contas_pagar cp where cp.pago_em is null
union all
select r.empresa_id, coalesce(r.data_prevista, app.hoje()), 'saida', r.valor_liquido, 'Repasse ' || l.nome
  from public.repasses r join public.locadores l on l.id = r.locador_id
 where r.status in ('previsto','liberado');

grant select on public.medicoes_v, public.contas_pagar_v, public.repasses_v, public.vw_margem_placa_mes,
  public.vw_dre_cliente_mes, public.vw_aging_receber, public.vw_repasses_pendentes, public.vw_contas_pagar_periodo,
  public.vw_manutencao_custos, public.vw_disponibilidade_frota, public.vw_preventivas_status,
  public.vw_fluxo_caixa_projetado to authenticated;
revoke all on public.medicoes_v, public.contas_pagar_v, public.repasses_v, public.vw_margem_placa_mes,
  public.vw_dre_cliente_mes, public.vw_aging_receber, public.vw_repasses_pendentes, public.vw_contas_pagar_periodo,
  public.vw_manutencao_custos, public.vw_disponibilidade_frota, public.vw_preventivas_status,
  public.vw_fluxo_caixa_projetado from anon;

-- =====================================================================
-- Power BI: schema bi + role bi_reader (somente leitura, sem PII de locadores)
-- Defina a senha depois:  alter role bi_reader with password '...';
-- =====================================================================
create schema if not exists bi;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bi_reader') then
    create role bi_reader with login nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

-- views do schema bi rodam como o dono (sem security_invoker): enxergam todas as empresas
create view bi.vw_margem_placa_mes as select * from public.vw_margem_placa_mes;
create view bi.vw_dre_cliente_mes as select * from public.vw_dre_cliente_mes;
create view bi.vw_aging_receber as select * from public.vw_aging_receber;
create view bi.vw_repasses_pendentes as select * from public.vw_repasses_pendentes;
create view bi.vw_contas_pagar_periodo as select * from public.vw_contas_pagar_periodo;
create view bi.vw_manutencao_custos as select * from public.vw_manutencao_custos;
create view bi.vw_disponibilidade_frota as select * from public.vw_disponibilidade_frota;
create view bi.vw_preventivas_status as select * from public.vw_preventivas_status;
create view bi.vw_fluxo_caixa_projetado as select * from public.vw_fluxo_caixa_projetado;
create view bi.medicoes as
  select id, empresa_id, empresa_apelido, contrato_id, cliente_id, cliente_fantasia as cliente_nome, obra_nome, placa,
         periodo_inicio, periodo_fim, competencia, dias, valor_base, acrescimos, descontos, valor_final,
         numero_nf, data_emissao, data_vencimento, status, status_exibicao, valor_recebido, saldo,
         repasse_bruto, repasse_liquido, margem
    from public.medicoes_v;

grant usage on schema bi to bi_reader;
grant usage on schema app to bi_reader;
grant execute on function app.hoje(), app.ultimo_dia(date), app.pct_alerta_preventiva(),
  app.calcular_preventiva(numeric, numeric, int, numeric, numeric, date, numeric, numeric, date, numeric) to bi_reader;
grant select on all tables in schema bi to bi_reader;
alter default privileges in schema bi grant select on tables to bi_reader;
