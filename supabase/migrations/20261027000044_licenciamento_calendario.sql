-- =====================================================================
-- 0044 Licenciamento: vencimento pelo calendário oficial de SP (final da placa)
-- Não há API oficial gratuita com a situação do licenciamento: o vencimento
-- é PREVISTO pelo calendário; "licenciado" só com evidência (exercício do
-- CRLV-e informado pelo usuário, com a data e a origem da verificação).
-- =====================================================================

-- ---------- calendário (um por ano; "pesado" = caminhões e tratores, "leve" = demais) ----------
create table public.calendario_licenciamento (
  ano int not null check (ano between 2020 and 2100),
  grupo text not null check (grupo in ('pesado','leve')),
  final smallint not null check (final between 0 and 9),
  vencimento date not null,
  fonte text,
  updated_at timestamptz not null default now(),
  primary key (ano, grupo, final)
);
create trigger trg_calendario_licenciamento_updated_at before update on public.calendario_licenciamento
  for each row execute function app.set_updated_at();
select app.aplicar_rls('calendario_licenciamento', array['admin','financeiro','faturamento','manutencao','consulta'], array['admin','manutencao']);

-- 2026 (Governo de SP / Detran-SP): caminhões set–dez; leves jul–dez; vence no último dia do mês
insert into public.calendario_licenciamento (ano, grupo, final, vencimento, fonte)
select 2026, g, f, v::date, 'Detran-SP 2026 (Agência SP)'
  from (values
    ('pesado',1,'2026-09-30'),('pesado',2,'2026-09-30'),('pesado',3,'2026-10-31'),('pesado',4,'2026-10-31'),('pesado',5,'2026-10-31'),
    ('pesado',6,'2026-11-30'),('pesado',7,'2026-11-30'),('pesado',8,'2026-11-30'),('pesado',9,'2026-12-31'),('pesado',0,'2026-12-31'),
    ('leve',1,'2026-07-31'),('leve',2,'2026-07-31'),('leve',3,'2026-08-31'),('leve',4,'2026-08-31'),('leve',5,'2026-09-30'),
    ('leve',6,'2026-09-30'),('leve',7,'2026-10-31'),('leve',8,'2026-10-31'),('leve',9,'2026-11-30'),('leve',0,'2026-12-31')
  ) as t(g, f, v)
on conflict do nothing;

-- ---------- veículo: qual calendário segue e o último exercício confirmado ----------
alter table public.veiculos
  add column if not exists calendario_licenciamento text not null default 'pesado' check (calendario_licenciamento in ('pesado','leve')),
  add column if not exists licenciado_exercicio int check (licenciado_exercicio is null or licenciado_exercicio between 2000 and 2100),
  add column if not exists licenciamento_verificado_em date,
  add column if not exists licenciamento_fonte text;
-- "outro" (carro de apoio etc.) segue o calendário de leves; o resto é caminhão/máquina
update public.veiculos set calendario_licenciamento = 'leve' where tipo::text = 'outro';

-- ---------- situação do licenciamento no exercício corrente ----------
create or replace view public.licenciamento_v with (security_invoker = true) as
select v.id as veiculo_id, v.empresa_id, e.apelido as empresa_apelido, v.placa, v.renavam, v.tipo, v.status,
       v.calendario_licenciamento, v.licenciado_exercicio, v.licenciamento_verificado_em, v.licenciamento_fonte,
       x.ano as exercicio, x.final, c.vencimento, c.fonte as calendario_fonte,
       case
         when v.licenciado_exercicio >= x.ano then 'licenciado'
         when x.final is null then 'placa_invalida'
         when c.vencimento is null then 'sem_calendario'
         when c.vencimento < app.hoje() then 'vencido'
         when c.vencimento <= app.hoje() + 30 then 'vencendo'
         else 'a_vencer'
       end as situacao,
       case when c.vencimento is not null then c.vencimento - app.hoje() end as dias_para_vencer
  from public.veiculos v
  join public.empresas e on e.id = v.empresa_id
  cross join lateral (select extract(year from app.hoje())::int as ano,
                             nullif(substring(upper(v.placa) from '([0-9])[^0-9]*$'), '')::smallint as final) x
  left join public.calendario_licenciamento c on c.ano = x.ano and c.grupo = v.calendario_licenciamento and c.final = x.final
 where v.status <> 'vendido';
grant select on public.licenciamento_v to authenticated;

-- ---------- alertas: licenciamento a vencer (30 dias) e vencido, até confirmar o exercício ----------
alter function app.job_gerar_alertas() rename to job_gerar_alertas_avulsas;
create or replace function app.job_gerar_alertas()
returns int language plpgsql security definer set search_path = public as $$
declare
  h date := app.hoje();
  n int := app.job_gerar_alertas_avulsas();
  k int;
begin
  -- veículo coberto pelo calendário: o alerta do documento "Licenciamento" (validade digitada à mão) sairia em
  -- dobro e com outra data; fica só o do calendário. Documentos de outros tipos, e veículos sem calendário, seguem iguais.
  delete from public.alertas a
   using public.documentos_veiculo d, public.licenciamento_v l
   where a.tipo = 'documento_vencendo' and a.referencia_id = d.id and a.data_ref = h and not a.lida
     and d.tipo = 'licenciamento' and l.veiculo_id = d.veiculo_id and l.situacao not in ('sem_calendario','placa_invalida');
  get diagnostics k = row_count; n := n - k;

  insert into public.alertas (tipo, referencia_tabela, referencia_id, empresa_id, severidade, titulo, descricao, link, data_ref)
  select case when l.situacao = 'vencido' then 'licenciamento_vencido' else 'licenciamento_vencendo' end, 'veiculos', l.veiculo_id, l.empresa_id,
         case when l.situacao = 'vencido' then 'critico' when l.dias_para_vencer <= 15 then 'alerta' else 'info' end::public.severidade_alerta,
         'Licenciamento ' || l.exercicio || ' ' || l.placa ||
           case when l.situacao = 'vencido' then ' vencido' when l.dias_para_vencer = 0 then ' vence hoje' else ' vence em ' || l.dias_para_vencer || ' dias' end,
         'Previsto pelo calendário de SP (final ' || l.final || '): ' || to_char(l.vencimento, 'DD/MM/YYYY') || '. Confirme com o CRLV-e do exercício.',
         '/manutencao/licenciamento', h
    from public.licenciamento_v l
   where l.situacao in ('vencido','vencendo')
  on conflict do nothing;
  get diagnostics k = row_count;
  return n + k;
end $$;
revoke execute on function app.job_gerar_alertas(), app.job_gerar_alertas_avulsas() from public, anon, authenticated;

notify pgrst, 'reload schema';
