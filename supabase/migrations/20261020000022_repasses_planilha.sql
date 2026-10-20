-- =====================================================================
-- 0022 Repasses no formato da planilha "Valor Repasse"
-- Empresa · Contrato (cliente/obra) · Placa · Parceiro · Período · Faturado ·
-- Vencimento · Valor · Repasse · Responsável · Status · Observações.
-- Acrescenta à repasses_v a obra, a data de faturamento, o nº do contrato e o
-- contato do cliente (o que recebe fatura, preferindo o da obra).
-- =====================================================================

create or replace view public.repasses_v with (security_invoker = true) as
select
  r.*,
  l.nome as locador_nome,
  v.placa,
  e.apelido as empresa_apelido,
  m.periodo_inicio, m.periodo_fim, m.dias, m.numero_nf, m.valor_final as medicao_valor,
  m.status as medicao_status, m.data_vencimento as medicao_vencimento,
  date_trunc('month', m.periodo_fim)::date as competencia,
  coalesce(cl.nome_fantasia, cl.razao_social) as cliente_nome,
  (r.status in ('previsto','liberado') and m.status <> 'recebido') as seria_adiantado,
  o.nome as obra_nome,
  m.data_emissao as medicao_emissao,
  c.numero as contrato_numero,
  ct.nome as responsavel_nome,
  ct.whatsapp as responsavel_whatsapp,
  ct.email as responsavel_email
from public.repasses r
join public.locadores l on l.id = r.locador_id
join public.veiculos v on v.id = r.veiculo_id
join public.empresas e on e.id = r.empresa_id
join public.medicoes m on m.id = r.medicao_id
join public.contratos c on c.id = m.contrato_id
join public.clientes cl on cl.id = c.cliente_id
left join public.obras o on o.id = c.obra_id
left join lateral (
  select x.nome, x.whatsapp, x.email
    from public.contatos x
   where x.cliente_id = c.cliente_id and (x.obra_id is null or x.obra_id = c.obra_id)
   order by (x.obra_id = c.obra_id) desc nulls last, x.recebe_fatura desc, x.created_at
   limit 1
) ct on true;
