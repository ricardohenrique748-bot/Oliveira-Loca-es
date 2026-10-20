-- =====================================================================
-- 0012 Número do contrato automático
-- Formato <PREFIXO>-<NNN>/<AA>: prefixo = 2 primeiras letras do apelido da
-- empresa (OLIVEIRA → OL, TDTS → TD), sequência por empresa e ano de início.
-- Só preenche quando o número vem vazio; número digitado é mantido.
-- =====================================================================
create or replace function app.contrato_numero()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefixo text;
  v_ano text;
  v_seq int;
begin
  new.numero := nullif(btrim(new.numero), '');
  if new.numero is not null then return new; end if;
  -- edição que apagou o número: mantém o anterior
  if tg_op = 'UPDATE' and old.numero is not null then
    new.numero := old.numero;
    return new;
  end if;

  select upper(left(regexp_replace(apelido, '[^A-Za-z0-9]', '', 'g'), 2)) into v_prefixo from public.empresas where id = new.empresa_id;
  v_prefixo := coalesce(nullif(v_prefixo, ''), 'CT');
  v_ano := to_char(coalesce(new.data_inicio, app.hoje()), 'YY');

  -- serializa a numeração da mesma empresa/ano
  perform pg_advisory_xact_lock(hashtext('contrato_numero:' || new.empresa_id || ':' || v_ano));
  select coalesce(max((regexp_match(numero, '^' || v_prefixo || '-(\d+)/' || v_ano || '$'))[1]::int), 0) + 1
    into v_seq
    from public.contratos
   where empresa_id = new.empresa_id and numero ~ ('^' || v_prefixo || '-\d+/' || v_ano || '$');

  new.numero := v_prefixo || '-' || lpad(v_seq::text, 3, '0') || '/' || v_ano;
  return new;
end $$;

create trigger trg_contratos_numero before insert or update of numero on public.contratos
  for each row execute function app.contrato_numero();
