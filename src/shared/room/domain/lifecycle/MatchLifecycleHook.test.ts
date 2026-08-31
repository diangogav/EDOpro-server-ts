import { mock } from "jest-mock-extended";

import { Team } from "@shared/room/Team";

import { MatchContext, MatchLifecycleHook, RoomClosedContext } from "./MatchLifecycleHook";

function makeContext(overrides?: Partial<MatchContext>): MatchContext {
	return {
		roomId: 1234,
		matchId: "match-1234-a",
		ranked: true,
		banListName: "TCG",
		season: 5,
		players: [
			{ id: "player-1", team: Team.PLAYER, name: "Diango", winner: false },
			{ id: "player-2", team: Team.OPPONENT, name: "Rival", winner: false },
		],
		announce: jest.fn(),
		...overrides,
	};
}

function makeRoomClosedContext(overrides?: Partial<RoomClosedContext>): RoomClosedContext {
	return {
		roomId: 1234,
		matchId: "match-1234-a",
		...overrides,
	};
}

describe("MatchLifecycleHook contract", () => {
	it("exposes optional onMatchStarted/onMatchEnding compatible with a mocked implementer", async () => {
		const hook = mock<MatchLifecycleHook>();
		const ctx = makeContext();

		await hook.onMatchStarted?.(ctx);
		await hook.onMatchEnding?.(ctx);

		expect(hook.onMatchStarted).toHaveBeenCalledWith(ctx);
		expect(hook.onMatchEnding).toHaveBeenCalledWith(ctx);
	});

	it("a hook implementer may declare only onMatchStarted, only onMatchEnding, or neither", () => {
		const startOnly: MatchLifecycleHook = {
			name: "start-only",
			onMatchStarted: async () => undefined,
		};
		const endOnly: MatchLifecycleHook = { name: "end-only", onMatchEnding: async () => undefined };
		const neither: MatchLifecycleHook = { name: "neither" };

		expect(startOnly.onMatchEnding).toBeUndefined();
		expect(endOnly.onMatchStarted).toBeUndefined();
		expect(neither.onMatchStarted).toBeUndefined();
		expect(neither.onMatchEnding).toBeUndefined();
	});

	it("MatchContext.announce is the only client-facing capability exposed to a hook", () => {
		const ctx = makeContext();

		ctx.announce("[Rating v1 start] Diango 1000 | Rival 1000");

		expect(ctx.announce).toHaveBeenCalledWith("[Rating v1 start] Diango 1000 | Rival 1000");
	});

	it("MatchContext carries a matchId distinct from roomId", () => {
		const ctx = makeContext({ roomId: 4242, matchId: "match-uuid-1" });

		expect(ctx.roomId).toBe(4242);
		expect(ctx.matchId).toBe("match-uuid-1");
	});

	it("exposes an optional onRoomClosed compatible with a mocked implementer", async () => {
		const hook = mock<MatchLifecycleHook>();
		const ctx = makeRoomClosedContext();

		await hook.onRoomClosed?.(ctx);

		expect(hook.onRoomClosed).toHaveBeenCalledWith(ctx);
	});

	it("a hook implementer may declare onRoomClosed independently of onMatchStarted/onMatchEnding", () => {
		const closedOnly: MatchLifecycleHook = {
			name: "closed-only",
			onRoomClosed: async () => undefined,
		};
		const neither: MatchLifecycleHook = { name: "neither" };

		expect(closedOnly.onMatchStarted).toBeUndefined();
		expect(closedOnly.onMatchEnding).toBeUndefined();
		expect(neither.onRoomClosed).toBeUndefined();
	});
});
