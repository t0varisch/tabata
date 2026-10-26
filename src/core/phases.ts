import type { Block, Phase, Workout } from "../types";

export function blockLabel(b: Block, index: number): string {
	return b.name.trim() || `Работа ${index + 1}`;
}

// Тренировка → плоская лента фаз: подготовка, затем работа/отдых по сетам всех блоков подряд.
// Фазы нулевой длины выкидываются; последний отдых — только если включён финальный отдых.
export function buildPhases(w: Pick<Workout, "prep" | "finalRest" | "blocks">): Phase[] {
	const blocks = w.blocks.filter((b) => b.sets > 0 && b.work > 0);
	if (blocks.length === 0) return [];
	const works: Phase[] = [];
	blocks.forEach((b, i) => {
		for (let set = 1; set <= b.sets; set++) {
			works.push({ kind: "work", duration: b.work, label: blockLabel(b, i), next: null, image: b.image, block: i + 1, blocks: blocks.length, set, sets: b.sets });
		}
	});
	const phases: Phase[] = [];
	if (w.prep > 0) phases.push({ ...works[0], kind: "prep", duration: w.prep, label: "Приготовься", next: works[0].label, image: null });
	works.forEach((work, i) => {
		phases.push(work);
		const isLast = i === works.length - 1;
		const rest = blocks[work.block - 1].rest;
		if (rest > 0 && (!isLast || w.finalRest)) {
			phases.push({ ...work, kind: "rest", duration: rest, label: "Отдых", next: isLast ? null : works[i + 1].label, image: null });
		}
	});
	return phases;
}

export function totalSeconds(phases: Phase[]): number {
	return phases.reduce((sum, p) => sum + p.duration, 0);
}
