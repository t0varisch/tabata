import { describe, expect, it } from "vitest";
import type { Block } from "../types";
import { blockLabel, buildPhases, totalSeconds } from "./phases";

const block = (p: Partial<Block>): Block => ({ id: "b", name: "", image: null, sets: 1, work: 30, rest: 30, ...p });
const romanWorkout = {
	prep: 5,
	finalRest: false,
	blocks: [block({ id: "g", name: "Гантели", sets: 4, work: 30, rest: 30 }), block({ id: "k", name: "Канат", sets: 3, work: 60, rest: 60 })],
};

describe("buildPhases", () => {
	it("разворачивает тренировку Романа в 14 фаз без финального отдыха", () => {
		const phases = buildPhases(romanWorkout);
		expect(phases).toHaveLength(14);
		expect(phases[0]).toMatchObject({ kind: "prep", duration: 5, label: "Приготовься", next: "Гантели" });
		expect(phases[13]).toMatchObject({ kind: "work", duration: 60, label: "Канат", block: 2, blocks: 2, set: 3, sets: 3 });
		expect(totalSeconds(phases)).toBe(545);
	});

	it("с финальным отдыхом заканчивается отдыхом", () => {
		const phases = buildPhases({ ...romanWorkout, finalRest: true });
		expect(phases).toHaveLength(15);
		expect(phases[14].kind).toBe("rest");
		expect(phases[14].next).toBeNull();
	});

	it("пропускает отдых 0 и подготовку 0", () => {
		const phases = buildPhases({ prep: 0, finalRest: true, blocks: [block({ sets: 3, rest: 0 })] });
		expect(phases.map((p) => p.kind)).toEqual(["work", "work", "work"]);
	});

	it("после последнего сета гантелей отдых показывает следующее упражнение", () => {
		const phases = buildPhases(romanWorkout);
		const lastDumbbellRest = phases[8];
		expect(lastDumbbellRest).toMatchObject({ kind: "rest", label: "Отдых", next: "Канат", block: 1, set: 4 });
		expect(phases[2]).toMatchObject({ kind: "rest", next: "Гантели" });
	});

	it("пустая тренировка и блок без сетов дают пустой список", () => {
		expect(buildPhases({ prep: 5, finalRest: false, blocks: [] })).toEqual([]);
		expect(buildPhases({ prep: 5, finalRest: false, blocks: [block({ sets: 0 })] })).toEqual([]);
	});

	it("берёт картинку блока в фазы работы", () => {
		const phases = buildPhases({ prep: 0, finalRest: false, blocks: [block({ image: "abc", sets: 1 })] });
		expect(phases[0].image).toBe("abc");
	});
});

describe("blockLabel", () => {
	it("без имени — Работа N, имя обрезается", () => {
		expect(blockLabel(block({ name: "" }), 1)).toBe("Работа 2");
		expect(blockLabel(block({ name: "   " }), 0)).toBe("Работа 1");
		expect(blockLabel(block({ name: "  Канат " }), 0)).toBe("Канат");
	});
});
