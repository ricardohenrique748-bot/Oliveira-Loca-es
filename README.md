# Oliveira Locações — Sistema de Gestão

Sistema web que substitui as 4 planilhas da Oliveira Locações (São José do Rio Preto/SP) e cobre o ciclo completo:

**contrato → medição mensal → faturamento → recebimento → repasse ao locador (sublocados) → contas a pagar → manutenção da frota → dashboard e margem por placa.**

Duas empresas emissoras (**OLIVEIRA** e **TDTS**) com RLS por empresa e perfil; tudo em pt-BR, BRL, datas dd/mm/aaaa e fuso America/Sao_Paulo.

## Stack

Vite + React (TypeScript strict, React Router 7) · Tailwind + shadcn/ui (Radix) + lucide-react · Recharts · Supabase (Postgres 17, Auth, Storage, RLS, pg_cron) · Zod + React Hook Form · TanStack Table · date-fns (ptBR) · SheetJS (XLSX) · jsPDF · Vitest · Playwright · PWA.

## Setup local

Pré-requisitos: Node 20+ e Docker Desktop **funcionando** (no Windows, o Docker precisa do WSL 2 com a distro `docker-desktop`; rode `wsl --install` como administrador se `wsl -l -v` não listar nada).

```bash
npm install
npx supabase start            # sobe Postgres/Auth/Storage locais (imprime URL e chaves)
cp .env.example .env.local    # preencha com os valores impressos acima
npx supabase db reset         # aplica supabase/migrations/* + supabase/seed.sql
npm run db:types              # regenera src/lib/supabase/database.types.ts (oficial)
npm run dev                   # http://localhost:3000
```

Usuários do seed (senha `Oliveira@2026`):

| E-mail | Perfil | Empresas |
|---|---|---|
| admin@oliveira.local | admin | todas |
| financeiro@oliveira.local | financeiro | OLIVEIRA, TDTS |
| faturamento@oliveira.local | faturamento | OLIVEIRA |
| manutencao@oliveira.local | manutencao | OLIVEIRA, TDTS |
| consulta@oliveira.local | consulta | OLIVEIRA, TDTS |

O seed tem 2 empresas, 8 clientes, 15 veículos (5 de locadores), 12 contratos, medições de jul–set/2026 geradas pelas próprias regras do sistema, recebimentos, repasses (com abatimento maior que o repasse), ~240 contas a pagar (parcelas 1/4, 13/53, 1/48 e recorrentes), OS abertas/fechadas, planos preventivos, documentos e pneus.

### Variáveis de ambiente

| Variável | Onde | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | app + scripts | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | chave pública (RLS aplicada) |
| `SUPABASE_SERVICE_ROLE_KEY` | **só servidor** | gestão de usuários (Configurações) e importação |
| `NEXT_PUBLIC_APP_URL` | app/E2E | URL pública |
| `E2E_EMAIL` / `E2E_PASSWORD` | Playwright | usuário dos testes |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `preview` | Vite (SPA) |
| `npm run typecheck` | Validação de tipos (`tsc --noEmit`) |
| `npm test` | Vitest: regras de cálculo, formatação, importação **e** integração SQL (migrations + seed em PGlite) |
| `npm run test:e2e` | Playwright (3 fluxos críticos; exige Supabase local com seed) |
| `npm run db:check` | aplica migrations + seed num Postgres em memória (PGlite) e mostra contagens — **não precisa de Docker** |
| `npm run db:types` | `supabase gen types` (Supabase local) |
| `npm run db:types:offline` | gera os tipos no mesmo formato a partir do PGlite (sem Docker) |
| `npm run db:reset` / `db:push` | recria o banco local / envia migrations ao projeto remoto |
| `npm run importar -- --dry-run` | importação das planilhas (ver abaixo) |

## Estrutura

```
src/
  app/(auth)/login                 login (Supabase Auth e-mail/senha)
  app/(app)/dashboard              KPIs, painel "Hoje", 6 gráficos clicáveis
  app/(app)/cadastros/...          empresas, contas bancárias, clientes (obras/contatos), locadores (PIX), veículos (ficha), fornecedores, categorias
  app/(app)/contratos              contratos + desmobilização + histórico
  app/(app)/medicoes               gerar medições (prévia) + grade estilo planilha + faturar em lote + lembrete XLSX/PDF
  app/(app)/receber                aging, baixa total/parcial/lote, cobrança e-mail / WhatsApp (wa.me)
  app/(app)/repasses               por locador, abatimentos detalhados, pagamento (adiantado exige confirmação), extrato PDF
  app/(app)/pagar                  lista + calendário, parcelas n/N, recorrência, baixa em lote, totais por dia/banco
  app/(app)/manutencao/...         painel da frota + indicadores, planos, OS (kanban), leituras (mobile), documentos, pneus
  app/(app)/relatorios             DRE placa/cliente, faturamento, aging, repasses, despesas, manutenção (XLSX/PDF)
  app/(app)/configuracoes          parâmetros, templates, usuários/perfis/empresas, rotinas, importação
  lib/calculos/                    regras de negócio puras + testes (Vitest)
  lib/supabase/                    clientes browser/server/admin, middleware, tipos gerados
  components/                      ui (shadcn), app (DataTable, formulários com máscara, anexos), layout
supabase/migrations/               SQL versionado (0001…0010)
supabase/seed.sql                  seed de desenvolvimento
supabase/tests/                    integração SQL + paridade SQL × TypeScript (PGlite)
scripts/importacao/                importação das planilhas
scripts/db/                        PGlite (validação sem Docker) e gerador de tipos offline
e2e/                               Playwright
```

## Regras de negócio

As regras ficam em **dois lugares de propósito**, com um teste de paridade entre eles:

- `src/lib/calculos/*` — funções puras usadas na interface (prévias, grade de medições recalculando ao digitar, parcelas) e cobertas pelos testes Vitest pedidos (períodos 01–30 e 21–20, meses de 28/31 dias, mobilização e desmobilização no meio do período, abatimento maior que o repasse, parcelamento 1/4..4/4, preventiva por km × dias…);
- `supabase/migrations/20261016000007_regras.sql` — as mesmas regras em PL/pgSQL, usadas pelas operações transacionais (RPC) e pelos jobs do pg_cron:
  - `fn_gerar_medicoes(competência, corte?, contratos?, dry_run)` — usada pelo botão (com prévia) e pelo job diário;
  - `fn_desmobilizar_contrato` — medição final proporcional, encerra o contrato, veículo → disponível;
  - `fn_pagar_repasse` — recalcula abatimentos e recusa adiantado sem confirmação (grava `adiantado` + `aprovado_por`);
  - `fn_fechar_os` — soma itens, cria a conta a pagar do veículo, atualiza o plano preventivo, registra leitura e devolve o veículo ao status anterior;
  - triggers: valor/vencimento da medição, status pelos recebimentos, criação/liberação do repasse, realocação de abatimentos "descontar do locador" (das despesas e repasses mais antigos para os mais novos, líquido nunca negativo e saldo para o próximo), km/horímetro pela leitura, status do veículo por contrato/OS.

`supabase/tests/regras-sql.test.ts` compara SQL × TypeScript em centenas de combinações de período/dias/valor e preventivas, e testa os critérios de aceite e o RLS de cada perfil.

**Competência** = mês em que o período **termina**. Ex.: competência set/2026 → corte 01: 01/09–30/09; corte 21: 21/08–20/09.

## Perfis e RLS

A matriz está comentada em `supabase/migrations/20261016000005_rls.sql` e espelhada em `src/lib/permissoes.ts` (menus e botões). Admin vê todas as empresas; os demais só as de `usuario_empresas`. PIX/CPF de locadores só para admin e financeiro (os outros perfis usam `vw_locadores_publico`). A tabela `auditoria` é preenchida por trigger em todas as tabelas financeiras e de manutenção.

## Rotinas (pg_cron)

Agendadas na migration 0009 (horários em UTC = 06:00/07:00 de Brasília): `gerar_medicoes`, `gerar_recorrentes` (dia 1), `atualizar_preventivas`, `gerar_alertas`. O admin pode executá-las na hora em **Configurações → Rotinas**. Na fase 2, o resumo diário por e-mail/WhatsApp entra como Edge Function lendo a tabela `alertas`.

## Importação das planilhas

1. Copie os XLSX para `scripts/importacao/planilhas/` (pasta fora do git).
2. `npm run importar -- --dry-run` → nada é gravado; gera `scripts/importacao/relatorios/inconsistencias_*.csv` (placas inválidas, clientes criados, `#REF!`, valores divergentes, parcelas…).
3. Ajuste o mapa `SINONIMOS_CLIENTES` em `scripts/importacao/normalizar.ts` e rode de novo.
4. `npm run importar` (opção `--empresa-pagar TDTS` muda a empresa padrão das contas a pagar sem coluna Empresa).

Só entram dados de **jan/2026 em diante**. O cabeçalho de cada aba é detectado automaticamente (procura nas 15 primeiras linhas pelos nomes de coluna esperados). A importação é idempotente para medições (contrato + início do período) e contas (descrição + vencimento + valor). Se a medição da planilha diferir do cálculo base 30, a diferença vai para acréscimos/descontos e é registrada no relatório.

## Power BI

A migration 0008 cria o schema `bi` (as mesmas views `vw_*`, sem PII de locadores) e o papel somente leitura `bi_reader`:

```sql
alter role bi_reader with password 'senha-forte';
```

Conecte o Power BI ao Postgres do Supabase (pooler, usuário `bi_reader.<project-ref>`) e use `bi.vw_margem_placa_mes`, `bi.vw_aging_receber`, `bi.vw_repasses_pendentes`, `bi.vw_contas_pagar_periodo`, `bi.vw_manutencao_custos`, `bi.vw_disponibilidade_frota`, `bi.vw_preventivas_status`, `bi.vw_fluxo_caixa_projetado`, `bi.medicoes`.

## Deploy (Vercel + Supabase sa-east-1)

1. Crie o projeto Supabase na região **South America (São Paulo)**.
2. `npx supabase link --project-ref <ref>` e `npx supabase db push` (aplica as migrations; pg_cron e buckets do Storage são criados por elas).
3. Crie o primeiro admin em Authentication → Users com o metadado `{"nome":"…","perfil":"admin"}`. O trigger cria o perfil; depois, os demais usuários são criados em Configurações.
4. Na Vercel: importe o repositório, defina `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_APP_URL`, e use a região `gru1`.
5. Em Authentication → URL configuration, defina o Site URL do app.
6. Backups: os backups diários do Supabase (plano Pro) atendem ao requisito; para PITR, ative o add-on.

## PWA

`/manifest.webmanifest` + `public/sw.js` (cache de estáticos e página offline). No celular da oficina, abra o sistema e use "Adicionar à tela inicial"; os atalhos levam direto a **Leituras** e **Ordens de serviço**. O logo em `public/logo-oliveira.svg` e os ícones em `public/icons/` são **placeholders**: substitua pelo logo oficial mantendo os nomes e rode `npm run icones` para regenerar os PNGs.

## Identidade visual

Tokens em `src/app/globals.css` (`--brand-black #0B0B0B`, `--brand-yellow #F5D90A`, `--brand-yellow-dark #C9B200`, status verde/âmbar/vermelho), Russo One nos títulos e Inter no corpo, sidebar preta com item ativo amarelo e texto preto sobre o amarelo (AA). Os gráficos usam uma paleta categórica validada para daltonismo (azul/laranja/aqua, com passos próprios no modo escuro). O amarelo da marca fica reservado para destaques e navegação.
