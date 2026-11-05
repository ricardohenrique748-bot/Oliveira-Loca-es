-- =====================================================================
-- 0067 Contrato: assinatura eletrônica pela Clicksign
-- O sistema gera o PDF do contrato, cria um envelope na Clicksign e manda o link ao cliente.
-- assinatura_status: enviado (aguardando o cliente) | assinado | cancelado
-- assinatura_arquivo: PDF assinado guardado no storage ("anexos/contratos-assinados/AAAA/MM/...pdf").
-- =====================================================================

alter table public.contratos
  add column if not exists assinatura_envelope_id text,
  add column if not exists assinatura_documento_id text,
  add column if not exists assinatura_status text check (assinatura_status in ('enviado', 'assinado', 'cancelado')),
  add column if not exists assinatura_signatario text,
  add column if not exists assinatura_enviada_em timestamptz,
  add column if not exists assinatura_concluida_em timestamptz,
  add column if not exists assinatura_arquivo text;

notify pgrst, 'reload schema';
