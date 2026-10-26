import type { Phase } from "../types";

export type RunnerState = { index: number; remaining: number; elapsedTotal: number; paused: boolean; done: boolean };

export type RunnerEvents = {
	onPhase?: (index: number, phase: Phase, phaseStartedAt: number) => void;
	onDone?: () => void;
	onPause?: () => void;
	onResume?: (index: number, remaining: number) => void;
};

// Время фазы считается от момента её начала по часам, а не тиками:
// если браузер уснул, tick() проходит все пропущенные фазы разом.
export class Runner {
	private index = 0;
	private phaseStart = 0;
	private pausedAt: number | null = null;
	// Те же отметки по настоящим часам: на Android performance.now стоит, пока телефон спит
	private phaseStartWall = 0;
	private pausedAtWall: number | null = null;
	private done = false;
	private readonly before: number[];

	constructor(
		private readonly phases: Phase[],
		private readonly events: RunnerEvents,
		private readonly now: () => number = () => performance.now(),
		private readonly wall: () => number = () => Date.now(),
	) {
		let sum = 0;
		this.before = phases.map((p) => {
			const at = sum;
			sum += p.duration;
			return at;
		});
	}

	start(): void {
		this.index = 0;
		this.done = this.phases.length === 0;
		this.pausedAt = null;
		this.pausedAtWall = null;
		this.restartPhase();
		if (this.done) this.events.onDone?.();
		else this.announce();
	}

	tick(): RunnerState {
		if (this.done || this.pausedAt !== null) return this.state();
		const t = this.now();
		const lost = this.wall() - this.phaseStartWall - (t - this.phaseStart);
		if (lost > 1000) this.phaseStart -= lost;
		while (!this.done && t - this.phaseStart >= this.phases[this.index].duration * 1000) {
			this.phaseStart += this.phases[this.index].duration * 1000;
			this.phaseStartWall += this.phases[this.index].duration * 1000;
			this.advance();
		}
		return this.state();
	}

	pause(): void {
		if (this.done || this.pausedAt !== null) return;
		this.pausedAt = this.now();
		this.pausedAtWall = this.wall();
		this.events.onPause?.();
	}

	resume(): void {
		if (this.pausedAt === null) return;
		this.phaseStart += this.now() - this.pausedAt;
		this.phaseStartWall += this.wall() - (this.pausedAtWall ?? this.wall());
		this.pausedAt = null;
		this.pausedAtWall = null;
		this.events.onResume?.(this.index, this.state().remaining);
	}

	next(): void {
		if (this.done) return;
		this.restartPhase();
		this.advance();
	}

	prev(): void {
		if (this.done) return;
		if (this.elapsedMs() < 500 && this.index > 0) this.index--;
		this.restartPhase();
		this.announce();
	}

	// Начало текущей фазы по тем же часам — для расписания сигналов
	startedAt(): number {
		return this.phaseStart;
	}

	stop(): void {
		this.done = true;
	}

	state(): RunnerState {
		const phase = this.phases[this.index];
		if (!phase) return { index: this.index, remaining: 0, elapsedTotal: 0, paused: false, done: true };
		const elapsed = this.done ? phase.duration * 1000 : this.elapsedMs();
		return {
			index: this.index,
			remaining: Math.max(0, Math.ceil((phase.duration * 1000 - elapsed) / 1000)),
			elapsedTotal: this.before[this.index] + Math.floor(elapsed / 1000),
			paused: this.pausedAt !== null,
			done: this.done,
		};
	}

	// Фаза начинается «сейчас» (или в момент паузы, если стоим на паузе)
	private restartPhase(): void {
		this.phaseStart = this.pausedAt ?? this.now();
		this.phaseStartWall = this.pausedAtWall ?? this.wall();
	}

	private elapsedMs(): number {
		return (this.pausedAt ?? this.now()) - this.phaseStart;
	}

	private advance(): void {
		if (this.index >= this.phases.length - 1) {
			this.done = true;
			this.events.onDone?.();
			return;
		}
		this.index++;
		this.announce();
	}

	private announce(): void {
		this.events.onPhase?.(this.index, this.phases[this.index], this.phaseStart);
	}
}
