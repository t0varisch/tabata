import { fmt, parseTime } from "../core/format";
import { h, icon } from "./dom";

export type StepperOpts = {
	label: string;
	value: number;
	step: number;
	min: number;
	max: number;
	time: boolean;
	onChange: (v: number) => void;
};

// [−] значение [+]; нажатие на значение — ввод с клавиатуры («1:30» или «90»)
export function stepper(opts: StepperOpts): HTMLElement {
	let value = opts.value;
	const show = (v: number) => (opts.time ? fmt(v) : String(v));
	const valueEl = h("button.step-value", { type: "button", "aria-label": `${opts.label}: изменить` }, show(value));

	const set = (v: number) => {
		const next = Math.min(opts.max, Math.max(opts.min, Math.round(v)));
		valueEl.textContent = show(next);
		if (next === value) return;
		value = next;
		opts.onChange(value);
	};

	valueEl.addEventListener("click", () => {
		const input = h("input.step-input", { type: "text", inputmode: "numeric", value: show(value), "aria-label": opts.label });
		const done = () => {
			const parsed = opts.time ? parseTime(input.value) : /^\d+$/.test(input.value.trim()) ? Number(input.value) : null;
			input.replaceWith(valueEl);
			if (parsed !== null) set(parsed);
		};
		input.addEventListener("change", done);
		input.addEventListener("blur", () => input.isConnected && done());
		input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
		valueEl.replaceWith(input);
		input.focus();
		input.select();
	});

	return h(
		"div.stepper",
		{},
		h("span.step-label", {}, opts.label),
		h(
			"div.step-row",
			{},
			h("button.step-minus", { type: "button", "aria-label": `${opts.label}: меньше`, onclick: () => set(value - opts.step) }, icon("minus", 20)),
			valueEl,
			h("button.step-plus", { type: "button", "aria-label": `${opts.label}: больше`, onclick: () => set(value + opts.step) }, icon("plus", 20)),
		),
	);
}
