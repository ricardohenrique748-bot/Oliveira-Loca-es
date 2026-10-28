-- =====================================================================
-- 0046 Conta a pagar "descontar do locador": valor próprio para o repasse
-- valor_locador = quanto é descontado do sublocador no repasse (pode ser
-- diferente do custo da despesa). Vazio = desconta o valor da despesa, como
-- antes. Nenhum dado existente muda: as contas atuais ficam com valor_locador
-- vazio e o desconto continua igual.
-- =====================================================================

alter table public.contas_pagar
  add column if not exists valor_locador numeric(14,2) check (valor_locador is null or valor_locador > 0);

-- ---------- abatimentos: usam o valor para o locador (ou o da despesa) ----------
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
    select rp.id, rp.valor_bruto from public.repasses rp
      join public.medicoes m on m.id = rp.medicao_id
     where rp.veiculo_id = p_veiculo and rp.status in ('previsto','liberado')
     order by m.periodo_inicio, rp.created_at
  loop
    disponivel := r.valor_bruto;
    total := 0;
    for p in select * from _pend where saldo > 0 order by data, conta_id::text loop
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

-- mudar o valor para o locador também recalcula os repasses da placa
drop trigger if exists trg_contas_pagar_abat_upd on public.contas_pagar;
create trigger trg_contas_pagar_abat_upd after update of descontar_locador, valor, valor_locador, veiculo_id, vencimento on public.contas_pagar
  for each row when (old.descontar_locador or new.descontar_locador) execute function app.conta_pagar_abatimento_after();

-- ---------- contas_pagar_v: mesma definição e mesma ordem de colunas, + valor_locador no fim ----------
-- (create or replace: não derruba a vw_contas_pagar_periodo nem a visão do Power BI que dependem dela)
create or replace view public.contas_pagar_v with (security_invoker = true) as
select
  cp.id, cp.empresa_id, cp.fornecedor_id, cp.descricao, cp.categoria_id, cp.tipo, cp.veiculo_id, cp.vencimento, cp.valor,
  cp.parcela_num, cp.parcela_total, cp.grupo_parcela_id, cp.recorrente, cp.forma_pagamento, cp.conta_bancaria_id,
  cp.descontar_locador, cp.repasse_id, cp.ordem_servico_id, cp.pago_em, cp.valor_pago, cp.anexo_url, cp.observacoes,
  cp.created_at, cp.updated_at, cp.created_by,
  case when cp.pago_em is not null then 'pago' when cp.vencimento < app.hoje() then 'vencido' else 'a_vencer' end as status,
  e.apelido as empresa_apelido,
  f.nome as fornecedor_nome,
  cat.nome as categoria_nome,
  v.placa,
  cb.banco, cb.apelido as conta_apelido,
  coalesce((select sum(a.valor) from public.repasse_abatimentos a join public.repasses r on r.id = a.repasse_id
             where a.conta_pagar_id = cp.id and r.status <> 'cancelado'), 0)::numeric(14,2) as valor_abatido,
  cp.valor_locador
from public.contas_pagar cp
join public.empresas e on e.id = cp.empresa_id
left join public.fornecedores f on f.id = cp.fornecedor_id
left join public.categorias_despesa cat on cat.id = cp.categoria_id
left join public.veiculos v on v.id = cp.veiculo_id
left join public.contas_bancarias cb on cb.id = cp.conta_bancaria_id;

notify pgrst, 'reload schema';
