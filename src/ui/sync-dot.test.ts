import { beforeEach, describe, expect, it } from "vitest";
import { syncDot } from "./sync-dot";

beforeEach(() => localStorage.clear());

describe("точка синхронизации", () => {
	it("без ключа не показывается — синхронизация не настроена, это не ошибка", () => {
		const dot = syncDot();
		expect(dot.el.hidden).toBe(true);
		dot.destroy();
	});

	it("с ключом видна", () => {
		localStorage.setItem("tabata:settings", JSON.stringify({ key: "k", lastSync: 1 }));
		const dot = syncDot();
		expect(dot.el.hidden).toBe(false);
		expect(dot.el.dataset.state).toBe("ok");
		dot.destroy();
	});
});
