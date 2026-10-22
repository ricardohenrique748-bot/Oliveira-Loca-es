-- =====================================================================
-- 0033 Uma placa pode ter mais de um contrato ativo ao mesmo tempo
-- Remove a trava "um contrato ativo por veículo" (índice e checagem na
-- proposta) e impede que a placa volte a "disponível" enquanto ainda
-- houver outro contrato ativo dela.
-- =====================================================================

drop index if exists public.contratos_veiculo_ativo_uk;

-- placa só sai de "locado" para "disponível" quando não sobra contrato ativo
-- (vale para encerrar, desmobilizar e excluir contrato, que atualizam o veículo cada um do seu jeito)
create or replace function app.veiculo_mantem_locado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'locado' and new.status = 'disponivel'
     and exists (select 1 from public.contratos c where c.veiculo_id = new.id and c.status = 'ativo') then
    new.status := 'locado';
  end if;
  return new;
end $$;
drop trigger if exists trg_veiculo_mantem_locado on public.veiculos;
create trigger trg_veiculo_mantem_locado before update of status on public.veiculos
  for each row execute function app.veiculo_mantem_locado();

-- proposta → contrato: sem a checagem de veículo já em contrato ativo (resto igual à 0021)
create or replace function public.fn_proposta_gerar_contrato(p_proposta uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.propostas;
  v_id uuid;
begin
  perform app.exigir_perfil('admin','faturamento','comercial');
  select * into p from public.propostas where id = p_proposta for update;
  if not found then raise exception 'Proposta não encontrada'; end if;
  perform app.exigir_empresa(p.empresa_id);
  if p.contrato_id is not null then raise exception 'Esta proposta já virou contrato'; end if;
  if p.status = 'recusada' then raise exception 'Proposta recusada não vira contrato'; end if;
  if p.veiculo_id is null then raise exception 'Informe o veículo na proposta antes de gerar o contrato'; end if;

  insert into public.contratos (empresa_id, cliente_id, obra_id, veiculo_id, tipo_cobranca, valor_mensal,
                                dia_corte_inicio, prazo_pagamento_dias, data_inicio, status, observacoes)
  values (p.empresa_id, p.cliente_id, p.obra_id, p.veiculo_id, p.tipo_cobranca, p.valor,
          p.dia_corte_inicio, p.prazo_pagamento_dias, coalesce(p.data_inicio_prevista, app.hoje()), 'ativo',
          concat_ws(E'\n', 'Gerado da proposta ' || p.numero, p.observacoes))
  returning id into v_id;

  update public.propostas set status = 'convertida', contrato_id = v_id where id = p.id;
  return v_id;
end $$;

notify pgrst, 'reload schema';
