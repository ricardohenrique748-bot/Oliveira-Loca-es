-- =====================================================================
-- 0032 Contas a pagar: despesa variável
-- Novo tipo de lançamento além de fixa e de veículo (também nas categorias).
-- =====================================================================
alter type public.tipo_despesa add value if not exists 'variavel' before 'veiculo';

notify pgrst, 'reload schema';
