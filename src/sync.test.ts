import { describe, expect, it, vi } from "vitest";
import type { Settings } from "./settings";
import type { StoredWorkout, StoreApi } from "./store";
import { applyServer, syncNow } from "./sync";
import type { Workout } from "./types";

const w = (id: string, updatedAt: number, p: Partial<Workout> = {}): Workout => ({ id, name: id, prep: 5, finalRest: false, blocks: [], updatedAt, ...p });
const rec = (id: string, updatedAt: number, dirty: boolean, p: Partial<Workout> = {}): StoredWorkout => ({ ...w(id, updatedAt, p), dirty });

function memStore(records: StoredWorkout[], images: Record<string, Blob> = {}): StoreApi & { records: StoredWorkout[]; images: Record<string, Blob> } {
	const s = {
		records,
		images,
		allRecords: async () => s.records.map((r) => ({ ...r })),
		updateAll: async (fn: (l: StoredWorkout[]) => StoredWorkout[]) => {
			s.records = fn(s.records.map((r) => ({ ...r })));
		},
		getImage: async (sha: string) => s.images[sha],
		putImage: async (sha: string, b: Blob) => {
			s.images[sha] = b;
		},
	};
	return s;
}

function memSettings(p: Partial<Settings> = {}) {
	let s: Settings = { key: "k", server: "https://srv/tabata", vibrate: false, quick: { work: 30, rest: 30, sets: 8, prep: 5 }, lastSync: null, lastError: null, ...p };
	return { load: () => s, save: (q: Partial<Settings>) => (s = { ...s, ...q }) };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("applyServer", () => {
	it("серверная новее заменяет локальную чистую", () => {
		const out = applyServer([rec("a", 1000, false, { name: "старое" })], new Map(), [w("a", 2000, { name: "новое" })]);
		expect(out).toEqual([{ ...w("a", 2000, { name: "новое" }), dirty: false }]);
	});

	it("правка во время синхронизации остаётся неотправленной", () => {
		const out = applyServer([rec("a", 2000, true, { name: "правка" })], new Map([["a", 1500]]), [w("a", 1500)]);
		expect(out[0]).toMatchObject({ name: "правка", dirty: true, updatedAt: 2000 });
	});

	it("отправленная правка становится чистой", () => {
		const out = applyServer([rec("a", 1500, true)], new Map([["a", 1500]]), [w("a", 1500)]);
		expect(out[0].dirty).toBe(false);
	});

	it("удалённая на сервере помечается удалённой", () => {
		const out = applyServer([rec("a", 1000, false)], new Map(), [w("a", 3000, { deleted: true })]);
		expect(out[0]).toMatchObject({ deleted: true, dirty: false });
	});

	it("локальная, которой нет на сервере, уйдёт при следующей синхронизации", () => {
		const out = applyServer([rec("x", 1000, false)], new Map(), []);
		expect(out[0]).toMatchObject({ id: "x", dirty: true });
	});
});

describe("syncNow", () => {
	it("без ключа не ходит в сеть", async () => {
		const f = vi.fn();
		expect(await syncNow({ fetch: f, store: memStore([]), settings: memSettings({ key: "" }) })).toBe("badkey");
		expect(f).not.toHaveBeenCalled();
	});

	it("неверный ключ: badkey, понятная ошибка, локальные данные целы", async () => {
		const store = memStore([rec("a", 1000, true)]);
		const settings = memSettings();
		const r = await syncNow({ fetch: async () => json({ detail: "bad key" }, 401), store, settings });
		expect(r).toBe("badkey");
		expect(settings.load().lastError).toBe("Неверный ключ");
		expect(store.records).toEqual([rec("a", 1000, true)]);
	});

	it("нет сети: offline", async () => {
		const settings = memSettings();
		const r = await syncNow({ fetch: async () => { throw new TypeError("Failed to fetch"); }, store: memStore([]), settings });
		expect(r).toBe("offline");
		expect(settings.load().lastError).toBe("Нет сети");
	});

	it("отправляет только неотправленные и с ключом", async () => {
		const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ workouts: [w("a", 1000), w("b", 1000)], missingImages: [] }));
		await syncNow({ fetch: f as unknown as typeof fetch, store: memStore([rec("a", 1000, true), rec("b", 1000, false)]), settings: memSettings() });
		const [url, init] = f.mock.calls[0];
		expect(url).toBe("https://srv/tabata/sync");
		expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer k");
		const sent = JSON.parse(init!.body as string);
		expect(sent.workouts.map((x: Workout) => x.id)).toEqual(["a"]);
		expect(sent.workouts[0]).not.toHaveProperty("dirty");
	});

	it("догружает картинки, которых нет на сервере, и скачивает недостающие у себя", async () => {
		const mine = new Blob(["mine"], { type: "image/webp" });
		const store = memStore([rec("a", 1000, true)], { s1: mine });
		const calls: string[] = [];
		const f = async (url: string, init?: RequestInit) => {
			calls.push(`${init?.method ?? "GET"} ${url}`);
			if (url.endsWith("/sync")) {
				const blocks = [
					{ id: "1", name: "", image: "s1", sets: 1, work: 30, rest: 0 },
					{ id: "2", name: "", image: "s2", sets: 1, work: 30, rest: 0 },
				];
				return json({ workouts: [w("a", 1000, { blocks })], missingImages: ["s1"] });
			}
			if (url.endsWith("/images/s2")) return new Response(new Blob(["theirs"], { type: "image/gif" }));
			return new Response(null, { status: 204 });
		};
		const settings = memSettings();
		expect(await syncNow({ fetch: f as typeof fetch, store, settings })).toBe("ok");
		expect(calls).toContain("PUT https://srv/tabata/images/s1");
		expect(calls).toContain("GET https://srv/tabata/images/s2");
		expect(store.images.s2).toBeDefined();
		expect(settings.load().lastSync).not.toBeNull();
		expect(settings.load().lastError).toBeNull();
	});

	it("битый ответ сервера: error, а следующая синхронизация снова работает", async () => {
		const settings = memSettings();
		const store = memStore([rec("a", 1000, true)]);
		const broken = async () => new Response("{обрыв", { status: 200 });
		expect(await syncNow({ fetch: broken as typeof fetch, store, settings })).toBe("error");
		expect(settings.load().lastError).toBe("Сбой синхронизации");
		const ok = async () => json({ workouts: [w("a", 1000)], missingImages: [] });
		expect(await syncNow({ fetch: ok as typeof fetch, store, settings })).toBe("ok");
	});

	it("запрос к серверу ограничен по времени", async () => {
		const f = vi.fn(async (_u: string, _i?: RequestInit) => json({ workouts: [], missingImages: [] }));
		await syncNow({ fetch: f as unknown as typeof fetch, store: memStore([]), settings: memSettings() });
		expect(f.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
	});
});
