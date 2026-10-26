// Сигналы ставятся в расписание Web Audio заранее, в момент начала фазы:
// если браузер притормозит скрипты, писк всё равно прозвучит вовремя.
let ctx: AudioContext | null = null;
let scheduled: OscillatorNode[] = [];

const SHORT = { freq: 880, dur: 0.12 };
const LONG = { freq: 1320, dur: 0.6 };

// Только по нажатию пользователя: иначе браузер не даст включить звук
export function unlockAudio(): void {
	try {
		// iOS: «ambient» смешивается с музыкой и не ставит её на паузу
		const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
		if (session) session.type = "ambient";
	} catch {
		// нет Audio Session API — не страшно
	}
	try {
		ctx ??= new AudioContext();
		if (ctx.state === "suspended") void ctx.resume();
	} catch {
		ctx = null;
	}
}

function beep(at: number, tone: { freq: number; dur: number }): void {
	if (!ctx || at < ctx.currentTime - 0.05) return;
	const start = Math.max(at, ctx.currentTime);
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = "triangle";
	osc.frequency.value = tone.freq;
	gain.gain.setValueAtTime(0.0001, start);
	gain.gain.exponentialRampToValueAtTime(0.9, start + 0.01);
	gain.gain.setValueAtTime(0.9, start + tone.dur - 0.04);
	gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
	osc.connect(gain).connect(ctx.destination);
	osc.start(start);
	osc.stop(start + tone.dur + 0.02);
	osc.onended = () => {
		scheduled = scheduled.filter((o) => o !== osc);
	};
	scheduled.push(osc);
}

// startPerfMs — начало фазы по performance.now(); короткие за 3, 2, 1 с до конца, длинный — в конце
export function schedulePhaseBeeps(startPerfMs: number, durationSec: number, isLast: boolean): void {
	if (!ctx) return;
	const toCtx = (perfMs: number) => ctx!.currentTime + (perfMs - performance.now()) / 1000;
	const end = startPerfMs + durationSec * 1000;
	if (durationSec >= 4) for (const s of [3, 2, 1]) beep(toCtx(end - s * 1000), SHORT);
	const longs = isLast ? 3 : 1;
	for (let i = 0; i < longs; i++) beep(toCtx(end + i * 800), LONG);
}

export function cancelBeeps(): void {
	for (const osc of scheduled) {
		try {
			osc.stop();
			osc.disconnect();
		} catch {
			// уже отзвучал
		}
	}
	scheduled = [];
}

export function vibrate(on: boolean): void {
	if (on) navigator.vibrate?.(300);
}
