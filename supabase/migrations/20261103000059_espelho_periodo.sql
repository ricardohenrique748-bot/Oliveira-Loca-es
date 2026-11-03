-- =====================================================================
-- 0059 Espelho de horas: período de fechamento escolhido
-- data_inicio: o período vai dela até a véspera do mesmo dia no mês seguinte
-- (ex.: competência novembro, fechamento de 21/10 a 20/11). Vazio = dia 1 da competência (como antes).
-- Linhas: até 31 (o período pode ter 31 dias).
-- =====================================================================

alter table public.espelhos
  add column if not exists data_inicio date,
  -- entre o dia 1 do mês anterior e o último dia da competência
  add constraint espelhos_data_inicio_ck check (
    data_inicio is null
    or data_inicio between (competencia - interval '1 month')::date and (competencia + interval '1 month' - interval '1 day')::date
  );

alter table public.espelhos drop constraint if exists espelhos_linhas_check;
alter table public.espelhos
  add constraint espelhos_linhas_check check (jsonb_typeof(linhas) = 'array' and jsonb_array_length(linhas) <= 31);

-- aprovado não muda: inclui a data de início
create or replace function app.espelho_antes_salvar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.status = 'aprovado'
     and (new.linhas is distinct from old.linhas or new.veiculo_id is distinct from old.veiculo_id
          or new.cliente_id is distinct from old.cliente_id or new.competencia is distinct from old.competencia
          or new.data_inicio is distinct from old.data_inicio) then
    raise exception 'Espelho já aprovado pelo cliente não pode ser alterado.' using hint = 'ESPELHO_APROVADO';
  end if;
  new.total_horas := coalesce((
    select sum(nullif(l->>'horas', '')::numeric)
      from jsonb_array_elements(new.linhas) l
  ), 0);
  return new;
end $$;

-- link público: devolve também a data de início do período
create or replace function public.fn_espelho_publico(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'competencia', e.competencia,
    'data_inicio', e.data_inicio,
    'status', e.status,
    'linhas', e.linhas,
    'total_horas', e.total_horas,
    'observacoes', e.observacoes,
    'enviado_em', e.enviado_em,
    'respondido_em', e.respondido_em,
    'respondido_por', e.respondido_por,
    'motivo_recusa', e.motivo_recusa,
    'empresa', coalesce(em.razao_social, em.apelido),
    'empresa_cnpj', em.cnpj,
    'cliente', coalesce(cl.nome_fantasia, cl.razao_social),
    'obra', o.nome,
    'contrato', c.numero,
    'placa', v.placa,
    'modelo', nullif(trim(concat_ws(' ', v.marca, v.modelo)), '')
  )
  from public.espelhos e
  join public.empresas em on em.id = e.empresa_id
  join public.clientes cl on cl.id = e.cliente_id
  join public.veiculos v on v.id = e.veiculo_id
  left join public.obras o on o.id = e.obra_id
  left join public.contratos c on c.id = e.contrato_id
  where e.token = p_token and e.status <> 'rascunho'
$$;

notify pgrst, 'reload schema';
