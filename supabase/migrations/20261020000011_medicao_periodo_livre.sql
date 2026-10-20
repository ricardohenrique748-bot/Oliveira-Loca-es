-- =====================================================================
-- 0011 Medição com período livre (lançamento manual)
-- A geração automática passa a pular contratos que já têm medição
-- cobrindo qualquer parte do período (não só a que começa no mesmo dia),
-- para não duplicar um mês lançado à mão com outro período (ex.: 15 a 14).
-- =====================================================================
create or replace function public.fn_gerar_medicoes(
  p_competencia date,
  p_dia_corte int default null,
  p_contratos uuid[] default null,
  p_dry_run boolean default false
) returns table (
  contrato_id uuid, empresa_id uuid, periodo_inicio date, periodo_fim date, dias int,
  valor_mensal numeric, valor_final numeric, valor_repasse_bruto numeric, medicao_id uuid
) language plpgsql security definer set search_path = public as $$
declare
  c record;
  per record;
  v_dias int;
  v_base int := app.base_dias();
  v_id uuid;
begin
  perform app.exigir_perfil('admin','financeiro','faturamento');
  for c in
    select ct.*, v.proprietario from public.contratos ct join public.veiculos v on v.id = ct.veiculo_id
     where ct.status in ('ativo','encerrado')
       and (p_dia_corte is null or ct.dia_corte_inicio = p_dia_corte)
       and (p_contratos is null or ct.id = any(p_contratos))
       and (auth.uid() is null or app.tem_empresa(ct.empresa_id))
     order by ct.empresa_id, ct.data_inicio
  loop
    select * into per from app.periodo_competencia(c.dia_corte_inicio, p_competencia);
    v_dias := app.calcular_dias(per.inicio, per.fim, c.data_inicio, least(c.data_fim, c.data_desmobilizacao), v_base);
    continue when v_dias <= 0;
    continue when exists (select 1 from public.medicoes m where m.contrato_id = c.id
                            and m.periodo_inicio <= per.fim and m.periodo_fim >= per.inicio
                            and m.status <> 'cancelado');
    v_id := null;
    if not p_dry_run then
      insert into public.medicoes (contrato_id, empresa_id, periodo_inicio, periodo_fim, dias, valor_mensal, final)
      values (c.id, c.empresa_id, per.inicio, per.fim, v_dias, c.valor_mensal,
              c.data_desmobilizacao is not null and c.data_desmobilizacao between per.inicio and per.fim)
      returning id into v_id;
    end if;
    contrato_id := c.id; empresa_id := c.empresa_id; periodo_inicio := per.inicio; periodo_fim := per.fim;
    dias := v_dias; valor_mensal := c.valor_mensal;
    valor_final := app.valor_proporcional(c.valor_mensal, v_dias, v_base);
    valor_repasse_bruto := case when c.proprietario = 'locador' and c.valor_repasse_mensal is not null
                                then app.valor_proporcional(c.valor_repasse_mensal, v_dias, v_base) end;
    medicao_id := v_id;
    return next;
  end loop;
end $$;

