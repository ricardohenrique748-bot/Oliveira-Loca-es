-- =====================================================================
-- 0066 Contrato: data do pagamento
-- data_pagamento: escolhida na tela; o dia dela vai para dia_pagamento (0065), que é o que
-- calcula o vencimento (esse dia do mês seguinte à emissão). Vazia: vale o prazo em dias.
-- =====================================================================

alter table public.contratos add column if not exists data_pagamento date;

notify pgrst, 'reload schema';
