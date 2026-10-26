export const DEFAULT_SERVER = "https://api.rehab-wellness.app/tabata";

export type Quick = { work: number; rest: number; sets: number; prep: number };

export type Settings = {
	key: string;
	server: string;
	vibrate: boolean;
	quick: Quick;
	lastSync: number | null;
	lastError: string | null;
};

const STORAGE_KEY = "tabata:settings";

const DEFAULTS: Settings = {
	key: "",
	server: DEFAULT_SERVER,
	vibrate: false,
	quick: { work: 30, rest: 30, sets: 8, prep: 5 },
	lastSync: null,
	lastError: null,
};

export function loadSettings(): Settings {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Settings>;
		return { ...DEFAULTS, ...saved, quick: { ...DEFAULTS.quick, ...saved.quick } };
	} catch {
		return { ...DEFAULTS, quick: { ...DEFAULTS.quick } };
	}
}

export function saveSettings(p: Partial<Settings>): Settings {
	const next = { ...loadSettings(), ...p };
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// приватный режим — настройки живут до перезагрузки
	}
	return next;
}

// Ссылка вида …/#key=<ключ>: сохранить ключ и убрать его из адресной строки
export function takeKeyFromHash(loc: Location, hist: History): boolean {
	const m = /^#key=([^&]+)/.exec(loc.hash);
	if (!m) return false;
	saveSettings({ key: decodeURIComponent(m[1]), lastError: null });
	hist.replaceState(null, "", loc.pathname + loc.search);
	return true;
}
