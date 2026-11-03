-- =====================================================================
-- 0061 Espelho de horas: dias escolhidos no calendário
-- datas: os dias do espelho, em ordem (podem pular dias); cada linha N é o N-ésimo dia.
-- Vazio/null = período contínuo (mês da competência, ou data_inicio/data_fim de espelhos já criados).
-- Até 62 dias. Ao trocar os dias, o sistema leva cada linha lançada para a sua data.
-- =====================================================================

alter table public.espelhos
  add column if not exists datas date[];

alter table public.espelhos drop constraint if exists espelhos_datas_ck;
alter table public.espelhos
  add constraint espelhos_datas_ck check (datas is null or cardinality(datas) <= 62);

-- aprovado não muda: inclui os dias
create or replace function app.espelho_antes_salvar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.status = 'aprovado'
     and (new.linhas is distinct from old.linhas or new.veiculo_id is distinct from old.veiculo_id
          or new.cliente_id is distinct from old.cliente_id or new.competencia is distinct from old.competencia
          or new.data_inicio is distinct from old.data_inicio or new.data_fim is distinct from old.data_fim
          or new.datas is distinct from old.datas) then
    raise exception 'Espelho já aprovado pelo cliente não pode ser alterado.' using hint = 'ESPELHO_APROVADO';
  end if;
  new.total_horas := coalesce((
    select sum(nullif(l->>'horas', '')::numeric)
      from jsonb_array_elements(new.linhas) l
  ), 0);
  return new;
end $$;

-- link público: devolve os dias
create or replace function public.fn_espelho_publico(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'competencia', e.competencia,
    'data_inicio', e.data_inicio,
    'data_fim', e.data_fim,
    'datas', e.datas,
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
