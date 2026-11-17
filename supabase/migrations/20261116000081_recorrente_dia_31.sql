
-- ---------------------------------------------------------------------
-- Contas a pagar: recorrência em dias 29–31 (espelho de vencimentosRecorrentesFaltantes com `dia`)
-- ---------------------------------------------------------------------
create or replace function app.job_gerar_recorrentes(p_meses int default 12)
returns int language plpgsql security definer set search_path = public as $$
declare
  g record;
  base public.contas_pagar;
  comp date;
  limite date := (date_trunc('month', app.hoje()) + make_interval(months => p_meses - 1))::date;
  dia int;
  n int := 0;
begin
  for g in
    select grupo_parcela_id, min(vencimento) as primeiro, max(vencimento) as ultimo
      from public.contas_pagar where recorrente and grupo_parcela_id is not null
     group by grupo_parcela_id
  loop
    -- a última conta do grupo define o modelo (valor/descrição atuais); se ela foi
    -- desmarcada como recorrente, a recorrência terminou
    select * into base from public.contas_pagar where grupo_parcela_id = g.grupo_parcela_id
      order by vencimento desc, created_at desc limit 1;
    continue when not base.recorrente;
    -- dia pedido = maior dia entre as 2 últimas contas (2 meses seguidos sempre incluem um de 31 dias),
    -- assim 31 que caiu em 30/11 ou 28/02 volta a ser 31; e respeita uma mudança de dia feita em "esta e as seguintes"
    select max(extract(day from v.vencimento))::int into dia from (select vencimento from public.contas_pagar
      where grupo_parcela_id = g.grupo_parcela_id order by vencimento desc limit 2) v;
    comp := greatest(date_trunc('month', g.primeiro), date_trunc('month', app.hoje()))::date;
    while comp <= limite loop
      if not exists (select 1 from public.contas_pagar where grupo_parcela_id = g.grupo_parcela_id
                        and date_trunc('month', vencimento) = comp) then
        insert into public.contas_pagar (empresa_id, fornecedor_id, descricao, categoria_id, tipo, veiculo_id, vencimento,
          valor, grupo_parcela_id, recorrente, forma_pagamento, conta_bancaria_id, descontar_locador, observacoes, created_by)
        values (base.empresa_id, base.fornecedor_id, base.descricao, base.categoria_id, base.tipo, base.veiculo_id,
          make_date(extract(year from comp)::int, extract(month from comp)::int, least(dia, extract(day from app.ultimo_dia(comp))::int)),
          base.valor, base.grupo_parcela_id, true, base.forma_pagamento, base.conta_bancaria_id, base.descontar_locador,
          base.observacoes, base.created_by);
        n := n + 1;
      end if;
      comp := (comp + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end $$;
