import { PlayerCredential } from "./PlayerCredential";
import { RoomAdmission } from "./RoomAdmission";
import { RoomLeague } from "./RoomLeague";
import { Seat } from "./Seat";

const verified: PlayerCredential = { kind: "verified", userId: "u-1" };
const external: PlayerCredential = { kind: "external", userId: "u-2" };
const guest: PlayerCredential = { kind: "guest", name: "Anon" };

const freeSeat = new Seat(0, 0);

describe("RoomAdmission.decide", () => {
	const admission = new RoomAdmission();

	describe("ranked rooms require an account even to watch", () => {
		it("rejects a guest in a Verified room", () => {
			const result = admission.decide(guest, { league: RoomLeague.Verified, freeSeat });
			expect(result).toEqual({ kind: "rejected", reason: "ranked-requires-account" });
		});

		it("rejects a guest in an External room", () => {
			const result = admission.decide(guest, { league: RoomLeague.External, freeSeat });
			expect(result).toEqual({ kind: "rejected", reason: "ranked-requires-account" });
		});
	});

	describe("segregation: a player only sits at its matching league", () => {
		it("seats a verified player in a Verified room", () => {
			const result = admission.decide(verified, { league: RoomLeague.Verified, freeSeat });
			expect(result).toEqual({ kind: "player", credential: verified, seat: freeSeat });
		});

		it("seats an external player in an External room", () => {
			const result = admission.decide(external, { league: RoomLeague.External, freeSeat });
			expect(result).toEqual({ kind: "player", credential: external, seat: freeSeat });
		});

		it("an external (authenticated) in a Verified room only watches", () => {
			const result = admission.decide(external, { league: RoomLeague.Verified, freeSeat });
			expect(result).toEqual({ kind: "spectator" });
		});

		it("seats a verified player in an External room (one-way cross-league)", () => {
			const result = admission.decide(verified, { league: RoomLeague.External, freeSeat });
			expect(result).toEqual({ kind: "player", credential: verified, seat: freeSeat });
		});
	});

	describe("a matching player watches when the room is full", () => {
		it("verified in a full Verified room → spectator", () => {
			const result = admission.decide(verified, { league: RoomLeague.Verified, freeSeat: null });
			expect(result).toEqual({ kind: "spectator" });
		});
	});

	describe("casual rooms admit anyone with a free seat", () => {
		it("seats a guest in casual", () => {
			const result = admission.decide(guest, { league: RoomLeague.Casual, freeSeat });
			expect(result).toEqual({ kind: "player", credential: guest, seat: freeSeat });
		});

		it("a guest watches a full casual room (never rejected)", () => {
			const result = admission.decide(guest, { league: RoomLeague.Casual, freeSeat: null });
			expect(result).toEqual({ kind: "spectator" });
		});
	});
	describe("ranked rooms require a verified account when the switch is on", () => {
		const required = { verifiedAccountRequired: true };

		it("seats a verified account in a ranked room", () => {
			const result = admission.decide(verified, {
				league: RoomLeague.Verified,
				freeSeat,
				accountVerified: true,
				...required,
			});
			expect(result).toEqual({ kind: "player", credential: verified, seat: freeSeat });
		});

		it("rejects an unverified account from a Verified room", () => {
			const result = admission.decide(verified, {
				league: RoomLeague.Verified,
				freeSeat,
				accountVerified: false,
				...required,
			});
			expect(result).toEqual({ kind: "rejected", reason: "ranked-requires-verified-account" });
		});

		it("rejects an unverified account even when it would only watch", () => {
			const result = admission.decide(external, {
				league: RoomLeague.Verified,
				freeSeat: null,
				accountVerified: false,
				...required,
			});
			expect(result).toEqual({ kind: "rejected", reason: "ranked-requires-verified-account" });
		});

		it("rejects an unverified account from an External room", () => {
			const result = admission.decide(external, {
				league: RoomLeague.External,
				freeSeat,
				accountVerified: false,
				...required,
			});
			expect(result).toEqual({ kind: "rejected", reason: "ranked-requires-verified-account" });
		});

		it("admits an unverified account as today when the switch is off", () => {
			const result = admission.decide(verified, {
				league: RoomLeague.Verified,
				freeSeat,
				accountVerified: false,
				verifiedAccountRequired: false,
			});
			expect(result).toEqual({ kind: "player", credential: verified, seat: freeSeat });
		});

		it("seats an unverified account in a casual room", () => {
			const result = admission.decide(verified, {
				league: RoomLeague.Casual,
				freeSeat,
				accountVerified: false,
				...required,
			});
			expect(result).toEqual({ kind: "player", credential: verified, seat: freeSeat });
		});

		it("still rejects a guest with ranked-requires-account", () => {
			const result = admission.decide(guest, {
				league: RoomLeague.Verified,
				freeSeat,
				accountVerified: false,
				...required,
			});
			expect(result).toEqual({ kind: "rejected", reason: "ranked-requires-account" });
		});
	});
});
