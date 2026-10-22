-- =====================================================================
-- 0031 Contrato por hora: horário do dia
-- hora_inicio / hora_fim (relógio no formulário). As horas da fatura saem
-- daqui; término antes do início = passou da meia-noite.
-- =====================================================================
alter table public.contratos add column if not exists hora_inicio time;
alter table public.contratos add column if not exists hora_fim time;

notify pgrst, 'reload schema';
