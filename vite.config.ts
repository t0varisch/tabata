import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	// Относительные пути: приложение работает из любой подпапки (GitHub Pages)
	base: "./",
	build: { target: "es2020" },
	plugins: [
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["icon.svg", "apple-touch-icon.png"],
			manifest: {
				name: "Табата — интервальный таймер",
				short_name: "Табата",
				description: "Интервальный таймер без рекламы: свои тренировки, синхронизация между устройствами",
				lang: "ru",
				id: "./",
				start_url: "./",
				scope: "./",
				display: "standalone",
				orientation: "portrait",
				background_color: "#111418",
				theme_color: "#111418",
				icons: [
					{ src: "icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "icon-512.png", sizes: "512x512", type: "image/png" },
					{ src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,png,svg}"],
			},
		}),
	],
});
