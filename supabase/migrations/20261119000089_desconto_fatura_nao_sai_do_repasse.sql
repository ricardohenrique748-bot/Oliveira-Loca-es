-- =====================================================================
-- 0089 Desconto da fatura só sai do repasse do locador se for marcado
-- Antes: desconto sem a opção marcada/desmarcada saía do repasse (padrão "sim").
-- Agora o padrão é "não": só sai com "Descontar do dono" marcado na fatura.
-- Repasses pagos não mudam.
-- =====================================================================

create or replace function app.recalcular_abatimentos_veiculo(p_veiculo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  p record;
  d record;
  disponivel numeric;
  usar numeric;
  total numeric;
  acrescimos numeric;
begin
  if p_veiculo is null then return; end if;

  delete from public.repasse_abatimentos a using public.repasses rp
   where a.repasse_id = rp.id and rp.veiculo_id = p_veiculo and rp.status in ('previsto','liberado');

  create temp table if not exists _pend (conta_id uuid primary key, os_id uuid, descricao text, data date, saldo numeric) on commit drop;
  truncate _pend;
  insert into _pend
  select cp.id, cp.ordem_servico_id, cp.descricao, cp.vencimento,
         coalesce(cp.valor_locador, cp.valor) - coalesce((select sum(a.valor) from public.repasse_abatimentos a
                                join public.repasses rp on rp.id = a.repasse_id
                               where a.conta_pagar_id = cp.id and rp.status <> 'cancelado'), 0)
    from public.contas_pagar cp
   where cp.veiculo_id = p_veiculo and cp.descontar_locador;
  delete from _pend where saldo <= 0;

  for r in
    select rp.id, rp.valor_bruto, coalesce(rp.data_prevista, m.periodo_fim) as limite,
           m.valor_base, m.descontos_itens
      from public.repasses rp
      join public.medicoes m on m.id = rp.medicao_id
     where rp.veiculo_id = p_veiculo and rp.status in ('previsto','liberado')
     order by m.periodo_inicio, rp.created_at
  loop
    select coalesce(sum(valor), 0) into acrescimos from public.repasse_ajustes where repasse_id = r.id and tipo = 'acrescimo';
    disponivel := r.valor_bruto + acrescimos;
    total := 0;

    -- 1) descontos da fatura, na proporção do repasse
    if coalesce(r.valor_base, 0) > 0 then
      for d in
        select x->>'descricao' as descricao, (x->>'valor')::numeric as valor
          from jsonb_array_elements(coalesce(r.descontos_itens, '[]'::jsonb)) x
         where coalesce((x->>'descontar_locador')::boolean, false) and coalesce((x->>'valor')::numeric, 0) > 0
      loop
        exit when disponivel <= 0;
        usar := least(round(r.valor_bruto * d.valor / r.valor_base, 2), disponivel);
        if usar > 0 then
          insert into public.repasse_abatimentos (repasse_id, conta_pagar_id, ordem_servico_id, descricao, valor)
          values (r.id, null, null, 'Desconto da fatura: ' || coalesce(nullif(d.descricao, ''), 'Desconto'), usar);
          disponivel := disponivel - usar;
          total := total + usar;
        end if;
      end loop;
    end if;

    -- 2) descontos lançados no recibo
    for d in select descricao, valor from public.repasse_ajustes where repasse_id = r.id and tipo = 'desconto' order by ordem, created_at loop
      exit when disponivel <= 0;
      usar := least(d.valor, disponivel);
      insert into public.repasse_abatimentos (repasse_id, conta_pagar_id, ordem_servico_id, descricao, valor)
      values (r.id, null, null, d.descricao, usar);
      disponivel := disponivel - usar;
      total := total + usar;
    end loop;

    -- 3) despesas "descontar do locador" (padrão por vencimento + escolha manual)
    for p in
      select x.* from _pend x
        left join public.repasse_descontos_escolha e on e.repasse_id = r.id and e.conta_pagar_id = x.conta_id
       where x.saldo > 0
         and coalesce(e.incluir, x.data is null or x.data <= r.limite)
       order by x.data, x.conta_id::text
    loop
      exit when disponivel <= 0;
      usar := least(p.saldo, disponivel);
      insert into public.repasse_abatimentos (repasse_id, conta_pagar_id, ordem_servico_id, descricao, valor)
      values (r.id, p.conta_id, p.os_id, p.descricao, usar);
      update _pend set saldo = saldo - usar where conta_id = p.conta_id;
      disponivel := disponivel - usar;
      total := total + usar;
    end loop;
    update public.repasses set valor_abatimentos = total, valor_liquido = valor_bruto + acrescimos - total where id = r.id;
  end loop;
end $$;

-- recalcula os repasses abertos
select app.recalcular_abatimentos_veiculo(v.id) from public.veiculos v where v.proprietario = 'locador';

notify pgrst, 'reload schema';
