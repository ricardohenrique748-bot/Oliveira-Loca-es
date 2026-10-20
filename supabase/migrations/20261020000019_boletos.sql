-- =====================================================================
-- 0019 Boletos (Sicredi — API de Cobrança)
-- Emissão, consulta e baixa ficam na Edge Function `sicredi-boleto`, que
-- grava com service_role. O app só lê; por isso não há policy de escrita.
-- =====================================================================

-- endereço do pagador (obrigatório no boleto registrado)
alter table public.clientes
  add column cep text,
  add column endereco text,
  add column cidade text,
  add column uf text;

-- cobrança Sicredi: cooperativa = agência; posto e código do beneficiário vêm do contrato de cobrança
alter table public.contas_bancarias
  add column posto text,
  add column codigo_beneficiario text;

create table public.boletos (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null references public.medicoes(id),
  empresa_id uuid not null references public.empresas(id),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  ambiente text not null check (ambiente in ('sandbox', 'producao')),
  seu_numero text not null,
  nosso_numero text not null,
  linha_digitavel text not null,
  codigo_barras text,
  pix_copia_cola text,
  txid text,
  valor numeric(14,2) not null check (valor > 0),
  data_vencimento date not null,
  status text not null default 'emitido' check (status in ('emitido', 'pago', 'baixado')),
  data_pagamento date,
  valor_pago numeric(14,2),
  recebimento_id uuid references public.recebimentos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.boletos (empresa_id);
create index on public.boletos (status);
-- um boleto em aberto por medição
create unique index boletos_medicao_emitido_uk on public.boletos (medicao_id) where status = 'emitido';
select app.add_updated_at_trigger('public.boletos');
create trigger trg_boletos_auditoria after insert or update or delete on public.boletos
  for each row execute function app.auditar();

alter table public.boletos enable row level security;
create policy boletos_select on public.boletos for select to authenticated
  using (app.tem_perfil('admin', 'financeiro', 'faturamento', 'consulta') and app.tem_empresa(empresa_id));
