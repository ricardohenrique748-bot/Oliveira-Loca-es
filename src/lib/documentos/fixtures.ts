/** Dados de exemplo dos testes (e para gerar PDFs de conferência). */
import type { DadosContrato } from "./contrato";
import type { DadosProposta } from "./proposta";

const empresa = {
  razao_social: "TDTS & Oliveira Locações Ltda", cnpj: "32.511.022/0001-02", endereco: "Rua Primavera, Quadra D, Lote 22, Condomínio Areia Branca",
  cidade: "São José do Rio Preto", uf: "SP", contato_nome: "Thiago", telefone: "17991869942", email: null,
};
const cliente = {
  razao_social: "RAF Empreendimento Imobiliário SPE Ltda", nome_fantasia: "RAF", cnpj: "11.222.333/0001-81",
  endereco: "Av. Brasil, 100", cidade: "Mirassol", uf: "SP", email: "compras@raf.com.br",
};

export const propostaGuindaste: DadosProposta = {
  numero: "PR-098/26", created_at: "2026-09-10T13:00:00Z", modelo_documento: "guindaste", modalidade: "com_motorista",
  tipo_cobranca: "mensal", valor: 55000, quantidade: 1, franquia: "220 horas/mês", km_livre: "3 mil km livres/mês", jornada: null,
  equipamento: "Guindaste telescópico rodoviário 40t XCMG", veiculo: null, obra: "Usina Norte", contato_cliente: "Otávio",
  local_operacao: null, data_inicio_prevista: "2026-10-01", periodo_minimo: "7 meses", validade: "2026-10-10",
  prazo_pagamento_dias: 30, dia_corte_inicio: 1, valor_mobilizacao: 10000, valor_desmobilizacao: 10000, multa_rescisao_pct: 10,
  condicoes: "- Seguro de carga por conta da contratante", empresa, cliente,
};

export const propostaCaminhao: DadosProposta = {
  ...propostaGuindaste, numero: "PR-097/26", modelo_documento: "caminhao", modalidade: "sem_motorista", tipo_cobranca: "diaria",
  valor: 1800, quantidade: 2, franquia: "mínima de 5 horas", km_livre: null, equipamento: null,
  veiculo: { placa: "AOI5A59", tipo: "caminhao", marca: "VW", modelo: "13.180", ano: 2006 },
  valor_mobilizacao: null, valor_desmobilizacao: null, prazo_pagamento_dias: 15, condicoes: null,
};

export const contrato: DadosContrato = {
  numero: "CT-012/26", tipo_cobranca: "mensal", valor_mensal: 9000, dia_corte_inicio: 1, prazo_pagamento_dias: 15,
  data_inicio: "2026-07-20", data_fim: "2027-01-16", obra: null, empresa, cliente,
  veiculo: { placa: "AOI5A59", marca: "VW", modelo: "13.180", ano: 2006, chassi: "9BWB672S06R619481", cor: "Branca", km_atual: 182000, horimetro_atual: 0, proprietario: "locador" },
};
