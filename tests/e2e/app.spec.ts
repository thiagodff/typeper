import { test, expect } from "@playwright/test";

test("history search, provider filter and deletion keep usage metrics", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await expect(page.locator(".provider-card")).toHaveCount(2);
  await page.screenshot({
    path: "artifacts/activity-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(page.locator(".history-item")).toHaveCount(3);
  await page.screenshot({
    path: "artifacts/history-light.png",
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Buscar no histórico" })
    .fill("microfone");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await expect(page.locator(".transcript-text")).toContainText(
    "microfone padrão",
  );
  await page
    .getByRole("combobox", { name: "Filtrar por provedor" })
    .selectOption("gemini");
  await expect(page.getByText("Nenhuma transcrição encontrada")).toBeVisible();
  await page.getByRole("textbox", { name: "Buscar no histórico" }).fill("");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Excluir transcrição", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(page.getByText("Nenhuma transcrição encontrada")).toBeVisible();
  await page.getByRole("button", { name: "Atividade", exact: true }).click();
  await expect(page.locator(".metric").first()).toContainText("3");
});

test("settings save, theme persists, and API keys are disabled in browser preview", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(page.getByLabel("Chave da API OpenAI")).toBeDisabled();
  await page.screenshot({
    path: "artifacts/settings-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Escuro", exact: true }).click();
  await page
    .getByRole("button", { name: "Segurar para falar", exact: false })
    .click();
  await page
    .getByRole("combobox", { name: "Atalho para ditar" })
    .selectOption("<Control><Alt>space");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .first()
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "artifacts/settings-dark.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".shortcut-card")).toContainText(
    "Segure, fale e solte.",
  );
  await expect(page.locator(".shortcut-card")).toContainText("Alt");
});

test("empty state and responsive layout do not invent usage or overflow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".metric").first()).toContainText("0");
  await expect(page.getByText("Sua próxima ideia começa aqui")).toBeVisible();
  await page.setViewportSize({ width: 760, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Como funciona", exact: false })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
