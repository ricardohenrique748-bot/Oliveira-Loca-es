-- =====================================================================
-- 0078 Boletos Itaú (API Cash Management v2 / BoleCode)
-- Mesmo fluxo do Sicredi (Edge Function sicredi-boleto, que agora atende
-- os dois bancos). Diferenças do Itaú:
--   • o beneficiário é agência (4) + conta com dígito (8): usa agencia/conta;
--   • a carteira (ex.: 109) vem do contrato de cobrança — preenchida = a conta emite boleto;
--   • o "nosso número" é gerado por nós (8 dígitos), sequencial por conta;
--   • o boleto sai com QR Code PIX (BoleCode) quando a conta tem chave PIX;
--   • não há PDF na API: o app desenha o boleto a partir dos dados gravados.
-- =====================================================================

alter type public.banco add value if not exists 'Itaú';

alter table public.contas_bancarias
  add column if not exists boleto_carteira text,
  add column if not exists pix_chave text,
  add column if not exists boleto_ultimo_nosso_numero bigint not null default 0;

-- carteira usada na emissão (o id do boleto no Itaú = beneficiário + carteira + nosso número)
alter table public.boletos
  add column if not exists carteira text;

-- próximo nosso número da conta, sem repetir mesmo com emissões simultâneas
create or replace function public.boleto_proximo_nosso_numero(p_conta uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.contas_bancarias
     set boleto_ultimo_nosso_numero = boleto_ultimo_nosso_numero + 1
   where id = p_conta
  returning boleto_ultimo_nosso_numero;
$$;
revoke all on function public.boleto_proximo_nosso_numero(uuid) from public, anon, authenticated;
grant execute on function public.boleto_proximo_nosso_numero(uuid) to service_role;

notify pgrst, 'reload schema';
