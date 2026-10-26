import "./styles.css";
import { takeKeyFromHash } from "./settings";
import { syncNow } from "./sync";
import type { View } from "./ui/dom";
import { editorView } from "./ui/editor";
import { homeView } from "./ui/home";
import { settingsView } from "./ui/settings-view";

const app = document.getElementById("app")!;
let current: View | null = null;

function viewFor(hash: string): View {
	const edit = /^#\/edit\/(.+)$/.exec(hash);
	if (edit) return editorView(decodeURIComponent(edit[1]));
	if (hash === "#/settings") return settingsView();
	return homeView();
}

function route(): void {
	current?.destroy?.();
	current = viewFor(location.hash);
	app.replaceChildren(current.el);
	window.scrollTo(0, 0);
}

takeKeyFromHash(location, history);
window.addEventListener("hashchange", route);
route();

void syncNow();
window.addEventListener("online", () => void syncNow());
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") void syncNow();
});
