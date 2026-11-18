-- =====================================================================
-- 0084 E-mail e último acesso dos usuários para a tela de Configurações
-- O navegador não tem a chave service_role, então a tela não lia auth.users
-- e o e-mail vinha vazio (o formulário pedia para digitar de novo).
-- Função só para admin, devolve apenas id, e-mail e último acesso.
-- =====================================================================

create or replace function public.fn_admin_listar_usuarios()
returns table (user_id uuid, email text, ultimo_acesso timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.exigir_perfil('admin');
  return query select u.id, u.email::text, u.last_sign_in_at from auth.users u;
end $$;
revoke all on function public.fn_admin_listar_usuarios() from public, anon;
grant execute on function public.fn_admin_listar_usuarios() to authenticated, service_role;

notify pgrst, 'reload schema';
