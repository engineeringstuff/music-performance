import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a player can start and pause a performance", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find your note." })).toBeVisible();

  await page.getByRole("button", { name: "Enter the stage" }).click();
  await page.getByLabel("Player name").fill("Playwright");
  await page.getByRole("button", { name: /Vocals/ }).click();
  await page.getByRole("button", { name: /Twinkle, Twinkle, Little Star/ }).click();
  await page.getByRole("button", { name: "Continue to stage" }).click();

  await expect(page.getByRole("heading", { name: "Twinkle, Twinkle, Little Star" })).toBeVisible();
  await page.getByRole("button", { name: "Start performance" }).click();
  await expect(page.getByText("PERFORMING")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("dialog")).toContainText("Paused");
  await page.getByRole("dialog").getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.evaluate(() => {
    window.location.hash = "#/settings";
  });
  await page.waitForTimeout(250);
  await expect(page.getByText("PERFORMING")).toBeVisible();

  await page.getByRole("button", { name: "Forfeit & exit" }).click();
  await expect(page.getByRole("dialog")).toContainText("Forfeit this run?");
  await page.getByRole("dialog").getByRole("button", { name: "Forfeit & exit" }).click();
  await expect(page.getByRole("heading", { name: "Set up your performance" })).toBeVisible();
});

test("privacy and local history are directly addressable", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: "Privacy & sound" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear local data" })).toBeVisible();

  await page.goto("/#/history");
  await expect(page.getByRole("heading", { name: "Your performances" })).toBeVisible();
});

test("clearing local data removes the profile and local results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the stage" }).click();
  await page.getByLabel("Player name").fill("Clear Me");
  await page.getByRole("button", { name: /Vocals/ }).click();
  await page.getByRole("button", { name: /Twinkle, Twinkle, Little Star/ }).click();
  await page.getByRole("button", { name: "Continue to stage" }).click();

  await page.evaluate(async () => {
    const modulePath = "/src/client/lib/results.ts";
    const results = await import(/* @vite-ignore */ modulePath);
    await results.saveResult({
      id: "clear-test",
      trackId: "twinkle",
      trackTitle: "Twinkle, Twinkle, Little Star",
      instrumentId: "vocals",
      playerName: "Clear Me",
      transposeSemitones: 0,
      keyTransposeSemitones: 0,
      octaveShiftSemitones: 0,
      guideEnabled: false,
      totalPoints: 100,
      maxPoints: 100,
      accuracy: 1,
      notesHit: 1,
      notesMissed: 0,
      longestStreak: 1,
      meanPitchQuality: 1,
      meanTimingQuality: 1,
      meanCoverage: 1,
      notes: [],
      completedAt: new Date().toISOString(),
    });
  });

  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Clear local data" }).click();
  await page.getByRole("button", { name: "Remove everything" }).click();
  await expect(page.getByRole("heading", { name: "Find your note." })).toBeVisible();

  const remainingResults = await page.evaluate(async () => {
    const modulePath = "/src/client/lib/results.ts";
    const results = await import(/* @vite-ignore */ modulePath);
    return results.countResults();
  });
  expect(remainingResults).toBe(0);

  await page.getByRole("button", { name: "Enter the stage" }).click();
  await expect(page.getByLabel("Player name")).toHaveValue("");
});

test("mobile landscape does not overflow horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  for (const path of ["/", "/#/setup", "/#/settings"]) {
    await page.goto(path);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows, path).toBe(false);
  }
});

test("a MIDI keyboard can start a performance", async ({ page }) => {
  await page.addInitScript(() => {
    const input = { name: "Fake MIDI", onmidimessage: null };
    (window as unknown as { __midiInput: typeof input }).__midiInput = input;
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: async () => ({ inputs: new Map([["fake", input]]) }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Enter the stage" }).click();
  await page.getByLabel("Player name").fill("MIDI Player");
  await page.getByRole("button", { name: "MIDI keyboard" }).click();
  await page.getByRole("button", { name: /Vocals/ }).click();
  await page.getByRole("button", { name: /Twinkle, Twinkle, Little Star/ }).click();
  await page.getByRole("button", { name: "Continue to stage" }).click();
  await page.getByRole("button", { name: "Start performance" }).click();
  await expect(page.getByText("PERFORMING")).toBeVisible({ timeout: 15_000 });

  await page.evaluate(() => {
    (
      window as unknown as { __midiInput: { onmidimessage: ((e: unknown) => void) | null } }
    ).__midiInput.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) });
  });
  await page.waitForTimeout(900);
  const scorePanel = await page.locator("aside").textContent();
  expect(scorePanel).toMatch(/Score\s*[1-9]\d*/i);

  await page.getByRole("button", { name: "Forfeit & exit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Forfeit & exit" }).click();
});

test("practice mode runs without a microphone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the stage" }).click();
  await page.getByLabel("Player name").fill("Practiser");
  await page.getByRole("button", { name: /Vocals/ }).click();
  await page.getByRole("button", { name: /Twinkle, Twinkle, Little Star/ }).click();
  await page.getByRole("button", { name: "Continue to stage" }).click();
  await page.getByRole("button", { name: "Practice without scoring" }).click();
  await expect(page.getByText("Practice · no score")).toBeVisible();
  await page.getByLabel("Loop").check();
  await page.getByLabel("Metronome").check();
  await page.locator("select").selectOption("0.75");
  await page.getByRole("button", { name: "Play practice" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Back to stage" }).click();
  await expect(page.getByRole("button", { name: "Start performance" })).toBeVisible();
});

test("selecting a pre-rendered key loads the matching backing stem", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the stage" }).click();
  await page.getByLabel("Player name").fill("Transposer");
  await page.getByRole("button", { name: /Vocals/ }).click();
  await page.getByRole("button", { name: /Twinkle, Twinkle, Little Star/ }).click();
  const request = page.waitForRequest((candidate) =>
    candidate.url().includes("twinkle.backing.t2.mp3"),
  );
  await page.getByRole("button", { name: "+2 semitones" }).click();
  await request;
  await page.getByRole("button", { name: "Continue to stage" }).click();
  await page.getByRole("button", { name: "Start performance" }).click();
  await expect(page.getByText("PERFORMING")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("D4", { exact: true }).first()).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Forfeit & exit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Forfeit & exit" }).click();
});

test("a completed run reaches results, saves and appears in history", async ({ page }) => {
  test.setTimeout(70_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the stage" }).click();
  await page.getByLabel("Player name").fill("Finisher");
  await page.getByRole("button", { name: /Vocals/ }).click();
  await page.getByRole("button", { name: /Twinkle, Twinkle, Little Star/ }).click();
  await page.getByRole("button", { name: "Continue to stage" }).click();
  await page.getByRole("button", { name: "Start performance" }).click();

  await expect(page.getByRole("heading", { name: "Encore!" })).toBeVisible({ timeout: 50_000 });
  await expect(page.getByText("Saved in this browser.")).toBeVisible({ timeout: 10_000 });

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Your performances" })).toBeVisible();
  await expect(page.getByText("Twinkle, Twinkle, Little Star").first()).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Encore!" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Encore!" })).toBeVisible();
  await expect(page.getByText("Saved in this browser.")).toBeVisible();
});
