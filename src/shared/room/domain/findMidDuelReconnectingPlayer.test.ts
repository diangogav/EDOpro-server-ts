import { YgoClient } from "@shared/client/domain/YgoClient";
import { ISocket } from "@shared/socket/domain/ISocket";

import { findMidDuelReconnectingPlayer } from "./findMidDuelReconnectingPlayer";

const player = (
	overrides: Partial<{
		name: string;
		isStrongAuth: boolean;
		closed: boolean;
		remoteAddress: string | null;
	}> = {},
): YgoClient =>
	({
		name: overrides.name ?? "Jaden",
		isStrongAuth: overrides.isStrongAuth ?? false,
		socket: {
			closed: overrides.closed ?? true,
			remoteAddress: overrides.remoteAddress ?? "1.1.1.1",
		},
	}) as unknown as YgoClient;

const socket = (overrides: Partial<ISocket> = {}): ISocket =>
	({
		remoteAddress: "1.1.1.1",
		...overrides,
	}) as unknown as ISocket;

describe("findMidDuelReconnectingPlayer", () => {
	it("NEVER matches when the socket's watch stamp names this room — a ranked still-connected name match stays seated", () => {
		const p = player({ closed: false });
		const found = findMidDuelReconnectingPlayer({
			players: [p],
			name: "Jaden",
			socket: socket({ watchForRoomId: 7 }),
			roomId: 7,
			ranked: true,
		});
		expect(found).toBeNull();
	});

	it("NEVER matches when the stamp names this room — even a fully reconnect-eligible casual match", () => {
		const p = player({ closed: true, remoteAddress: "1.1.1.1" });
		const found = findMidDuelReconnectingPlayer({
			players: [p],
			name: "Jaden",
			socket: socket({ watchForRoomId: 7 }),
			roomId: 7,
			ranked: false,
		});
		expect(found).toBeNull();
	});

	it("a stamp for a DIFFERENT room is inert — the by-name reconnect still resolves", () => {
		const p = player();
		const found = findMidDuelReconnectingPlayer({
			players: [p],
			name: "Jaden",
			socket: socket({ watchForRoomId: 8 }),
			roomId: 7,
			ranked: true,
		});
		expect(found).toBe(p);
	});

	it("without a stamp it behaves exactly like findReconnectingPlayer — match found", () => {
		const p = player();
		const found = findMidDuelReconnectingPlayer({
			players: [p],
			name: "Jaden",
			socket: socket(),
			roomId: 7,
			ranked: true,
		});
		expect(found).toBe(p);
	});

	it("without a stamp it behaves exactly like findReconnectingPlayer — no match is null", () => {
		const found = findMidDuelReconnectingPlayer({
			players: [],
			name: "Jaden",
			socket: socket(),
			roomId: 7,
			ranked: true,
		});
		expect(found).toBeNull();
	});
});
