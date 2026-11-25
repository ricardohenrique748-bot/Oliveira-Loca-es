-- =====================================================================
-- 0097 Auditoria nos cadastros com dados pessoais e fiscais
-- O trigger genérico (0006: quem, quando, antes e depois) já cobria as tabelas
-- financeiras e de frota. Faltavam os cadastros com CPF/CNPJ, endereço e
-- contatos (LGPD) e os dados fiscais das empresas (NFS-e).
-- Só cria triggers: nenhum dado muda. A tabela auditoria continua visível só ao admin.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['clientes', 'contatos', 'fornecedores', 'obras', 'empresas'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_%s_auditoria on public.%I', t, t);
      execute format('create trigger trg_%s_auditoria after insert or update or delete on public.%I
        for each row execute function app.auditar()', t, t);
    end if;
  end loop;
end $$;
