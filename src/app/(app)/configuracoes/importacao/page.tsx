import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/basicos";
import { Cabecalho } from "@/components/app/comuns";

const PLANILHAS = [
  ["Planilha_Lembrete_Faturamento_Locacao_Veiculos_Pesados.xlsx", "“Oliveira SET26”, “Sub-locado SET26” e anteriores", "clientes, obras, veículos, contratos, medições, contatos"],
  ["FATURAMENTO OLIVEIRAeOLIVEIRA.xlsx", "“BASE” e abas por cliente", "locadores (PIX), valor mensal e repasse; medições históricas"],
  ["Pagamentos Fornecedores - CAIXA.xlsx", "uma aba por mês", "repasses pagos aos locadores"],
  ["Contas a pagar 202x.xlsx", "“Outubro26” … “Março27”", "contas a pagar (parcelas n/N, banco, forma, descontar)"],
];

export default function ImportacaoPage() {
  return (
    <div className="space-y-4">
      <Cabecalho titulo="Importação de planilhas" descricao="Migração única das 4 planilhas atuais. Executada por script no computador do administrador, com modo de simulação." />
      <Card>
        <CardHeader><CardTitle>Planilhas suportadas</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground"><th className="py-2 pr-4">Arquivo</th><th className="py-2 pr-4">Abas</th><th className="py-2">Destino</th></tr></thead>
            <tbody>{PLANILHAS.map(([a, b, c]) => <tr key={a} className="border-t"><td className="py-2 pr-4 font-medium">{a}</td><td className="py-2 pr-4">{b}</td><td className="py-2">{c}</td></tr>)}</tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Passo a passo</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-inside list-decimal space-y-2">
            <li>Copie os arquivos para <code className="rounded bg-muted px-1">scripts/importacao/planilhas/</code> (pasta ignorada pelo git).</li>
            <li>Configure <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> e <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code> no <code className="rounded bg-muted px-1">.env.local</code>.</li>
            <li>Simule: <code className="rounded bg-muted px-1">npm run importar -- --dry-run</code> — nada é gravado; o relatório de inconsistências sai em <code className="rounded bg-muted px-1">scripts/importacao/relatorios/</code> (CSV).</li>
            <li>Revise o CSV (placas inválidas, clientes não mapeados, fórmulas #REF!, parcelas sem n/N) e ajuste o mapa de sinônimos em <code className="rounded bg-muted px-1">scripts/importacao/normalizar.ts</code>.</li>
            <li>Importe de verdade: <code className="rounded bg-muted px-1">npm run importar</code>. Só entram dados de jan/2026 em diante.</li>
            <li>Depois, em Configurações → Rotinas, clique em “Executar rotinas agora” para gerar alertas e recorrências.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
