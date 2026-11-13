-- =====================================================================
-- 0077 Boletos em parcelas: mais de um boleto em aberto na mesma fatura
-- Antes: um boleto em aberto por medição (índice único) e sempre o saldo inteiro.
-- Agora: a fatura pode ter vários boletos em aberto (parcelas), desde que a soma
-- não passe do saldo — essa conta é feita pela Edge Function sicredi-boleto.
-- Cada boleto guarda a parcela (1, 2, …), o total de parcelas e o grupo da emissão.
-- Não altera dados existentes (os boletos atuais ficam como parcela única).
-- =====================================================================

drop index if exists public.boletos_medicao_emitido_uk;
create index if not exists boletos_medicao_emitido_idx on public.boletos (medicao_id) where status = 'emitido';

alter table public.boletos
  add column if not exists parcela smallint,
  add column if not exists parcelas smallint,
  add column if not exists grupo_id uuid;

notify pgrst, 'reload schema';
