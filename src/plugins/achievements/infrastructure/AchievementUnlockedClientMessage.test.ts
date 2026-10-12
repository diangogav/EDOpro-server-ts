import {
	ACHIEVEMENT_UNLOCKED,
	AchievementUnlockedClientMessage,
} from "./AchievementUnlockedClientMessage";

describe("AchievementUnlockedClientMessage", () => {
	it("exposes the 0xf1 opcode", () => {
		expect(ACHIEVEMENT_UNLOCKED).toBe(0xf1);
	});

	it("encodes [size u16 LE][0xf1][achievementId u16 LE][code utf8]", () => {
		const frame = AchievementUnlockedClientMessage.create(1001, "first_win");

		expect(frame).toEqual(
			Buffer.concat([
				Buffer.from([0x0c, 0x00]),
				Buffer.from([0xf1]),
				Buffer.from([0xe9, 0x03]),
				Buffer.from("first_win", "utf8"),
			]),
		);
	});

	it("counts multibyte code bytes, not characters, in the size", () => {
		const frame = AchievementUnlockedClientMessage.create(2, "é");

		expect(frame).toEqual(Buffer.from([0x05, 0x00, 0xf1, 0x02, 0x00, 0xc3, 0xa9]));
	});
});
