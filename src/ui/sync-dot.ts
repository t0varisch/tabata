import { loadSettings } from "../settings";
import { onSyncStatus, type SyncStatus } from "../sync";
import { h } from "./dom";

const TEXT: Record<SyncStatus, string> = {
	running: "Синхронизация…",
	ok: "Синхронизировано",
	offline: "Нет сети — синхронизирую позже",
	badkey: "Синхронизация не настроена",
	error: "Ошибка синхронизации",
};

// Точка статуса: зелёная — ок, серая — нет сети или идёт, красная — ошибка. Нажатие — настройки.
export function syncDot(): { el: HTMLElement; destroy: () => void } {
	const el = h("a.sync-dot", { href: "#/settings" });
	const paint = (s: SyncStatus) => {
		el.dataset.state = s;
		el.title = TEXT[s];
		el.setAttribute("aria-label", TEXT[s]);
	};
	const s = loadSettings();
	// Без ключа синхронизация просто не настроена — красная точка тут только пугает
	el.hidden = !s.key;
	paint(!s.key ? "badkey" : s.lastError === "Нет сети" ? "offline" : s.lastError ? "error" : s.lastSync ? "ok" : "running");
	return { el, destroy: onSyncStatus(paint) };
}
