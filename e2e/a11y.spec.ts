import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("welcome, setup, settings and history have no serious axe violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const screens = [
    ["/", "Find your note."],
    ["/#/setup", "Set up your performance"],
    ["/#/settings", "Privacy & sound"],
    ["/#/history", "Your performances"],
  ] as const;
  for (const [path, heading] of screens) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(serious, `${path}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
  }

  await page.goto("/#/setup");
  await page.getByLabel("Player name").fill("Axe Player");
  await page.getByRole("button", { name: /Vocals/ }).click();
  await page.getByRole("button", { name: /Twinkle, Twinkle, Little Star/ }).click();
  await page.getByRole("button", { name: "Continue to stage" }).click();
  await expect(page.getByRole("button", { name: "Start performance" })).toBeVisible();

  const ready = await new AxeBuilder({ page }).analyze();
  expect(
    ready.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);

  await page.getByRole("button", { name: "Practice without scoring" }).click();
  const practice = await new AxeBuilder({ page }).analyze();
  expect(
    practice.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);

  await page.getByRole("button", { name: "Back to stage" }).click();
  await page.getByRole("button", { name: "Start performance" }).click();
  await expect(page.getByText("PERFORMING")).toBeVisible({ timeout: 15_000 });
  const game = await new AxeBuilder({ page }).analyze();
  expect(
    game.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);

  await page.getByRole("button", { name: "Forfeit & exit" }).click();
  const dialog = await new AxeBuilder({ page }).analyze();
  expect(
    dialog.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});
