-- =====================================================================
-- 0086 Contrato: quantidade de veículos/equipamentos
-- Só informativa: sai no PDF do contrato e não muda o valor
-- (o valor mensal continua digitado à mão). Vazio = não sai no PDF.
-- =====================================================================

alter table public.contratos add column if not exists quantidade int;
alter table public.contratos drop constraint if exists contratos_quantidade_ck;
alter table public.contratos add constraint contratos_quantidade_ck check (quantidade is null or quantidade between 1 and 9999);

notify pgrst, 'reload schema';
