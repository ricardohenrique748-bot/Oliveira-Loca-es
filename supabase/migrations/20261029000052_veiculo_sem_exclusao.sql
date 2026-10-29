-- =====================================================================
-- 0052 Veículo não pode ser excluído
-- Excluir apagaria em cascata documentos, laudos, leituras, pneus e o
-- histórico da placa. Para tirar da frota, use o status "Vendido".
-- =====================================================================

create or replace function app.veiculo_bloqueia_exclusao()
returns trigger language plpgsql as $$
begin
  raise exception 'Veículo não pode ser excluído. Para tirar da frota, mude o status para "Vendido".';
end $$;

drop trigger if exists trg_veiculo_bloqueia_exclusao on public.veiculos;
create trigger trg_veiculo_bloqueia_exclusao before delete on public.veiculos
  for each row execute function app.veiculo_bloqueia_exclusao();
