-- =====================================================================
-- 0063 Espelho de horas: itens do fechamento (como na planilha)
-- fechamento (jsonb): combustivel, lavagem, lubrificante, pecas, mao_obra, pneus (descontos),
-- mobilizacao, desmobilizacao (acréscimos), dias_reparo, dias_base. Cálculo na tela
-- (calcularFechamento em src/lib/calculos/espelho.ts).
-- =====================================================================

alter table public.espelhos
  add column if not exists fechamento jsonb not null default '{}'::jsonb;

alter table public.espelhos drop constraint if exists espelhos_fechamento_ck;
alter table public.espelhos
  add constraint espelhos_fechamento_ck check (jsonb_typeof(fechamento) = 'object');

-- aprovado não muda: inclui o fechamento
create or replace function app.espelho_antes_salvar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.status = 'aprovado'
     and (new.linhas is distinct from old.linhas or new.veiculo_id is distinct from old.veiculo_id
          or new.cliente_id is distinct from old.cliente_id or new.competencia is distinct from old.competencia
          or new.data_inicio is distinct from old.data_inicio or new.data_fim is distinct from old.data_fim
          or new.datas is distinct from old.datas
          or new.valor_mensal is distinct from old.valor_mensal or new.horas_franquia is distinct from old.horas_franquia
          or new.fechamento is distinct from old.fechamento) then
    raise exception 'Espelho já aprovado pelo cliente não pode ser alterado.' using hint = 'ESPELHO_APROVADO';
  end if;
  new.total_horas := coalesce((
    select sum(nullif(l->>'horas', '')::numeric) from jsonb_array_elements(new.linhas) l), 0);
  return new;
end $$;

-- link público: devolve o fechamento
create or replace function public.fn_espelho_publico(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'competencia', e.competencia, 'data_inicio', e.data_inicio, 'data_fim', e.data_fim, 'datas', e.datas,
    'valor_mensal', e.valor_mensal, 'horas_franquia', e.horas_franquia, 'fechamento', e.fechamento,
    'status', e.status, 'linhas', e.linhas, 'total_horas', e.total_horas, 'observacoes', e.observacoes,
    'enviado_em', e.enviado_em, 'respondido_em', e.respondido_em, 'respondido_por', e.respondido_por,
    'motivo_recusa', e.motivo_recusa, 'empresa', coalesce(em.razao_social, em.apelido), 'empresa_cnpj', em.cnpj,
    'cliente', coalesce(cl.nome_fantasia, cl.razao_social), 'obra', o.nome, 'contrato', c.numero,
    'placa', v.placa, 'modelo', nullif(trim(concat_ws(' ', v.marca, v.modelo)), ''))
  from public.espelhos e
  join public.empresas em on em.id = e.empresa_id
  join public.clientes cl on cl.id = e.cliente_id
  join public.veiculos v on v.id = e.veiculo_id
  left join public.obras o on o.id = e.obra_id
  left join public.contratos c on c.id = e.contrato_id
  where e.token = p_token and e.status <> 'rascunho'
$$;

notify pgrst, 'reload schema';
