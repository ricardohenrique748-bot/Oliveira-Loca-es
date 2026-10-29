-- =====================================================================
-- 0050 Documentos do veículo: laudos e data de emissão
-- Os laudos técnicos do caminhão (viabilidade, dielétrico, escada,
-- guarda-corpo, opacidade, HRN...) entram como tipos de documento, e
-- todo documento ganha a data de emissão ao lado da de vencimento
-- (validade). O alerta de vencimento (30/15/0 dias) já vale para eles.
-- =====================================================================

alter type public.tipo_documento add value if not exists 'laudo_viabilidade';
alter type public.tipo_documento add value if not exists 'plano_manutencao';
alter type public.tipo_documento add value if not exists 'checklist_fotografico';
alter type public.tipo_documento add value if not exists 'os_preventiva';
alter type public.tipo_documento add value if not exists 'laudo_dieletrico';
alter type public.tipo_documento add value if not exists 'apreciacao_riscos_hrn';
alter type public.tipo_documento add value if not exists 'laudo_escada';
alter type public.tipo_documento add value if not exists 'laudo_guarda_corpo';
alter type public.tipo_documento add value if not exists 'checklist_detalhado';
alter type public.tipo_documento add value if not exists 'laudo_opacidade';
alter type public.tipo_documento add value if not exists 'plano_inspecao';

alter table public.documentos_veiculo add column if not exists data_emissao date;

alter table public.documentos_veiculo drop constraint if exists documentos_veiculo_emissao_ck;
alter table public.documentos_veiculo add constraint documentos_veiculo_emissao_ck
  check (data_emissao is null or validade is null or validade >= data_emissao);

notify pgrst, 'reload schema';
