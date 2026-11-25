-- =====================================================================
-- 0096 Arquivos (Storage) por perfil
-- Antes: qualquer usuário ativo lia qualquer arquivo dos buckets comprovantes,
-- anexos e fotos (ex.: "manutenção" abria comprovante de repasse).
-- Agora cada pasta segue as mesmas regras da tela onde o arquivo é anexado:
--   comprovantes/pagamentos, comprovantes/repasses, anexos/contas
--       ver: admin, financeiro, consulta (+ quem enxerga contas a pagar)
--       enviar: admin, financeiro
--   comprovantes/recebimentos, anexos/faturas, anexos/contratos, anexos/contratos-assinados
--       ver: admin, financeiro, faturamento, consulta
--       enviar: admin, financeiro, faturamento
--   anexos/documentos, anexos/multas, fotos/* (frota e OS)
--       ver: todos os perfis (inclusive comercial, que consulta a frota); enviar: admin, financeiro, manutenção
--   pasta fora do mapa: só admin e financeiro
-- Excluir arquivo continua só admin e financeiro (policy arquivos_delete, sem mudança).
-- Só policies: nenhum arquivo é movido ou apagado.
-- =====================================================================

create or replace function app.arquivo_permitido(p_bucket text, p_nome text, p_escrita boolean)
returns boolean language plpgsql stable set search_path = public, extensions as $$
declare
  pasta text := split_part(p_nome, '/', 1);
begin
  if p_bucket = 'fotos' or (p_bucket = 'anexos' and pasta in ('documentos', 'multas')) then
    return case when p_escrita then app.tem_perfil('admin','financeiro','manutencao')
                else app.tem_perfil('admin','financeiro','faturamento','manutencao','consulta','comercial') end;
  end if;
  if (p_bucket = 'comprovantes' and pasta = 'recebimentos')
     or (p_bucket = 'anexos' and pasta in ('faturas', 'contratos', 'contratos-assinados')) then
    return case when p_escrita then app.tem_perfil('admin','financeiro','faturamento')
                else app.tem_perfil('admin','financeiro','faturamento','consulta') end;
  end if;
  if (p_bucket = 'comprovantes' and pasta in ('pagamentos', 'repasses')) or (p_bucket = 'anexos' and pasta = 'contas') then
    return case when p_escrita then app.tem_perfil('admin','financeiro')
                else app.tem_perfil('admin','financeiro','consulta') end
           and (pasta = 'repasses' or app.ve_contas_pagar());
  end if;
  return app.tem_perfil('admin','financeiro');
end $$;
revoke all on function app.arquivo_permitido(text, text, boolean) from public, anon;
grant execute on function app.arquivo_permitido(text, text, boolean) to authenticated, service_role;

do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  execute 'drop policy if exists "arquivos_select" on storage.objects';
  execute 'drop policy if exists "arquivos_insert" on storage.objects';
  execute 'drop policy if exists "arquivos_update" on storage.objects';
  execute $p$
    create policy "arquivos_select" on storage.objects for select to authenticated
    using (bucket_id in ('comprovantes','anexos','fotos') and app.arquivo_permitido(bucket_id, name, false))
  $p$;
  execute $p$
    create policy "arquivos_insert" on storage.objects for insert to authenticated
    with check (bucket_id in ('comprovantes','anexos','fotos') and app.arquivo_permitido(bucket_id, name, true))
  $p$;
  execute $p$
    create policy "arquivos_update" on storage.objects for update to authenticated
    using (bucket_id in ('comprovantes','anexos','fotos') and app.arquivo_permitido(bucket_id, name, true))
    with check (bucket_id in ('comprovantes','anexos','fotos') and app.arquivo_permitido(bucket_id, name, true))
  $p$;
end $$;
