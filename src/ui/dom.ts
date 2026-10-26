type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/** Короткий конструктор элементов: h("button.primary", { onclick }, "Текст"). */
export function h<K extends keyof HTMLElementTagNameMap>(
	tag: K | `${K}.${string}`,
	attrs: Attrs = {},
	...children: Child[]
): HTMLElementTagNameMap[K] {
	const [name, ...classes] = tag.split(".");
	const el = document.createElement(name as K);
	if (classes.length) el.className = classes.join(" ");
	for (const [k, v] of Object.entries(attrs)) {
		if (v === undefined || v === false) continue;
		if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
		else el.setAttribute(k, v === true ? "" : String(v));
	}
	for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
	return el;
}

const PATHS: Record<string, string> = {
	back: '<path d="M15 18l-6-6 6-6"/>',
	gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
	play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
	pause: '<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" stroke="none"/>',
	stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
	prev: '<path d="M11 18l-6-6 6-6M19 18l-6-6 6-6"/>',
	next: '<path d="M13 6l6 6-6 6M5 6l6 6-6 6"/>',
	minus: '<path d="M5 12h14"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	close: '<path d="M6 6l12 12M18 6L6 18"/>',
	trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
	edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
	up: '<path d="M6 15l6-6 6 6"/>',
	down: '<path d="M6 9l6 6 6-6"/>',
	image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
	sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
};

export function icon(name: string, size = 22): SVGSVGElement {
	const wrap = document.createElement("span");
	wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ""}</svg>`;
	return wrap.firstElementChild as SVGSVGElement;
}

export function iconButton(name: string, label: string, onclick: () => void, cls = ""): HTMLButtonElement {
	return h(`button.icon-btn${cls ? `.${cls}` : ""}` as "button", { type: "button", "aria-label": label, title: label, onclick: () => onclick() }, icon(name));
}

export type View = { el: HTMLElement; destroy?: () => void };
