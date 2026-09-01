import { expect, test } from "@playwright/test";

test("manifest, controlled worker, offline reload, and browser-page restart", async ({ context, page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(2);

  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "Rock Frost is offline" })).toBeVisible();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    registration.waiting?.postMessage({ type: "ACTIVATE_UPDATE" });
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Rock Frost is offline" })).toBeVisible();

  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/offline");
  await expect(reopened.getByRole("heading", { name: "Rock Frost is offline" })).toBeVisible();
  await context.setOffline(false);
});
