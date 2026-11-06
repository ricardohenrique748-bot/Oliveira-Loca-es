-- =====================================================================
-- 0068 NFS-e: descrição do serviço escrita na hora de emitir
-- Cada nota tem a sua (obra, CNO, endereço, vencimento, PIX...). Fica gravada na fatura
-- e a última de cada cliente vem preenchida na próxima emissão para ele.
-- =====================================================================

alter table public.medicoes add column if not exists nfse_descricao text;

notify pgrst, 'reload schema';
