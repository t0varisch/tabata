export type Block = { id: string; name: string; image: string | null; sets: number; work: number; rest: number };

export type Workout = {
	id: string;
	name: string;
	prep: number;
	finalRest: boolean;
	blocks: Block[];
	updatedAt: number;
	deleted?: boolean;
};

export type PhaseKind = "prep" | "work" | "rest";

export type Phase = {
	kind: PhaseKind;
	duration: number;
	label: string;
	next: string | null;
	image: string | null;
	block: number;
	blocks: number;
	set: number;
	sets: number;
};
