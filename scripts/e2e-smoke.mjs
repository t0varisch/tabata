// Сквозная проверка: тренировка создаётся, сохраняется, проходит все фазы; вбок ничего не уезжает.
// Запуск: npx vite preview (порт 4173), затем node scripts/e2e-smoke.mjs
// BASE=адрес (по умолчанию http://localhost:4173/), SIZES=390x844,320x640, CHANNEL=msedge|chrome
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:4173/";
const SIZES = (process.env.SIZES ?? "390x844,320x640").split(",").map((s) => s.split("x").map(Number));
const OUT = "test-output";
mkdirSync(OUT, { recursive: true });

const fail = (msg) => {
	console.error(`ПРОВАЛ: ${msg}`);
	process.exitCode = 1;
};

async function noSideScroll(page, where) {
	const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	if (over > 0) fail(`${where}: прокрутка вбок на ${over} px`);
}

async function setStepper(page, label, value, nth = 0) {
	await page.getByRole("button", { name: `${label}: изменить` }).nth(nth).click();
	await page.keyboard.press("Control+A");
	await page.keyboard.type(value);
	await page.keyboard.press("Enter");
}

const browser = await chromium.launch({ channel: process.env.CHANNEL ?? "msedge" });
for (const [width, height] of SIZES) {
	const tag = `${width}`;
	const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true });
	const page = await context.newPage();
	page.on("pageerror", (e) => fail(`${tag}: ошибка на странице: ${e.message}`));
	await page.goto(BASE);
	await page.getByRole("heading", { name: "Табата" }).waitFor();
	await noSideScroll(page, `${tag} главная`);
	if (await page.locator(".sync-dot").isVisible()) fail(`${tag}: точка синхронизации видна без ключа`);
	await page.screenshot({ path: `${OUT}/home-${tag}.png`, fullPage: true });

	// Новая тренировка: подготовка 1 с, блок 1 — 2 × (5 с / 1 с), блок 2 — 1 × 5 с
	await page.getByRole("button", { name: "Новая тренировка" }).click();
	await page.getByRole("textbox", { name: "Название тренировки" }).waitFor();
	await page.getByRole("textbox", { name: "Название тренировки" }).fill("Проверка");
	await setStepper(page, "Подготовка", "1");
	await setStepper(page, "Сеты", "2");
	await setStepper(page, "Работа", "5");
	await setStepper(page, "Отдых", "1");
	await page.getByRole("button", { name: "Блок", exact: true }).click();
	await setStepper(page, "Сеты", "1", 1);
	await setStepper(page, "Работа", "5", 1);
	await page.getByRole("textbox", { name: "Название блока 2" }).fill("Канат");
	await noSideScroll(page, `${tag} редактор`);
	await page.screenshot({ path: `${OUT}/editor-${tag}.png`, fullPage: true });
	const total = await page.locator(".footer-bar .total").textContent();
	// 1 + 5 + 1 + 5 + 1 + 5 = 18
	if (total !== "Всего 0:18") fail(`${tag}: в редакторе «${total}», ждали «Всего 0:18»`);

	// Сохранение переживает перезагрузку
	await page.waitForTimeout(600);
	await page.reload();
	await page.getByRole("textbox", { name: "Название блока 2" }).waitFor();
	if ((await page.getByRole("textbox", { name: "Название блока 2" }).inputValue()) !== "Канат") fail(`${tag}: после перезагрузки название блока потерялось`);

	await page.locator(".footer-bar .start").click();
	const seen = [];
	const started = Date.now();
	let shot = false;
	while (Date.now() - started < 25_000) {
		const label = (await page.locator(".run-label").textContent())?.trim();
		if (label && seen.at(-1) !== label) seen.push(label);
		if (!shot && label === "Работа 1") {
			await noSideScroll(page, `${tag} тренировка`);
			await page.screenshot({ path: `${OUT}/run-${tag}.png` });
			shot = true;
		}
		if (label === "Отдых" && seen.length === 3) {
			const nextText = await page.locator(".run-next").textContent();
			if (nextText !== "Дальше: Работа 1") fail(`${tag}: на отдыхе «${nextText}»`);
		}
		if (label === "Готово") break;
		await page.waitForTimeout(150);
	}
	await page.screenshot({ path: `${OUT}/done-${tag}.png` });
	const want = ["Приготовься", "Работа 1", "Отдых", "Работа 1", "Отдых", "Канат", "Готово"];
	if (JSON.stringify(seen) !== JSON.stringify(want)) fail(`${tag}: фазы ${JSON.stringify(seen)}, ждали ${JSON.stringify(want)}`);
	else console.log(`${tag}: фазы по порядку, ${((Date.now() - started) / 1000).toFixed(1)} с`);
	await context.close();
}
await browser.close();
console.log(process.exitCode ? "e2e: ЕСТЬ ПРОВАЛЫ" : "e2e: ПРОЙДЕНО");
