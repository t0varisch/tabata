import { describe, expect, it, vi } from "vitest";
import { stepper } from "./stepper";

function make(value: number, p: { min?: number; max?: number; time?: boolean } = {}) {
	const onChange = vi.fn();
	const el = stepper({ label: "Работа", value, step: 5, min: p.min ?? 0, max: p.max ?? 600, time: p.time ?? true, onChange });
	const q = (sel: string) => el.querySelector(sel) as HTMLElement;
	return { el, onChange, plus: () => q(".step-plus").click(), minus: () => q(".step-minus").click(), value: () => q(".step-value").textContent };
}

describe("stepper", () => {
	it("плюс прибавляет шаг и сообщает новое значение", () => {
		const s = make(30);
		s.plus();
		expect(s.onChange).toHaveBeenLastCalledWith(35);
		expect(s.value()).toBe("0:35");
	});

	it("минус не уходит ниже минимума", () => {
		const s = make(5, { min: 5 });
		s.minus();
		expect(s.value()).toBe("0:05");
		expect(s.onChange).not.toHaveBeenCalled();
	});

	it("плюс не превышает максимум", () => {
		const s = make(598, { max: 600 });
		s.plus();
		s.plus();
		expect(s.onChange).toHaveBeenLastCalledWith(600);
		expect(s.value()).toBe("10:00");
	});

	it("ввод числом: нажатие на значение открывает поле, «1:30» превращается в 90", () => {
		const s = make(30);
		(s.el.querySelector(".step-value") as HTMLElement).click();
		const input = s.el.querySelector("input") as HTMLInputElement;
		input.value = "1:30";
		input.dispatchEvent(new Event("change"));
		expect(s.onChange).toHaveBeenLastCalledWith(90);
		expect(s.value()).toBe("1:30");
	});

	it("не время — показывает число как есть", () => {
		const s = make(8, { time: false });
		s.minus();
		expect(s.value()).toBe("3");
	});
});
