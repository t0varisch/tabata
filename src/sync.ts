import { loadSettings, saveSettings, type Settings } from "./settings";
import * as storeModule from "./store";
import type { StoredWorkout, StoreApi } from "./store";
import type { Workout } from "./types";

export type SyncResult = "ok" | "offline" | "badkey" | "error";
export type SyncStatus = SyncResult | "running";

export type SyncDeps = {
	fetch: typeof fetch;
	store: StoreApi;
	settings: { load: () => Settings; save: (p: Partial<Settings>) => Settings };
};

const listeners = new Set<(s: SyncStatus) => void>();
let running: Promise<SyncResult> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function onSyncStatus(cb: (s: SyncStatus) => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function emit(s: SyncStatus): void {
	for (const cb of listeners) cb(s);
}

function defaultDeps(): SyncDeps {
	return { fetch: (input, init) => fetch(input, init), store: storeModule, settings: { load: loadSettings, save: saveSettings } };
}

function device(): string {
	const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
	return /Android/i.test(ua) ? "android" : /iPhone|iPad/i.test(ua) ? "ios" : /Windows/i.test(ua) ? "windows" : "web";
}

function strip({ dirty: _dirty, ...w }: StoredWorkout): Workout {
	return w;
}

// Серверная версия побеждает, кроме правок, которые не ушли в эту синхронизацию
// (сделаны во время неё). Локальная, которой на сервере нет, уйдёт в следующий раз.
export function applyServer(local: StoredWorkout[], sent: Map<string, number>, server: Workout[]): StoredWorkout[] {
	const out = new Map<string, StoredWorkout>(server.map((w) => [w.id, { ...w, dirty: false }]));
	for (const l of local) {
		const s = out.get(l.id);
		const editedSince = l.dirty && (!sent.has(l.id) || l.updatedAt > sent.get(l.id)!);
		if (!s) out.set(l.id, { ...l, dirty: true });
		else if (editedSince && l.updatedAt > s.updatedAt) out.set(l.id, l);
	}
	return [...out.values()];
}

export function syncNow(deps: SyncDeps = defaultDeps()): Promise<SyncResult> {
	if (running) {
		again = true;
		return running;
	}
	emit("running");
	const current = run(deps).finally(() => {
		running = null;
		if (again) {
			again = false;
			void syncNow(deps);
		}
	});
	running = current;
	void current.then(emit);
	return current;
}

async function run(deps: SyncDeps): Promise<SyncResult> {
	const s = deps.settings.load();
	if (!s.key) {
		deps.settings.save({ lastError: "Нет ключа синхронизации" });
		return "badkey";
	}
	const auth = { Authorization: `Bearer ${s.key}` };
	const dirty = (await deps.store.allRecords()).filter((r) => r.dirty);
	const sent = new Map(dirty.map((r) => [r.id, r.updatedAt]));
	let res: Response;
	try {
		res = await deps.fetch(`${s.server}/sync`, {
			method: "POST",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ workouts: dirty.map(strip), device: device() }),
		});
	} catch {
		deps.settings.save({ lastError: "Нет сети" });
		return "offline";
	}
	if (res.status === 401) {
		deps.settings.save({ lastError: "Неверный ключ" });
		return "badkey";
	}
	if (!res.ok) {
		deps.settings.save({ lastError: `Сервер ответил ${res.status}` });
		return "error";
	}
	const body = (await res.json()) as { workouts: Workout[]; missingImages: string[] };
	await deps.store.updateAll((local) => applyServer(local, sent, body.workouts));
	await syncImages(deps, s.server, auth, body);
	deps.settings.save({ lastSync: Date.now(), lastError: null });
	return "ok";
}

// Ошибки картинок не валят синхронизацию: недогруженное уйдёт в следующий раз
async function syncImages(
	deps: SyncDeps,
	server: string,
	auth: Record<string, string>,
	body: { workouts: Workout[]; missingImages: string[] },
): Promise<void> {
	for (const sha of body.missingImages) {
		const blob = await deps.store.getImage(sha);
		if (!blob) continue;
		try {
			await deps.fetch(`${server}/images/${sha}`, { method: "PUT", headers: { ...auth, "Content-Type": blob.type }, body: blob });
		} catch {
			// следующая синхронизация
		}
	}
	const wanted = new Set(body.workouts.filter((w) => !w.deleted).flatMap((w) => w.blocks.flatMap((b) => (b.image ? [b.image] : []))));
	for (const sha of wanted) {
		if (body.missingImages.includes(sha) || (await deps.store.getImage(sha))) continue;
		try {
			const r = await deps.fetch(`${server}/images/${sha}`, { headers: auth });
			if (r.ok) await deps.store.putImage(sha, await r.blob());
		} catch {
			// следующая синхронизация
		}
	}
}

export function scheduleSync(delayMs = 2000): void {
	clearTimeout(timer);
	timer = setTimeout(() => void syncNow(), delayMs);
}
