-- =====================================================================
-- 0057 Espelho de horas
-- Cadastro manual das horas de um veículo no mês: 30 linhas (dia 1 a 30),
-- cada uma com início, fim, intervalo, horas e observação (jsonb `linhas`).
-- Depois de preenchido, o espelho é enviado ao cliente por um link público
-- (/aprovacao/espelho/<token>) onde ele aprova ou recusa (com motivo).
--
-- status: rascunho → enviado → aprovado | recusado (recusado → enviado de novo)
-- O link só abre espelho enviado/aprovado/recusado; rascunho não aparece.
-- Aprovado fica travado (linhas não mudam mais).
-- =====================================================================

create table public.espelhos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  veiculo_id uuid not null references public.veiculos(id),
  cliente_id uuid not null references public.clientes(id),
  contrato_id uuid references public.contratos(id) on delete set null,
  obra_id uuid references public.obras(id) on delete set null,
  competencia date not null check (competencia = date_trunc('month', competencia)::date),
  linhas jsonb not null default '[]'::jsonb check (jsonb_typeof(linhas) = 'array' and jsonb_array_length(linhas) <= 30),
  total_horas numeric(10,2) not null default 0,
  observacoes text check (observacoes is null or length(observacoes) <= 1000),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aprovado', 'recusado')),
  -- link público: quem tem o token vê e responde o espelho
  token uuid not null unique default gen_random_uuid(),
  enviado_em timestamptz,
  respondido_em timestamptz,
  respondido_por text check (respondido_por is null or length(respondido_por) <= 120),
  motivo_recusa text check (motivo_recusa is null or length(motivo_recusa) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.espelhos (empresa_id, competencia);
create index on public.espelhos (veiculo_id);
create unique index espelhos_veiculo_cliente_mes_uk on public.espelhos (veiculo_id, cliente_id, competencia);

select app.add_updated_at_trigger('public.espelhos');
create trigger trg_espelhos_auditoria after insert or update or delete on public.espelhos
  for each row execute function app.auditar();

-- total de horas sai das linhas; espelho aprovado não muda mais
create or replace function app.espelho_antes_salvar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.status = 'aprovado'
     and (new.linhas is distinct from old.linhas or new.veiculo_id is distinct from old.veiculo_id
          or new.cliente_id is distinct from old.cliente_id or new.competencia is distinct from old.competencia) then
    raise exception 'Espelho já aprovado pelo cliente não pode ser alterado.' using hint = 'ESPELHO_APROVADO';
  end if;
  new.total_horas := coalesce((
    select sum(nullif(l->>'horas', '')::numeric)
      from jsonb_array_elements(new.linhas) l
  ), 0);
  return new;
end $$;

create trigger trg_espelhos_antes_salvar before insert or update on public.espelhos
  for each row execute function app.espelho_antes_salvar();

-- mesmo acesso de medições: financeiro e faturamento lançam, consulta lê
do $$
begin
  perform app.aplicar_rls('espelhos', array['admin','financeiro','faturamento','consulta'],
    array['admin','financeiro','faturamento'], 'app.tem_empresa(empresa_id)');
end $$;

-- ---------- link público (sem login) ----------

-- dados do espelho para a página do cliente; null se o token não existe ou ainda é rascunho
create or replace function public.fn_espelho_publico(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'competencia', e.competencia,
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

-- resposta do cliente: só vale para espelho enviado (aprovado/recusado não muda pelo link)
create or replace function public.fn_responder_espelho(p_token uuid, p_aprovado boolean, p_nome text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome text := nullif(trim(p_nome), '');
  v_motivo text := nullif(trim(p_motivo), '');
  v_status text;
begin
  if v_nome is null or length(v_nome) < 3 then
    raise exception 'Informe seu nome.' using hint = 'NOME_OBRIGATORIO';
  end if;
  if length(v_nome) > 120 then
    raise exception 'Nome muito longo.' using hint = 'NOME_LONGO';
  end if;
  if not p_aprovado and v_motivo is null then
    raise exception 'Informe o motivo da recusa.' using hint = 'MOTIVO_OBRIGATORIO';
  end if;
  if length(coalesce(v_motivo, '')) > 1000 then
    raise exception 'Motivo muito longo (máximo 1000 caracteres).' using hint = 'MOTIVO_LONGO';
  end if;

  select status into v_status from public.espelhos where token = p_token for update;
  if v_status is null or v_status = 'rascunho' then
    raise exception 'Espelho não encontrado.' using hint = 'ESPELHO_NAO_ENCONTRADO';
  end if;
  if v_status <> 'enviado' then
    raise exception 'Este espelho já foi respondido.' using hint = 'ESPELHO_RESPONDIDO';
  end if;

  update public.espelhos
     set status = case when p_aprovado then 'aprovado' else 'recusado' end,
         respondido_em = now(),
         respondido_por = v_nome,
         motivo_recusa = case when p_aprovado then null else v_motivo end
   where token = p_token;

  return public.fn_espelho_publico(p_token);
end $$;

revoke execute on function public.fn_espelho_publico(uuid) from public;
revoke execute on function public.fn_responder_espelho(uuid, boolean, text, text) from public;
grant execute on function public.fn_espelho_publico(uuid) to anon, authenticated, service_role;
grant execute on function public.fn_responder_espelho(uuid, boolean, text, text) to anon, authenticated, service_role;
grant execute on function app.espelho_antes_salvar() to authenticated, service_role;

notify pgrst, 'reload schema';
