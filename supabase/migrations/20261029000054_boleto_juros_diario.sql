-- =====================================================================
-- 0054 Boleto: juros por dia de atraso (% ao dia, R$ ao dia) além de % ao mês
-- No Sicredi a multa é cobrada uma vez; o que corre por dia são os juros
-- (tipoJuros VALOR = R$/dia; PERCENTUAL + tipoJurosPercentual DIARIO|MENSAL).
-- =====================================================================

alter table public.contas_bancarias drop constraint contas_bancarias_boleto_juros_mes_pct_check;
alter table public.contas_bancarias rename column boleto_juros_mes_pct to boleto_juros;
alter table public.contas_bancarias
  add column boleto_juros_tipo text not null default 'pct_dia' check (boleto_juros_tipo in ('pct_dia', 'pct_mes', 'valor_dia')),
  add constraint contas_bancarias_boleto_juros_ck check (boleto_juros > 0 and (boleto_juros_tipo = 'valor_dia' or boleto_juros < 100));
-- o que já estava cadastrado era % ao mês
update public.contas_bancarias set boleto_juros_tipo = 'pct_mes' where boleto_juros is not null;

alter table public.boletos rename column juros_mes_pct to juros;
alter table public.boletos add column juros_tipo text check (juros_tipo in ('pct_dia', 'pct_mes', 'valor_dia'));
update public.boletos set juros_tipo = 'pct_mes' where juros is not null;
