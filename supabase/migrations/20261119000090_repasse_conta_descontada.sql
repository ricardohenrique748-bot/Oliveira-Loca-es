-- =====================================================================
-- 0090 Conta "descontar do locador" fica marcada como descontada
-- Ao pagar o repasse, a conta passa a apontar para ele (contas_pagar.repasse_id)
-- quando o que foi abatido em repasses PAGOS cobre o valor do locador.
-- Antes comparava com o valor TOTAL da conta: com "valor para o locador"
-- menor que o total, a conta nunca ficava marcada, mesmo abatida inteira.
-- Também acerta as contas de repasses já pagos que ficaram sem a marca.
-- (Isso não é a baixa do pagamento ao fornecedor — essa continua em Contas a pagar.)
-- =====================================================================

create or replace function public.fn_pagar_repasse(
  p_repasse uuid, p_data date, p_comprovante_url text default null, p_confirmar_adiantado boolean default false
) returns public.repasses language plpgsql security definer set search_path = public as $$
declare
  rp public.repasses;
  st public.status_medicao;
  v_adiantado boolean;
begin
  perform app.exigir_perfil('admin','financeiro');
  select * into rp from public.repasses where id = p_repasse for update;
  if not found then raise exception 'Repasse não encontrado'; end if;
  perform app.exigir_empresa(rp.empresa_id);
  if rp.status = 'pago' then raise exception 'Repasse já pago' using errcode = 'P0001', hint = 'REPASSE_JA_PAGO'; end if;
  if rp.status = 'cancelado' then raise exception 'Repasse cancelado' using errcode = 'P0001', hint = 'REPASSE_CANCELADO'; end if;

  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);
  select * into rp from public.repasses where id = p_repasse;

  select status into st from public.medicoes where id = rp.medicao_id;
  v_adiantado := st <> 'recebido';
  if v_adiantado and not coalesce(p_confirmar_adiantado, false) then
    raise exception 'Medição ainda não recebida do cliente: confirme o pagamento adiantado'
      using errcode = 'P0001', hint = 'CONFIRMACAO_ADIANTAMENTO';
  end if;

  update public.repasses set
    status = 'pago', data_pagamento = coalesce(p_data, app.hoje()),
    comprovante_url = coalesce(p_comprovante_url, comprovante_url),
    adiantado = v_adiantado,
    aprovado_por = case when v_adiantado then auth.uid() else null end
  where id = p_repasse returning * into rp;

  -- contas totalmente descontadas do locador passam a apontar para este repasse
  -- (o "totalmente" é o valor do locador; sem ele, o valor da conta)
  update public.contas_pagar cp set repasse_id = p_repasse
   where cp.id in (select conta_pagar_id from public.repasse_abatimentos where repasse_id = p_repasse)
     and coalesce(cp.valor_locador, cp.valor) <= (select coalesce(sum(a.valor), 0) from public.repasse_abatimentos a
                        join public.repasses r2 on r2.id = a.repasse_id
                       where a.conta_pagar_id = cp.id and r2.status = 'pago') + 0.005;

  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);
  return rp;
end $$;
grant execute on function public.fn_pagar_repasse(uuid, date, text, boolean) to authenticated, service_role;

-- acerto: contas já descontadas por inteiro em repasses pagos, ainda sem a marca (aponta para o último repasse pago)
update public.contas_pagar cp set repasse_id = x.repasse_id
  from (
    select a.conta_pagar_id,
           (array_agg(a.repasse_id order by r.data_pagamento desc nulls last, r.created_at desc))[1] as repasse_id,
           sum(a.valor) as abatido
      from public.repasse_abatimentos a
      join public.repasses r on r.id = a.repasse_id
     where a.conta_pagar_id is not null and r.status = 'pago'
     group by a.conta_pagar_id
  ) x
 where cp.id = x.conta_pagar_id and cp.repasse_id is null and cp.descontar_locador
   and coalesce(cp.valor_locador, cp.valor) <= x.abatido + 0.005;

notify pgrst, 'reload schema';
