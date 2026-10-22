-- =====================================================================
-- 0030 Contrato por hora
-- tipo_cobranca = 'hora': valor_mensal e valor_repasse_mensal guardam o valor
-- POR HORA; a fatura cobra valor × horas (as horas ficam em medicoes.dias).
-- Igual à diária: vale um dia só, mais dias = renovar (fatura do dia).
-- Espelho em src/lib/calculos/medicao.ts (cobrancaAvulsa, baseCobranca).
-- =====================================================================

-- troca o check de tipo_cobranca (nome gerado pelo Postgres na 0013)
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.contratos'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%tipo_cobranca%'
  loop
    execute format('alter table public.contratos drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.contratos add constraint contratos_tipo_cobranca_check
  check (tipo_cobranca in ('mensal', 'diaria', 'hora'));

-- divisor do valor: diária e hora = 1 (valor × quantidade), mensal = base de dias do mês
create or replace function app.base_cobranca(p_tipo text)
returns int language sql stable as $$
  select case when p_tipo in ('diaria', 'hora') then 1 else app.base_dias() end
$$;

-- hora: a geração mensal não cria fatura (as horas são digitadas na fatura do dia)
create or replace function app.dias_cobranca(p_tipo text, p_inicio date, p_fim date, p_data_inicio date, p_data_fim_efetiva date)
returns int language plpgsql stable as $$
begin
  if p_tipo = 'hora' then
    return 0;
  end if;
  if p_tipo = 'diaria' then
    return greatest(0, least(p_fim, coalesce(p_data_fim_efetiva, p_fim)) - greatest(p_inicio, p_data_inicio) + 1);
  end if;
  return app.calcular_dias(p_inicio, p_fim, p_data_inicio, p_data_fim_efetiva, app.base_dias());
end $$;

notify pgrst, 'reload schema';
