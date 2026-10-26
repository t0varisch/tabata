import { openDB, type IDBPDatabase } from "idb";
import type { Workout } from "./types";

// Тренировка в базе + пометка «не отправлено на сервер»
export type StoredWorkout = Workout & { dirty: boolean };

export type StoreApi = {
	allRecords(): Promise<StoredWorkout[]>;
	updateAll(fn: (local: StoredWorkout[]) => StoredWorkout[]): Promise<void>;
	getImage(sha: string): Promise<Blob | undefined>;
	putImage(sha: string, blob: Blob): Promise<void>;
};

let dbp: Promise<IDBPDatabase> | null = null;
const listeners = new Set<() => void>();

function db(): Promise<IDBPDatabase> {
	dbp ??= openDB("tabata", 1, {
		upgrade(d) {
			d.createObjectStore("workouts", { keyPath: "id" });
			d.createObjectStore("images");
		},
	});
	return dbp;
}

function changed(): void {
	for (const cb of listeners) cb();
}

export function onStoreChange(cb: () => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export async function allRecords(): Promise<StoredWorkout[]> {
	return (await db()).getAll("workouts");
}

export async function listWorkouts(): Promise<Workout[]> {
	const all = await allRecords();
	return all.filter((w) => !w.deleted).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export async function getWorkout(id: string): Promise<Workout | undefined> {
	const w: StoredWorkout | undefined = await (await db()).get("workouts", id);
	return w && !w.deleted ? w : undefined;
}

// Время правки строго растёт, даже если часы устройства стоят на месте
function stamp(prev: number): number {
	return Math.max(Date.now(), prev + 1);
}

export async function saveWorkout(w: Workout): Promise<void> {
	await (await db()).put("workouts", { ...w, updatedAt: stamp(w.updatedAt), dirty: true });
	changed();
}

export async function deleteWorkout(id: string): Promise<void> {
	const d = await db();
	const w: StoredWorkout | undefined = await d.get("workouts", id);
	if (!w) return;
	await d.put("workouts", { ...w, deleted: true, updatedAt: stamp(w.updatedAt), dirty: true });
	changed();
}

// Чтение и запись в одной транзакции: правка, сделанная во время синхронизации, не затрётся
export async function updateAll(fn: (local: StoredWorkout[]) => StoredWorkout[]): Promise<void> {
	const tx = (await db()).transaction("workouts", "readwrite");
	const next = fn(await tx.store.getAll());
	await tx.store.clear();
	for (const r of next) await tx.store.put(r);
	await tx.done;
	changed();
}

export async function getImage(sha: string): Promise<Blob | undefined> {
	return (await db()).get("images", sha);
}

export async function putImage(sha: string, blob: Blob): Promise<void> {
	await (await db()).put("images", blob, sha);
}
