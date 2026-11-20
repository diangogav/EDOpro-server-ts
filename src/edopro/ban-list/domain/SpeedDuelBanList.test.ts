import { EdoproBanList } from "./BanList";
import { findSpeedDuelBanList } from "./SpeedDuelBanList";

function list(name: string): EdoproBanList {
	const banList = new EdoproBanList();
	banList.setName(name);

	return banList;
}

describe("findSpeedDuelBanList", () => {
	it("finds the Speed Duel list by its name, whatever its date", () => {
		const speed = list("2025.07 Speed Duel");

		expect(findSpeedDuelBanList([list("2026.10 TCG"), speed, list("2010.03 Edison")])).toBe(speed);
	});

	it("takes the most recent one when several are loaded", () => {
		const newest = list("2026.01 Speed Duel");

		expect(findSpeedDuelBanList([list("2025.07 Speed Duel"), newest])).toBe(newest);
	});

	it("gives nothing when no Speed Duel list is loaded", () => {
		expect(findSpeedDuelBanList([list("2026.10 TCG"), new EdoproBanList()])).toBeNull();
	});
});
