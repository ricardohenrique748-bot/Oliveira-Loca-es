-- =====================================================================
-- 0075 Repasse: escolher quais despesas "descontar do locador" entram
-- Antes: o repasse aberto puxava TODAS as despesas pendentes da placa
-- (ex.: as 12 parcelas do seguro de uma vez).
-- Agora:
--   * padrão: entra só o que vence até a data prevista do repasse
--     (sem data prevista: até o fim do período); o resto espera os
--     próximos repasses;
--   * o usuário marca/desmarca cada despesa num repasse aberto
--     (tabela repasse_descontos_escolha), e a escolha vale por cima do padrão.
-- Repasses pagos não mudam.
-- =====================================================================

create table if not exists public.repasse_descontos_escolha (
  repasse_id uuid not null references public.repasses(id) on delete cascade,
  conta_pagar_id uuid not null references public.contas_pagar(id) on delete cascade,
  incluir boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (repasse_id, conta_pagar_id)
);
create index if not exists repasse_descontos_escolha_conta_idx on public.repasse_descontos_escolha (conta_pagar_id);

drop trigger if exists trg_repasse_descontos_escolha_updated_at on public.repasse_descontos_escolha;
select app.add_updated_at_trigger('public.repasse_descontos_escolha');

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'repasse_descontos_escolha' and policyname = 'repasse_descontos_escolha_select') then
    perform app.aplicar_rls('repasse_descontos_escolha', array['admin','financeiro','consulta'], array['admin','financeiro'], 'app.repasse_visivel(repasse_id)');
  end if;
end $$;
grant select, insert, update, delete on public.repasse_descontos_escolha to authenticated;

drop trigger if exists trg_repasse_descontos_escolha_auditoria on public.repasse_descontos_escolha;
create trigger trg_repasse_descontos_escolha_auditoria after insert or update or delete on public.repasse_descontos_escolha
  for each row execute function app.auditar();

-- ---------- abatimentos: padrão por vencimento + escolha manual ----------
create or replace function app.recalcular_abatimentos_veiculo(p_veiculo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  p record;
  disponivel numeric;
  usar numeric;
  total numeric;
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
    select rp.id, rp.valor_bruto, coalesce(rp.data_prevista, m.periodo_fim) as limite
      from public.repasses rp
      join public.medicoes m on m.id = rp.medicao_id
     where rp.veiculo_id = p_veiculo and rp.status in ('previsto','liberado')
     order by m.periodo_inicio, rp.created_at
  loop
    disponivel := r.valor_bruto;
    total := 0;
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
    update public.repasses set valor_abatimentos = total, valor_liquido = valor_bruto - total where id = r.id;
  end loop;
end $$;

-- ---------- marcar / desmarcar uma despesa num repasse aberto ----------
create or replace function public.fn_escolher_desconto_repasse(p_repasse uuid, p_conta uuid, p_incluir boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  rp public.repasses;
begin
  perform app.exigir_perfil('admin','financeiro');
  select * into rp from public.repasses where id = p_repasse for update;
  if not found then raise exception 'Repasse não encontrado'; end if;
  perform app.exigir_empresa(rp.empresa_id);
  if rp.status not in ('previsto','liberado') then raise exception 'Repasse pago ou cancelado não pode ser alterado'; end if;
  if not exists (select 1 from public.contas_pagar where id = p_conta and veiculo_id = rp.veiculo_id and descontar_locador) then
    raise exception 'Esta despesa não é de desconto desta placa';
  end if;
  insert into public.repasse_descontos_escolha (repasse_id, conta_pagar_id, incluir)
  values (p_repasse, p_conta, p_incluir)
  on conflict (repasse_id, conta_pagar_id) do update set incluir = excluded.incluir;
  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);
end $$;
grant execute on function public.fn_escolher_desconto_repasse to authenticated, service_role;

-- aplica a regra nova aos repasses abertos (pagos não mudam)
select app.recalcular_abatimentos_veiculo(v.id) from public.veiculos v where v.proprietario = 'locador';

notify pgrst, 'reload schema';
