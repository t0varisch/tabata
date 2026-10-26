// Синхронизация двух «устройств» через локальный сервер: тренировка и картинка с телефона появляются на компьютере.
// Запуск: локальный сервер (TABATA_KEY=local-test-key, порт 8090) + npx vite preview --port 4180, затем
// BASE=http://localhost:4180/ SERVER=http://127.0.0.1:8090 node scripts/e2e-sync.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:4180/";
const SERVER = process.env.SERVER ?? "http://127.0.0.1:8090";
const KEY = process.env.KEY ?? "local-test-key";
const fail = (m) => {
	console.error(`ПРОВАЛ: ${m}`);
	process.exitCode = 1;
};

// Картинка 1600×900 — должна уменьшиться до 720 по большей стороне
const PNG = await (async () => {
	const b = await chromium.launch({ channel: process.env.CHANNEL ?? "msedge" });
	const p = await b.newPage();
	const data = await p.evaluate(() => {
		const c = document.createElement("canvas");
		c.width = 1600;
		c.height = 900;
		const g = c.getContext("2d");
		g.fillStyle = "#e53935";
		g.fillRect(0, 0, 1600, 900);
		g.fillStyle = "#fff";
		g.fillRect(400, 200, 800, 500);
		return c.toDataURL("image/png").split(",")[1];
	});
	await b.close();
	return Buffer.from(data, "base64");
})();

const browser = await chromium.launch({ channel: process.env.CHANNEL ?? "msedge" });

async function device(name) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await context.addInitScript(
		([server, key]) => {
			if (!localStorage.getItem("tabata:settings")) localStorage.setItem("tabata:settings", JSON.stringify({ key, server }));
		},
		[SERVER, KEY],
	);
	const page = await context.newPage();
	page.on("pageerror", (e) => fail(`${name}: ${e.message}`));
	await page.goto(BASE);
	return { context, page };
}

// Телефон: создаёт тренировку с картинкой
const phone = await device("телефон");
await phone.page.getByRole("button", { name: "Новая тренировка" }).click();
await phone.page.getByRole("textbox", { name: "Название тренировки" }).fill("Синк-проверка");
await phone.page.getByRole("textbox", { name: "Название блока 1" }).fill("Гантели");
const chooser = phone.page.waitForEvent("filechooser");
await phone.page.getByRole("button", { name: "Картинка" }).click();
await (await chooser).setFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
await phone.page.locator(".thumb img").waitFor();
await phone.page.waitForTimeout(3500); // 300 мс сохранение + 2 с отложенная синхронизация
await phone.page.goto(BASE);
await phone.page.locator('.sync-dot[data-state="ok"]').waitFor({ timeout: 10_000 });

// Сервер: тренировка и картинка на месте
const res = await fetch(`${SERVER}/sync`, {
	method: "POST",
	headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
	body: JSON.stringify({ workouts: [], device: "check" }),
});
const body = await res.json();
const onServer = body.workouts.find((w) => w.name === "Синк-проверка");
if (!onServer) fail("на сервере нет тренировки");
else if (body.missingImages.length) fail(`на сервере нет картинок: ${body.missingImages}`);
else {
	const img = await fetch(`${SERVER}/images/${onServer.blocks[0].image}`, { headers: { Authorization: `Bearer ${KEY}` } });
	const bytes = Buffer.from(await img.arrayBuffer());
	const type = img.headers.get("content-type");
	console.log(`сервер: тренировка есть, картинка ${type}, ${(bytes.length / 1024).toFixed(1)} КБ (исходник ${(PNG.length / 1024).toFixed(1)} КБ)`);
	if (type !== "image/webp" && type !== "image/jpeg") fail(`картинка не сжата: ${type}`);
}

// Компьютер: открывает приложение — тренировка и картинка приезжают
const pc = await device("компьютер");
await pc.page.getByText("Синк-проверка").waitFor({ timeout: 10_000 });
await pc.page.getByRole("link", { name: "Изменить: Синк-проверка" }).click();
await pc.page.locator(".thumb img").waitFor({ timeout: 10_000 });
const w = await pc.page.locator(".thumb img").evaluate((img) => img.naturalWidth);
if (w !== 720) fail(`ширина картинки ${w}, ждали 720`);
console.log("компьютер: тренировка и картинка приехали");

// Компьютер переименовывает — телефон получает правку
await pc.page.getByRole("textbox", { name: "Название тренировки" }).fill("Синк-проверка 2");
await pc.page.waitForTimeout(3500);
await phone.page.reload();
await phone.page.getByText("Синк-проверка 2").waitFor({ timeout: 10_000 });
console.log("телефон: правка с компьютера приехала");

await browser.close();
console.log(process.exitCode ? "синхронизация: ЕСТЬ ПРОВАЛЫ" : "синхронизация: ПРОЙДЕНО");
