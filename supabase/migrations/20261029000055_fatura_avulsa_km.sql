-- =====================================================================
-- 0055 Fatura avulsa: unidade "km"
-- Munck/transporte cobra as horas e também o km rodado (um item por hora,
-- outro por km).
-- =====================================================================

alter table public.medicoes drop constraint if exists medicoes_unidade_check;
alter table public.medicoes add constraint medicoes_unidade_check
  check (unidade in ('mes', 'semana', 'dia', 'hora', 'km'));

notify pgrst, 'reload schema';
