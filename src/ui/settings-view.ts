import { DEFAULT_SERVER, loadSettings, saveSettings } from "../settings";
import { onSyncStatus, syncNow } from "../sync";
import { h, icon, type View } from "./dom";

function when(ts: number | null): string {
	if (!ts) return "ещё не было";
	return new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function settingsView(): View {
	const s = loadSettings();
	const key = h("input", { type: "text", value: s.key, autocomplete: "off", spellcheck: "false", placeholder: "вставь ключ", "aria-label": "Ключ синхронизации" });
	const server = h("input", { type: "url", value: s.server, spellcheck: "false", "aria-label": "Адрес сервера" });
	const vibrate = h("input", { type: "checkbox", checked: s.vibrate });
	const status = h("p.status");
	const error = h("p.error");

	const paint = () => {
		const now = loadSettings();
		status.textContent = `Последняя синхронизация: ${when(now.lastSync)}`;
		error.textContent = now.lastError ?? "";
	};
	paint();
	const off = onSyncStatus((st) => {
		if (st === "running") status.textContent = "Синхронизация…";
		else paint();
	});

	const save = () => {
		saveSettings({ key: key.value.trim(), server: server.value.trim().replace(/\/+$/, "") || DEFAULT_SERVER });
		void syncNow();
	};
	vibrate.addEventListener("change", () => saveSettings({ vibrate: vibrate.checked }));

	const el = h(
		"div.screen.settings",
		{},
		h("header.top", {}, h("a.icon-btn", { href: "#/", "aria-label": "Назад" }, icon("back")), h("h1", {}, "Настройки")),
		h(
			"section.card",
			{},
			h("h2", {}, "Синхронизация"),
			h("label.field", {}, h("span", {}, "Ключ"), key),
			h("label.field", {}, h("span", {}, "Сервер"), server),
			h("p.muted", {}, "Ключ хранится только на этом устройстве. Тренировки уходят на сервер, когда есть сеть."),
			h("div.actions", {}, h("button.btn.primary", { type: "button", onclick: save }, icon("sync", 20), "Сохранить и синхронизировать")),
			status,
			error,
		),
		h("section.card", {}, h("h2", {}, "Тренировка"), h("label.toggle", {}, vibrate, h("span", {}, "Вибрация на смену фазы"))),
	);
	return { el, destroy: off };
}
