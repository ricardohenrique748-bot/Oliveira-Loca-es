-- =====================================================================
-- 0085 Proposta com várias placas
-- A placa principal continua em propostas.veiculo_id (valor = propostas.valor).
-- As outras ficam em proposta_placas, cada uma com o seu valor (mensal ou
-- por diária, conforme a cobrança da proposta).
-- Ao gerar o contrato, as outras placas viram contrato_placas (SQL 0071).
-- =====================================================================

create table if not exists public.proposta_placas (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references public.propostas(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id),
  valor numeric(14,2) not null check (valor >= 0),
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint proposta_placas_uk unique (proposta_id, veiculo_id)
);
create index if not exists proposta_placas_veiculo_idx on public.proposta_placas (veiculo_id);

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'proposta_placas' and policyname = 'proposta_placas_select') then
    perform app.aplicar_rls('proposta_placas', array['admin','financeiro','faturamento','consulta','comercial'], array['admin','faturamento','comercial'],
      'exists (select 1 from public.propostas p where p.id = proposta_id and app.tem_empresa(p.empresa_id))');
  end if;
end $$;
grant select, insert, update, delete on public.proposta_placas to authenticated;

drop trigger if exists trg_proposta_placas_auditoria on public.proposta_placas;
create trigger trg_proposta_placas_auditoria after insert or update or delete on public.proposta_placas
  for each row execute function app.auditar();

-- proposta → contrato: leva também as outras placas
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

  insert into public.contrato_placas (contrato_id, veiculo_id, valor_mensal, ordem)
  select v_id, pp.veiculo_id, pp.valor, pp.ordem
    from public.proposta_placas pp
   where pp.proposta_id = p.id and pp.veiculo_id <> p.veiculo_id
   order by pp.ordem, pp.created_at;

  update public.propostas set status = 'convertida', contrato_id = v_id where id = p.id;
  return v_id;
end $$;

notify pgrst, 'reload schema';
