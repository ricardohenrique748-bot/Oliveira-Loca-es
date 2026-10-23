-- =====================================================================
-- Contratos da planilha de faturamento (out/2026) — SÓ contratos, sem faturas.
-- Rodar no SQL Editor do Supabase. Pode rodar de novo: placa que já tem
-- contrato ativo é pulada. O número do contrato é gerado automaticamente.
-- Cliente não cadastrado é criado; placa não cadastrada é pulada (aviso).
-- Prazo de pagamento = vencimento − emissão da planilha.
-- =====================================================================
do $$
declare
  r record;
  v_empresa uuid; v_veiculo uuid; v_prop text; v_cliente uuid; v_obra uuid;
  v_criados int := 0;
  -- maiúsculas sem acento, para comparar nomes
  norm constant text := 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
  sem  constant text := 'AAAAAEEEEIIIIOOOOOUUUUC';
begin
  for r in select * from (values
    -- empresa,   cliente,               obra,   placa,     locador (planilha),        início,       prazo, valor,    repasse,  contato
    ('OLIVEIRA', 'GUARANA',             null,   'EAQ7B27', 'Antonio Carlos Rombola', date '2026-08-01', 10, 14000.00, 10000.00, 'Henrique (27) 99933-2289'),
    ('OLIVEIRA', 'CARAMURU',            '3800', 'KIF1264', 'Jairo',                  date '2026-09-01', 23,  3800.00,  2500.00, 'nfeservicos@caramuruconstrucoes.com.br'),
    ('OLIVEIRA', 'CARAMURU',            '3800', 'PEF3H47', 'Jardel',                 date '2026-09-01', 23,  9000.00,  7000.00, 'nfeservicos@caramuruconstrucoes.com.br'),
    ('OLIVEIRA', 'CARAMURU',            '3800', 'FDO8F32', 'Jardel',                 date '2026-09-01', 23,  7500.00,  6000.00, 'nfeservicos@caramuruconstrucoes.com.br'),
    ('TDTS',     'STN',                 null,   'AOI5A59', 'Jardel',                 date '2026-09-01', 15,  9000.00,  7000.00, 'Antonio (11) 99008-8530'),
    ('OLIVEIRA', 'GUARANA',             null,   'MQE7C64', 'Lazaro',                 date '2026-08-01', 10,  8000.00,  8000.00, 'Henrique (27) 99933-2289'),
    ('OLIVEIRA', 'CONSTRUTORA LUIZ',    null,   'KAQ0H45', 'Raquel',                 date '2026-09-01', 24,  8000.00,  5500.00, 'Hortencio (84) 9620-9753'),
    ('TDTS',     'BS2G',                null,   'BXI2387', 'Raquel',                 date '2026-09-01',  5,  7500.00,  6000.00, 'Val Mendes (69) 9955-2888'),
    ('TDTS',     'FAAB',                null,   'EJH7F70', 'Robson',                 date '2026-09-01', 20,  8500.00,  6000.00, 'suprimentos@faabengenharia.com'),
    ('OLIVEIRA', 'GUARANA',             null,   'BWY2D41', 'Robson',                 date '2026-08-01', 10,  8000.00,  5000.00, 'Henrique (27) 99933-2289'),
    ('OLIVEIRA', 'CONSTRUTORA LUIZ',    null,   'NDX0H98', 'Silvia',                 date '2026-09-01', 22,  8000.00,  6000.00, 'Guilherme (85) 9654-4719'),
    ('TDTS',     'SOTENG',              null,   'ALZ2G88', 'Waltenir Felix',         date '2026-09-01', 14,  9000.00,  6000.00, 'Eder (65) 8126-8870 / Fernanda (89) 8143-8906'),
    ('OLIVEIRA', 'CONTREL',             null,   'PEF3A40', 'Waltenir Felix',         date '2026-09-01', 15,  8000.00,  6000.00, 'gislaine@contrel.com.br')
  ) as t(empresa, cliente, obra, placa, locador, inicio, prazo, valor, repasse, contato)
  loop
    select id into v_empresa from public.empresas where apelido = r.empresa;
    if v_empresa is null then raise notice 'PULADO %: empresa % não encontrada', r.placa, r.empresa; continue; end if;

    select id, proprietario::text into v_veiculo, v_prop from public.veiculos
     where regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g') = r.placa;
    if v_veiculo is null then raise notice 'PULADO %: placa não cadastrada', r.placa; continue; end if;

    if exists (select 1 from public.contratos where veiculo_id = v_veiculo and status = 'ativo') then
      raise notice 'PULADO %: já tem contrato ativo', r.placa; continue;
    end if;

    -- cliente: razão social ou fantasia contendo o nome (sem acento); senão cadastra
    select id into v_cliente from public.clientes
     where translate(upper(razao_social), norm, sem) like '%' || r.cliente || '%'
        or translate(upper(coalesce(nome_fantasia, '')), norm, sem) like '%' || r.cliente || '%'
     order by length(razao_social) limit 1;
    if v_cliente is null then
      insert into public.clientes (razao_social) values (r.cliente) returning id into v_cliente;
      raise notice 'Cliente % cadastrado (complete o CNPJ em Clientes)', r.cliente;
    end if;

    v_obra := null;
    if r.obra is not null then
      select id into v_obra from public.obras where cliente_id = v_cliente and nome ilike '%' || r.obra || '%' limit 1;
      if v_obra is null then
        insert into public.obras (cliente_id, nome) values (v_cliente, 'Obra ' || r.obra) returning id into v_obra;
      end if;
    end if;

    insert into public.contratos (empresa_id, cliente_id, obra_id, veiculo_id, valor_mensal, valor_repasse_mensal,
                                  dia_corte_inicio, prazo_pagamento_dias, data_inicio, status, observacoes)
    values (v_empresa, v_cliente, v_obra, v_veiculo, r.valor, case when v_prop = 'locador' then r.repasse end,
            1, r.prazo, r.inicio, 'ativo',
            format('Importado da planilha (locador: %s). Contato faturamento: %s', r.locador, r.contato));
    if v_prop <> 'locador' then
      raise notice 'ATENÇÃO %: veículo é frota própria — repasse de R$ % ignorado', r.placa, r.repasse;
    end if;
    v_criados := v_criados + 1;
  end loop;
  raise notice '% contrato(s) criado(s)', v_criados;
end $$;
