-- =====================================================================
-- 0094 Boleto sem duplicidade (idempotência da emissão)
-- Antes, a função conferia "já tem boleto em aberto?" e só depois chamava o
-- banco: dois cliques (ou duas abas) passavam juntos pela conferência e
-- geravam dois boletos reais. Agora a Edge Function grava uma trava por
-- fatura antes de chamar o banco (chave primária = fatura) e apaga no fim.
-- Trava esquecida (função caiu no meio) vale 2 minutos; a função limpa.
-- Só a service_role (Edge Function) usa a tabela.
-- =====================================================================

create table if not exists public.boletos_emissao_trava (
  medicao_id uuid primary key references public.medicoes(id) on delete cascade,
  user_id uuid,
  criado_em timestamptz not null default now()
);

alter table public.boletos_emissao_trava enable row level security;
-- sem policies: usuários do app não leem nem gravam; só a service_role
revoke all on public.boletos_emissao_trava from anon, authenticated;
grant all on public.boletos_emissao_trava to service_role;
