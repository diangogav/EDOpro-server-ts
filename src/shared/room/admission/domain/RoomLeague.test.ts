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

	describe("type — the wire identifier exposed to the lobby", () => {
		it("returns the league's identifier", () => {
			expect(RoomLeague.Verified.type).toBe("verified");
			expect(RoomLeague.External.type).toBe("external");
			expect(RoomLeague.Casual.type).toBe("casual");
		});
	});

	describe("determine — which league a room is born into", () => {
		it("the explicit casual flag wins over everything", () => {
			expect(
				RoomLeague.determine({ casual: true, rankedOverride: true, hasPin: true }),
			).toBe(RoomLeague.Casual);
		});

		it("a ticket-created room is Verified", () => {
			expect(
				RoomLeague.determine({ casual: false, rankedOverride: true, hasPin: false }),
			).toBe(RoomLeague.Verified);
		});

		it("an explicit non-ranked override is Casual (e.g. rooms vs bot)", () => {
			expect(
				RoomLeague.determine({ casual: false, rankedOverride: false, hasPin: true }),
			).toBe(RoomLeague.Casual);
		});

		it("a PIN-created room (no override) is External", () => {
			expect(
				RoomLeague.determine({ casual: false, rankedOverride: undefined, hasPin: true }),
			).toBe(RoomLeague.External);
		});

		it("no credential and no override is Casual", () => {
			expect(
				RoomLeague.determine({ casual: false, rankedOverride: undefined, hasPin: false }),
			).toBe(RoomLeague.Casual);
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

		it("External admits external AND verified (one-way cross), but not guests", () => {
			expect(RoomLeague.External.admitsAsPlayer(external)).toBe(true);
			expect(RoomLeague.External.admitsAsPlayer(verified)).toBe(true);
			expect(RoomLeague.External.admitsAsPlayer(guest)).toBe(false);
		});

		it("the cross is one-way: a verified sits in External, but an external never sits in Verified", () => {
			expect(RoomLeague.External.admitsAsPlayer(verified)).toBe(true);
			expect(RoomLeague.Verified.admitsAsPlayer(external)).toBe(false);
		});
	});
});
