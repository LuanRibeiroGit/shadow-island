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

test("overlay opens one small window per working soul", async ({ page }) => {
  await page.goto("/overlay.html");
  const root = page.locator(".overlay-root");
  await expect(root).toHaveAttribute("data-roamers", /\S/, { timeout: 10_000 });
  await expect(root).toHaveAttribute("data-crew", "0");
  const agent = ((await root.getAttribute("data-roamers")) ?? "").split(" ")[0]!;

  await page.setViewportSize({ width: 160, height: 90 });
  await page.goto(`/overlay.html?agent=${encodeURIComponent(agent)}`);
  await expect(page.locator(".overlay-root canvas")).toBeVisible();
  await expect(page.locator(".overlay-root")).toHaveAttribute("data-crew", "1", { timeout: 10_000 });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  const bubble = page.locator(".bubble");
  await expect(bubble).toHaveCount(1, { timeout: 10_000 });
  const box = await bubble.evaluate((e) => e.getBoundingClientRect());
  expect(box.width).toBeLessThanOrEqual(150);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(160);
});

test("grimoire edits, saves and links the global, category and project instructions", async ({ page }) => {
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

  await expect(page.getByRole("group", { name: "Pessoal" }).locator(".grimoire-item", { hasText: "ilha-das-sombras" })).toBeVisible();
  await page.locator(".grimoire-item", { hasText: "Trabalho" }).click();
  await expect(page.getByLabel("Instruções de Trabalho")).toHaveValue(/Projetos de trabalho/);
  await expect(page.getByRole("button", { name: "Vincular", exact: true })).toHaveCount(0);

  await page.getByRole("group", { name: "Sem categoria" }).locator(".grimoire-item", { hasText: "loja-online" }).click();
  await expect(page.getByLabel("Instruções de loja-online")).toHaveCount(0);
  await page.getByRole("button", { name: "Trabalho", exact: true }).click();
  const project = page.getByLabel("Instruções de loja-online");
  await expect(project).toHaveValue("");
  await project.fill("# Loja\n");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(project).toHaveValue("@~/(demo)/instructions/trabalho/trabalho.md\n# Loja\n");
  await expect(page.getByRole("group", { name: "Trabalho" }).locator(".grimoire-item", { hasText: "loja-online" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Sem categoria" })).toHaveCount(0);
  await page.locator(".grimoire-item", { hasText: "Global" }).click();
  await expect(page.getByLabel("Instruções de Global")).toHaveValue(/Nunca escrever comentários/);
});
