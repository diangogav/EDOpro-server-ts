import { YgoClient } from "@shared/client/domain/YgoClient";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";

import {
	findReconnectingPlayer,
	isPairingReconnectRoutingEligible,
} from "./findReconnectingPlayer";

const player = (
	overrides: Partial<{
		name: string;
		isStrongAuth: boolean;
		closed: boolean;
		remoteAddress: string | null;
		credential: PlayerCredential | null;
	}> = {},
): YgoClient =>
	({
		name: overrides.name ?? "Jaden",
		isStrongAuth: overrides.isStrongAuth ?? false,
		credential: overrides.credential ?? null,
		socket: {
			closed: overrides.closed ?? true,
			remoteAddress: overrides.remoteAddress ?? "1.1.1.1",
		},
	}) as unknown as YgoClient;

const externalSeat = (userId = "acc-1", extra: Parameters<typeof player>[0] = {}): YgoClient =>
	player({ credential: { kind: "external", userId }, ...extra });

describe("findReconnectingPlayer", () => {
	describe("ranked seats bound to an account identity (external/PIN seats)", () => {
		it("grants the seat to a joiner presenting the SAME account id — even over a half-open socket from another address (backgrounded mobile client)", () => {
			const p = externalSeat("acc-1", { closed: false });
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "9.9.9.9",
				ranked: true,
				joinerUserId: "acc-1",
			});
			expect(found).toBe(p);
		});

		it("DENIES the seat to a name-matching joiner with NO account id — a guest knowing the display name never takes an external seat", () => {
			const p = externalSeat("acc-1");
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "1.1.1.1",
				ranked: true,
				joinerUserId: null,
			});
			expect(found).toBeNull();
		});

		it("DENIES the seat to a name-matching joiner with a DIFFERENT account id", () => {
			const p = externalSeat("acc-1");
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "1.1.1.1",
				ranked: true,
				joinerUserId: "acc-2",
			});
			expect(found).toBeNull();
		});

		it("denies even a still-connected victim's seat to an identity-less name match — the half-open allowance never weakens the identity rule", () => {
			const p = externalSeat("acc-1", { closed: false });
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "1.1.1.1",
				ranked: true,
				joinerUserId: null,
			});
			expect(found).toBeNull();
		});
	});

	it("NEVER matches a strong-auth (ticket) player — it is unreachable by name even with the matching account id", () => {
		const p = player({
			isStrongAuth: true,
			credential: { kind: "verified", userId: "acc-1" },
		});
		const found = findReconnectingPlayer({
			players: [p],
			name: "Jaden",
			remoteAddress: "1.1.1.1",
			ranked: true,
			joinerUserId: "acc-1",
		});
		expect(found).toBeNull();
	});

	describe("ranked seats without a recorded credential (legacy flavor)", () => {
		it("matches a disconnected legacy player by name in a ranked room", () => {
			const p = player();
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "9.9.9.9",
				ranked: true,
				joinerUserId: null,
			});
			expect(found).toBe(p);
		});

		it("matches even a still-open socket in a ranked room — a backgrounded mobile client leaves a half-open socket that never reports closed, so the by-name reconnect must take it over (last-join-wins)", () => {
			const p = player({ closed: false });
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "9.9.9.9",
				ranked: true,
				joinerUserId: null,
			});
			expect(found).toBe(p);
		});
	});

	describe("casual rooms — the address+liveness rule is untouched by identity", () => {
		it("in a casual room NEVER takes over a still-open socket", () => {
			const p = player({ closed: false, remoteAddress: "1.1.1.1" });
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "1.1.1.1",
				ranked: false,
				joinerUserId: null,
			});
			expect(found).toBeNull();
		});

		it("in a casual room ALSO requires the same remote address", () => {
			const p = player({ remoteAddress: "1.1.1.1" });
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "2.2.2.2",
				ranked: false,
				joinerUserId: null,
			});
			expect(found).toBeNull();
		});

		it("a matching account id does NOT relax the casual rule — address still has to match", () => {
			const p = externalSeat("acc-1", { remoteAddress: "1.1.1.1" });
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "2.2.2.2",
				ranked: false,
				joinerUserId: "acc-1",
			});
			expect(found).toBeNull();
		});

		it("a casual reconnect from the same address onto a closed socket still works", () => {
			const p = player({ closed: true, remoteAddress: "1.1.1.1" });
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "1.1.1.1",
				ranked: false,
				joinerUserId: null,
			});
			expect(found).toBe(p);
		});
	});

	it("DENIES a by-name reconnect to a guest-credential seat (a bot seat) in a ranked room — even to a joiner presenting an account id", () => {
		const p = player({ credential: { kind: "guest", name: "Jaden" } });
		const found = findReconnectingPlayer({
			players: [p],
			name: "Jaden",
			remoteAddress: "1.1.1.1",
			ranked: true,
			joinerUserId: "acc-1",
		});
		expect(found).toBeNull();
	});

	describe("isPairingReconnectRoutingEligible — the routing-only predicate", () => {
		it("reports an external seat as route-eligible by name alone — routing must reach the room whose own door resolves identity for real", () => {
			const p = externalSeat("acc-1", { closed: false });
			const eligible = isPairingReconnectRoutingEligible({
				players: [p],
				name: "Jaden",
				remoteAddress: "9.9.9.9",
				ranked: true,
			});
			expect(eligible).toBe(true);
		});

		it("still never reaches a strong-auth (ticket) seat", () => {
			const p = player({
				isStrongAuth: true,
				credential: { kind: "verified", userId: "acc-1" },
			});
			const eligible = isPairingReconnectRoutingEligible({
				players: [p],
				name: "Jaden",
				remoteAddress: "1.1.1.1",
				ranked: true,
			});
			expect(eligible).toBe(false);
		});

		it("does not weaken the casual address+liveness rule either", () => {
			const p = player({ closed: false, remoteAddress: "1.1.1.1" });
			const eligible = isPairingReconnectRoutingEligible({
				players: [p],
				name: "Jaden",
				remoteAddress: "1.1.1.1",
				ranked: false,
			});
			expect(eligible).toBe(false);
		});

		it("the seating API no longer admits the routing mode — undefined is rejected by the type and denies at runtime", () => {
			const p = externalSeat("acc-1", { closed: false });
			const found = findReconnectingPlayer({
				players: [p],
				name: "Jaden",
				remoteAddress: "9.9.9.9",
				ranked: true,
				// @ts-expect-error joinerUserId is resolved (string) or absent (null) — a seating caller can never pass the routing-only mode
				joinerUserId: undefined,
			});
			expect(found).toBeNull();
		});
	});

	it("requires a matching name", () => {
		const p = player({ name: "Other" });
		const found = findReconnectingPlayer({
			players: [p],
			name: "Jaden",
			remoteAddress: "1.1.1.1",
			ranked: true,
			joinerUserId: null,
		});
		expect(found).toBeNull();
	});

	it("returns null when nobody matches", () => {
		const found = findReconnectingPlayer({
			players: [],
			name: "Jaden",
			remoteAddress: "1.1.1.1",
			ranked: true,
			joinerUserId: null,
		});
		expect(found).toBeNull();
	});
});
