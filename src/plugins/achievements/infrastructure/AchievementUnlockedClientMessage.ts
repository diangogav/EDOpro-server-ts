// STOC notice sent to the player who just unlocked an achievement.
// Wire format: [2b size LE][0xf1][achievementId u16 LE][code utf8].
// The size counts the opcode and the body, not the 2-byte size prefix.
export const ACHIEVEMENT_UNLOCKED = 0xf1;

export class AchievementUnlockedClientMessage {
	static create(achievementId: number, code: string): Buffer {
		const id = Buffer.alloc(2);
		id.writeUint16LE(achievementId);

		const data = Buffer.concat([
			Buffer.from([ACHIEVEMENT_UNLOCKED]),
			id,
			Buffer.from(code, "utf8"),
		]);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);

		return Buffer.concat([size, data]);
	}
}
