-- =====================================================================
-- 0036 Empresa: dados fiscais para emitir NFS-e (padrão nacional)
-- O certificado A1 e a senha NÃO ficam no banco: vão como secrets da função de emissão.
-- =====================================================================

alter table public.empresas
  add column if not exists inscricao_municipal text,
  add column if not exists regime_tributario text check (regime_tributario in ('mei', 'simples_nacional', 'normal')),
  add column if not exists codigo_ibge text check (codigo_ibge ~ '^\d{7}$'),
  add column if not exists nfse_codigo_servico text,
  add column if not exists nfse_aliquota_iss numeric(5,2) check (nfse_aliquota_iss between 0 and 100);

-- dados informados pelo usuário em 2026-10-23
update public.empresas
   set inscricao_municipal = '3886940', regime_tributario = 'simples_nacional', codigo_ibge = '3549805',
       nfse_codigo_servico = '16.02.00', nfse_aliquota_iss = 3
 where apelido = 'OLIVEIRA' and inscricao_municipal is null;

notify pgrst, 'reload schema';
