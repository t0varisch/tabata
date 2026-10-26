import { fmt } from "../core/format";
import { blockLabel, buildPhases, totalSeconds } from "../core/phases";
import { prepareImage } from "../images";
import { deleteWorkout, getImage, getWorkout, putImage, saveWorkout } from "../store";
import { scheduleSync } from "../sync";
import type { Block, Workout } from "../types";
import { newBlock } from "../workouts";
import { h, icon, iconButton, type View } from "./dom";
import { stepper } from "./stepper";

export function editorView(id: string): View {
	const el = h("div.screen.editor");
	let w: Workout | undefined;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let urls: string[] = [];
	const total = h("span.total");
	const start = h("a.btn.primary.start", { href: `#/run/${encodeURIComponent(id)}` }, icon("play", 20), "Старт");
	const blocksEl = h("div.blocks");

	const flush = () => {
		if (saveTimer === undefined || !w) return;
		clearTimeout(saveTimer);
		saveTimer = undefined;
		void saveWorkout(w).then(() => scheduleSync());
	};

	const refreshTotal = () => {
		if (!w) return;
		const phases = buildPhases(w);
		total.textContent = phases.length ? `Всего ${fmt(totalSeconds(phases))}` : "Добавь блок с работой больше 0";
		start.classList.toggle("disabled", phases.length === 0);
		start.setAttribute("aria-disabled", String(phases.length === 0));
	};

	// Каждая правка сохраняется сама через 300 мс
	const changed = () => {
		refreshTotal();
		clearTimeout(saveTimer);
		saveTimer = setTimeout(flush, 300);
	};

	const pickImage = (b: Block) => {
		const input = h("input", { type: "file", accept: "image/*", hidden: true });
		input.addEventListener("change", async () => {
			const file = input.files?.[0];
			input.remove();
			if (!file) return;
			try {
				const { sha, blob } = await prepareImage(file);
				await putImage(sha, blob);
				b.image = sha;
				changed();
				renderBlocks();
			} catch (e) {
				alert(e instanceof Error ? e.message : "Не удалось добавить картинку");
			}
		});
		document.body.append(input);
		input.click();
	};

	const blockCard = (b: Block, i: number, all: Block[]) => {
		const move = (d: number) => {
			const j = i + d;
			if (j < 0 || j >= all.length) return;
			[all[i], all[j]] = [all[j], all[i]];
			changed();
			renderBlocks();
		};
		const remove = () => {
			if (all.length > 1 && !confirm(`Удалить блок «${blockLabel(b, i)}»?`)) return;
			all.splice(i, 1);
			changed();
			renderBlocks();
		};
		const name = h("input.name-input", { type: "text", value: b.name, placeholder: `Работа ${i + 1} (название по желанию)`, "aria-label": `Название блока ${i + 1}` });
		name.addEventListener("input", () => {
			b.name = name.value;
			changed();
		});
		const thumb = h("div.thumb");
		if (b.image) {
			const sha = b.image;
			void getImage(sha).then((blob) => {
				if (!blob) return thumb.replaceChildren(h("span.muted", {}, "картинка загрузится при синхронизации"));
				const url = URL.createObjectURL(blob);
				urls.push(url);
				thumb.replaceChildren(h("img", { src: url, alt: "" }));
			});
		}
		return h(
			"section.card.block",
			{},
			h(
				"div.block-head",
				{},
				h("h3", {}, `Блок ${i + 1}`),
				h(
					"div.block-tools",
					{},
					iconButton("up", "Выше", () => move(-1)),
					iconButton("down", "Ниже", () => move(1)),
					iconButton("trash", "Удалить блок", remove),
				),
			),
			name,
			h(
				"div.image-row",
				{},
				thumb,
				h("button.btn.small", { type: "button", onclick: () => pickImage(b) }, icon("image", 18), b.image ? "Заменить" : "Картинка"),
				b.image
					? h("button.btn.small", { type: "button", onclick: () => ((b.image = null), changed(), renderBlocks()) }, "Убрать")
					: null,
			),
			h(
				"div.grid.three",
				{},
				stepper({ label: "Сеты", value: b.sets, step: 1, min: 1, max: 99, time: false, onChange: (v) => ((b.sets = v), changed()) }),
				stepper({ label: "Работа", value: b.work, step: 5, min: 5, max: 3600, time: true, onChange: (v) => ((b.work = v), changed()) }),
				stepper({ label: "Отдых", value: b.rest, step: 5, min: 0, max: 3600, time: true, onChange: (v) => ((b.rest = v), changed()) }),
			),
		);
	};

	const renderBlocks = () => {
		if (!w) return;
		for (const u of urls) URL.revokeObjectURL(u);
		urls = [];
		blocksEl.replaceChildren(...w.blocks.map((b, i, all) => blockCard(b, i, all)));
	};

	const render = () => {
		if (!w) {
			el.replaceChildren(h("header.top", {}, h("a.icon-btn", { href: "#/", "aria-label": "Назад" }, icon("back")), h("h1", {}, "Не найдено")), h("p.empty", {}, "Такой тренировки нет — возможно, её удалили на другом устройстве."));
			return;
		}
		const workout = w;
		const title = h("input.title-input", { type: "text", value: workout.name, "aria-label": "Название тренировки" });
		title.addEventListener("input", () => {
			workout.name = title.value.trim() || "Без названия";
			changed();
		});
		const finalRest = h("input", { type: "checkbox", checked: workout.finalRest });
		finalRest.addEventListener("change", () => {
			workout.finalRest = finalRest.checked;
			changed();
		});
		const remove = async () => {
			if (!confirm(`Удалить тренировку «${workout.name}»?`)) return;
			clearTimeout(saveTimer);
			saveTimer = undefined;
			await deleteWorkout(workout.id);
			scheduleSync();
			location.hash = "#/";
		};
		el.replaceChildren(
			h("header.top", {}, h("a.icon-btn", { href: "#/", "aria-label": "Назад", onclick: flush }, icon("back")), title),
			h(
				"section.card",
				{},
				h(
					"div.grid",
					{},
					stepper({ label: "Подготовка", value: workout.prep, step: 1, min: 0, max: 60, time: true, onChange: (v) => ((workout.prep = v), changed()) }),
					h("label.toggle", {}, finalRest, h("span", {}, "Отдых после последнего сета")),
				),
			),
			blocksEl,
			h("button.btn.add-block", { type: "button", onclick: () => (workout.blocks.push(newBlock()), changed(), renderBlocks()) }, icon("plus", 20), "Блок"),
			h("div.footer-bar", {}, total, start),
			h("button.btn.danger", { type: "button", onclick: () => void remove() }, icon("trash", 18), "Удалить тренировку"),
		);
		start.addEventListener("click", (e) => {
			if (start.classList.contains("disabled")) e.preventDefault();
			else flush();
		});
		renderBlocks();
		refreshTotal();
	};

	void getWorkout(id).then((found) => {
		w = found ? structuredClone(found) : undefined;
		render();
	});

	return {
		el,
		destroy: () => {
			flush();
			for (const u of urls) URL.revokeObjectURL(u);
		},
	};
}
