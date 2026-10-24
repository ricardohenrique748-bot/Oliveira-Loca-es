-- =====================================================================
-- 0039 NFS-e: histórico de tentativas de emissão (evidência para diagnóstico)
-- Cada envio à Sefin Nacional vira uma linha: XML exato enviado (assinado),
-- status HTTP e corpo bruto da resposta, ou o erro de conexão.
-- Só inclusão: sem update/delete pelo app (as policies não existem).
-- NUNCA guardar aqui certificado, senha, chave privada ou variáveis secretas.
-- Sem gatilho de auditoria: a linha já é o registro e não deve ser duplicada.
-- Não altera nem apaga dados existentes.
-- =====================================================================

create table if not exists public.nfse_tentativas (
  id uuid primary key default gen_random_uuid(),
  -- a fatura apagada (só canceladas podem ser) leva junto as tentativas dela
  medicao_id uuid not null references public.medicoes(id) on delete cascade,
  ambiente text not null check (ambiente in ('homologacao', 'producao')),
  numero_dps integer,
  criado_em timestamptz not null default now(),
  criado_por uuid not null default auth.uid(),
  -- XML exato que foi compactado e enviado (com declaração e assinatura)
  xml_enviado text not null,
  -- resposta da Sefin: status e corpo bruto, como chegaram
  http_status integer,
  resposta_corpo text,
  -- falha sem resposta HTTP (conexão, tempo esgotado)
  erro text,
  constraint nfse_tentativas_resultado_ck check (http_status is not null or erro is not null)
);
create index if not exists nfse_tentativas_medicao_idx on public.nfse_tentativas (medicao_id, criado_em desc);

alter table public.nfse_tentativas enable row level security;

-- quem emite nota (admin, financeiro, faturamento) e só nas faturas da sua empresa
drop policy if exists nfse_tentativas_select on public.nfse_tentativas;
create policy nfse_tentativas_select on public.nfse_tentativas for select to authenticated
  using (app.tem_perfil('admin','financeiro','faturamento') and app.medicao_visivel(medicao_id));

drop policy if exists nfse_tentativas_insert on public.nfse_tentativas;
create policy nfse_tentativas_insert on public.nfse_tentativas for insert to authenticated
  with check (app.tem_perfil('admin','financeiro','faturamento') and app.medicao_visivel(medicao_id) and criado_por = auth.uid());

revoke all on public.nfse_tentativas from anon, public;
grant select, insert on public.nfse_tentativas to authenticated;

notify pgrst, 'reload schema';
