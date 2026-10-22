/**
 * Fluxos críticos (exigem Supabase local com o seed: `npx supabase db reset`).
 *  1. Gerar e faturar medição
 *  2. Pagar repasse com abatimento (e bloqueio de adiantado sem confirmação)
 *  3. Abrir e fechar OS gerando conta a pagar
 */
import { expect, test } from "@playwright/test";
import { entrar, selecionar } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await entrar(page);
});

test("gerar e faturar medição", async ({ page }) => {
  await page.goto("/medicoes?comp=2026-10");
  await page.getByRole("button", { name: "Gerar medições do período" }).click();
  const dialogo = page.getByRole("dialog", { name: "Gerar medições do período" });
  await dialogo.getByLabel("Competência").fill("2026-10");
  await dialogo.getByRole("button", { name: "Ver prévia" }).click();
  const gerar = dialogo.getByRole("button", { name: /^Gerar \d+ medições/ });
  await expect(dialogo.getByText(/medições|Nenhuma medição a gerar/).first()).toBeVisible();
  if (await gerar.isEnabled()) {
    // FJK8A12 (CYMI, corte 01, R$ 18.000) — período completo = 30 dias = valor mensal
    await expect(dialogo.getByRole("row", { name: /FJK8A12/ })).toContainText("R$ 18.000,00");
    await gerar.click();
    await expect(page.getByText(/medição\(ões\) gerada\(s\)/)).toBeVisible();
  } else {
    await dialogo.getByRole("button", { name: "Fechar" }).click();
  }

  const linha = page.getByRole("row", { name: /FJK8A12/ }).first();
  await expect(linha).toBeVisible();
  await linha.getByLabel("Número da NF").fill("9001");
  await linha.getByLabel("Data de emissão").fill("2026-11-01");
  await expect(linha.getByLabel("Vencimento")).toHaveValue("2026-12-01"); // emissão + 30 dias
  await page.getByRole("button", { name: /Salvar alterações/ }).click();
  await expect(page.getByText("Medições salvas")).toBeVisible();

  await page.getByRole("row", { name: /FJK8A12/ }).first().getByLabel(/Selecionar FJK8A12/).check();
  await page.getByRole("button", { name: "Marcar como faturado" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como faturado" }).click();
  await expect(page.getByText(/faturada\(s\)/)).toBeVisible();
  await expect(page.getByRole("row", { name: /FJK8A12/ }).first()).toContainText("Faturado");
});

test("pagar repasse com abatimento e bloquear adiantado sem confirmação", async ({ page }) => {
  await page.goto("/repasses");
  const robson = page.locator("div.rounded-lg", { hasText: "Robson Ferreira" }).first();
  // FRT2J34 ago/2026: bruto 12.000 − (4 × 1.250 pneus + 293,47 multa) = 6.706,53, cliente já pagou
  const linha = robson.getByRole("row", { name: /FRT2J34.*01\/08/ });
  await expect(linha).toContainText("R$ 6.706,53");
  await linha.getByRole("button", { name: "Pagar" }).click();
  const dlg = page.getByRole("dialog", { name: "Pagar repasse" });
  await expect(dlg).toContainText("R$ 6.706,53");
  await expect(dlg.getByText("Pagamento adiantado")).toHaveCount(0);
  await dlg.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(page.getByText("Repasse pago")).toBeVisible();

  // repasse cuja medição ainda não foi recebida: exige confirmação explícita
  const previsto = page.getByRole("row", { name: /FRT2J34.*01\/09/ });
  await previsto.getByRole("button", { name: "Pagar" }).click();
  const dlg2 = page.getByRole("dialog", { name: "Pagar repasse" });
  await expect(dlg2.getByText("Pagamento adiantado")).toBeVisible();
  await expect(dlg2.getByRole("button", { name: "Pagar adiantado" })).toBeDisabled();
  await dlg2.getByRole("button", { name: "Cancelar" }).click();
});

test("abrir e fechar OS gerando conta a pagar", async ({ page }) => {
  await page.goto("/manutencao/ordens?novo=1");
  const dlg = page.getByRole("dialog", { name: "Abrir ordem de serviço" });
  await selecionar(page, "Veículo", /DSV3I21/);
  await dlg.getByLabel("Problema / serviço solicitado").fill("E2E: troca de lâmpadas e regulagem de freio");
  await dlg.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/manutencao\/ordens\/[0-9a-f-]{36}/);
  await expect(page.getByText("Manutenção").first()).toBeVisible();

  await page.getByRole("button", { name: "Novo item" }).click();
  const item = page.getByRole("dialog", { name: "Novo item" });
  await item.getByLabel("Descrição").fill("Regulagem de freio");
  await item.getByLabel("Quantidade").fill("1");
  await item.getByLabel("Valor unitário").fill("350");
  await item.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: /Regulagem de freio/ })).toContainText("R$ 350,00");

  await page.getByRole("button", { name: "Fechar OS" }).first().click();
  const fechar = page.getByRole("dialog", { name: /Fechar OS/ });
  await fechar.getByRole("button", { name: "Fechar OS" }).click();
  await expect(page.getByText("Conta a pagar gerada")).toBeVisible();
  await expect(page.getByText(/R\$ 350,00 · em aberto/)).toBeVisible();
  await page.getByRole("link", { name: "Abrir conta" }).click();
  await expect(page.getByRole("dialog", { name: "Editar conta" })).toBeVisible();
});
