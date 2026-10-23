-- Permite lançar mais de uma fatura do mesmo contrato no mesmo período/dia
-- (ex.: duas diárias no mesmo dia). A geração automática continua sem duplicar.
drop index if exists public.medicoes_contrato_periodo_uk;
