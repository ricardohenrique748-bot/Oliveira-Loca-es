/**
 * npm run db:check — aplica todas as migrations + seed num Postgres em memória
 * (PGlite) e imprime um resumo. Não precisa de Docker.
 */
import { criarBanco } from "./db/pglite";

async function main() {
  const db = await criarBanco({ seed: !process.argv.includes("--sem-seed"), log: (m) => console.log(m) });
  const tabelas = await db.query<{ tabela: string; linhas: number }>(`
    select relname as tabela, n_live_tup::int as linhas from pg_stat_user_tables
     where schemaname = 'public' order by relname`);
  const contagens: Record<string, number> = {};
  for (const t of tabelas.rows) {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from public.${t.tabela}`);
    contagens[t.tabela] = r.rows[0].n;
  }
  console.table(contagens);
  await db.close();
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
