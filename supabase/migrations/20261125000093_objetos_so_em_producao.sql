-- =====================================================================
-- 0093 Traz para o repositório objetos que foram criados direto em produção
-- (SQL Editor) e não tinham migration. Copiados do dump de produção de
-- 25/11/2026. Idempotente: em produção não muda nada (já existem).
--  * multas_importacoes: histórico das importações de multas (Senatran)
--  * fn_mover_desconto_repasse: escolhe em qual repasse uma despesa
--    "descontar do locador" é abatida
-- Fora daqui, de propósito:
--  * public.rls_auto_enable(): event trigger do próprio Supabase
--    (liga RLS em tabela nova); gerenciado pelo painel
--  * public.trava_aprovacao_liberacao(): não é deste sistema (cita outro
--    domínio e uma tabela "usuarios" que não existe aqui); sem trigger usando
-- =====================================================================

create table if not exists public.multas_importacoes (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('portal_senatran', 'automatica')),
  fonte text,
  placas text[] not null default '{}',
  encontradas integer not null default 0,
  novas integer not null default 0,
  atualizadas integer not null default 0,
  sem_placa text[] not null default '{}',
  erro text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists multas_importacoes_created_at_idx on public.multas_importacoes (created_at desc);

alter table public.multas_importacoes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'multas_importacoes' and policyname = 'multas_importacoes_select') then
    perform app.aplicar_rls('multas_importacoes', array['admin','financeiro','manutencao','consulta'], array['admin','financeiro','manutencao']);
  end if;
end $$;
revoke all on public.multas_importacoes from anon;
grant select, insert, update, delete on public.multas_importacoes to authenticated;

create or replace function public.fn_mover_desconto_repasse(p_conta uuid, p_repasse uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  cp public.contas_pagar;
  rp public.repasses;
begin
  perform app.exigir_perfil('admin','financeiro');
  select * into cp from public.contas_pagar where id = p_conta and descontar_locador;
  if not found then raise exception 'Despesa não encontrada ou não é "descontar do locador"'; end if;
  perform app.exigir_empresa(cp.empresa_id);
  if p_repasse is not null then
    select * into rp from public.repasses where id = p_repasse for update;
    if not found or rp.veiculo_id is distinct from cp.veiculo_id then raise exception 'Este repasse não é da placa da despesa'; end if;
    if rp.status not in ('previsto','liberado') then raise exception 'Repasse pago ou cancelado não pode ser alterado'; end if;
  end if;

  insert into public.repasse_descontos_escolha (repasse_id, conta_pagar_id, incluir)
  select o.id, p_conta, coalesce(o.id = p_repasse, false) from public.repasses o
   where o.veiculo_id = cp.veiculo_id and o.status in ('previsto','liberado')
  on conflict (repasse_id, conta_pagar_id) do update set incluir = excluded.incluir;

  perform app.recalcular_abatimentos_veiculo(cp.veiculo_id);
end $$;
revoke all on function public.fn_mover_desconto_repasse(uuid, uuid) from public, anon;
grant execute on function public.fn_mover_desconto_repasse(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
