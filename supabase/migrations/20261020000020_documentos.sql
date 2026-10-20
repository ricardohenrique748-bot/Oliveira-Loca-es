-- =====================================================================
-- 0020 Documentos: PDF da proposta (modelos caminhão e guindaste/munck)
-- e do contrato de locação, nos layouts usados pela Oliveira.
-- =====================================================================

-- cabeçalho/rodapé dos documentos e cidade do foro/mobilização
alter table public.empresas
  add column endereco text,
  add column cidade text,
  add column uf text,
  add column contato_nome text,
  add column telefone text,
  add column email text;

-- quadro de identificação do veículo no contrato
alter table public.veiculos
  add column chassi text,
  add column cor text;

-- modelo do documento: caminhão = locação sem operador (motorista por conta do cliente);
-- guindaste = com operador da Oliveira, franquia de horas e mobilização
alter table public.propostas
  add column modelo_documento text not null default 'guindaste' check (modelo_documento in ('caminhao', 'guindaste')),
  add column contato_cliente text,
  add column local_operacao text,
  add column quantidade int not null default 1 check (quantidade between 1 and 999),
  add column franquia text,
  add column km_livre text,
  add column jornada text,
  add column valor_mobilizacao numeric(14,2) check (valor_mobilizacao >= 0),
  add column valor_desmobilizacao numeric(14,2) check (valor_desmobilizacao >= 0),
  add column multa_rescisao_pct numeric(5,2) not null default 10 check (multa_rescisao_pct between 0 and 100);

update public.propostas set modelo_documento = 'caminhao' where modalidade = 'sem_motorista';
