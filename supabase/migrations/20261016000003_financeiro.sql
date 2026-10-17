-- =====================================================================
-- 0003 financeiro: medições, recebimentos, repasses, abatimentos,
-- contas a pagar
-- =====================================================================

create table public.medicoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id),
  empresa_id uuid not null references public.empresas(id),
  periodo_inicio date not null,
  periodo_fim date not null,
  dias int not null check (dias between 0 and 31),
  valor_base numeric(14,2) not null default 0,
  acrescimos numeric(14,2) not null default 0 check (acrescimos >= 0),
  descontos numeric(14,2) not null default 0 check (descontos >= 0),
  valor_final numeric(14,2) not null default 0,
  numero_nf text,
  data_emissao date,
  data_vencimento date,
  status public.status_medicao not null default 'a_faturar',
  final boolean not null default false, -- medição final (desmobilização)
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint medicao_periodo_ck check (periodo_fim >= periodo_inicio)
);
create index on public.medicoes (empresa_id);
create index on public.medicoes (status);
create index on public.medicoes (periodo_inicio);
create index on public.medicoes (data_vencimento);
create unique index medicoes_contrato_periodo_uk on public.medicoes (contrato_id, periodo_inicio) where status <> 'cancelado';

create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null references public.medicoes(id) on delete cascade,
  data date not null,
  valor numeric(14,2) not null check (valor > 0),
  conta_bancaria_id uuid references public.contas_bancarias(id),
  comprovante_url text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.recebimentos (medicao_id);
create index on public.recebimentos (data);

create table public.repasses (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null references public.medicoes(id),
  locador_id uuid not null references public.locadores(id),
  empresa_id uuid not null references public.empresas(id),
  veiculo_id uuid not null references public.veiculos(id),
  valor_bruto numeric(14,2) not null default 0,
  valor_abatimentos numeric(14,2) not null default 0,
  valor_liquido numeric(14,2) not null default 0 check (valor_liquido >= 0),
  data_prevista date,
  data_pagamento date,
  adiantado boolean not null default false,
  aprovado_por uuid references auth.users(id),
  comprovante_url text,
  status public.status_repasse not null default 'previsto',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.repasses (empresa_id);
create index on public.repasses (status);
create index on public.repasses (locador_id);
create index on public.repasses (veiculo_id);
create unique index repasses_medicao_uk on public.repasses (medicao_id) where status <> 'cancelado';

create table public.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  fornecedor_id uuid references public.fornecedores(id),
  descricao text not null,
  categoria_id uuid references public.categorias_despesa(id),
  tipo public.tipo_despesa not null default 'fixa',
  veiculo_id uuid references public.veiculos(id),
  vencimento date not null,
  valor numeric(14,2) not null check (valor >= 0),
  parcela_num int,
  parcela_total int,
  grupo_parcela_id uuid,
  recorrente boolean not null default false,
  forma_pagamento public.forma_pagamento not null default 'boleto',
  conta_bancaria_id uuid references public.contas_bancarias(id),
  descontar_locador boolean not null default false,
  repasse_id uuid references public.repasses(id) on delete set null, -- repasse que concluiu o abatimento
  ordem_servico_id uuid, -- FK adicionada em 0004
  pago_em date,
  valor_pago numeric(14,2),
  anexo_url text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  -- regra: despesa de veículo exige veiculo_id
  constraint conta_veiculo_ck check (tipo <> 'veiculo' or veiculo_id is not null),
  constraint conta_parcela_ck check (
    (parcela_num is null and parcela_total is null) or
    (parcela_num between 1 and parcela_total)
  ),
  constraint conta_descontar_ck check (not descontar_locador or veiculo_id is not null)
);
create index on public.contas_pagar (empresa_id);
create index on public.contas_pagar (vencimento);
create index on public.contas_pagar (veiculo_id);
create index on public.contas_pagar (grupo_parcela_id);
create index on public.contas_pagar (pago_em);
create index contas_pagar_descontar_idx on public.contas_pagar (veiculo_id) where descontar_locador;

create table public.repasse_abatimentos (
  id uuid primary key default gen_random_uuid(),
  repasse_id uuid not null references public.repasses(id) on delete cascade,
  conta_pagar_id uuid references public.contas_pagar(id) on delete cascade,
  ordem_servico_id uuid, -- FK adicionada em 0004
  descricao text not null,
  valor numeric(14,2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.repasse_abatimentos (repasse_id);
create index on public.repasse_abatimentos (conta_pagar_id);

do $$
declare t text;
begin
  foreach t in array array['medicoes','recebimentos','repasses','contas_pagar','repasse_abatimentos']
  loop
    perform app.add_updated_at_trigger(('public.' || t)::regclass);
  end loop;
end $$;
