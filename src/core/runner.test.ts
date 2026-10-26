import { describe, expect, it } from "vitest";
import type { Block } from "../types";
import { buildPhases } from "./phases";
import { Runner } from "./runner";

const block = (p: Partial<Block>): Block => ({ id: "b", name: "", image: null, sets: 1, work: 30, rest: 30, ...p });
// подготовка 5, гантели 4×30/30, канат 3×60/60 → 14 фаз
const phases = buildPhases({
	prep: 5,
	finalRest: false,
	blocks: [block({ name: "Гантели", sets: 4 }), block({ name: "Канат", sets: 3, work: 60, rest: 60 })],
});

function setup() {
	let t = 1000;
	const seen: number[] = [];
	let doneCalls = 0;
	const r = new Runner(phases, { onPhase: (i) => seen.push(i), onDone: () => doneCalls++ }, () => t);
	return { r, seen, advance: (ms: number) => (t += ms), done: () => doneCalls };
}

describe("Runner", () => {
	it("старт объявляет первую фазу", () => {
		const { r, seen } = setup();
		r.start();
		expect(seen).toEqual([0]);
		expect(r.state()).toMatchObject({ index: 0, remaining: 5, paused: false, done: false });
	});

	it("через 5 с переходит к первой работе", () => {
		const { r, seen, advance } = setup();
		r.start();
		advance(4999);
		expect(r.tick().index).toBe(0);
		advance(1);
		expect(r.tick()).toMatchObject({ index: 1, remaining: 30 });
		expect(seen).toEqual([0, 1]);
	});

	it("после сна на 95 с встаёт на верную фазу и объявляет каждую пройденную", () => {
		const { r, seen, advance } = setup();
		r.start();
		advance(5000);
		r.tick(); // фаза 1 — работа гантелей, началась
		advance(95_000); // 30 работа + 30 отдых + 30 работа = 90, ещё 5 с в отдыхе сета 2
		expect(r.tick()).toMatchObject({ index: 4, remaining: 25 });
		expect(seen).toEqual([0, 1, 2, 3, 4]);
		expect(r.state().elapsedTotal).toBe(100);
	});

	it("пауза не съедает время фазы", () => {
		const { r, advance } = setup();
		r.start();
		advance(2000);
		r.pause();
		advance(10_000);
		expect(r.tick()).toMatchObject({ index: 0, remaining: 3, paused: true });
		r.resume();
		advance(2500);
		expect(r.tick()).toMatchObject({ index: 0, remaining: 1 });
	});

	it("вперёд в последней фазе завершает тренировку один раз", () => {
		const { r, done } = setup();
		r.start();
		for (let i = 0; i < 13; i++) r.next();
		expect(r.state()).toMatchObject({ index: 13, done: false });
		r.next();
		r.next();
		expect(r.state().done).toBe(true);
		expect(done()).toBe(1);
	});

	it("естественный конец вызывает onDone", () => {
		const { r, advance, done } = setup();
		r.start();
		advance(545_000);
		expect(r.tick().done).toBe(true);
		expect(done()).toBe(1);
	});

	it("назад: в начале фазы — на предыдущую, позже — в начало текущей", () => {
		const { r, advance } = setup();
		r.start();
		r.prev();
		expect(r.state()).toMatchObject({ index: 0, remaining: 5 });
		r.next();
		advance(3000);
		r.prev();
		expect(r.state()).toMatchObject({ index: 1, remaining: 30 });
		advance(200);
		r.prev();
		expect(r.state()).toMatchObject({ index: 0, remaining: 5 });
	});

	it("после паузы начало фазы сдвигается на длину паузы", () => {
		const { r, advance } = setup();
		r.start();
		expect(r.startedAt()).toBe(1000);
		advance(2000);
		r.pause();
		advance(10_000);
		r.resume();
		expect(r.startedAt()).toBe(11_000);
	});

	it("перемотка на паузе оставляет паузу и полную длину фазы", () => {
		const { r, advance } = setup();
		r.start();
		r.pause();
		r.next();
		advance(7000);
		expect(r.tick()).toMatchObject({ index: 1, remaining: 30, paused: true });
	});

	it("если монотонные часы стояли во сне, а настоящие шли — догоняет по настоящим", () => {
		let perf = 1000;
		let wall = 5_000_000;
		const seen: number[] = [];
		const r = new Runner(phases, { onPhase: (i) => seen.push(i) }, () => perf, () => wall);
		r.start();
		perf += 5000;
		wall += 5000;
		r.tick();
		wall += 95_000; // телефон спал: performance.now стоял
		expect(r.tick()).toMatchObject({ index: 4, remaining: 25 });
		expect(seen).toEqual([0, 1, 2, 3, 4]);
	});

	it("пауза одинаково сдвигает оба вида часов", () => {
		let perf = 1000;
		let wall = 5_000_000;
		const r = new Runner(phases, {}, () => perf, () => wall);
		r.start();
		perf += 2000;
		wall += 2000;
		r.pause();
		perf += 60_000;
		wall += 60_000;
		r.resume();
		perf += 1000;
		wall += 1000;
		expect(r.tick()).toMatchObject({ index: 0, remaining: 2 });
	});
});
