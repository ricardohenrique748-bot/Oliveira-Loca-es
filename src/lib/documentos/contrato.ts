/**
 * Conteúdo do Contrato Particular de Locação de Veículo/Equipamento (modelo da Oliveira),
 * preenchido com empresa, cliente, veículo e condições do contrato. Função pura; o PDF é desenhado por pdf.ts.
 */
import { formatBRL, formatData, formatKm, formatHoras, formatPlaca } from "@/lib/format";
import { diffDias } from "@/lib/calculos/datas";
import { numeroPorExtenso, valorPorExtenso } from "./extenso";
import { cidadeUF, enderecoCompleto, rodapeEmpresa, type ClienteDoc, type EmpresaDoc } from "./proposta";
import type { Bloco, Documento } from "./pdf";

export interface DadosContrato {
  numero: string | null; tipo_cobranca: "mensal" | "diaria"; valor_mensal: number; dia_corte_inicio: number; prazo_pagamento_dias: number;
  data_inicio: string; data_fim: string | null; obra: string | null;
  empresa: EmpresaDoc; cliente: ClienteDoc;
  veiculo: {
    placa: string; marca: string | null; modelo: string | null; ano: number | null; chassi: string | null; cor: string | null;
    km_atual: number; horimetro_atual: number; proprietario: "proprio" | "locador";
  };
}

/** multa compensatória por rescisão antecipada sem justa causa (cláusula 14.5) */
export const MULTA_RESCISAO_CONTRATO = 20;

/** item numerado (n.i.), item com sublista, parágrafo sem número ou bloco solto (tabela) */
type Item = string | { texto: string; lista: string[] } | { livre: string } | { bloco: Bloco };

function clausula(n: number, titulo: string, itens: Item[]): Bloco[] {
  let i = 0;
  const blocos: Bloco[] = [{ t: "secao", texto: `${n}. ${titulo}` }];
  for (const it of itens) {
    if (typeof it === "object" && "livre" in it) { blocos.push({ t: "paragrafo", texto: it.livre }); continue; }
    if (typeof it === "object" && "bloco" in it) { blocos.push(it.bloco); continue; }
    i++;
    const texto = typeof it === "string" ? it : it.texto;
    blocos.push({ t: "paragrafo", rotulo: `${n}.${i}.`, texto });
    if (typeof it === "object") blocos.push({ t: "lista", itens: it.lista });
  }
  return blocos;
}

const extensoDias = (n: number) => `${n} (${numeroPorExtenso(n)})`;

export function montarContrato(c: DadosContrato): Documento {
  const e = c.empresa, cli = c.cliente, v = c.veiculo;
  const diaria = c.tipo_cobranca === "diaria";
  const local = cidadeUF(e) || "São José do Rio Preto/SP";
  const prazoDias = c.data_fim ? diffDias(c.data_inicio, c.data_fim) : null;
  const valorTexto = `${formatBRL(c.valor_mensal)} (${valorPorExtenso(c.valor_mensal)})`;
  const periodo = c.dia_corte_inicio === 21
    ? "o período compreendido entre o dia 21 (vinte e um) de cada mês e o dia 20 (vinte) do mês seguinte"
    : "o período compreendido entre o primeiro e o último dia de cada mês";
  const pagamento = `${extensoDias(c.prazo_pagamento_dias)} dias contados da emissão da respectiva fatura`;
  const veiculoCurto = [v.marca, v.modelo, v.ano && `(${v.ano})`].filter(Boolean).join(" ") + ` — Placa ${formatPlaca(v.placa)}`;
  const comMotorista = v.proprietario === "proprio";
  const enderecoCli = enderecoCompleto(cli) || "[ENDEREÇO COMPLETO]";

  const blocos: Bloco[] = [
    { t: "titulo", texto: "Contrato Particular de Locação de Veículo/Equipamento" },
    { t: "paragrafo", texto: "Pelo presente instrumento particular, de um lado:" },
    { t: "paragrafo", texto: `${e.razao_social.toUpperCase()}, pessoa jurídica de direito privado, inscrita no CNPJ sob nº ${e.cnpj ?? "[●]"}, com endereço na ${enderecoCompleto(e) || "[ENDEREÇO]"}, neste ato representada na forma de seus atos constitutivos, doravante denominada simplesmente LOCADORA;` },
    { t: "paragrafo", texto: "e, de outro lado:" },
    { t: "paragrafo", texto: `${cli.razao_social.toUpperCase()}, pessoa jurídica de direito privado, inscrita no CNPJ sob nº ${cli.cnpj ?? "[●]"}, com sede na ${enderecoCli}, neste ato representada na forma de seus atos constitutivos, doravante denominada simplesmente LOCATÁRIA;` },
    { t: "paragrafo", texto: "têm entre si justo e contratado o presente CONTRATO PARTICULAR DE LOCAÇÃO DE VEÍCULO/EQUIPAMENTO, mediante as cláusulas e condições seguintes." },

    { t: "secao", texto: "Ficha resumo da contratação" },
    { t: "paragrafo", texto: "Dados comerciais para consulta rápida. Em caso de qualquer divergência, prevalece o texto das cláusulas." },
    { t: "campos", pares: [
      ["LOCADORA", `${e.razao_social} — CNPJ ${e.cnpj ?? "[●]"}`],
      ["LOCATÁRIA", `${cli.razao_social} — CNPJ ${cli.cnpj ?? "[●]"}`],
      ...(c.obra ? [["Obra", c.obra] as [string, string]] : []),
      ["Veículo/equipamento", `${veiculoCurto} — cláusula 1`],
      ["Modalidade", comMotorista ? "Com motorista/operador fornecido pela LOCADORA — cláusula 8" : "Sem motorista: condução e operação pela LOCATÁRIA — cláusula 8"],
      ["Início da locação", `${formatData(c.data_inicio)} — cláusula 2`],
      ["Prazo", `${prazoDias != null ? `${prazoDias} dias` : "Indeterminado"} — cláusula 2`],
      [diaria ? "Valor da diária" : "Valor mensal", `${formatBRL(c.valor_mensal)} por veículo/equipamento — cláusula 3`],
      ["Mobilização/desmobilização", `Retirada e devolução em ${local} — cláusula 3`],
      ["Pagamento", `${c.prazo_pagamento_dias} dias após emissão da fatura, mediante medição mensal — cláusula 4`],
      ["Foro", `Comarca de ${local} — cláusula 24`],
    ] },

    ...clausula(1, "Do objeto", [
      "O presente contrato tem por objeto a locação do seguinte veículo/equipamento:",
      { bloco: { t: "tabela", cabecalho: ["Marca", "Modelo", "Ano", "Chassi", "Placa", "Cor"],
        linhas: [[v.marca ?? "", v.modelo ?? "", v.ano ? String(v.ano) : "", v.chassi ?? "", formatPlaca(v.placa), v.cor ?? ""]] } },
      "As informações constantes desta cláusula poderão ser adaptadas a cada contratação, conforme o veículo ou equipamento efetivamente locado, sendo vedada a substituição do bem por outro sem registro e concordância entre as partes.",
      "Integram o presente contrato, para todos os efeitos, a Ordem de Serviço/Ordem de Locação, o checklist de entrega, o registro fotográfico, o checklist de devolução, propostas comerciais eventualmente aprovadas e demais documentos expressamente vinculados à contratação.",
      "Havendo divergência entre informações exclusivamente operacionais constantes da Ordem de Serviço e deste contrato, prevalecerão as disposições deste instrumento, ressalvadas condições comerciais específicas formalmente acordadas entre as partes.",
    ]),

    ...clausula(2, "Do prazo da locação", [
      `O início da locação está previsto para o dia ${formatData(c.data_inicio)}.`,
      prazoDias != null
        ? `O prazo de locação será de ${extensoDias(prazoDias)} dias, contados da data de início da disponibilização do veículo/equipamento.`
        : "A locação vigorará por prazo indeterminado, contado da data de início da disponibilização do veículo/equipamento, até sua desmobilização na forma da cláusula 14.",
      "Para as contratações futuras, as datas de início e término poderão ser definidas na respectiva Ordem de Serviço/Ordem de Locação, que passará a integrar este contrato.",
      "A permanência do veículo/equipamento em posse da LOCATÁRIA após o término do prazo contratual, sem oposição da LOCADORA, não importará automaticamente em renovação por prazo idêntico, devendo eventual continuidade ser formalizada entre as partes.",
    ]),

    ...clausula(3, "Do preço da locação", [
      diaria
        ? `A LOCATÁRIA pagará à LOCADORA o valor de ${valorTexto} por diária, por veículo/equipamento locado, multiplicado pelos dias de disponibilização apurados na medição.`
        : `A LOCATÁRIA pagará à LOCADORA o valor de ${valorTexto} por mês, por veículo/equipamento locado.`,
      "Nas contratações futuras, o valor poderá ser definido na Ordem de Serviço/Ordem de Locação ou proposta comercial correspondente, desde que expressamente aceita pela LOCATÁRIA.",
      `A mobilização compreenderá a retirada do veículo/equipamento em ${local} e a desmobilização compreenderá sua devolução em ${local}, salvo estipulação diversa por escrito.`,
      "Despesas extraordinárias de transporte, deslocamento, pedágio, estadia ou mobilização para local diverso do originalmente contratado deverão ser previamente acordadas entre as partes.",
    ]),

    ...clausula(4, "Das medições, faturamento e pagamento", [
      "Serão realizadas medições mensais.",
      `A medição mensal será realizada tomando-se por base ${periodo}.`,
      `A LOCATÁRIA deverá enviar ou validar a medição até o 5º (quinto) dia ${c.dia_corte_inicio === 21 ? "após o fechamento de cada período" : "do mês subsequente"}.`,
      `O pagamento será efetuado no prazo de ${pagamento}/nota fiscal, por transferência bancária para conta indicada pela LOCADORA.`,
      "A ausência de manifestação da LOCATÁRIA sobre a medição apresentada, dentro de 05 dias úteis de seu recebimento, autorizará a LOCADORA a solicitar formalmente sua validação, sem prejuízo da comprovação do período efetivamente disponibilizado por outros documentos operacionais.",
      "Eventual divergência sobre parte da medição deverá ser comunicada por escrito e de forma fundamentada, não autorizando a retenção de valores incontroversos.",
      "O atraso de qualquer pagamento sujeitará a LOCATÁRIA, independentemente de notificação, ao pagamento de multa moratória de 2% (dois por cento) sobre o débito, juros de mora de 1% (um por cento) ao mês, calculados proporcionalmente aos dias de atraso, e atualização monetária pelo IPCA, ou índice oficial que venha a substituí-lo.",
      "Permanecendo o débito após cobrança administrativa, a LOCADORA poderá adotar as medidas extrajudiciais e judiciais cabíveis para sua recuperação, acrescidas das despesas comprovadamente necessárias à cobrança, observada a legislação aplicável.",
      "A tolerância eventual da LOCADORA quanto ao atraso ou à forma de pagamento não importará em novação, renúncia ou alteração das condições contratadas.",
    ]),

    ...clausula(5, "Da destinação e utilização do veículo/equipamento", [
      { livre: "A locação será destinada exclusivamente ao atendimento das atividades da LOCATÁRIA relacionadas às suas prestações de serviços." },
      "O veículo/equipamento deverá ser utilizado exclusivamente para a finalidade compatível com suas características técnicas e com a atividade contratada, observados os limites de carga, capacidade, operação, circulação e segurança aplicáveis.",
      { texto: "É vedada a utilização do veículo/equipamento:", lista: [
        "em finalidade diversa daquela para a qual foi disponibilizado;",
        "por pessoa sem habilitação, qualificação ou autorização necessária;",
        "em condições que excedam os limites técnicos do veículo/equipamento;",
        "para prática de qualquer atividade ilícita;",
        "de maneira contrária às orientações técnicas ou de segurança aplicáveis.",
      ] },
      "A LOCATÁRIA não poderá ceder, transferir, emprestar, sublocar ou disponibilizar o veículo/equipamento a terceiros sem autorização prévia e expressa da LOCADORA.",
    ]),

    ...clausula(6, "Das obrigações da LOCADORA", [
      "A LOCADORA será responsável pela manutenção preventiva do veículo/equipamento e pelos reparos decorrentes de desgaste natural proveniente de sua utilização regular.",
      { texto: "Compete ainda à LOCADORA:", lista: [
        "disponibilizar o veículo/equipamento em condições adequadas de utilização e segurança, ressalvadas as condições expressamente registradas no checklist inicial;",
        "entregar à LOCATÁRIA os documentos necessários à regular utilização do bem que sejam de sua responsabilidade;",
        "providenciar, quando de sua responsabilidade, as manutenções necessárias ao funcionamento do veículo/equipamento;",
        "manter canal de comunicação para recebimento de informações relacionadas a falhas, acidentes, avarias ou necessidade de manutenção.",
      ] },
      "Ocorrendo problema de manutenção de responsabilidade da LOCADORA que provoque a paralisação do veículo/equipamento, a LOCADORA terá até 48 (quarenta e oito) horas para adotar providências destinadas à solução do problema.",
      "A contagem do prazo previsto no item anterior terá início a partir da comunicação formal da ocorrência à LOCADORA, acompanhada das informações mínimas necessárias à identificação do problema.",
      "A paralisação decorrente de mau uso, acidente, negligência, imprudência, imperícia ou fato imputável à LOCATÁRIA não será considerada manutenção de responsabilidade da LOCADORA.",
    ]),

    ...clausula(7, "Das obrigações da LOCATÁRIA", [
      "A LOCATÁRIA será responsável por 1 (uma) lavagem mensal, lubrificação e serviços de borracharia relacionados ao uso ordinário.",
      "O fornecimento de óleo diesel será de responsabilidade da LOCATÁRIA.",
      "A LOCATÁRIA assume responsabilidade pela guarda, conservação e correta utilização do veículo/equipamento durante todo o período em que estiver sob sua posse.",
      { texto: "Compete ainda à LOCATÁRIA:", lista: [
        "observar as orientações de utilização, segurança e conservação do veículo/equipamento;",
        "comunicar imediatamente qualquer falha, avaria, acidente, apreensão ou ocorrência envolvendo o bem;",
        "permitir que a LOCADORA realize inspeções previamente comunicadas quando houver motivo relacionado à conservação, segurança ou manutenção do bem;",
        "não realizar alterações, adaptações, instalações ou intervenções estruturais no veículo/equipamento sem autorização da LOCADORA;",
        "manter o veículo/equipamento em local e condições compatíveis com sua guarda e conservação;",
        "devolver o bem nas condições em que o recebeu, ressalvado o desgaste natural decorrente de sua utilização regular;",
        "responsabilizar-se pelos atos das pessoas às quais permitir a utilização ou operação do veículo/equipamento.",
      ] },
    ]),

    ...clausula(8, "Dos operadores, motoristas e responsabilidade pela operação", [
      "Quando a contratação compreender apenas a locação do veículo/equipamento, sem fornecimento de motorista ou operador pela LOCADORA, a LOCATÁRIA será integralmente responsável pela escolha, contratação, habilitação, qualificação e supervisão das pessoas responsáveis por sua condução ou operação.",
      "A LOCATÁRIA declara que somente permitirá a condução ou operação por profissionais legalmente habilitados e tecnicamente aptos à atividade executada.",
      "Eventuais obrigações trabalhistas, previdenciárias, fiscais, administrativas e securitárias decorrentes dos profissionais contratados diretamente pela LOCATÁRIA serão de responsabilidade exclusiva desta.",
      "Caso determinada contratação inclua motorista ou operador disponibilizado pela LOCADORA, essa condição deverá constar expressamente da Ordem de Serviço/Ordem de Locação, com a correspondente definição das responsabilidades operacionais das partes.",
    ]),

    ...clausula(9, "Do seguro, sinistros e responsabilidades", [
      "A LOCADORA será responsável pela contratação dos seguros legalmente obrigatórios relativos ao veículo, quando aplicáveis.",
      "A existência de seguro facultativo, sua cobertura, franquia, limites e exclusões dependerão da apólice efetivamente contratada pela LOCADORA, não se presumindo cobertura não expressamente existente.",
      "A LOCATÁRIA deverá informar imediatamente à LOCADORA qualquer sinistro ocorrido durante a locação, independentemente da existência de reivindicação perante seguradora.",
      "Em caso de acidente ou sinistro, a LOCATÁRIA deverá preservar o veículo/equipamento, adotar as providências emergenciais razoavelmente necessárias, registrar a ocorrência quando cabível e fornecer à LOCADORA todos os documentos e informações necessários à apuração dos fatos e eventual acionamento do seguro.",
      "Danos decorrentes de negligência, imprudência, imperícia, condução irregular ou utilização indevida por ato imputável à LOCATÁRIA ou às pessoas sob sua responsabilidade serão suportados pela LOCATÁRIA, na extensão dos prejuízos que lhe forem juridicamente atribuíveis.",
      "Quando o sinistro decorrer de ato imputável à LOCATÁRIA e houver cobertura securitária, eventual franquia e demais despesas não cobertas pela seguradora poderão ser de responsabilidade da LOCATÁRIA, desde que devidamente comprovadas.",
      "A LOCATÁRIA não responderá pelos danos decorrentes exclusivamente de vício, defeito preexistente ou desgaste natural do veículo/equipamento que não tenham sido causados ou agravados por sua conduta.",
    ]),

    ...clausula(10, "Das multas de trânsito, pedágios e infrações", [
      "As multas de trânsito, pedágios, tarifas e demais encargos decorrentes da utilização do veículo durante o período em que estiver sob posse da LOCATÁRIA serão de responsabilidade desta, quando relacionados à sua utilização ou às pessoas por ela autorizadas.",
      "A LOCATÁRIA deverá fornecer, no prazo solicitado, todas as informações necessárias à identificação do condutor responsável por eventual infração.",
      "Caso a LOCADORA seja obrigada a efetuar pagamento que, nos termos deste contrato, seja de responsabilidade da LOCATÁRIA, poderá exigir o respectivo reembolso mediante apresentação do documento comprobatório.",
    ]),

    ...clausula(11, "Da manutenção e das intervenções no veículo", [
      "A LOCATÁRIA deverá comunicar à LOCADORA qualquer sinal de defeito ou necessidade de manutenção que possa comprometer a segurança ou a integridade do veículo/equipamento.",
      "Salvo situação emergencial destinada exclusivamente a evitar agravamento de dano, nenhum reparo ou intervenção de responsabilidade da LOCADORA deverá ser realizado por terceiro sem prévia autorização.",
      "A realização de reparo sem autorização da LOCADORA não gerará, por si só, direito automático ao reembolso da despesa.",
      "Se ficar comprovado que a manutenção ou o reparo decorreu de utilização inadequada, acidente ou dano imputável à LOCATÁRIA, os respectivos custos poderão ser cobrados desta.",
    ]),

    ...clausula(12, "Do checklist de entrega e devolução", [
      "A entrega e a devolução do veículo/equipamento serão acompanhadas de checklist e registro fotográfico, destinados a documentar suas condições no início e no término da locação.",
      "O checklist deverá, sempre que aplicável, registrar placa, identificação do veículo/equipamento, quilometragem ou horímetro, condição dos pneus, carroceria, cabine, acessórios, equipamentos de segurança e avarias aparentes.",
      "Após a devolução do veículo/equipamento, a LOCATÁRIA terá o prazo de 48 (quarenta e oito) horas para apresentar, por escrito, eventual contestação fundamentada referente às avarias registradas.",
      "Decorrido o prazo sem manifestação, o checklist e o relatório de vistoria serão considerados aceitos pela LOCATÁRIA, ressalvados vícios cuja constatação não fosse razoavelmente possível no momento da vistoria.",
      "A constatação de dano que exceda o desgaste natural deverá ser documentada e, quando imputável à LOCATÁRIA, poderá gerar obrigação de ressarcimento do custo efetivamente necessário ao reparo.",
      "O registro fotográfico deverá permanecer anexado ou vinculado eletronicamente ao respectivo contrato ou Ordem de Serviço.",
    ]),

    ...clausula(13, "Da inadimplência", [
      "O não pagamento dos valores contratados nas datas estabelecidas caracterizará inadimplemento da LOCATÁRIA.",
      "Verificado o atraso, a LOCADORA poderá realizar cobrança administrativa pelos meios de contato informados pela LOCATÁRIA.",
      "Persistindo a inadimplência, a LOCADORA poderá suspender novas disponibilizações de veículos/equipamentos à LOCATÁRIA, sem prejuízo das obrigações já constituídas.",
      "Quando o inadimplemento persistir e houver veículo/equipamento ainda em posse da LOCATÁRIA, a LOCADORA poderá notificá-la para regularização ou devolução do bem no prazo indicado na comunicação, observadas as circunstâncias da contratação e a legislação aplicável.",
      "A ausência de regularização autorizará a adoção das medidas extrajudiciais ou judiciais cabíveis.",
    ]),

    ...clausula(14, "Da rescisão e desmobilização", [
      "O presente contrato poderá ser rescindido por descumprimento das obrigações nele estabelecidas.",
      "A parte que identificar descumprimento contratual deverá, sempre que a natureza da obrigação permitir sua regularização, comunicar a outra parte e conceder prazo razoável para saneamento antes da rescisão.",
      "Poderá haver rescisão imediata, independentemente de prazo para regularização, quando a gravidade da conduta tornar incompatível a manutenção da relação contratual, especialmente em situações de utilização ilícita, desaparecimento do bem, recusa de restituição, utilização por pessoa não habilitada ou risco relevante à integridade do veículo/equipamento.",
      "Havendo interesse na desmobilização total ou parcial dos veículos/equipamentos antes do encerramento do prazo contratado, esta poderá ocorrer mediante acordo entre as partes e aviso prévio de 30 (trinta) dias.",
      `Caso a contratação seja rescindida antecipadamente e sem justa causa por iniciativa de uma das partes, aplicar-se-á a multa compensatória de ${MULTA_RESCISAO_CONTRATO}% (${numeroPorExtenso(MULTA_RESCISAO_CONTRATO)} por cento) sobre o saldo contratual correspondente ao período remanescente, salvo condição comercial distinta expressamente estabelecida na Ordem de Serviço/Ordem de Locação.`,
      "A multa prevista no item anterior não será cumulada com outra penalidade de mesma natureza incidente sobre o mesmo fato.",
      "A rescisão não prejudicará a cobrança de valores vencidos, medições realizadas, despesas reembolsáveis, danos apurados ou demais obrigações constituídas durante a vigência do contrato.",
    ]),

    ...clausula(15, "Da devolução do veículo/equipamento", [
      "Encerrada a locação, a LOCATÁRIA deverá disponibilizar o veículo/equipamento para devolução no local e prazo estabelecidos entre as partes.",
      "A devolução somente será considerada concluída após a efetiva restituição do bem e realização do checklist de devolução.",
      "A retenção injustificada do veículo/equipamento após encerrado o período de locação poderá gerar cobrança proporcional pelo período de permanência, sem prejuízo das demais medidas cabíveis.",
    ]),

    ...clausula(16, "Da responsabilidade por danos", [
      "Cada parte responderá pelos danos diretos comprovadamente decorrentes do descumprimento de suas obrigações contratuais ou de ato que lhe seja imputável.",
      "A LOCATÁRIA responderá pelos danos causados ao veículo/equipamento por seus empregados, prepostos, contratados ou terceiros a quem tenha permitido sua utilização, ressalvado o desgaste natural.",
      "A responsabilidade da LOCATÁRIA deverá ser apurada considerando a causa do dano, os registros de entrega e devolução, as fotografias, documentos técnicos e demais elementos disponíveis.",
    ]),

    ...clausula(17, "Da documentação e dos registros da contratação", [
      "As partes reconhecem como integrantes da relação contratual os documentos e registros produzidos durante sua execução, incluindo Ordens de Serviço, medições, notas fiscais, comprovantes, checklists, fotografias, comunicações eletrônicas e documentos de entrega e devolução.",
      "A LOCATÁRIA obriga-se a fornecer dados cadastrais e informações verdadeiras e atualizadas necessárias à formalização da contratação e faturamento.",
      "Alterações relevantes de endereço, e-mail, telefone ou representante responsável deverão ser informadas à outra parte.",
    ]),

    ...clausula(18, "Das comunicações entre as partes", [
      "Serão consideradas válidas as comunicações realizadas pelos e-mails, números de WhatsApp ou demais canais formalmente utilizados pelas partes durante a relação comercial.",
      "As partes deverão manter seus respectivos dados de contato atualizados.",
      "Comunicações relacionadas a rescisão, inadimplemento, devolução de veículo/equipamento ou alteração substancial da contratação deverão permitir a comprovação de seu envio.",
    ]),

    ...clausula(19, "Da proteção de dados", [
      "As partes comprometem-se a tratar os dados pessoais a que tiverem acesso em razão desta contratação exclusivamente para finalidades legítimas relacionadas à execução do contrato, cumprimento de obrigações legais, exercício regular de direitos e demais hipóteses admitidas pela legislação aplicável.",
      "Cada parte será responsável pelos tratamentos de dados pessoais que realizar no âmbito de suas próprias atividades.",
    ]),

    ...clausula(20, "Da ausência de vínculo", [
      "O presente contrato não estabelece sociedade, associação, representação, vínculo empregatício ou relação de subordinação entre as partes.",
      "Cada parte permanecerá exclusivamente responsável por seus empregados, prestadores, tributos, encargos e obrigações decorrentes de sua própria atividade.",
    ]),

    ...clausula(21, "Da cessão do contrato", [
      "Nenhuma das partes poderá ceder integralmente este contrato ou transferir a terceiros suas obrigações principais sem prévia ciência e concordância da outra parte, ressalvadas hipóteses legalmente permitidas.",
    ]),

    ...clausula(22, "Das condições gerais", [
      "O presente contrato produzirá efeitos a partir de sua assinatura pelas partes.",
      "A eventual tolerância de uma parte quanto ao descumprimento de obrigação pela outra será considerada mera liberalidade e não importará em renúncia de direito, alteração contratual ou novação.",
      "Caso qualquer disposição deste contrato seja considerada inválida ou inexequível, as demais permanecerão válidas e eficazes na máxima extensão permitida.",
      "Qualquer alteração das condições deste instrumento deverá ser formalizada por escrito, inclusive por meio eletrônico, e aceita pelas partes.",
      "Este contrato, seus anexos, Ordens de Serviço e demais documentos vinculados representam o conjunto das condições aplicáveis à contratação correspondente.",
    ]),

    ...clausula(23, "Da assinatura eletrônica", [
      "As partes reconhecem como válida a assinatura física ou eletrônica deste contrato e de seus documentos vinculados, inclusive por plataforma de assinatura eletrônica que permita identificação dos signatários e preservação da integridade do documento.",
      "As partes reconhecem a validade dos documentos eletrônicos e das manifestações de vontade realizadas pelos meios admitidos em lei.",
    ]),

    ...clausula(24, "Do foro", [
      `Fica eleito o Foro da Comarca de ${local} para dirimir as controvérsias decorrentes deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja, ressalvadas as hipóteses de competência legal inderrogável.`,
    ]),

    { t: "paragrafo", texto: "E, por estarem de acordo, as partes assinam o presente instrumento." },
    { t: "paragrafo", alinhar: "direita", texto: `${local}, _____ de ________________ de ______.` },
    { t: "assinaturas", partes: [
      { titulo: "LOCADORA", linhas: [e.razao_social, `CNPJ nº ${e.cnpj ?? "[●]"}`, "Representante: ______________________"] },
      { titulo: "LOCATÁRIA", linhas: [cli.razao_social, `CNPJ nº ${cli.cnpj ?? "[●]"}`, "Representante: ______________________"] },
      { titulo: "TESTEMUNHA 01", linhas: ["Nome: ______________________________", "CPF: _______________________________"] },
      { titulo: "TESTEMUNHA 02", linhas: ["Nome: ______________________________", "CPF: _______________________________"] },
    ] },

    { t: "quebra" },
    { t: "secao", texto: "Anexo I — Identificação do veículo/equipamento e checklist de entrega" },
    { t: "campos", colunas: 2, preencher: true, pares: [
      ["Contrato nº", c.numero ?? ""], ["OS nº", ""],
      ["Cliente", cli.razao_social], ["CNPJ", cli.cnpj ?? ""],
      ["Placa", formatPlaca(v.placa)], ["Marca/modelo", [v.marca, v.modelo].filter(Boolean).join(" ")],
      ["Ano", v.ano ? String(v.ano) : ""], ["Chassi", v.chassi ?? ""],
      ["Data de entrega", formatData(c.data_inicio)], ["Km / horímetro", [v.km_atual ? formatKm(v.km_atual) : "", v.horimetro_atual ? formatHoras(v.horimetro_atual) : ""].filter(Boolean).join(" · ")],
      ["Combustível", ""], ["Condições dos pneus", ""],
      ["Condições externas", ""], ["Condições internas", ""],
    ] },
    { t: "campos", preencher: true, pares: [["Acessórios/equipamentos entregues", ""], ["Avarias preexistentes", ""], ["Observações", ""]] },
    { t: "paragrafo", texto: "O registro fotográfico realizado na entrega integra este checklist e o respectivo contrato." },
    { t: "assinaturas", partes: [
      { titulo: "Assinatura/aceite LOCADORA", linhas: [] },
      { titulo: "Assinatura/aceite LOCATÁRIA", linhas: [] },
    ] },
  ];

  return {
    arquivo: `contrato_${c.numero ?? formatPlaca(v.placa)}_${cli.nome_fantasia ?? cli.razao_social}`,
    cabecalho: `Contrato de Locação${c.numero ? ` Nº ${c.numero}` : ""}`,
    rodape: rodapeEmpresa(e),
    blocos,
  };
}
