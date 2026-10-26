const MAX_GIF = 3 * 1024 * 1024;
const MAX_SIDE = 720;

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Гифка — как есть (иначе пропадёт анимация), остальное — уменьшить до 720 px и сжать в WebP
export async function prepareImage(file: File): Promise<{ sha: string; blob: Blob }> {
	if (file.type === "image/gif") {
		if (file.size > MAX_GIF) throw new Error("Гифка больше 3 МБ");
		return { sha: await sha256Hex(await file.arrayBuffer()), blob: file };
	}
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	let blob = await toBlob(canvas, "image/webp", 0.8);
	if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.85);
	if (!blob) throw new Error("Не удалось прочитать картинку");
	return { sha: await sha256Hex(await blob.arrayBuffer()), blob };
}
