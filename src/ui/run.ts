import { cancelBeeps, schedulePhaseBeeps, unlockAudio, vibrate } from "../audio";
import { fmt } from "../core/format";
import { buildPhases, totalSeconds } from "../core/phases";
import { Runner } from "../core/runner";
import { loadSettings } from "../settings";
import { getImage, getWorkout } from "../store";
import type { Phase, Workout } from "../types";
import { quickWorkout } from "../workouts";
import { h, icon, type View } from "./dom";

type WakeLock = { release: () => Promise<void> };

export function runView(id: string): View {
	const el = h("div.run");
	let runner: Runner | null = null;
	let interval: ReturnType<typeof setInterval> | undefined;
	let lock: WakeLock | null = null;
	let alive = true;
	const urls = new Map<string, string>();
	const vibrateOn = loadSettings().vibrate;

	const wake = async () => {
		try {
			const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock;
			if (wl && !lock && alive) lock = await wl.request("screen");
		} catch {
			// экран может погаснуть, таймер всё равно идёт по часам
		}
	};
	const unwake = () => {
		void lock?.release().catch(() => {});
		lock = null;
	};
	const onVisible = () => {
		if (document.visibilityState !== "visible" || !runner) return;
		lock = null; // браузер отпускает блокировку, когда вкладка скрыта
		if (!runner.state().done) void wake();
		paint();
	};

	const info = h("div.run-info");
	const left = h("div.run-left");
	const label = h("div.run-label");
	const image = h("div.run-image");
	const time = h("div.run-time");
	const next = h("div.run-next");
	const pauseBtn = h("button.run-btn.big", { type: "button", "aria-label": "Пауза" });
	const controls = h("div.run-controls");
	let phases: Phase[] = [];
	let total = 0;

	const showImage = async (sha: string | null) => {
		if (!sha) return image.replaceChildren();
		let url = urls.get(sha);
		if (!url) {
			const blob = await getImage(sha);
			if (!blob) return image.replaceChildren();
			url = URL.createObjectURL(blob);
			urls.set(sha, url);
		}
		image.replaceChildren(h("img", { src: url, alt: "" }));
	};

	const paint = () => {
		if (!runner) return;
		const st = runner.state();
		if (st.done) return paintDone();
		const p = phases[st.index];
		el.dataset.kind = p.kind;
		const where = p.blocks > 1 ? `Блок ${p.block} из ${p.blocks} · ` : "";
		info.textContent = p.kind === "prep" ? "Начинаем" : `${where}Сет ${p.set} из ${p.sets}`;
		left.textContent = `Осталось ${fmt(total - st.elapsedTotal)}`;
		label.textContent = p.label;
		time.textContent = fmt(st.remaining);
		next.textContent = p.next ? `Дальше: ${p.next}` : "";
		pauseBtn.replaceChildren(icon(st.paused ? "play" : "pause", 34));
		pauseBtn.setAttribute("aria-label", st.paused ? "Продолжить" : "Пауза");
		el.classList.toggle("paused", st.paused);
	};

	let doneShown = false;
	const paintDone = () => {
		if (doneShown) return;
		doneShown = true;
		el.dataset.kind = "done";
		el.classList.remove("paused");
		info.textContent = "";
		left.textContent = `Всего ${fmt(total)}`;
		label.textContent = "Готово";
		time.textContent = "";
		next.textContent = "";
		image.replaceChildren();
		controls.replaceChildren(
			h("button.btn.primary", { type: "button", onclick: () => begin() }, icon("play", 20), "Ещё раз"),
			h("a.btn", { href: "#/" }, "На главную"),
		);
	};

	const runControls = () =>
		controls.replaceChildren(
			h("button.run-btn", { type: "button", "aria-label": "Назад на интервал", onclick: () => (cancelBeeps(), runner?.prev(), paint()) }, icon("prev", 30)),
			pauseBtn,
			h("button.run-btn", { type: "button", "aria-label": "Вперёд на интервал", onclick: () => (cancelBeeps(), runner?.next(), paint()) }, icon("next", 30)),
			h("button.run-btn", { type: "button", "aria-label": "Стоп", onclick: stop }, icon("stop", 26)),
		);

	pauseBtn.addEventListener("click", () => {
		if (!runner) return;
		if (runner.state().paused) runner.resume();
		else runner.pause();
		paint();
	});

	function stop() {
		if (!runner) return;
		const wasPaused = runner.state().paused;
		runner.pause();
		if (confirm("Закончить тренировку?")) {
			location.hash = "#/";
			return;
		}
		if (!wasPaused) runner.resume();
		paint();
	}

	const begin = () => {
		doneShown = false;
		unlockAudio();
		cancelBeeps();
		runControls();
		runner = new Runner(phases, {
			onPhase: (i, p, startedAt) => {
				void showImage(p.kind === "work" ? p.image : null);
				if (runner?.state().paused) return;
				schedulePhaseBeeps(startedAt, p.duration, i === phases.length - 1);
				if (i > 0) vibrate(vibrateOn);
			},
			onPause: () => cancelBeeps(),
			onResume: (i) => schedulePhaseBeeps(runner!.startedAt(), phases[i].duration, i === phases.length - 1),
			onDone: () => {
				if (vibrateOn) vibrate(true);
				unwake();
				paint();
			},
		});
		runner.start();
		void wake();
		paint();
	};

	const setup = (w: Workout | undefined) => {
		if (!alive) return;
		phases = w ? buildPhases(w) : [];
		total = totalSeconds(phases);
		if (!w || phases.length === 0) {
			el.dataset.kind = "done";
			el.replaceChildren(
				h("div.run-label", {}, w ? "Тренировка пустая" : "Тренировка не найдена"),
				h("div.run-controls", {}, h("a.btn", { href: w ? `#/edit/${encodeURIComponent(w.id)}` : "#/" }, w ? "Открыть редактор" : "На главную")),
			);
			return;
		}
		el.replaceChildren(
			h("div.run-head", {}, h("span.run-title", {}, w.name), left),
			info,
			label,
			image,
			time,
			next,
			controls,
		);
		begin();
		// Переходы фаз считает tick() по часам; 10 раз в секунду хватает для цифр
		interval = setInterval(() => {
			runner?.tick();
			paint();
		}, 100);
	};

	document.addEventListener("visibilitychange", onVisible);

	if (id === "quick") setup(quickWorkout(loadSettings().quick));
	else void getWorkout(id).then(setup);

	return {
		el,
		destroy: () => {
			alive = false;
			runner?.stop();
			cancelBeeps();
			clearInterval(interval);
			document.removeEventListener("visibilitychange", onVisible);
			unwake();
			for (const u of urls.values()) URL.revokeObjectURL(u);
		},
	};
}
