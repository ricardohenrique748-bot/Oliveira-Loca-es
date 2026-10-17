-- =====================================================================
-- Oliveira Locações — 0001 base: extensões, schema auxiliar, enums,
-- funções utilitárias (updated_at, created_by)
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
comment on schema app is 'Funções auxiliares internas (RLS, regras de negócio, jobs)';

-- ---------- Enums ----------
create type public.perfil_usuario as enum ('admin','financeiro','faturamento','manutencao','consulta');
create type public.banco as enum ('Bradesco','Sicredi','Inter','Outro');
create type public.tipo_veiculo as enum ('caminhao','guindaste','trator','munck','outro');
create type public.proprietario_veiculo as enum ('proprio','locador');
create type public.status_veiculo as enum ('disponivel','locado','manutencao','parado','vendido');
create type public.status_contrato as enum ('ativo','encerrado','suspenso');
create type public.status_medicao as enum ('a_faturar','faturado','recebido_parcial','recebido','cancelado');
create type public.status_repasse as enum ('previsto','liberado','pago','cancelado');
create type public.tipo_despesa as enum ('fixa','veiculo');
create type public.forma_pagamento as enum ('boleto','debito_automatico','cartao','pix','transferencia');
create type public.tipo_os as enum ('preventiva','corretiva','pneu','inspecao');
create type public.status_os as enum ('aberta','em_execucao','aguardando_peca','fechada','cancelada');
create type public.tipo_item_os as enum ('peca','servico');
create type public.tipo_documento as enum ('licenciamento','seguro','tacografo','inspecao_icamento','antt','outro');
create type public.origem_leitura as enum ('manual','os','importacao');
create type public.tipo_chave_pix as enum ('cpf','cnpj','email','telefone','aleatoria');
create type public.severidade_alerta as enum ('info','alerta','critico');
create type public.acao_auditoria as enum ('INSERT','UPDATE','DELETE');

-- ---------- Utilitários ----------
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Cria trigger de updated_at em uma tabela
create or replace function app.add_updated_at_trigger(p_table regclass)
returns void language plpgsql as $$
begin
  execute format(
    'create trigger trg_%s_updated_at before update on %s for each row execute function app.set_updated_at()',
    replace(p_table::text, 'public.', ''), p_table);
end $$;

-- Data de hoje no fuso de São Paulo
create or replace function app.hoje()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
