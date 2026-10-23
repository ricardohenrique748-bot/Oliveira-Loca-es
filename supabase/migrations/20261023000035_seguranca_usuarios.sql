-- =====================================================================
-- 0035 Segurança de usuários
--  * o perfil nunca vem dos metadados do signUp (o próprio usuário os preenche):
--    novo usuário do Auth nasce 'consulta' e inativo; quem define perfil/ativo é o admin
--    (fn_admin_salvar_usuario)
--  * sem senha padrão: usuário novo exige senha com 8+ caracteres, letras e números
--  * crypt/gen_salt sem prefixo de schema: pgcrypto fica em extensions no Supabase e em public no PGlite (demo)
-- =====================================================================

create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios_perfil (user_id, nome, perfil, ativo)
  values (new.id, split_part(new.email, '@', 1), 'consulta', false)
  on conflict (user_id) do nothing;
  return new;
end $$;

create or replace function app.validar_senha(p_senha text)
returns void language plpgsql immutable as $$
begin
  if length(p_senha) < 8 or p_senha !~ '[0-9]' or p_senha !~ '[A-Za-z]' then
    raise exception 'Senha fraca: use 8 ou mais caracteres, com letras e números';
  end if;
end $$;

create or replace function public.fn_admin_salvar_usuario(
  p_user_id uuid,
  p_email text,
  p_senha text,
  p_nome text,
  p_perfil public.perfil_usuario,
  p_ativo boolean,
  p_empresas uuid[]
)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user_id uuid := p_user_id;
  v_senha text := nullif(trim(p_senha), '');
begin
  perform app.exigir_perfil('admin');
  if v_senha is not null then perform app.validar_senha(v_senha); end if;

  if v_user_id is null then
    if v_senha is null then
      raise exception 'Informe a senha inicial do usuário';
    end if;
    if exists (select 1 from auth.users where lower(email) = lower(trim(p_email))) then
      raise exception 'E-mail já cadastrado';
    end if;

    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      lower(trim(p_email)), crypt(v_senha, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('nome', p_nome),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(p_email)), 'email_verified', true),
      'email', v_user_id::text, now(), now(), now()
    );
  else
    if exists (select 1 from auth.users where lower(email) = lower(trim(p_email)) and id <> v_user_id) then
      raise exception 'E-mail já cadastrado';
    end if;
    update auth.users
    set email = coalesce(lower(trim(p_email)), email),
        encrypted_password = case when v_senha is not null
                                  then crypt(v_senha, gen_salt('bf'))
                                  else encrypted_password end,
        banned_until = case when p_ativo then null else now() + interval '100 years' end,
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into public.usuarios_perfil (user_id, nome, perfil, ativo)
  values (v_user_id, p_nome, p_perfil, p_ativo)
  on conflict (user_id) do update
  set nome = excluded.nome, perfil = excluded.perfil, ativo = excluded.ativo;

  delete from public.usuario_empresas where user_id = v_user_id;
  if p_empresas is not null and array_length(p_empresas, 1) > 0 then
    insert into public.usuario_empresas (user_id, empresa_id)
    select v_user_id, unnest(p_empresas);
  end if;

  return v_user_id;
end $$;

revoke execute on function public.fn_admin_salvar_usuario from public, anon;
grant execute on function public.fn_admin_salvar_usuario to authenticated, service_role;
revoke execute on function app.validar_senha(text) from public, anon;
grant execute on function app.validar_senha(text) to authenticated, service_role;
