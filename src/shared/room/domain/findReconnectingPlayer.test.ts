import { YgoClient } from "@shared/client/domain/YgoClient";

import { findReconnectingPlayer } from "./findReconnectingPlayer";

const player = (overrides: Partial<{
	name: string;
	isStrongAuth: boolean;
	closed: boolean;
	remoteAddress: string | null;
}> = {}): YgoClient =>
	({
		name: overrides.name ?? "Jaden",
		isStrongAuth: overrides.isStrongAuth ?? false,
		socket: {
			closed: overrides.closed ?? true,
			remoteAddress: overrides.remoteAddress ?? "1.1.1.1",
		},
	}) as unknown as YgoClient;

describe("findReconnectingPlayer", () => {
	it("matches a disconnected legacy player by name in a ranked room", () => {
		const p = player();
		const found = findReconnectingPlayer({
			players: [p],
			name: "Jaden",
			remoteAddress: "9.9.9.9",
			ranked: true,
		});
		expect(found).toBe(p);
	});

	it("NEVER matches a strong-auth (ticket) player — it is unreachable by name", () => {
		const p = player({ isStrongAuth: true });
		const found = findReconnectingPlayer({
			players: [p],
			name: "Jaden",
			remoteAddress: "1.1.1.1",
			ranked: true,
		});
		expect(found).toBeNull();
	});

	it("NEVER matches a player whose socket is still open (live session)", () => {
		const p = player({ closed: false });
		const found = findReconnectingPlayer({
			players: [p],
			name: "Jaden",
			remoteAddress: "1.1.1.1",
			ranked: true,
		});
		expect(found).toBeNull();
	});

	it("requires a matching name", () => {
		const p = player({ name: "Other" });
		const found = findReconnectingPlayer({
			players: [p],
			name: "Jaden",
			remoteAddress: "1.1.1.1",
			ranked: true,
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
		});
		expect(found).toBeNull();
	});

	it("returns null when nobody matches", () => {
		const found = findReconnectingPlayer({
			players: [],
			name: "Jaden",
			remoteAddress: "1.1.1.1",
			ranked: true,
		});
		expect(found).toBeNull();
	});
});
