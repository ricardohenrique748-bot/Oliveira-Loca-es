-- =====================================================================
-- 0018 Contato principal do cliente
-- E-mail e WhatsApp gerais da empresa (os contatos por obra continuam em
-- public.contatos).
-- =====================================================================
alter table public.clientes add column email text;
alter table public.clientes add column whatsapp text;
