-- =====================================================================
-- 0037 Empresa: texto fixo que sai na discriminação de toda NFS-e
-- (ex.: dados bancários para pagamento), e código do serviço correto.
-- =====================================================================

alter table public.empresas add column if not exists nfse_texto_complementar text;

-- como na NFS-e 189 da prefeitura (22/10/2026)
update public.empresas
   set nfse_texto_complementar = 'Dados Bancários: PIX.: 44.889.430/0001-81 BANCO SICREDI AGÊNCIA.: 3003 C/C.: 00043433-7'
 where apelido = 'OLIVEIRA' and nfse_texto_complementar is null;

-- 16.02.00 não existe na lista nacional; o da nota é 16.02.01.000 (nacional 160201 + municipal 000)
update public.empresas set nfse_codigo_servico = '16.02.01.000'
 where apelido = 'OLIVEIRA' and nfse_codigo_servico = '16.02.00';

notify pgrst, 'reload schema';
