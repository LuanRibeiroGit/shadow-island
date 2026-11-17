import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  (page as unknown as { __errors: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
});

test("castle shows the demo banner and the main agent from replayed events", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Modo demonstração")).toBeVisible();
  await expect(page.locator(".castle-canvas-host canvas")).toBeVisible();
  await expect(page.locator(".castle-side").getByText("Guardiã da Lanterna").first()).toBeVisible({ timeout: 10_000 });
});

test("dashboard labels data quality and never invents a cost", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Métricas/ }).first().click();
  await expect(page.getByRole("heading", { name: "Métricas" })).toBeVisible();
  const tokens = page.getByTestId("kpi-tokens");
  await expect(tokens).toContainText("Real");
  // No prices configured -> cost must be unavailable, not $0.
  const cost = page.getByTestId("kpi-cost");
  await expect(cost).toContainText("Indisponível");
  await expect(cost).not.toContainText("$");
});

test("configuring a price turns the cost into an estimate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Configurações/ }).first().click();
  await page.getByRole("tab", { name: "Métricas" }).click();
  await page.getByLabel("Modelo ou prefixo").fill("claude-");
  await page.getByLabel("Entrada (US$/M)").fill("1");
  await page.getByLabel("Saída (US$/M)").fill("1");
  await page.getByRole("button", { name: "Salvar preço" }).click();
  await page.getByRole("button", { name: /Métricas/ }).first().click();
  await expect(page.getByTestId("kpi-cost")).toContainText("$");
  await expect(page.getByTestId("kpi-cost")).toContainText("Estimado");
});

test("missions list real lifecycle missions with filters", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Missões/ }).first().click();
  const table = page.getByTestId("missions-table");
  await expect(table).toBeVisible();
  await page.getByLabel("Status").selectOption({ label: "Concluída" });
  await expect(table.locator("tbody tr").first()).toContainText("Concluída");
});

test("history opens a session timeline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Crônicas|Histórico/ }).first().click();
  await page.getByTestId("sessions-table").locator("tbody tr").first().click();
  await expect(page.getByRole("heading", { name: "Linha do tempo" })).toBeVisible();
  await expect(page.locator(".timeline li").first()).toBeVisible();
});

test("demo mode refuses to touch Claude Code settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Configurações/ }).first().click();
  await page.getByRole("tab", { name: "Claude Code" }).click();
  await page.getByRole("button", { name: /Instalar integração|Verificar \/ reparar/ }).click();
  await expect(page.getByText("não está disponível no modo demonstração")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("character customization persists per specialty", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Tripulação|Personagens/ }).first().click();
  const card = page.locator("section", { hasText: "Testador" }).first();
  await card.getByLabel("Classe").selectOption({ label: "Sentinela de Osso" });
  await expect(card).toContainText("Sentinela de Osso");
});

test("overlay page renders the crew strip", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 160 });
  await page.goto("/overlay.html");
  await expect(page.locator(".overlay-root canvas")).toBeVisible();
  // Only working agents appear on the desktop, over a transparent background.
  await expect(page.locator(".overlay-root")).not.toHaveAttribute("data-crew", "0", { timeout: 10_000 });
  await expect(page.locator(".overlay-root")).toHaveAttribute("data-crew", /\d+/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
});

test("grimoire edits, saves and links the global and project instructions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Grimório/ }).first().click();
  await expect(page.getByRole("heading", { name: "Grimório" })).toBeVisible();
  const editor = page.getByLabel("Instruções de Global");
  await expect(editor).toHaveValue(/Regras globais/);
  const save = page.getByRole("button", { name: "Salvar" });
  await expect(save).toBeDisabled();
  await editor.fill("# Regras globais\n\nNunca escrever comentários.\n");
  await save.click();
  await expect(page.getByRole("status")).toContainText("Global salvo.");
  await page.getByRole("button", { name: "Vincular", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("vinculado em ~/.claude/CLAUDE.md");

  await page.locator(".grimoire-item", { hasText: "loja-online" }).click();
  const project = page.getByLabel("Instruções de loja-online");
  await expect(project).toHaveValue("");
  await project.fill("# Loja\n");
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.locator(".grimoire-item", { hasText: "Global" }).click();
  await expect(page.getByLabel("Instruções de Global")).toHaveValue(/Nunca escrever comentários/);
});
