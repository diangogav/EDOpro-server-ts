import { YgoRoom } from "@shared/room/domain/YgoRoom";

import { createAccountStatusProbe } from "./bootstrapPresence";

const room = (turn: number, players: Array<{ id: string | null; closed?: boolean }>): YgoRoom =>
	({
		turn,
		players: players.map((player) => ({
			id: player.id,
			socket: { closed: player.closed ?? false },
		})),
	}) as unknown as YgoRoom;

describe("createAccountStatusProbe", () => {
	it("reports an account seated in a running duel as in a duel, even if it is also queued", () => {
		const probe = createAccountStatusProbe({
			rooms: () => [room(2, [{ id: "user-1" }, { id: null }])],
			isSearching: () => true,
		});

		expect(probe.statusOf("user-1")).toBe("in-duel");
	});

	it("reports a queued account outside a running duel as searching", () => {
		const probe = createAccountStatusProbe({
			rooms: () => [room(0, [{ id: "user-1" }])],
			isSearching: (userId) => userId === "user-1",
		});

		expect(probe.statusOf("user-1")).toBe("searching");
	});

	it("reports an account whose seat's socket closed, or that is nowhere, as free", () => {
		const probe = createAccountStatusProbe({
			rooms: () => [room(5, [{ id: "user-1", closed: true }, { id: "user-2" }])],
			isSearching: () => false,
		});

		expect(probe.statusOf("user-1")).toBe("free");
		expect(probe.statusOf("user-3")).toBe("free");
	});
});
