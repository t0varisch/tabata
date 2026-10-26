// Работает ли приложение без сети после первого открытия (зал без интернета).
// Запуск: npx vite preview, затем node scripts/offline-check.mjs  (BASE=, CHANNEL=)
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:4173/";
const browser = await chromium.launch({ channel: process.env.CHANNEL ?? "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto(BASE);
await page.evaluate(async () => {
	await navigator.serviceWorker.ready;
});
await page.getByRole("button", { name: "Новая тренировка" }).click();
await page.getByRole("textbox", { name: "Название тренировки" }).fill("Офлайн");
await page.waitForTimeout(600);
await page.goto(BASE);
await page.getByText("Офлайн").waitFor();

await context.setOffline(true);
await page.reload();
let ok = true;
try {
	await page.getByRole("heading", { name: "Табата" }).waitFor({ timeout: 5000 });
	await page.getByText("Офлайн").waitFor({ timeout: 5000 });
} catch {
	ok = false;
}
await browser.close();
console.log(ok ? "офлайн: ПРОЙДЕНО — приложение и тренировки открываются без сети" : "офлайн: ПРОВАЛ");
if (!ok) process.exitCode = 1;
