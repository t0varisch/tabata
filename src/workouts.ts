import { newId } from "./core/ids";
import type { Quick } from "./settings";
import type { Block, Workout } from "./types";

export function newBlock(p: Partial<Block> = {}): Block {
	return { id: newId(), name: "", image: null, sets: 8, work: 30, rest: 30, ...p };
}

export function newWorkout(name: string, blocks: Block[] = [newBlock()], prep = 5): Workout {
	return { id: newId(), name, prep, finalRest: false, blocks, updatedAt: 0 };
}

// Быстрый таймер как тренировка из одного блока
export function quickWorkout(q: Quick): Workout {
	return { ...newWorkout("Быстрый таймер", [newBlock({ id: "quick", sets: q.sets, work: q.work, rest: q.rest })], q.prep), id: "quick" };
}
