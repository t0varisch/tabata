import { fmt } from "../core/format";
import { buildPhases, totalSeconds } from "../core/phases";
import { loadSettings, saveSettings } from "../settings";
import { listWorkouts, onStoreChange, saveWorkout } from "../store";
import { scheduleSync } from "../sync";
import type { Workout } from "../types";
import { newBlock, newWorkout, quickWorkout } from "../workouts";
import { h, icon, iconButton, type View } from "./dom";
import { stepper } from "./stepper";
import { syncDot } from "./sync-dot";

function duration(w: Workout): string {
	return fmt(totalSeconds(buildPhases(w)));
}

export function homeView(): View {
	const q = { ...loadSettings().quick };
	const total = h("span.total");
	const updateTotal = () => (total.textContent = `Всего ${duration(quickWorkout(q))}`);
	const change = (k: keyof typeof q) => (v: number) => {
		q[k] = v;
		saveSettings({ quick: { ...q } });
		updateTotal();
	};
	updateTotal();

	const saveQuick = async () => {
		const n = (await listWorkouts()).length + 1;
		const w = newWorkout(`Тренировка ${n}`, [newBlock({ sets: q.sets, work: q.work, rest: q.rest })], q.prep);
		await saveWorkout(w);
		scheduleSync();
		location.hash = `#/edit/${w.id}`;
	};

	const addWorkout = async () => {
		const n = (await listWorkouts()).length + 1;
		const w = newWorkout(`Тренировка ${n}`);
		await saveWorkout(w);
		scheduleSync();
		location.hash = `#/edit/${w.id}`;
	};

	const list = h("div.list");
	const renderList = async () => {
		const workouts = await listWorkouts();
		list.replaceChildren(
			...(workouts.length
				? workouts.map((w) =>
						h(
							"div.row",
							{},
							h(
								"a.row-main",
								{ href: `#/run/${w.id}`, "aria-label": `Старт: ${w.name}` },
								h("span.row-name", {}, w.name),
								h("span.row-meta", {}, `${w.blocks.length} ${plural(w.blocks.length, "блок", "блока", "блоков")} · ${duration(w)}`),
							),
							h("a.icon-btn", { href: `#/edit/${w.id}`, "aria-label": `Изменить: ${w.name}`, title: "Изменить" }, icon("edit")),
						),
					)
				: [h("p.empty", {}, "Пока нет тренировок. Нажми «+» или сохрани быстрый таймер.")]),
		);
	};
	void renderList();
	const offStore = onStoreChange(() => void renderList());
	const dot = syncDot();

	const el = h(
		"div.screen.home",
		{},
		h("header.top", {}, h("h1", {}, "Табата"), h("div.top-actions", {}, dot.el, h("a.icon-btn", { href: "#/settings", "aria-label": "Настройки", title: "Настройки" }, icon("gear")))),
		h(
			"section.card.quick",
			{},
			h("h2", {}, "Быстрый таймер"),
			h(
				"div.grid",
				{},
				stepper({ label: "Работа", value: q.work, step: 5, min: 5, max: 3600, time: true, onChange: change("work") }),
				stepper({ label: "Отдых", value: q.rest, step: 5, min: 0, max: 3600, time: true, onChange: change("rest") }),
				stepper({ label: "Циклы", value: q.sets, step: 1, min: 1, max: 99, time: false, onChange: change("sets") }),
				stepper({ label: "Подготовка", value: q.prep, step: 1, min: 0, max: 60, time: true, onChange: change("prep") }),
			),
			total,
			h(
				"div.actions",
				{},
				h("a.btn.primary.start", { href: "#/run/quick" }, icon("play", 20), "Старт"),
				h("button.btn", { type: "button", onclick: () => void saveQuick() }, "Сохранить как тренировку"),
			),
		),
		h("section.workouts", {}, h("div.section-head", {}, h("h2", {}, "Тренировки"), iconButton("plus", "Новая тренировка", () => void addWorkout())), list),
	);
	return {
		el,
		destroy: () => {
			offStore();
			dot.destroy();
		},
	};
}

function plural(n: number, one: string, few: string, many: string): string {
	const m10 = n % 10;
	const m100 = n % 100;
	if (m10 === 1 && m100 !== 11) return one;
	if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
	return many;
}
