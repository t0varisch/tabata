import { describe, expect, it } from "vitest";
import { prepareImage, sha256Hex } from "./images";

describe("sha256Hex", () => {
	it("совпадает с эталоном для «abc»", async () => {
		const data = new TextEncoder().encode("abc").buffer as ArrayBuffer;
		expect(await sha256Hex(data)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
	});
});

describe("prepareImage", () => {
	it("гифка больше 3 МБ — понятная ошибка", async () => {
		const big = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "big.gif", { type: "image/gif" });
		await expect(prepareImage(big)).rejects.toThrow("Гифка больше 3 МБ");
	});

	it("маленькая гифка остаётся как есть, чтобы не потерять анимацию", async () => {
		const bytes = new Uint8Array(1024).fill(7);
		const gif = new File([bytes], "a.gif", { type: "image/gif" });
		const { sha, blob } = await prepareImage(gif);
		expect(blob.type).toBe("image/gif");
		expect(blob.size).toBe(1024);
		expect(sha).toBe(await sha256Hex(bytes.buffer as ArrayBuffer));
	});
});
