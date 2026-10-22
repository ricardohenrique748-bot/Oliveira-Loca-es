-- Zera o sistema para começar a lançar do zero.
-- Mantém: clientes (com obras e contatos), fornecedores, veículos/placas e locadores,
-- e a estrutura (empresas, usuários, contas bancárias, categorias de despesa, configurações).
-- Apaga: contratos, propostas, faturamento (medições, recebimentos, boletos, repasses),
-- contas a pagar, manutenção (OS, planos, pneus, documentos, leituras), multas, alertas e o histórico.
begin;

truncate table
  public.boletos, public.recebimentos, public.repasse_abatimentos, public.repasses, public.medicoes,
  public.multas, public.propostas, public.contratos,
  public.os_itens, public.ordens_servico, public.contas_pagar, public.planos_manutencao,
  public.pneus_historico, public.pneus, public.documentos_veiculo, public.leituras,
  public.alertas, public.auditoria
restart identity;

-- sem contrato e sem OS, nenhuma placa fica locada ou em manutenção
update public.veiculos set status = 'disponivel' where status in ('locado', 'manutencao');

select (select count(*) from public.clientes) as clientes, (select count(*) from public.fornecedores) as fornecedores,
       (select count(*) from public.veiculos) as placas, (select count(*) from public.contratos) as contratos,
       (select count(*) from public.medicoes) as faturas, (select count(*) from public.contas_pagar) as contas_pagar;

commit;
