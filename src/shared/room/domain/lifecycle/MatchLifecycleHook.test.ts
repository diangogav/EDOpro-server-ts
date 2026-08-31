import { mock } from "jest-mock-extended";

import { Team } from "@shared/room/Team";

import { MatchContext, MatchLifecycleHook } from "./MatchLifecycleHook";

function makeContext(overrides?: Partial<MatchContext>): MatchContext {
	return {
		roomId: 1234,
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
});
