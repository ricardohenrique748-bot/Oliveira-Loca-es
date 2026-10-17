-- =====================================================================
-- 0002 cadastros: empresas, usuários, clientes, obras, contatos,
-- locadores, fornecedores, veículos, contas bancárias, categorias,
-- contratos, configurações
-- =====================================================================

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  apelido text not null unique check (apelido = upper(apelido)),
  razao_social text not null,
  cnpj text unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.usuarios_perfil (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  perfil public.perfil_usuario not null default 'consulta',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.usuario_empresas (
  user_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (user_id, empresa_id)
);

create table public.contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  banco public.banco not null,
  agencia text,
  conta text,
  apelido text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.contas_bancarias (empresa_id);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text unique,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.clientes (lower(coalesce(nome_fantasia, razao_social)));

create table public.obras (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  codigo text,
  cidade text,
  uf char(2),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.obras (cliente_id);

create table public.contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  obra_id uuid references public.obras(id) on delete set null,
  nome text not null,
  email text,
  whatsapp text,
  recebe_fatura boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.contatos (cliente_id);
create index on public.contatos (obra_id);

create table public.locadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf_cnpj text,
  telefone text,
  chave_pix text,
  tipo_chave_pix public.tipo_chave_pix,
  banco text,
  nome_titular_pix text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.locadores (lower(nome));

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf_cnpj text,
  telefone text,
  email text,
  categoria text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.fornecedores (lower(nome));

create table public.veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  tipo public.tipo_veiculo not null default 'caminhao',
  marca text,
  modelo text,
  ano int check (ano between 1950 and 2100),
  proprietario public.proprietario_veiculo not null default 'proprio',
  locador_id uuid references public.locadores(id),
  empresa_id uuid not null references public.empresas(id),
  km_atual numeric(12,1) not null default 0,
  horimetro_atual numeric(12,1) not null default 0,
  status public.status_veiculo not null default 'disponivel',
  foto_url text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint veiculo_locador_ck check (
    (proprietario = 'locador' and locador_id is not null) or (proprietario = 'proprio' and locador_id is null)
  )
);
create index on public.veiculos (empresa_id);
create index on public.veiculos (status);
create index on public.veiculos (locador_id);
create index on public.veiculos (modelo);

create table public.categorias_despesa (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo public.tipo_despesa not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (nome, tipo)
);

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid not null references public.clientes(id),
  obra_id uuid references public.obras(id),
  veiculo_id uuid not null references public.veiculos(id),
  numero text,
  valor_mensal numeric(14,2) not null check (valor_mensal >= 0),
  valor_repasse_mensal numeric(14,2) check (valor_repasse_mensal >= 0),
  dia_corte_inicio int not null default 1 check (dia_corte_inicio in (1, 21)),
  prazo_pagamento_dias int not null default 30 check (prazo_pagamento_dias between 0 and 365),
  data_inicio date not null,
  data_fim date,
  data_desmobilizacao date,
  status public.status_contrato not null default 'ativo',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint contrato_datas_ck check (
    (data_fim is null or data_fim >= data_inicio) and
    (data_desmobilizacao is null or data_desmobilizacao >= data_inicio)
  )
);
create index on public.contratos (empresa_id);
create index on public.contratos (status);
create index on public.contratos (veiculo_id);
create index on public.contratos (cliente_id);
-- um veículo só pode ter um contrato ativo por vez
create unique index contratos_veiculo_ativo_uk on public.contratos (veiculo_id) where status = 'ativo';

create table public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

insert into public.configuracoes (chave, valor, descricao) values
  ('base_dias_mes', '30', 'Base de dias do mês para cálculo proporcional (medição e repasse)'),
  ('alerta_dias_fatura', '5', 'Antecedência (dias) para alertar faturas vencendo'),
  ('alerta_dias_documento', '[30, 15, 0]', 'Faixas de alerta para vencimento de documentos'),
  ('alerta_dias_os_aberta', '3', 'OS aberta há mais de N dias gera alerta'),
  ('alerta_dias_pagar', '7', 'Janela (dias) de contas a pagar no dashboard'),
  ('preventiva_pct_alerta', '0.9', 'Percentual consumido do intervalo que marca a preventiva como "próxima"'),
  ('template_cobranca_email', to_jsonb(E'Prezado(a) {contato},\n\nSegue lembrete da fatura {nf} referente à locação do veículo {placa} ({periodo}), no valor de {valor}, com vencimento em {vencimento}.\n\nQualquer dúvida estamos à disposição.\n\nAtenciosamente,\n{empresa}'::text), 'Template de e-mail de cobrança'),
  ('template_cobranca_whatsapp', to_jsonb('Olá {contato}! Lembrete da fatura {nf} — locação {placa} ({periodo}), valor {valor}, vencimento {vencimento}. Obrigado! {empresa}'::text), 'Template de WhatsApp de cobrança');

-- Base de dias configurável (default 30)
create or replace function app.base_dias()
returns int language sql stable as $$
  select coalesce((select (valor #>> '{}')::int from public.configuracoes where chave = 'base_dias_mes'), 30)
$$;

do $$
declare t text;
begin
  foreach t in array array['empresas','usuarios_perfil','usuario_empresas','contas_bancarias','clientes','obras',
    'contatos','locadores','fornecedores','veiculos','categorias_despesa','contratos','configuracoes']
  loop
    perform app.add_updated_at_trigger(('public.' || t)::regclass);
  end loop;
end $$;

-- Placa sempre normalizada: maiúsculas, sem hífen/espaço
create or replace function app.normalizar_placa()
returns trigger language plpgsql as $$
begin
  new.placa := upper(regexp_replace(new.placa, '[^A-Za-z0-9]', '', 'g'));
  return new;
end $$;
create trigger trg_veiculos_placa before insert or update of placa on public.veiculos
  for each row execute function app.normalizar_placa();

-- Novo usuário no Auth → perfil (metadados: nome, perfil)
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios_perfil (user_id, nome, perfil)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'perfil')::public.perfil_usuario, 'consulta')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();
