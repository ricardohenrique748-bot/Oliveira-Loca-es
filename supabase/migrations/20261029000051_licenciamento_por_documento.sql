-- =====================================================================
-- 0051 Licenciamento pelo documento cadastrado no veículo
-- Antes (0044) o vencimento era previsto pelo calendário de SP e toda
-- placa aparecia "vencida (prevista)" até alguém confirmar o CRLV-e.
-- Agora a situação vem do documento "Licenciamento" cadastrado na ficha
-- do veículo (o de vencimento mais longe): emissão e vencimento dele.
-- Sem documento = "não cadastrado". A data do calendário continua na
-- view (vencimento) só como referência.
-- O alerta passa a ser o de documento (30/15/0 dias), como os laudos.
-- =====================================================================

create or replace view public.licenciamento_v with (security_invoker = true) as
select v.id as veiculo_id, v.empresa_id, e.apelido as empresa_apelido, v.placa, v.renavam, v.tipo, v.status,
       v.calendario_licenciamento, v.licenciado_exercicio, v.licenciamento_verificado_em, v.licenciamento_fonte,
       x.ano as exercicio, x.final, c.vencimento, c.fonte as calendario_fonte,
       case
         when d.id is null then 'nao_cadastrado'
         when d.validade is null then 'sem_vencimento'
         when d.validade < app.hoje() then 'vencido'
         when d.validade <= app.hoje() + 30 then 'vencendo'
         else 'em_dia'
       end as situacao,
       d.validade - app.hoje() as dias_para_vencer,
       d.id as documento_id, d.numero as documento_numero, d.data_emissao, d.validade, d.anexo_url
  from public.veiculos v
  join public.empresas e on e.id = v.empresa_id
  cross join lateral (select extract(year from app.hoje())::int as ano,
                             nullif(substring(upper(v.placa) from '([0-9])[^0-9]*$'), '')::smallint as final) x
  left join public.calendario_licenciamento c on c.ano = x.ano and c.grupo = v.calendario_licenciamento and c.final = x.final
  left join lateral (
    select dv.id, dv.numero, dv.data_emissao, dv.validade, dv.anexo_url
      from public.documentos_veiculo dv
     where dv.veiculo_id = v.id and dv.tipo = 'licenciamento'
     order by dv.validade desc nulls last, dv.data_emissao desc nulls last, dv.created_at desc
     limit 1
  ) d on true
 where v.status <> 'vendido';
grant select on public.licenciamento_v to authenticated;

-- alertas: só os de documento (o licenciamento cadastrado entra como qualquer documento com vencimento);
-- sem a previsão pelo calendário nem o filtro que escondia o documento de licenciamento
create or replace function app.job_gerar_alertas()
returns int language plpgsql security definer set search_path = public as $$
begin
  return app.job_gerar_alertas_avulsas();
end $$;
revoke execute on function app.job_gerar_alertas() from public, anon, authenticated;

-- os avisos previstos pelo calendário que ainda estão abertos deixam de valer
update public.alertas set lida = true
 where tipo in ('licenciamento_vencendo', 'licenciamento_vencido') and not lida;

notify pgrst, 'reload schema';
