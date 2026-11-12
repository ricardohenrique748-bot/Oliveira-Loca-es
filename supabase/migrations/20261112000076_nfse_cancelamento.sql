-- =====================================================================
-- 0076 NFS-e: cancelamento pelo sistema (evento e101101 na Sefin Nacional)
-- * a fatura guarda a nota cancelada (chave, número, quando, motivo) e
--   libera a emissão de uma nova (nfse_chave volta a vazio);
-- * nfse_tentativas ganha o tipo (emissão / cancelamento): o pedido enviado
--   e a resposta da Receita ficam no mesmo histórico;
-- * só admin e financeiro cancelam (as funções conferem perfil e empresa).
-- Não altera dados existentes.
-- =====================================================================

alter table public.medicoes
  add column if not exists nfse_cancelada_chave text,
  add column if not exists nfse_cancelada_numero text,
  add column if not exists nfse_cancelada_em timestamptz,
  add column if not exists nfse_cancelamento_motivo text;

alter table public.nfse_tentativas
  add column if not exists tipo text not null default 'emissao';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nfse_tentativas_tipo_ck') then
    alter table public.nfse_tentativas add constraint nfse_tentativas_tipo_ck check (tipo in ('emissao', 'cancelamento'));
  end if;
end $$;

-- antes de enviar: quem pede pode cancelar esta nota? devolve chave, ambiente e CNPJ da empresa
create or replace function public.fn_nfse_preparar_cancelamento(p_medicao uuid)
returns table (chave text, ambiente text, cnpj text, numero_nf text)
language plpgsql security definer set search_path = public as $$
declare
  m public.medicoes;
begin
  perform app.exigir_perfil('admin','financeiro');
  select * into m from public.medicoes where id = p_medicao;
  if not found then raise exception 'Fatura não encontrada'; end if;
  perform app.exigir_empresa(m.empresa_id);
  if m.nfse_chave is null then raise exception 'Esta fatura não tem NFS-e emitida pelo sistema'; end if;
  return query select m.nfse_chave, m.nfse_ambiente, e.cnpj, m.numero_nf from public.empresas e where e.id = m.empresa_id;
end $$;
revoke execute on function public.fn_nfse_preparar_cancelamento(uuid) from public, anon;
grant execute on function public.fn_nfse_preparar_cancelamento(uuid) to authenticated, service_role;

-- depois que a Receita aceitou: registra na fatura e libera nova emissão
create or replace function public.fn_nfse_registrar_cancelamento(p_medicao uuid, p_chave text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.medicoes;
begin
  perform app.exigir_perfil('admin','financeiro');
  select * into m from public.medicoes where id = p_medicao for update;
  if not found then raise exception 'Fatura não encontrada'; end if;
  perform app.exigir_empresa(m.empresa_id);
  if m.nfse_chave is distinct from p_chave then raise exception 'A nota desta fatura mudou: abra a fatura de novo'; end if;
  update public.medicoes set
    nfse_cancelada_chave = m.nfse_chave,
    nfse_cancelada_numero = m.numero_nf,
    nfse_cancelada_em = now(),
    nfse_cancelamento_motivo = p_motivo,
    nfse_chave = null,
    nfse_dps = null,
    nfse_emitida_em = null,
    nfse_erro = null,
    numero_nf = null
  where id = p_medicao;
end $$;
revoke execute on function public.fn_nfse_registrar_cancelamento(uuid, text, text) from public, anon;
grant execute on function public.fn_nfse_registrar_cancelamento(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
