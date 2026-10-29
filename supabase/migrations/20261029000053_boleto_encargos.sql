-- =====================================================================
-- 0053 Boleto: multa, juros e protesto/negativação automáticos
-- Padrão na conta de cobrança; o diálogo de emissão sugere e permite alterar.
-- Regras do Sicredi (Manual API Cobrança 4.0): protesto 3–99 dias,
-- negativação Serasa 46–99 dias, nunca os dois no mesmo boleto.
-- =====================================================================

alter table public.contas_bancarias
  add column boleto_multa_pct numeric(5,2) check (boleto_multa_pct > 0 and boleto_multa_pct < 100),
  add column boleto_juros_mes_pct numeric(5,2) check (boleto_juros_mes_pct > 0 and boleto_juros_mes_pct < 100),
  add column boleto_apos_vencimento text check (boleto_apos_vencimento in ('protesto', 'negativacao')),
  add column boleto_dias_apos_vencimento int,
  add constraint contas_bancarias_boleto_apos_venc_ck check (
    boleto_apos_vencimento is null
    or (boleto_apos_vencimento = 'protesto' and boleto_dias_apos_vencimento between 3 and 99)
    or (boleto_apos_vencimento = 'negativacao' and boleto_dias_apos_vencimento between 46 and 99)
  );

-- o que foi enviado ao banco em cada boleto
alter table public.boletos
  add column multa_pct numeric(5,2),
  add column juros_mes_pct numeric(5,2),
  add column protesto_dias int,
  add column negativacao_dias int;
