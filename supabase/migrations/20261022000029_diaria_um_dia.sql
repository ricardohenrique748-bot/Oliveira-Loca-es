-- =====================================================================
-- 0029 Contrato por diária vale um dia
-- A fatura cobre só o dia do contrato (1 diária); para mais dias o contrato é
-- renovado (cada renovação estende data_fim e lança a fatura do dia).
-- Ajusta os contratos por diária já existentes, criados com fatura do mês.
-- =====================================================================

-- fatura do mês que contém o início → só o dia do início, 1 diária
update public.medicoes m
   set periodo_inicio = c.data_inicio, periodo_fim = c.data_inicio, dias = 1
  from public.contratos c
 where m.contrato_id = c.id
   and c.tipo_cobranca = 'diaria' and c.data_fim is null
   and m.status in ('a_faturar', 'faturado')
   and m.periodo_inicio <= c.data_inicio and m.periodo_fim >= c.data_inicio;

-- último dia do contrato = início (a geração mensal deixa de criar faturas para ele)
update public.contratos set data_fim = data_inicio
 where tipo_cobranca = 'diaria' and data_fim is null;
