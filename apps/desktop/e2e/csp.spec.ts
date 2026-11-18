import { expect, test } from "@playwright/test";

// Same bundle the desktop app ships, under the same CSP as the webview. Catches
// assets or libraries that only fail with the strict policy (e.g. fetch of
// manifest.json, Pixi needing eval).
const BASE = "http://localhost:1422";

test("production bundle runs under the app CSP", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.goto(`${BASE}/`);
  await expect(page.locator(".castle-canvas-host canvas")).toBeVisible();
  await expect(page.locator(".castle-side").getByText("Guardiã da Lanterna").first()).toBeVisible({ timeout: 10_000 });
  await page.goto(`${BASE}/overlay.html`);
  const root = page.locator(".overlay-root");
  await expect(root).toHaveAttribute("data-roamers", /\S/, { timeout: 10_000 });
  const agent = ((await root.getAttribute("data-roamers")) ?? "").split(" ")[0]!;
  await page.goto(`${BASE}/overlay.html?agent=${encodeURIComponent(agent)}`);
  // Only working agents appear on the desktop, over a transparent background.
  await expect(page.locator(".overlay-root")).toHaveAttribute("data-crew", "1", { timeout: 10_000 });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect(problems).toEqual([]);
});
