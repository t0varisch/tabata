import { describe, expect, it } from "vitest";
import { fmt, parseTime } from "./format";

describe("fmt", () => {
	it("минуты и секунды с нулём", () => {
		expect(fmt(5)).toBe("0:05");
		expect(fmt(65)).toBe("1:05");
		expect(fmt(3600)).toBe("60:00");
		expect(fmt(0)).toBe("0:00");
	});
});

describe("parseTime", () => {
	it("понимает м:сс и секунды", () => {
		expect(parseTime("1:05")).toBe(65);
		expect(parseTime("45")).toBe(45);
		expect(parseTime(" 2:00 ")).toBe(120);
	});
	it("мусор и отрицательные — null", () => {
		expect(parseTime("")).toBeNull();
		expect(parseTime("abc")).toBeNull();
		expect(parseTime("-3")).toBeNull();
		expect(parseTime("1:75")).toBeNull();
	});
});
