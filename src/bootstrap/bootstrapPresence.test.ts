import { DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";

import { createAccountStatusProbe, createChallengeMatchmaking } from "./bootstrapPresence";

const room = (
	duelState: DuelState,
	players: Array<{ id: string | null; closed?: boolean }>,
): YgoRoom =>
	({
		duelState,
		players: players.map((player) => ({
			id: player.id,
			socket: { closed: player.closed ?? false },
		})),
	}) as unknown as YgoRoom;

describe("createAccountStatusProbe", () => {
	it("reports an account seated in a running duel as in a duel, even if it is also queued", () => {
		const probe = createAccountStatusProbe({
			rooms: () => [room(DuelState.DUELING, [{ id: "user-1" }, { id: null }])],
			isSearching: () => true,
		});

		expect(probe.statusOf("user-1")).toBe("in-duel");
	});

	it.each([
		DuelState.RPS,
		DuelState.CHOOSING_ORDER,
		DuelState.DUELING,
		DuelState.SIDE_DECKING,
	])("reports an account seated in a room in the %p state as in a duel", (duelState) => {
		const probe = createAccountStatusProbe({
			rooms: () => [room(duelState, [{ id: "user-1" }, { id: "user-2" }])],
			isSearching: () => false,
		});

		expect(probe.statusOf("user-1")).toBe("in-duel");
	});

	it("reports a queued account outside a running duel as searching", () => {
		const probe = createAccountStatusProbe({
			rooms: () => [room(DuelState.WAITING, [{ id: "user-1" }])],
			isSearching: (userId) => userId === "user-1",
		});

		expect(probe.statusOf("user-1")).toBe("searching");
	});

	it("reports an account whose seat's socket closed, or that is nowhere, as free", () => {
		const probe = createAccountStatusProbe({
			rooms: () => [
				room(DuelState.SIDE_DECKING, [{ id: "user-1", closed: true }, { id: "user-2" }]),
			],
			isSearching: () => false,
		});

		expect(probe.statusOf("user-1")).toBe("free");
		expect(probe.statusOf("user-3")).toBe("free");
	});
});

describe("createChallengeMatchmaking", () => {
	const queue = (matched: string[]) => ({
		isUserMatched: jest.fn((userId: string) => matched.includes(userId)),
		removeUser: jest.fn(() => true),
	});
	const matchmakingRoom = (players: Array<{ id: string; closed?: boolean }>) => ({
		isMatchmaking: true,
		players: players.map((player) => ({
			id: player.id,
			socket: { closed: player.closed ?? false },
		})),
	});

	it("counts an account as matched when the queue matched it or it sits in a matchmaking room", () => {
		const matchmaking = createChallengeMatchmaking({
			queue: () => queue(["user-1"]),
			rooms: () => [
				matchmakingRoom([{ id: "user-2" }, { id: "user-4", closed: true }]),
				{ ...matchmakingRoom([{ id: "user-3" }]), isMatchmaking: false },
			],
		});

		expect(matchmaking.isMatched("user-1")).toBe(true);
		expect(matchmaking.isMatched("user-2")).toBe(true);
		expect(matchmaking.isMatched("user-3")).toBe(false);
		expect(matchmaking.isMatched("user-4")).toBe(false);
	});

	it("takes the account out of the queue", () => {
		const matchmakingQueue = queue([]);
		const matchmaking = createChallengeMatchmaking({
			queue: () => matchmakingQueue,
			rooms: () => [],
		});

		matchmaking.removeUser("user-1");

		expect(matchmakingQueue.removeUser).toHaveBeenCalledWith("user-1");
	});

	it("does nothing and matches nobody while matchmaking is not running", () => {
		const matchmaking = createChallengeMatchmaking({ queue: () => null, rooms: () => [] });

		expect(matchmaking.isMatched("user-1")).toBe(false);
		expect(() => matchmaking.removeUser("user-1")).not.toThrow();
	});
});
