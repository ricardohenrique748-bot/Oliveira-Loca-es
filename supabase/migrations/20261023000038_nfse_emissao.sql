-- =====================================================================
-- 0038 NFS-e: numeração da DPS por empresa e resultado da emissão na fatura
-- =====================================================================

alter table public.empresas add column if not exists nfse_proximo_dps integer not null default 1;

alter table public.medicoes
  add column if not exists nfse_ambiente text check (nfse_ambiente in ('homologacao', 'producao')),
  add column if not exists nfse_dps integer,
  add column if not exists nfse_chave text,
  add column if not exists nfse_erro text,
  add column if not exists nfse_emitida_em timestamptz;

-- reserva o próximo número de DPS da empresa (atômico: dois cliques ao mesmo tempo não repetem número)
create or replace function public.fn_nfse_reservar_dps(p_empresa uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  perform app.exigir_perfil('admin','financeiro','faturamento');
  perform app.exigir_empresa(p_empresa);
  update public.empresas set nfse_proximo_dps = nfse_proximo_dps + 1 where id = p_empresa
  returning nfse_proximo_dps - 1 into v;
  if v is null then raise exception 'Empresa não encontrada'; end if;
  return v;
end $$;
revoke execute on function public.fn_nfse_reservar_dps(uuid) from public, anon;
grant execute on function public.fn_nfse_reservar_dps(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
