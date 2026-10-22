-- =====================================================================
-- Seed de desenvolvimento — Oliveira Locações
-- 2 empresas · 8 clientes · 15 veículos (5 de locadores) · 12 contratos
-- 3 meses de medições (jul–set/2026) · contas a pagar · OS · planos
-- Usuários (senha Oliveira@2026): admin@, financeiro@, faturamento@,
-- manutencao@, consulta@ oliveira.local
-- =====================================================================

-- ---------- Usuários ----------
do $$
declare
  u record;
begin
  for u in select * from (values
    ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'admin@oliveira.local', 'Administrador', 'admin'),
    ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'financeiro@oliveira.local', 'Financeiro', 'financeiro'),
    ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'faturamento@oliveira.local', 'Faturamento', 'faturamento'),
    ('aaaaaaaa-0000-0000-0000-000000000004'::uuid, 'manutencao@oliveira.local', 'Oficina', 'manutencao'),
    ('aaaaaaaa-0000-0000-0000-000000000005'::uuid, 'consulta@oliveira.local', 'Diretoria (consulta)', 'consulta')
  ) as t(id, email, nome, perfil)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      crypt('Oliveira@2026', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', u.nome, 'perfil', u.perfil),
      now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', u.id::text, now(), now(), now());
  end loop;
end $$;

-- ---------- Empresas e contas ----------
insert into public.empresas (id, apelido, razao_social, cnpj) values
  ('11111111-0000-0000-0000-000000000001', 'OLIVEIRA', 'Oliveira & Oliveira Locações Ltda', '44.889.430/0001-81'),
  ('11111111-0000-0000-0000-000000000002', 'TDTS', 'TDTS & Oliveira Locações Ltda', '32.511.022/0001-02');

-- endereço e contato que saem na proposta e no contrato
update public.empresas set endereco = 'Rua Primavera, Quadra D, Lote 22, Condomínio Areia Branca', cidade = 'São José do Rio Preto', uf = 'SP',
  contato_nome = 'Thiago', telefone = '17991869942';

insert into public.usuario_empresas (user_id, empresa_id) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002');

insert into public.contas_bancarias (id, empresa_id, banco, agencia, conta, apelido) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Bradesco', '0123', '45678-9', 'Bradesco Oliveira'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Sicredi', '0730', '12345-6', 'Sicredi Oliveira'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Inter', '0001', '9876543-2', 'Inter Oliveira'),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000002', 'Bradesco', '0123', '55555-1', 'Bradesco TDTS'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002', 'Inter', '0001', '1234567-8', 'Inter TDTS');

insert into public.categorias_despesa (id, nome, tipo) values
  ('33333333-0000-0000-0000-000000000001', 'Aluguel', 'fixa'),
  ('33333333-0000-0000-0000-000000000002', 'Energia', 'fixa'),
  ('33333333-0000-0000-0000-000000000003', 'Internet/Telefone', 'fixa'),
  ('33333333-0000-0000-0000-000000000004', 'Salários e encargos', 'fixa'),
  ('33333333-0000-0000-0000-000000000005', 'Impostos', 'fixa'),
  ('33333333-0000-0000-0000-000000000006', 'Financiamentos', 'fixa'),
  ('33333333-0000-0000-0000-000000000007', 'Contabilidade', 'fixa'),
  ('33333333-0000-0000-0000-000000000011', 'Manutenção', 'veiculo'),
  ('33333333-0000-0000-0000-000000000012', 'Pneus', 'veiculo'),
  ('33333333-0000-0000-0000-000000000013', 'Combustível', 'veiculo'),
  ('33333333-0000-0000-0000-000000000014', 'Multas', 'veiculo'),
  ('33333333-0000-0000-0000-000000000015', 'IPVA/Licenciamento', 'veiculo'),
  ('33333333-0000-0000-0000-000000000016', 'Seguro do veículo', 'veiculo'),
  ('33333333-0000-0000-0000-000000000017', 'Financiamento de veículo', 'veiculo'),
  ('33333333-0000-0000-0000-000000000018', 'Rastreador', 'veiculo');

-- ---------- Clientes, obras, contatos ----------
insert into public.clientes (id, razao_social, nome_fantasia, cnpj) values
  ('44444444-0000-0000-0000-000000000001', 'CYMI Construções e Participações S.A.', 'CYMI', '01.111.111/0001-11'),
  ('44444444-0000-0000-0000-000000000002', 'Zopone Engenharia e Comércio Ltda', 'Zopone', '02.222.222/0001-22'),
  ('44444444-0000-0000-0000-000000000003', 'Construtora Caramuru Ltda', 'Caramuru', '03.333.333/0001-33'),
  ('44444444-0000-0000-0000-000000000004', 'Contrel Construções Elétricas Ltda', 'Contrel', '04.444.444/0001-44'),
  ('44444444-0000-0000-0000-000000000005', 'Conserva Engenharia Ltda', 'Conserva', '05.555.555/0001-55'),
  ('44444444-0000-0000-0000-000000000006', 'Tabocas Participações S.A.', 'Tabocas', '06.666.666/0001-66'),
  ('44444444-0000-0000-0000-000000000007', 'Omexom Serviços de Energia Ltda', 'Omexom', '07.777.777/0001-77'),
  ('44444444-0000-0000-0000-000000000008', 'Terravam Terraplenagem Ltda', 'Terravam', '08.888.888/0001-88');

insert into public.obras (id, cliente_id, nome, codigo, cidade, uf) values
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'LT 500 kV Rio Preto–Araraquara', 'LT-500', 'São José do Rio Preto', 'SP'),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'Edifício Residencial Redentora', 'ZOP-114', 'São José do Rio Preto', 'SP'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000003', 'Obra 3800-D', '3800-D', 'Mirassol', 'SP'),
  ('55555555-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000004', 'SE Catanduva', 'CT-22', 'Catanduva', 'SP'),
  ('55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000005', 'Conservação SP-310', 'SP310', 'José Bonifácio', 'SP'),
  ('55555555-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000006', 'Usina Fotovoltaica Bady Bassitt', 'UFV-BB', 'Bady Bassitt', 'SP'),
  ('55555555-0000-0000-0000-000000000007', '44444444-0000-0000-0000-000000000007', 'Manutenção redes CPFL', 'OMX-CPFL', 'São José do Rio Preto', 'SP'),
  ('55555555-0000-0000-0000-000000000008', '44444444-0000-0000-0000-000000000008', 'Loteamento Jardim Norte', 'TRV-07', 'Cedral', 'SP'),
  ('55555555-0000-0000-0000-000000000009', '44444444-0000-0000-0000-000000000001', 'SE Votuporanga', 'SE-VTP', 'Votuporanga', 'SP'),
  ('55555555-0000-0000-0000-000000000010', '44444444-0000-0000-0000-000000000003', 'Obra 2100-A', '2100-A', 'São José do Rio Preto', 'SP');

insert into public.contatos (cliente_id, obra_id, nome, email, whatsapp, recebe_fatura) values
  ('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'Juliana Prado', 'faturamento.lt500@cymi.example', '5517991110001', true),
  ('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000009', 'Rafael Costa', 'rafael.costa@cymi.example', '5517991110002', true),
  ('44444444-0000-0000-0000-000000000002', null, 'Fernanda Lima', 'contas@zopone.example', '5514998880001', true),
  ('44444444-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000003', 'Eng. Paulo Mendes', 'obra3800d@caramuru.example', '5517997770001', true),
  ('44444444-0000-0000-0000-000000000004', null, 'Carla Souza', 'financeiro@contrel.example', '5517996660001', true),
  ('44444444-0000-0000-0000-000000000005', null, 'Marcos Antunes', 'medicoes@conserva.example', '5517995550001', true),
  ('44444444-0000-0000-0000-000000000006', null, 'Beatriz Rocha', 'ap@tabocas.example', '5581994440001', true),
  ('44444444-0000-0000-0000-000000000007', null, 'Diego Martins', 'faturas.br@omexom.example', '5519993330001', true),
  ('44444444-0000-0000-0000-000000000008', null, 'Sérgio Alves', 'sergio@terravam.example', '5517992220001', true);

-- ---------- Locadores e fornecedores ----------
insert into public.locadores (id, nome, cpf_cnpj, telefone, chave_pix, tipo_chave_pix, banco, nome_titular_pix) values
  ('66666666-0000-0000-0000-000000000001', 'Robson Ferreira', '123.456.789-09', '5517991234567', '123.456.789-09', 'cpf', 'Sicredi', 'Robson Ferreira da Silva'),
  ('66666666-0000-0000-0000-000000000002', 'Marcos Pereira', '987.654.321-00', '5517997654321', 'marcos.pereira@email.example', 'email', 'Bradesco', 'Marcos Pereira'),
  ('66666666-0000-0000-0000-000000000003', 'Transportes JR Ltda', '34.567.890/0001-12', '5517993456789', '34.567.890/0001-12', 'cnpj', 'Inter', 'Transportes JR Ltda');

insert into public.fornecedores (id, nome, cpf_cnpj, telefone, categoria) values
  ('77777777-0000-0000-0000-000000000001', 'Silcar Pneus', '45.678.901/0001-23', '1732221111', 'Pneus'),
  ('77777777-0000-0000-0000-000000000002', 'Auto Peças Rio Preto', '56.789.012/0001-34', '1732222222', 'Peças'),
  ('77777777-0000-0000-0000-000000000003', 'Mecânica Diesel Noroeste', '67.890.123/0001-45', '1732223333', 'Oficina'),
  ('77777777-0000-0000-0000-000000000004', 'Guindastes Paulista Serviços', '78.901.234/0001-56', '1132224444', 'Oficina'),
  ('77777777-0000-0000-0000-000000000005', 'Posto Estrela', '89.012.345/0001-67', '1732225555', 'Combustível'),
  ('77777777-0000-0000-0000-000000000006', 'Bradesco Financiamentos', null, null, 'Financiamento'),
  ('77777777-0000-0000-0000-000000000007', 'Imobiliária Rio Preto', '90.123.456/0001-78', '1732226666', 'Aluguel'),
  ('77777777-0000-0000-0000-000000000008', 'CPFL Paulista', null, null, 'Energia'),
  ('77777777-0000-0000-0000-000000000009', 'Contábil Noroeste', '01.234.567/0001-89', '1732227777', 'Contabilidade');

-- ---------- Veículos ----------
insert into public.veiculos (id, placa, tipo, marca, modelo, ano, proprietario, locador_id, empresa_id, km_atual, horimetro_atual, status) values
  ('88888888-0000-0000-0000-000000000001', 'FJK8A12', 'caminhao', 'Mercedes-Benz', 'Atego 2430', 2019, 'proprio', null, '11111111-0000-0000-0000-000000000001', 184350, 0, 'disponivel'),
  ('88888888-0000-0000-0000-000000000002', 'GHT-3B45', 'caminhao', 'Volkswagen', 'Constellation 24.280', 2020, 'proprio', null, '11111111-0000-0000-0000-000000000001', 152900, 0, 'disponivel'),
  ('88888888-0000-0000-0000-000000000003', 'DQX4521', 'guindaste', 'Liebherr', 'LTM 1050', 2012, 'proprio', null, '11111111-0000-0000-0000-000000000001', 98200, 4330, 'disponivel'),
  ('88888888-0000-0000-0000-000000000004', 'EAB7C88', 'munck', 'Volvo', 'VM 270 Munck', 2018, 'proprio', null, '11111111-0000-0000-0000-000000000001', 201400, 2890, 'disponivel'),
  ('88888888-0000-0000-0000-000000000005', 'CPL2D19', 'trator', 'New Holland', 'TL75', 2017, 'proprio', null, '11111111-0000-0000-0000-000000000002', 0, 6120, 'disponivel'),
  ('88888888-0000-0000-0000-000000000006', 'FMZ5E63', 'caminhao', 'Mercedes-Benz', 'Atego 2430', 2021, 'proprio', null, '11111111-0000-0000-0000-000000000002', 121800, 0, 'disponivel'),
  ('88888888-0000-0000-0000-000000000007', 'GKR9F07', 'caminhao', 'Scania', 'P320', 2019, 'proprio', null, '11111111-0000-0000-0000-000000000002', 233100, 0, 'disponivel'),
  ('88888888-0000-0000-0000-000000000008', 'BTE6G44', 'caminhao', 'Volkswagen', 'Constellation 24.280', 2018, 'proprio', null, '11111111-0000-0000-0000-000000000001', 265700, 0, 'disponivel'),
  ('88888888-0000-0000-0000-000000000009', 'HJA1H90', 'munck', 'Ford', 'Cargo 2429 Munck', 2016, 'proprio', null, '11111111-0000-0000-0000-000000000002', 310250, 3540, 'disponivel'),
  ('88888888-0000-0000-0000-000000000010', 'DSV3I21', 'caminhao', 'Mercedes-Benz', 'Atego 2430', 2022, 'proprio', null, '11111111-0000-0000-0000-000000000001', 64300, 0, 'disponivel'),
  ('88888888-0000-0000-0000-000000000011', 'FRT2J34', 'caminhao', 'Volkswagen', 'Constellation 24.280', 2019, 'locador', '66666666-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 175600, 0, 'disponivel'),
  ('88888888-0000-0000-0000-000000000012', 'GPA8K56', 'caminhao', 'Mercedes-Benz', 'Axor 2536', 2017, 'locador', '66666666-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 298400, 0, 'disponivel'),
  ('88888888-0000-0000-0000-000000000013', 'EKL4L78', 'munck', 'Volvo', 'VM 330 Munck', 2020, 'locador', '66666666-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 142300, 2105, 'disponivel'),
  ('88888888-0000-0000-0000-000000000014', 'CXD7M90', 'caminhao', 'Iveco', 'Tector 240E30', 2018, 'locador', '66666666-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 188900, 0, 'disponivel'),
  ('88888888-0000-0000-0000-000000000015', 'FBN5N12', 'caminhao', 'Scania', 'G400', 2016, 'locador', '66666666-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 402100, 0, 'disponivel');

-- ---------- Contratos ----------
insert into public.contratos (id, numero, empresa_id, cliente_id, obra_id, veiculo_id, valor_mensal, valor_repasse_mensal,
  dia_corte_inicio, prazo_pagamento_dias, data_inicio, data_desmobilizacao, status) values
  ('99999999-0000-0000-0000-000000000001', 'OL-001/25', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', 18000, null, 1, 30, '2025-03-01', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000002', 'OL-014/25', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000002', 16500, null, 21, 28, '2025-11-21', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000003', 'OL-003/26', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000003', '88888888-0000-0000-0000-000000000003', 42000, null, 1, 30, '2026-02-01', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000004', 'OL-011/26', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000004', '88888888-0000-0000-0000-000000000004', 22000, null, 21, 30, '2026-07-10', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000005', 'TD-002/26', '11111111-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000005', '88888888-0000-0000-0000-000000000005', 9500, null, 1, 15, '2026-01-01', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000006', 'TD-009/26', '11111111-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000006', '88888888-0000-0000-0000-000000000006', 17000, null, 1, 30, '2026-08-12', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000007', 'TD-006/25', '11111111-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000007', '55555555-0000-0000-0000-000000000007', '88888888-0000-0000-0000-000000000007', 18500, null, 21, 30, '2025-06-21', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000008', 'OL-009/25', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000008', '55555555-0000-0000-0000-000000000008', '88888888-0000-0000-0000-000000000008', 15000, null, 1, 30, '2025-09-01', '2026-08-15', 'encerrado'),
  ('99999999-0000-0000-0000-000000000009', 'TD-004/26', '11111111-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000009', '88888888-0000-0000-0000-000000000009', 21000, null, 1, 30, '2026-04-01', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000010', 'OL-001/26', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000011', 17500, 12000, 1, 30, '2026-01-15', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000011', 'OL-005/26', '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000010', '88888888-0000-0000-0000-000000000012', 18000, 12500, 21, 30, '2026-03-21', null, 'ativo'),
  ('99999999-0000-0000-0000-000000000012', 'TD-007/26', '11111111-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000007', '55555555-0000-0000-0000-000000000007', '88888888-0000-0000-0000-000000000013', 23000, 15500, 1, 28, '2026-05-01', null, 'ativo');

-- ---------- Medições jul–set/2026 (pelas próprias regras do sistema) ----------
select count(*) from public.fn_gerar_medicoes('2026-07-01');
select count(*) from public.fn_gerar_medicoes('2026-08-01');
select count(*) from public.fn_gerar_medicoes('2026-09-01');

-- faturamento: NF sequencial, emissão no dia seguinte ao fim do período
-- (deixa 2 medições de setembro a faturar)
with ordenadas as (
  select id, periodo_fim, row_number() over (order by periodo_fim, empresa_id, contrato_id) as n
    from public.medicoes
   where not (contrato_id in ('99999999-0000-0000-0000-000000000005', '99999999-0000-0000-0000-000000000009')
              and periodo_inicio = '2026-09-01')
)
update public.medicoes m set status = 'faturado', numero_nf = (4100 + o.n)::text, data_emissao = o.periodo_fim + 1
  from ordenadas o where o.id = m.id;

-- recebimentos: julho todo pago; agosto pago exceto Caramuru (parcial) e Omexom TD-006 (vencida)
insert into public.recebimentos (medicao_id, data, valor, conta_bancaria_id)
select m.id, m.data_vencimento - 2, m.valor_final,
       case when m.empresa_id = '11111111-0000-0000-0000-000000000001' then '22222222-0000-0000-0000-000000000001'::uuid
            else '22222222-0000-0000-0000-000000000004'::uuid end
  from public.medicoes m
 where m.status = 'faturado' and m.periodo_fim between '2026-07-01' and '2026-08-31'
   and not (m.periodo_fim > '2026-07-31' and m.contrato_id in ('99999999-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000007'))
   and m.data_vencimento - 2 <= '2026-10-16';

insert into public.recebimentos (medicao_id, data, valor, conta_bancaria_id)
select m.id, m.data_vencimento, round(m.valor_final / 2, 2), '22222222-0000-0000-0000-000000000002'
  from public.medicoes m
 where m.contrato_id = '99999999-0000-0000-0000-000000000003' and m.periodo_inicio = '2026-08-01';

-- setembro: TD-007 (Omexom/Marcos) recebeu antecipado → repasse liberado
insert into public.recebimentos (medicao_id, data, valor, conta_bancaria_id)
select m.id, '2026-10-14', m.valor_final, '22222222-0000-0000-0000-000000000005'
  from public.medicoes m
 where m.contrato_id = '99999999-0000-0000-0000-000000000012' and m.periodo_inicio = '2026-09-01';

-- repasses de julho pagos
select public.fn_pagar_repasse(r.id, (m.data_vencimento + 3), null, false)
  from public.repasses r join public.medicoes m on m.id = r.medicao_id
 where m.periodo_fim <= '2026-07-31' and m.status = 'recebido';

-- ---------- Contas a pagar ----------
-- fixas recorrentes: histórico jul–set pago + job gera os próximos 12 meses
do $$
declare
  c record;
  g uuid;
  mes date;
begin
  for c in select * from (values
    ('11111111-0000-0000-0000-000000000001'::uuid, '77777777-0000-0000-0000-000000000007'::uuid, 'Aluguel galpão', '33333333-0000-0000-0000-000000000001'::uuid, 5, 4500.00, 'boleto', '22222222-0000-0000-0000-000000000001'::uuid),
    ('11111111-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000008', 'Energia elétrica', '33333333-0000-0000-0000-000000000002', 10, 812.37, 'debito_automatico', '22222222-0000-0000-0000-000000000002'),
    ('11111111-0000-0000-0000-000000000001', null, 'Internet fibra', '33333333-0000-0000-0000-000000000003', 15, 289.90, 'debito_automatico', '22222222-0000-0000-0000-000000000003'),
    ('11111111-0000-0000-0000-000000000001', null, 'Folha de pagamento', '33333333-0000-0000-0000-000000000004', 5, 38400.00, 'transferencia', '22222222-0000-0000-0000-000000000001'),
    ('11111111-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000009', 'Honorários contábeis', '33333333-0000-0000-0000-000000000007', 10, 1800.00, 'pix', '22222222-0000-0000-0000-000000000003'),
    ('11111111-0000-0000-0000-000000000001', null, 'Simples Nacional / DAS', '33333333-0000-0000-0000-000000000005', 20, 9850.00, 'boleto', '22222222-0000-0000-0000-000000000001'),
    ('11111111-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000007', 'Aluguel pátio TDTS', '33333333-0000-0000-0000-000000000001', 5, 2500.00, 'boleto', '22222222-0000-0000-0000-000000000004'),
    ('11111111-0000-0000-0000-000000000002', null, 'Folha de pagamento TDTS', '33333333-0000-0000-0000-000000000004', 5, 21300.00, 'transferencia', '22222222-0000-0000-0000-000000000004'),
    ('11111111-0000-0000-0000-000000000002', null, 'Rastreadores frota TDTS', '33333333-0000-0000-0000-000000000018', 12, 640.00, 'cartao', '22222222-0000-0000-0000-000000000005')
  ) as t(empresa, fornecedor, descricao, categoria, dia, valor, forma, conta)
  loop
    g := gen_random_uuid();
    for mes in select generate_series('2026-07-01'::date, '2026-09-01'::date, interval '1 month')::date loop
      insert into public.contas_pagar (empresa_id, fornecedor_id, descricao, categoria_id, tipo, vencimento, valor, grupo_parcela_id,
        recorrente, forma_pagamento, conta_bancaria_id, pago_em, valor_pago)
      values (c.empresa, c.fornecedor, c.descricao, c.categoria, 'fixa', mes + (c.dia - 1), c.valor, g, true,
        c.forma::public.forma_pagamento, c.conta, mes + (c.dia - 1), c.valor);
    end loop;
  end loop;
end $$;
select app.job_gerar_recorrentes();

-- parcelados
do $$
declare
  g uuid;
  i int;
begin
  -- Silcar Pneus 1/4..4/4 — pneus do FRT2J34 (Robson), descontar do locador
  g := gen_random_uuid();
  for i in 1..4 loop
    insert into public.contas_pagar (empresa_id, fornecedor_id, descricao, categoria_id, tipo, veiculo_id, vencimento, valor,
      parcela_num, parcela_total, grupo_parcela_id, forma_pagamento, conta_bancaria_id, descontar_locador, pago_em, valor_pago)
    values ('11111111-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', format('Silcar Pneus %s/4', i),
      '33333333-0000-0000-0000-000000000012', 'veiculo', '88888888-0000-0000-0000-000000000011',
      ('2026-08-10'::date + make_interval(months => i - 1))::date, 1250, i, 4, g, 'boleto', '22222222-0000-0000-0000-000000000002', true,
      case when i <= 2 then ('2026-08-10'::date + make_interval(months => i - 1))::date end,
      case when i <= 2 then 1250 end);
  end loop;

  -- Financiamento Guindaste 13/53 em diante (DQX4521)
  g := gen_random_uuid();
  for i in 13..53 loop
    insert into public.contas_pagar (empresa_id, fornecedor_id, descricao, categoria_id, tipo, veiculo_id, vencimento, valor,
      parcela_num, parcela_total, grupo_parcela_id, forma_pagamento, conta_bancaria_id, pago_em, valor_pago)
    values ('11111111-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000006', format('Financiamento Guindaste %s/53', i),
      '33333333-0000-0000-0000-000000000017', 'veiculo', '88888888-0000-0000-0000-000000000003',
      ('2026-08-20'::date + make_interval(months => i - 13))::date, 8900, i, 53, g, 'debito_automatico', '22222222-0000-0000-0000-000000000001',
      case when i <= 14 then ('2026-08-20'::date + make_interval(months => i - 13))::date end,
      case when i <= 14 then 8900 end);
  end loop;

  -- Parcela FGI 1/48 (TDTS)
  g := gen_random_uuid();
  for i in 1..48 loop
    insert into public.contas_pagar (empresa_id, descricao, categoria_id, tipo, vencimento, valor, parcela_num, parcela_total,
      grupo_parcela_id, forma_pagamento, conta_bancaria_id, pago_em, valor_pago)
    values ('11111111-0000-0000-0000-000000000002', format('Parcela FGI %s/48', i), '33333333-0000-0000-0000-000000000006', 'fixa',
      ('2026-09-25'::date + make_interval(months => i - 1))::date, 3200, i, 48, g, 'boleto', '22222222-0000-0000-0000-000000000004',
      case when i = 1 then '2026-09-25'::date end, case when i = 1 then 3200 end);
  end loop;
end $$;

-- despesas avulsas de veículo
insert into public.contas_pagar (empresa_id, fornecedor_id, descricao, categoria_id, tipo, veiculo_id, vencimento, valor,
  forma_pagamento, conta_bancaria_id, descontar_locador, pago_em, valor_pago, observacoes) values
  ('11111111-0000-0000-0000-000000000001', null, 'Multa RENAINF — excesso de velocidade', '33333333-0000-0000-0000-000000000014', 'veiculo', '88888888-0000-0000-0000-000000000011', '2026-09-28', 293.47, 'boleto', '22222222-0000-0000-0000-000000000001', true, '2026-09-27', 293.47, 'Infração com motorista do locador'),
  ('11111111-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000005', 'Diesel S10 — setembro', '33333333-0000-0000-0000-000000000013', 'veiculo', '88888888-0000-0000-0000-000000000001', '2026-09-30', 3420.80, 'cartao', '22222222-0000-0000-0000-000000000003', false, '2026-09-30', 3420.80, null),
  ('11111111-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000005', 'Diesel S10 — outubro', '33333333-0000-0000-0000-000000000013', 'veiculo', '88888888-0000-0000-0000-000000000003', '2026-10-16', 5870.15, 'cartao', '22222222-0000-0000-0000-000000000003', false, null, null, null),
  ('11111111-0000-0000-0000-000000000002', null, 'Licenciamento 2026 HJA1H90', '33333333-0000-0000-0000-000000000015', 'veiculo', '88888888-0000-0000-0000-000000000009', '2026-10-10', 1186.54, 'pix', '22222222-0000-0000-0000-000000000005', false, null, null, null),
  ('11111111-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000002', 'Kit embreagem EKL4L78', '33333333-0000-0000-0000-000000000011', 'veiculo', '88888888-0000-0000-0000-000000000013', '2026-10-20', 2380.00, 'boleto', '22222222-0000-0000-0000-000000000004', true, null, null, 'Combinado com Marcos: descontar no repasse'),
  ('11111111-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000002', 'Filtros e lubrificantes', '33333333-0000-0000-0000-000000000011', 'veiculo', '88888888-0000-0000-0000-000000000002', '2026-10-21', 742.00, 'boleto', '22222222-0000-0000-0000-000000000002', false, null, null, null);

-- ---------- Manutenção: planos ----------
insert into public.planos_manutencao (id, veiculo_id, modelo, servico, intervalo_km, intervalo_horas, intervalo_dias,
  ultima_execucao_data, ultima_execucao_km, ultima_execucao_horas) values
  ('bbbbbbbb-0000-0000-0000-000000000001', null, 'Atego 2430', 'Troca de óleo do motor', 10000, null, 180, null, null, null),
  ('bbbbbbbb-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000001', 'Atego 2430', 'Troca de óleo do motor', 10000, null, 180, '2026-04-02', 176300, null),
  ('bbbbbbbb-0000-0000-0000-000000000003', '88888888-0000-0000-0000-000000000006', 'Atego 2430', 'Troca de óleo do motor', 10000, null, 180, '2026-06-10', 114500, null),
  ('bbbbbbbb-0000-0000-0000-000000000004', '88888888-0000-0000-0000-000000000010', 'Atego 2430', 'Troca de óleo do motor', 10000, null, 180, '2026-03-20', 60100, null),
  ('bbbbbbbb-0000-0000-0000-000000000005', '88888888-0000-0000-0000-000000000003', null, 'Revisão do guindaste (lança e hidráulico)', null, 250, null, '2026-08-03', null, 4100),
  ('bbbbbbbb-0000-0000-0000-000000000006', '88888888-0000-0000-0000-000000000004', null, 'Revisão do munck', null, 500, 180, '2026-05-15', null, 2420),
  ('bbbbbbbb-0000-0000-0000-000000000007', '88888888-0000-0000-0000-000000000007', null, 'Troca de filtros (ar/combustível)', 20000, null, null, '2026-02-10', 214000, null),
  ('bbbbbbbb-0000-0000-0000-000000000008', '88888888-0000-0000-0000-000000000002', null, 'Lubrificação geral', null, null, 30, '2026-09-25', null, null),
  ('bbbbbbbb-0000-0000-0000-000000000009', '88888888-0000-0000-0000-000000000005', null, 'Troca de óleo do motor (trator)', null, 250, 365, '2026-07-01', null, 5900),
  ('bbbbbbbb-0000-0000-0000-000000000010', '88888888-0000-0000-0000-000000000011', null, 'Troca de óleo do motor', 15000, null, 180, '2026-07-15', 168000, null);

-- ---------- OS ----------
insert into public.ordens_servico (id, veiculo_id, tipo, plano_id, data_abertura, km, horimetro, fornecedor_id,
  descricao_problema, diagnostico, horas_parado, descontar_locador, parar_veiculo) values
  ('cccccccc-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000012', 'corretiva', null, '2026-08-25', 296900, null, '77777777-0000-0000-0000-000000000003',
   'Motor perdendo potência e soltando fumaça', 'Retífica do motor — desgaste de bronzinas', 168, true, true),
  ('cccccccc-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000003', 'corretiva', null, '2026-08-01', 97800, 4090, '77777777-0000-0000-0000-000000000004',
   'Vazamento no cilindro da lança', 'Troca de retentores do cilindro telescópico', 48, false, true),
  ('cccccccc-0000-0000-0000-000000000003', '88888888-0000-0000-0000-000000000007', 'preventiva', null, '2026-07-14', 226800, null, '77777777-0000-0000-0000-000000000003',
   'Revisão 225.000 km', null, 8, false, true),
  ('cccccccc-0000-0000-0000-000000000004', '88888888-0000-0000-0000-000000000006', 'preventiva', 'bbbbbbbb-0000-0000-0000-000000000003', '2026-09-12', 120900, null, '77777777-0000-0000-0000-000000000002',
   'Troca de óleo programada', null, 4, false, false);

insert into public.os_itens (ordem_servico_id, tipo, descricao, quantidade, valor_unitario) values
  ('cccccccc-0000-0000-0000-000000000001', 'peca', 'Jogo de bronzinas e anéis', 1, 6400),
  ('cccccccc-0000-0000-0000-000000000001', 'peca', 'Kit juntas do motor', 1, 2150),
  ('cccccccc-0000-0000-0000-000000000001', 'peca', 'Bomba d''água', 1, 1650),
  ('cccccccc-0000-0000-0000-000000000001', 'servico', 'Retífica e montagem do motor', 1, 4600),
  ('cccccccc-0000-0000-0000-000000000002', 'peca', 'Kit retentores cilindro telescópico', 1, 1150),
  ('cccccccc-0000-0000-0000-000000000002', 'servico', 'Mão de obra hidráulica', 1, 700),
  ('cccccccc-0000-0000-0000-000000000003', 'peca', 'Filtros (óleo, ar, combustível)', 1, 980),
  ('cccccccc-0000-0000-0000-000000000003', 'peca', 'Óleo 15W40', 32, 28.5),
  ('cccccccc-0000-0000-0000-000000000003', 'servico', 'Revisão', 1, 650),
  ('cccccccc-0000-0000-0000-000000000004', 'peca', 'Óleo 15W40', 28, 28.5),
  ('cccccccc-0000-0000-0000-000000000004', 'peca', 'Filtro de óleo', 1, 145),
  ('cccccccc-0000-0000-0000-000000000004', 'servico', 'Troca de óleo', 1, 180);

select public.fn_fechar_os('cccccccc-0000-0000-0000-000000000001', '2026-09-01', 296950, null, 168, true, '2026-10-01', 'boleto', '22222222-0000-0000-0000-000000000001');
select public.fn_fechar_os('cccccccc-0000-0000-0000-000000000002', '2026-08-03', 97810, 4100, 48, true, '2026-09-02', 'boleto', '22222222-0000-0000-0000-000000000001');
select public.fn_fechar_os('cccccccc-0000-0000-0000-000000000003', '2026-07-14', 226800, null, 8, true, '2026-08-13', 'pix', '22222222-0000-0000-0000-000000000005');
select public.fn_fechar_os('cccccccc-0000-0000-0000-000000000004', '2026-09-12', 120900, null, 4, true, '2026-10-12', 'boleto', '22222222-0000-0000-0000-000000000004');
-- contas de OS já vencidas foram pagas
update public.contas_pagar set pago_em = vencimento, valor_pago = valor
 where ordem_servico_id is not null and vencimento < '2026-10-01';

-- OS em aberto
insert into public.ordens_servico (veiculo_id, tipo, data_abertura, fornecedor_id, descricao_problema, status, parar_veiculo) values
  ('88888888-0000-0000-0000-000000000015', 'corretiva', '2026-10-09', '77777777-0000-0000-0000-000000000003', 'Caixa de câmbio arranhando marchas', 'aguardando_peca', true),
  ('88888888-0000-0000-0000-000000000009', 'pneu', '2026-10-15', '77777777-0000-0000-0000-000000000001', 'Troca de 2 pneus do eixo traseiro', 'em_execucao', false),
  ('88888888-0000-0000-0000-000000000004', 'inspecao', '2026-10-16', null, 'Inspeção anual do equipamento de içamento (NR-11/NR-12)', 'aberta', false);

-- ---------- Leituras ----------
insert into public.leituras (veiculo_id, data, km, horimetro, origem) values
  ('88888888-0000-0000-0000-000000000001', '2026-10-15', 185120, null, 'manual'),
  ('88888888-0000-0000-0000-000000000002', '2026-10-15', 153480, null, 'manual'),
  ('88888888-0000-0000-0000-000000000003', '2026-10-14', 98260, 4330, 'manual'),
  ('88888888-0000-0000-0000-000000000004', '2026-10-14', 201720, 2905, 'manual'),
  ('88888888-0000-0000-0000-000000000005', '2026-10-13', null, 6140, 'manual'),
  ('88888888-0000-0000-0000-000000000006', '2026-10-15', 122300, null, 'manual'),
  ('88888888-0000-0000-0000-000000000007', '2026-10-15', 235420, null, 'manual'),
  ('88888888-0000-0000-0000-000000000011', '2026-10-12', 176900, null, 'manual');

-- ---------- Documentos ----------
insert into public.documentos_veiculo (veiculo_id, tipo, numero, validade) values
  ('88888888-0000-0000-0000-000000000001', 'licenciamento', 'CRLV-2026', '2026-10-31'),
  ('88888888-0000-0000-0000-000000000003', 'inspecao_icamento', 'ART 2026/0441', '2026-11-30'),
  ('88888888-0000-0000-0000-000000000003', 'seguro', 'Apólice 77.889', '2026-10-25'),
  ('88888888-0000-0000-0000-000000000004', 'inspecao_icamento', 'ART 2025/0912', '2026-10-16'),
  ('88888888-0000-0000-0000-000000000007', 'tacografo', 'INMETRO 55120', '2026-10-01'),
  ('88888888-0000-0000-0000-000000000009', 'antt', 'RNTRC 0451122', '2027-03-01'),
  ('88888888-0000-0000-0000-000000000012', 'licenciamento', 'CRLV-2026', '2027-01-31');

-- ---------- Pneus ----------
insert into public.pneus (veiculo_id, posicao, marca, medida, numero_fogo, data_compra, km_instalacao, ressolagens, status) values
  ('88888888-0000-0000-0000-000000000011', 'DE (dianteiro esquerdo)', 'Michelin', '295/80R22.5', 'F-1001', '2026-08-10', 172000, 0, 'em_uso'),
  ('88888888-0000-0000-0000-000000000011', 'DD (dianteiro direito)', 'Michelin', '295/80R22.5', 'F-1002', '2026-08-10', 172000, 0, 'em_uso'),
  ('88888888-0000-0000-0000-000000000001', 'T1E (tração esquerdo ext.)', 'Pirelli', '295/80R22.5', 'F-0870', '2025-11-03', 158400, 1, 'em_uso'),
  ('88888888-0000-0000-0000-000000000001', 'T1D (tração direito ext.)', 'Pirelli', '295/80R22.5', 'F-0871', '2025-11-03', 158400, 1, 'em_uso'),
  (null, null, 'Bridgestone', '295/80R22.5', 'F-0655', '2025-05-20', null, 2, 'estoque');

select app.job_atualizar_preventivas();
select app.job_gerar_alertas();
