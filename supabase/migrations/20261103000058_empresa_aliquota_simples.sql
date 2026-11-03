-- =====================================================================
-- 0058 Empresa: percentual de tributos do Simples Nacional para a NFS-e
-- ME/EPP não pode usar o indicador de total de tributos (E0712): informa pTotTribSN.
-- Valor = alíquota efetiva do DAS (sem a parcela do ISS quando há isenção). Muda com a faixa
-- de faturamento: o contador informa e o usuário atualiza em Cadastros → Empresas.
-- =====================================================================

alter table public.empresas
  add column if not exists nfse_aliquota_simples numeric(5,2) check (nfse_aliquota_simples between 0 and 100);

-- informado pelo contador em 2026-11-03: faixa de 13,72% menos a parcela do ISS (isento) = 9,26%
update public.empresas
   set nfse_aliquota_simples = 9.26
 where apelido = 'OLIVEIRA' and nfse_aliquota_simples is null;

notify pgrst, 'reload schema';
