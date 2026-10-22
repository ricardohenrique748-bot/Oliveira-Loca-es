-- =====================================================================
-- 0026 Contrato: PDF enviado pelo cliente, guardado no storage (bucket anexos)
-- Referência no formato "anexos/contratos/AAAA/MM/xxxx-arquivo.pdf", como nas demais telas.
-- =====================================================================

alter table public.contratos add column if not exists anexo_url text;

notify pgrst, 'reload schema';
