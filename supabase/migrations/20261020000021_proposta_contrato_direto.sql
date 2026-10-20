-- =====================================================================
-- 0021 Proposta → contrato sem etapa de aprovação
-- O formulário enxuto não mostra a situação; gerar o contrato já vale
-- como aceite. Bloqueia só proposta recusada ou já convertida.
-- =====================================================================

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
  if exists (select 1 from public.contratos where veiculo_id = p.veiculo_id and status = 'ativo') then
    raise exception 'O veículo da proposta já está em um contrato ativo';
  end if;

  insert into public.contratos (empresa_id, cliente_id, obra_id, veiculo_id, tipo_cobranca, valor_mensal,
                                dia_corte_inicio, prazo_pagamento_dias, data_inicio, status, observacoes)
  values (p.empresa_id, p.cliente_id, p.obra_id, p.veiculo_id, p.tipo_cobranca, p.valor,
          p.dia_corte_inicio, p.prazo_pagamento_dias, coalesce(p.data_inicio_prevista, app.hoje()), 'ativo',
          concat_ws(E'\n', 'Gerado da proposta ' || p.numero, p.observacoes))
  returning id into v_id;

  update public.propostas set status = 'convertida', contrato_id = v_id where id = p.id;
  return v_id;
end $$;
