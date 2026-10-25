import { expect, type Page, test } from "@playwright/test";

async function reachReady(page: Page, options: { midi?: boolean } = {}): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the stage" }).click();
  await page.getByLabel("Player name").fill("Error Test");
  if (options.midi) {
    await page.getByRole("button", { name: "MIDI keyboard" }).click();
  }
  await page.getByRole("button", { name: /Vocals/ }).click();
  await page.getByRole("button", { name: /Twinkle, Twinkle, Little Star/ }).click();
  await page.getByRole("button", { name: "Continue to stage" }).click();
}

test("microphone denial shows a recoverable error", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await reachReady(page);
  await page.getByRole("button", { name: "Start performance" }).click();
  await expect(page.getByRole("heading", { name: "We couldn't start" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Microphone access was denied/)).toBeVisible();
  await page.getByRole("button", { name: "Back to soundcheck" }).click();
  await expect(page.getByRole("heading", { name: "Set up your performance" })).toBeVisible();
});

test("a missing chart surfaces a load error", async ({ page }) => {
  await page.route("**/charts/twinkle.json", (route) =>
    route.fulfill({ status: 404, body: "nope" }),
  );
  await reachReady(page);
  await page.getByRole("button", { name: "Start performance" }).click();
  await expect(page.getByRole("heading", { name: "We couldn't start" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Could not load .*charts\/twinkle\.json/)).toBeVisible();
});

test("MIDI input with no devices shows a clear error", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: async () => ({ inputs: new Map() }),
    });
  });
  await reachReady(page, { midi: true });
  await page.getByRole("button", { name: "Start performance" }).click();
  await expect(page.getByRole("heading", { name: "We couldn't start" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/No MIDI input was found/)).toBeVisible();
});
