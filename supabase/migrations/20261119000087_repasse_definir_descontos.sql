-- =====================================================================
-- 0087 Repasse: escolher de uma vez as despesas que saem deste repasse
-- Na hora de pagar, a tela mostra TODAS as despesas "descontar do locador"
-- da placa juntas (sem separar por fatura/contrato) e o usuário marca as
-- que desconta no repasse que está pagando.
--   * marcada: entra neste repasse e sai dos outros repasses abertos da placa
--     (senão um repasse mais antigo a pegaria primeiro);
--   * desmarcada: fica fora deste repasse (espera outro).
-- Usa a mesma tabela de escolhas da 0075 (repasse_descontos_escolha).
-- Repasses pagos não mudam.
-- =====================================================================

create or replace function public.fn_definir_descontos_repasse(p_repasse uuid, p_contas uuid[])
returns public.repasses language plpgsql security definer set search_path = public as $$
declare
  rp public.repasses;
  c record;
begin
  perform app.exigir_perfil('admin','financeiro');
  select * into rp from public.repasses where id = p_repasse for update;
  if not found then raise exception 'Repasse não encontrado'; end if;
  perform app.exigir_empresa(rp.empresa_id);
  if rp.status not in ('previsto','liberado') then raise exception 'Repasse pago ou cancelado não pode ser alterado'; end if;

  for c in select cp.id from public.contas_pagar cp where cp.veiculo_id = rp.veiculo_id and cp.descontar_locador loop
    if c.id = any(coalesce(p_contas, '{}')) then
      insert into public.repasse_descontos_escolha (repasse_id, conta_pagar_id, incluir)
      values (p_repasse, c.id, true)
      on conflict (repasse_id, conta_pagar_id) do update set incluir = true;
      -- os outros repasses abertos da placa não pegam esta despesa
      insert into public.repasse_descontos_escolha (repasse_id, conta_pagar_id, incluir)
      select o.id, c.id, false from public.repasses o
       where o.veiculo_id = rp.veiculo_id and o.id <> p_repasse and o.status in ('previsto','liberado')
      on conflict (repasse_id, conta_pagar_id) do update set incluir = false;
    else
      insert into public.repasse_descontos_escolha (repasse_id, conta_pagar_id, incluir)
      values (p_repasse, c.id, false)
      on conflict (repasse_id, conta_pagar_id) do update set incluir = false;
    end if;
  end loop;

  perform app.recalcular_abatimentos_veiculo(rp.veiculo_id);
  select * into rp from public.repasses where id = p_repasse;
  return rp;
end $$;
grant execute on function public.fn_definir_descontos_repasse(uuid, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
