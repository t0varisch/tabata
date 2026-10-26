// Жест «Назад» во время тренировки спрашивает «Закончить тренировку?», а выход не запускает тренировку заново.
// Запуск: npx vite preview --port 4180, затем BASE=http://localhost:4180/ node scripts/e2e-back.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:4180/";
const fail = (m) => {
	console.error(`ПРОВАЛ: ${m}`);
	process.exitCode = 1;
};

const browser = await chromium.launch({ channel: process.env.CHANNEL ?? "msedge" });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto(BASE);
await page.getByRole("heading", { name: "Табата" }).waitFor();

const dialogs = [];
let answer = false;
page.on("dialog", (d) => {
	dialogs.push(d.message());
	void (answer ? d.accept() : d.dismiss());
});

// Старт с главной, «Назад» → отказ → тренировка идёт
await page.getByRole("link", { name: "Старт" }).click();
await page.locator(".run").waitFor();
await page.waitForTimeout(1200);
await page.goBack();
await page.waitForTimeout(400);
if (dialogs.at(-1) !== "Закончить тренировку?") fail(`вопроса не было: ${JSON.stringify(dialogs)}`);
if (!(await page.locator(".run").isVisible())) fail("после отказа экран тренировки закрылся");
const t1 = await page.locator(".run-time").textContent();
await page.waitForTimeout(1500);
const t2 = await page.locator(".run-time").textContent();
if (t1 === t2) fail(`после отказа таймер стоит: ${t1}`);

// «Назад» ещё раз → согласие → главная, вопрос один
answer = true;
const before = dialogs.length;
await page.goBack();
await page.getByRole("heading", { name: "Табата" }).waitFor({ timeout: 3000 });
if (dialogs.length - before !== 1) fail(`вопросов при выходе: ${dialogs.length - before}`);

// С главной «Назад» не возвращает в тренировку
await page.waitForTimeout(300);
if (await page.locator(".run").isVisible()) fail("тренировка открылась снова");

// «Стоп» → согласие → главная; затем «Вперёд» браузера не запускает тренировку из защитной записи молча
await page.getByRole("link", { name: "Старт" }).click();
await page.locator(".run").waitFor();
await page.getByRole("button", { name: "Стоп" }).click();
await page.getByRole("heading", { name: "Табата" }).waitFor({ timeout: 3000 });
console.log(`вопросы: ${JSON.stringify(dialogs)}`);
await browser.close();
console.log(process.exitCode ? "назад: ЕСТЬ ПРОВАЛЫ" : "назад: ПРОЙДЕНО");
