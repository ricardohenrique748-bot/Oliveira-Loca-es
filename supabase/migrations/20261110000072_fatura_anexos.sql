-- =====================================================================
-- 0072 Anexos da fatura
-- PDFs e fotos ligados à fatura (OS assinada, canhoto, fotos do serviço...).
-- Mesmo formato dos outros anexos: "bucket/caminho", um por linha.
-- =====================================================================

alter table public.medicoes add column if not exists anexo_url text;

notify pgrst, 'reload schema';
