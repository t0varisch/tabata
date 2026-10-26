export function fmt(sec: number): string {
	const s = Math.max(0, Math.round(sec));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// «1:05» → 65, «45» → 45; всё остальное — null
export function parseTime(s: string): number | null {
	const t = s.trim();
	const mmss = /^(\d{1,3}):([0-5]\d)$/.exec(t);
	if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
	if (/^\d{1,5}$/.test(t)) return Number(t);
	return null;
}
