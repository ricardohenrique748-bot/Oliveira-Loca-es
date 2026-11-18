-- =====================================================================
-- 0083 Repasse: acréscimos e descontos do recibo ficam gravados
-- Antes: o que se digitava no recibo saía só no PDF e sumia ao fechar.
-- Agora ficam em repasse_ajustes e mudam o repasse:
--   líquido = bruto + acréscimos − (descontos da fatura + descontos do recibo + despesas do locador)
-- Os descontos do recibo entram como linhas de repasse_abatimentos (sem conta a pagar).
-- Repasses pagos não mudam.
-- =====================================================================

create table if not exists public.repasse_ajustes (
  id uuid primary key default gen_random_uuid(),
  repasse_id uuid not null references public.repasses(id) on delete cascade,
  tipo text not null check (tipo in ('acrescimo','desconto')),
  descricao text not null check (length(trim(descricao)) between 1 and 200),
  valor numeric(14,2) not null check (valor > 0),
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists repasse_ajustes_repasse_idx on public.repasse_ajustes (repasse_id);

drop trigger if exists trg_repasse_ajustes_updated_at on public.repasse_ajustes;
select app.add_updated_at_trigger('public.repasse_ajustes');

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'repasse_ajustes' and policyname = 'repasse_ajustes_select') then
    perform app.aplicar_rls('repasse_ajustes', array['admin','financeiro','consulta'], array['admin','financeiro'], 'app.repasse_visivel(repasse_id)');
  end if;
end $$;
grant select, insert, update, delete on public.repasse_ajustes to authenticated;

drop trigger if exists trg_repasse_ajustes_auditoria on public.repasse_ajustes;
create trigger trg_repasse_ajustes_auditoria after insert or update or delete on public.repasse_ajustes
  for each row execute function app.auditar();

-- ---------- abatimentos: fatura → recibo → despesas do locador ----------
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
         where coalesce((x->>'descontar_locador')::boolean, true) and coalesce((x->>'valor')::numeric, 0) > 0
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

-- ---------- grava a lista inteira de acréscimos/descontos de um repasse aberto ----------
create or replace function public.fn_salvar_ajustes_repasse(p_repasse uuid, p_ajustes jsonb)
returns public.repasses language plpgsql security definer set search_path = public as $$
declare
  rp public.repasses;
begin
  perform app.exigir_perfil('admin','financeiro');
  select * into rp from public.repasses where id = p_repasse for update;
  if not found then raise exception 'Repasse não encontrado'; end if;
  perform app.exigir_empresa(rp.empresa_id);
  if rp.status not in ('previsto','liberado') then raise exception 'Repasse pago ou cancelado não pode ser alterado'; end if;

  delete from public.repasse_ajustes where repasse_id = p_repasse;
  insert into public.repasse_ajustes (repasse_id, tipo, descricao, valor, ordem)
  select p_repasse, x->>'tipo', trim(x->>'descricao'), (x->>'valor')::numeric, (n - 1)::int
    from jsonb_array_elements(coalesce(p_ajustes, '[]'::jsonb)) with ordinality as t(x, n);
  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);

  select * into rp from public.repasses where id = p_repasse;
  return rp;
end $$;
grant execute on function public.fn_salvar_ajustes_repasse to authenticated, service_role;

notify pgrst, 'reload schema';
