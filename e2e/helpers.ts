import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: process.env.E2E_EMAIL ?? "admin@oliveira.local", senha: process.env.E2E_PASSWORD ?? "Oliveira@2026" };

export async function entrar(page: Page, email = ADMIN.email, senha = ADMIN.senha) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Seleciona uma opção num Select do Radix pelo rótulo do campo. */
export async function selecionar(page: Page, rotulo: string | RegExp, opcao: string | RegExp) {
  await page.getByRole("combobox", { name: rotulo }).click();
  await page.getByRole("option", { name: opcao }).first().click();
}
