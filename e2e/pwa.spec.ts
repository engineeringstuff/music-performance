import { expect, test } from "@playwright/test";

test("the production PWA boots offline from precached hashed assets", async ({ page, context }) => {
  const rootResponse = await page.request.get("/");
  expect(rootResponse.status()).toBe(200);
  expect(rootResponse.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(rootResponse.headers()["permissions-policy"]).toContain("microphone=(self)");
  expect(rootResponse.headers()["permissions-policy"]).toContain("midi=(self)");
  expect(rootResponse.headers()["strict-transport-security"]).toContain("max-age=");

  const manifest = (await (await page.request.get("/manifest.webmanifest")).json()) as {
    icons: { sizes: string; purpose?: string }[];
  };
  expect(manifest.icons.some((icon) => icon.purpose?.includes("maskable"))).toBe(true);
  expect(manifest.icons.some((icon) => icon.sizes === "192x192")).toBe(true);

  const missing = await page.request.get("/audio/does-not-exist.mp3");
  expect(missing.status()).toBe(404);

  const swSource = await (await page.request.get("/sw.js")).text();
  expect(swSource).toContain('const CACHE_VERSION = "mp-');

  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 15_000,
  });
  const cachedPaths = await page.evaluate(async () => {
    const keys = await caches.keys();
    const key = keys.find((candidate) => candidate.startsWith("mp-"));
    if (!key) {
      return [];
    }
    const cache = await caches.open(key);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths).toContain("/api/tracks");
  expect(cachedPaths.some((path) => path.includes("/assets/"))).toBe(true);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await context.setOffline(true);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Find your note." })).toBeVisible({
    timeout: 10_000,
  });

  // Lazy chunks must also be precached for offline deep links.
  await page.goto("/#/history");
  await expect(page.getByRole("heading", { name: "Your performances" })).toBeVisible({
    timeout: 10_000,
  });

  // The cached catalogue must let Setup work while offline.
  await page.goto("/#/setup");
  await expect(page.getByRole("heading", { name: "Set up your performance" })).toBeVisible({
    timeout: 10_000,
  });
  await context.setOffline(false);
});
