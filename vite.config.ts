import { defineConfig } from "vite";

export default defineConfig({
	// Относительные пути: приложение работает из любой подпапки (GitHub Pages)
	base: "./",
	build: { target: "es2020" },
});
