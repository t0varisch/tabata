import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { allRecords, deleteWorkout, getWorkout, listWorkouts, saveWorkout } from "./store";
import type { Workout } from "./types";

const w = (id: string, name: string): Workout => ({ id, name, prep: 5, finalRest: false, blocks: [], updatedAt: 0 });

describe("store", () => {
	it("сохраняет с отметкой времени и пометкой «не отправлено», удаление — пометкой", async () => {
		await saveWorkout(w("b", "Вечер"));
		await saveWorkout(w("a", "Утро"));
		expect((await listWorkouts()).map((x) => x.name)).toEqual(["Вечер", "Утро"]);
		const saved = await getWorkout("a");
		expect(saved!.updatedAt).toBeGreaterThan(0);
		await deleteWorkout("b");
		expect((await listWorkouts()).map((x) => x.id)).toEqual(["a"]);
		const all = await allRecords();
		expect(all.find((r) => r.id === "b")).toMatchObject({ deleted: true, dirty: true });
	});
});
