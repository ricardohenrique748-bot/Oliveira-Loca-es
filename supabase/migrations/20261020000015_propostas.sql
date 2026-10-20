-- =====================================================================
-- 0015 Comercial: propostas de locação
-- Uma proposta por veículo/equipamento. Ao ser aprovada, vira contrato
-- (fn_proposta_gerar_contrato) com os mesmos valores.
--
-- Acesso (L = leitura, E = escrita)
-- tabela                 admin  financeiro  faturamento  manutencao  consulta  comercial
-- propostas              LE     L           LE           -           L         LE
-- clientes/obras/contat. (+ comercial LE)
-- empresas/veiculos/configuracoes (+ comercial L)
-- =====================================================================

create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  numero text,
  cliente_id uuid not null references public.clientes(id),
  obra_id uuid references public.obras(id),
  -- veículo é opcional na proposta (pode ser só o tipo de equipamento); obrigatório para gerar o contrato
  veiculo_id uuid references public.veiculos(id),
  equipamento text,
  tipo_cobranca text not null default 'mensal' check (tipo_cobranca in ('mensal', 'diaria')),
  -- mensal: valor do mês; diária: valor por dia (mesma regra do contrato)
  valor numeric(14,2) not null check (valor >= 0),
  dia_corte_inicio int not null default 1 check (dia_corte_inicio in (1, 21)),
  prazo_pagamento_dias int not null default 30 check (prazo_pagamento_dias between 0 and 365),
  data_inicio_prevista date,
  periodo_minimo text,
  validade date,
  condicoes text,
  observacoes text,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'aprovada', 'recusada', 'convertida')),
  motivo_recusa text,
  contrato_id uuid references public.contratos(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint proposta_veiculo_ou_equipamento_ck check (veiculo_id is not null or nullif(btrim(equipamento), '') is not null)
);
create index on public.propostas (empresa_id);
create index on public.propostas (status);
create index on public.propostas (cliente_id);
create unique index propostas_numero_uk on public.propostas (empresa_id, numero);
select app.add_updated_at_trigger('public.propostas');

-- número automático PR-<NNN>/<AA> por empresa e ano (mesmo padrão de 0012)
create or replace function app.proposta_numero()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ano text;
  v_seq int;
begin
  new.numero := nullif(btrim(new.numero), '');
  if new.numero is not null then return new; end if;
  if tg_op = 'UPDATE' and old.numero is not null then
    new.numero := old.numero;
    return new;
  end if;
  v_ano := to_char(coalesce(new.created_at, now()) at time zone 'America/Sao_Paulo', 'YY');
  perform pg_advisory_xact_lock(hashtext('proposta_numero:' || new.empresa_id || ':' || v_ano));
  select coalesce(max((regexp_match(numero, '^PR-(\d+)/' || v_ano || '$'))[1]::int), 0) + 1
    into v_seq
    from public.propostas
   where empresa_id = new.empresa_id and numero ~ ('^PR-\d+/' || v_ano || '$');
  new.numero := 'PR-' || lpad(v_seq::text, 3, '0') || '/' || v_ano;
  return new;
end $$;

create trigger trg_propostas_numero before insert or update of numero on public.propostas
  for each row execute function app.proposta_numero();

create trigger trg_propostas_auditoria after insert or update or delete on public.propostas
  for each row execute function app.auditar();

-- ---------- RLS ----------
select app.aplicar_rls('propostas', array['admin','financeiro','faturamento','consulta','comercial'],
                       array['admin','faturamento','comercial'], 'app.tem_empresa(empresa_id)');

-- comercial cadastra clientes/obras/contatos e consulta frota e empresas
create policy clientes_comercial on public.clientes for all to authenticated
  using (app.tem_perfil('comercial')) with check (app.tem_perfil('comercial'));
create policy obras_comercial on public.obras for all to authenticated
  using (app.tem_perfil('comercial')) with check (app.tem_perfil('comercial'));
create policy contatos_comercial on public.contatos for all to authenticated
  using (app.tem_perfil('comercial')) with check (app.tem_perfil('comercial'));
create policy veiculos_select_comercial on public.veiculos for select to authenticated
  using (app.tem_perfil('comercial') and app.tem_empresa(empresa_id));
create policy empresas_select_comercial on public.empresas for select to authenticated
  using (app.tem_perfil('comercial') and app.tem_empresa(id));
create policy configuracoes_select_comercial on public.configuracoes for select to authenticated
  using (app.tem_perfil('comercial'));
create policy alertas_select_comercial on public.alertas for select to authenticated
  using (app.tem_perfil('comercial') and app.tem_empresa(empresa_id));

-- ---------- Proposta aprovada → contrato ----------
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
  if p.status <> 'aprovada' then raise exception 'Só proposta aprovada pode virar contrato'; end if;
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
