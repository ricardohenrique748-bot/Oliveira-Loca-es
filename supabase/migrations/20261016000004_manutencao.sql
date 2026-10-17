-- =====================================================================
-- 0004 manutenção: planos, OS, itens, pneus, documentos, leituras,
-- alertas
-- =====================================================================

create table public.planos_manutencao (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid references public.veiculos(id) on delete cascade, -- null = plano-modelo
  modelo text,
  servico text not null,
  intervalo_km numeric(12,1) check (intervalo_km > 0),
  intervalo_horas numeric(12,1) check (intervalo_horas > 0),
  intervalo_dias int check (intervalo_dias > 0),
  ultima_execucao_data date,
  ultima_execucao_km numeric(12,1),
  ultima_execucao_horas numeric(12,1),
  ativo boolean not null default true,
  -- calculado por app.atualizar_preventivas() (job diário)
  status_calculado text check (status_calculado in ('em_dia','proxima','vencida')),
  pct_consumido numeric(8,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint plano_intervalo_ck check (coalesce(intervalo_km, intervalo_horas, intervalo_dias::numeric) is not null),
  constraint plano_alvo_ck check (veiculo_id is not null or modelo is not null)
);
create index on public.planos_manutencao (veiculo_id);
create index on public.planos_manutencao (modelo);

create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  veiculo_id uuid not null references public.veiculos(id),
  empresa_id uuid not null references public.empresas(id),
  tipo public.tipo_os not null default 'corretiva',
  plano_id uuid references public.planos_manutencao(id) on delete set null,
  data_abertura date not null default app.hoje(),
  data_fechamento date,
  km numeric(12,1),
  horimetro numeric(12,1),
  fornecedor_id uuid references public.fornecedores(id),
  descricao_problema text not null,
  diagnostico text,
  custo_total numeric(14,2) not null default 0,
  horas_parado numeric(10,1) not null default 0 check (horas_parado >= 0),
  descontar_locador boolean not null default false,
  parar_veiculo boolean not null default true, -- false = serviço rápido, veículo não muda de status
  status_veiculo_anterior public.status_veiculo,
  fotos text[] not null default '{}',
  status public.status_os not null default 'aberta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.ordens_servico (veiculo_id);
create index on public.ordens_servico (empresa_id);
create index on public.ordens_servico (status);
create index on public.ordens_servico (data_abertura);

alter table public.contas_pagar
  add constraint contas_pagar_os_fk foreign key (ordem_servico_id) references public.ordens_servico(id) on delete set null;
alter table public.repasse_abatimentos
  add constraint repasse_abatimentos_os_fk foreign key (ordem_servico_id) references public.ordens_servico(id) on delete set null;
create index on public.contas_pagar (ordem_servico_id);

create table public.os_itens (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id) on delete cascade,
  tipo public.tipo_item_os not null default 'peca',
  descricao text not null,
  quantidade numeric(12,3) not null default 1 check (quantidade > 0),
  valor_unitario numeric(14,2) not null default 0 check (valor_unitario >= 0),
  valor_total numeric(14,2) generated always as (round(quantidade * valor_unitario, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.os_itens (ordem_servico_id);

create table public.pneus (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid references public.veiculos(id) on delete set null,
  posicao text,
  marca text,
  medida text,
  numero_fogo text not null unique,
  data_compra date,
  km_instalacao numeric(12,1),
  ressolagens int not null default 0 check (ressolagens >= 0),
  status text not null default 'em_uso' check (status in ('em_uso','estoque','ressolagem','descartado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.pneus (veiculo_id);

create table public.pneus_historico (
  id uuid primary key default gen_random_uuid(),
  pneu_id uuid not null references public.pneus(id) on delete cascade,
  data date not null default app.hoje(),
  evento text not null, -- instalacao, remocao, rodizio, ressolagem, descarte
  veiculo_id uuid references public.veiculos(id),
  posicao text,
  km numeric(12,1),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.pneus_historico (pneu_id);

create table public.documentos_veiculo (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  tipo public.tipo_documento not null,
  numero text,
  validade date,
  anexo_url text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.documentos_veiculo (veiculo_id);
create index on public.documentos_veiculo (validade);

create table public.leituras (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  data date not null default app.hoje(),
  km numeric(12,1),
  horimetro numeric(12,1),
  origem public.origem_leitura not null default 'manual',
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint leitura_valor_ck check (km is not null or horimetro is not null)
);
create index on public.leituras (veiculo_id, data desc);

create table public.alertas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  referencia_tabela text not null,
  referencia_id uuid not null,
  empresa_id uuid references public.empresas(id),
  severidade public.severidade_alerta not null default 'info',
  titulo text not null,
  descricao text,
  link text,
  data_ref date not null default app.hoje(),
  lida boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (tipo, referencia_id, data_ref)
);
create index on public.alertas (data_ref desc) where not lida;

do $$
declare t text;
begin
  foreach t in array array['planos_manutencao','ordens_servico','os_itens','pneus','pneus_historico',
    'documentos_veiculo','leituras','alertas']
  loop
    perform app.add_updated_at_trigger(('public.' || t)::regclass);
  end loop;
end $$;

-- Leitura nova atualiza km/horímetro do veículo (só se maior)
create or replace function app.leitura_atualiza_veiculo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.veiculos v set
    km_atual = greatest(v.km_atual, coalesce(new.km, v.km_atual)),
    horimetro_atual = greatest(v.horimetro_atual, coalesce(new.horimetro, v.horimetro_atual))
  where v.id = new.veiculo_id;
  return new;
end $$;
create trigger trg_leituras_veiculo after insert on public.leituras
  for each row execute function app.leitura_atualiza_veiculo();
