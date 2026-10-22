-- =====================================================================
-- 0024 Repasse com valor digitado
-- O valor mensal do repasse vem do contrato ao criar, mas pode ser
-- alterado em cada repasse pendente: recalcula bruto, abatimentos e líquido.
-- =====================================================================

create or replace function public.fn_alterar_valor_repasse(p_repasse uuid, p_valor_mensal numeric)
returns public.repasses language plpgsql security definer set search_path = public as $$
declare
  rp public.repasses;
  m public.medicoes;
  c public.contratos;
begin
  perform app.exigir_perfil('admin','financeiro');
  if p_valor_mensal is null or p_valor_mensal < 0 then raise exception 'Informe um valor válido'; end if;
  select * into rp from public.repasses where id = p_repasse for update;
  if not found then raise exception 'Repasse não encontrado'; end if;
  perform app.exigir_empresa(rp.empresa_id);
  if rp.status not in ('previsto','liberado') then raise exception 'Repasse pago ou cancelado não pode ser alterado'; end if;

  select * into m from public.medicoes where id = rp.medicao_id;
  select * into c from public.contratos where id = m.contrato_id;
  update public.repasses set
    valor_repasse_mensal = p_valor_mensal,
    valor_bruto = app.valor_proporcional(p_valor_mensal, m.dias, app.base_cobranca(c.tipo_cobranca))
  where id = rp.id;
  -- abatimentos e líquido acompanham o novo bruto
  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);

  select * into rp from public.repasses where id = p_repasse;
  return rp;
end $$;

grant execute on function public.fn_alterar_valor_repasse to authenticated, service_role;
