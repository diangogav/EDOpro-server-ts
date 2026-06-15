import { PlayerCredential } from "./PlayerCredential";
import { RoomLeague } from "./RoomLeague";

const verified: PlayerCredential = { kind: "verified", userId: "u-1" };
const external: PlayerCredential = { kind: "external", userId: "u-2" };
const guest: PlayerCredential = { kind: "guest", name: "Anon" };

describe("RoomLeague", () => {
	describe("isRanked", () => {
		it("Verified and External are ranked, Casual is not", () => {
			expect(RoomLeague.Verified.isRanked).toBe(true);
			expect(RoomLeague.External.isRanked).toBe(true);
			expect(RoomLeague.Casual.isRanked).toBe(false);
		});
	});

	describe("admitsAsPlayer", () => {
		it("Casual admits anyone", () => {
			expect(RoomLeague.Casual.admitsAsPlayer(verified)).toBe(true);
			expect(RoomLeague.Casual.admitsAsPlayer(external)).toBe(true);
			expect(RoomLeague.Casual.admitsAsPlayer(guest)).toBe(true);
		});

		it("Verified admits ONLY verified credentials", () => {
			expect(RoomLeague.Verified.admitsAsPlayer(verified)).toBe(true);
			expect(RoomLeague.Verified.admitsAsPlayer(external)).toBe(false);
			expect(RoomLeague.Verified.admitsAsPlayer(guest)).toBe(false);
		});

		it("External admits ONLY external credentials", () => {
			expect(RoomLeague.External.admitsAsPlayer(external)).toBe(true);
			expect(RoomLeague.External.admitsAsPlayer(verified)).toBe(false);
			expect(RoomLeague.External.admitsAsPlayer(guest)).toBe(false);
		});
	});
});
