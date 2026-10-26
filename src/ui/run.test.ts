import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../audio", () => ({ unlockAudio: vi.fn(), cancelBeeps: vi.fn(), schedulePhaseBeeps: vi.fn(), vibrate: vi.fn() }));

import * as audio from "../audio";
import type { View } from "./dom";
import { runView } from "./run";

let view: View;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance", "Date"] });
	localStorage.setItem("tabata:settings", JSON.stringify({ quick: { work: 30, rest: 30, sets: 2, prep: 5 } }));
	view = runView("quick");
	document.body.append(view.el);
	vi.clearAllMocks();
});

afterEach(() => {
	view.destroy?.();
	view.el.remove();
	vi.useRealTimers();
});

describe("экран тренировки", () => {
	it("возврат на экран: звук будится, старые сигналы снимаются, текущая фаза перепланируется", () => {
		Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		expect(audio.unlockAudio).toHaveBeenCalled();
		expect(audio.cancelBeeps).toHaveBeenCalled();
		expect(audio.schedulePhaseBeeps).toHaveBeenCalledTimes(1);
	});

	it("кнопки тренировки будят звук", () => {
		(view.el.querySelector('[aria-label="Пауза"]') as HTMLElement).click();
		expect(audio.unlockAudio).toHaveBeenCalled();
	});

	it("иконка паузы не пересоздаётся каждые 100 мс — нажатие не теряется", () => {
		const svg = view.el.querySelector('[aria-label="Пауза"] svg');
		vi.advanceTimersByTime(500);
		expect(view.el.querySelector('[aria-label="Пауза"] svg')).toBe(svg);
	});
});
